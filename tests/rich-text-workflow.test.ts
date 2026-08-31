import { describe, expect, it } from "vitest";

import {
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
