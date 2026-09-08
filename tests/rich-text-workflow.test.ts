import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  commitRichTextBatch,
  expectedBatchPaths,
  formatRichTextBatchCommitMessage,
  validateRichTextBatchManifest,
  type RichTextBatchManifest,
} from "../src/ingestion/rich-text-workflow.js";


function manifest(): RichTextBatchManifest {
  const spellIds = Array.from({ length: 25 }, (_, index) => `spell.test-${index + 1}`);
  return {
    version: 1,
    base_commit: "a".repeat(40),
    upstream_commit: "a".repeat(40),
    batch_size: 25,
    spell_ids: spellIds,
    files: spellIds.map((spellId) => {
      const slug = spellId.replace("spell.", "");
      return {
        spell_id: spellId,
        canonical_path: `data/canonical/${slug}.json`,
        canonical_sha256: "b".repeat(64),
        decision_path: `data/decisions/${slug}.json`,
        decision_sha256: "c".repeat(64),
      };
    }),
  };
}


describe("rich-text workflow manifests", () => {
  it("formats a descriptive batch commit subject", () => {
    expect(formatRichTextBatchCommitMessage("Heart of the Mammoth", 5))
      .toBe("ingest rich-text: Heart of the Mammoth + 4 spells");
  });

  it("requires 25 unique, matching canonical and decision paths", () => {
    const planned = manifest();
    expect(() => validateRichTextBatchManifest(planned)).not.toThrow();
    expect(expectedBatchPaths(planned)).toHaveLength(50);

    planned.batch_size = 5;
    expect(() => validateRichTextBatchManifest(planned)).toThrow("batch size");

    planned.batch_size = 25;
    planned.files[0]!.decision_path = "data/decisions/not-the-same-spell.json";
    expect(() => validateRichTextBatchManifest(planned)).toThrow("invalid paths");
  });
});

it("refuses an unrelated staged file before staging or committing a batch", () => {
  const planned = manifest();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-batch-test-"));
  const filename = path.join(directory, "manifest.json");
  fs.writeFileSync(filename, JSON.stringify(planned));
  const git = vi.mocked(execFileSync);
  git.mockImplementation((_command, args) => {
    const command = (args as string[]).join(" ");
    if (command === "rev-parse HEAD") return planned.base_commit;
    if (command === "diff --name-only") return expectedBatchPaths(planned).join("\n");
    if (command === "diff --cached --name-only") return "unrelated.txt";
    throw new Error("Unexpected Git mutation: " + command);
  });
  try {
    expect(() => commitRichTextBatch(filename)).toThrow("Index changed an unexpected file set");
    expect(git.mock.calls.every(([, args]) => !(args as string[]).includes("add"))).toBe(true);
  } finally {
    git.mockReset();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));


it("rejects spell IDs that escape the canonical directory", () => {
  const planned = manifest();
  const spellId = "spell.../outside";
  planned.spell_ids[0] = spellId;
  planned.files[0] = {
    ...planned.files[0]!,
    spell_id: spellId,
    canonical_path: "data/outside.json",
    decision_path: "data/outside.json",
  };
  expect(() => validateRichTextBatchManifest(planned)).toThrow("invalid paths");
});
