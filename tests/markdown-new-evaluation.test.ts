import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, test } from "vitest";

import {
  evaluateCorpus,
  evaluateNormalizedView,
  type ReferenceNormalizationProvider,
} from "../src/experiments/markdown-new-evaluation.js";


const observation = {
  observation_id: "test:spell.example:abc12345",
  source: { site_id: "test", url: "https://example.test/spells/example.html" },
  retrieval: { content_sha256: "unused", raw_artifact_path: "unused" },
  page: { source_notice_raw: "Test Book pg. 1" },
  spell_raw: {
    name_raw: "Example Spell",
    school_raw: "evocation [light]",
    levels_raw: "wizard 1",
    casting_time_raw: "1 standard action",
    components_raw: "V, S",
    range_raw: "close",
    delivery_fields_raw: [{ label_raw: "Target", value_raw: "one creature" }],
    duration_raw: "1 round/level",
    saving_throw_raw: "Will negates",
    spell_resistance_raw: "yes",
    description_raw: "This spell functions like other spell.",
    references_raw: [{ anchor_text_raw: "other spell", href_raw: "other.html" }],
  },
};


describe("pluggable reference normalization evaluation", () => {
  test("scores derived Markdown without replacing original evidence", () => {
    const result = evaluateNormalizedView(
      { id: "example", observationPath: "unused", challenge: "fixture" },
      observation,
      "/evidence/example.html",
      {
        providerId: "fixture",
        content: `# Example Spell\n\n**Source** Test Book pg. 1\n\n**School** evocation [light]\n\n**Level** wizard 1\n\n**Casting Time** 1 standard action\n\n**Components** V, S\n\n**Range** close\n\n**Target** one creature\n\n**Duration** 1 round/level\n\n**Saving Throw** Will negates\n\n**Spell Resistance** yes\n\nThis spell functions like [other spell](other.html).`,
        metadata: { version: "fixture-1" },
      },
    );
    expect(result.original_artifact_path).toBe(path.relative(process.cwd(), "/evidence/example.html"));
    expect(result.field_checks.ratio).toBe(1);
    expect(result.description_retained).toBe(true);
    expect(result.reference_checks).toEqual({ retained: 1, expected: 1, ratio: 1 });
  });

  test("rejects a changed original artifact before calling a provider", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-normalizer-"));
    const observationDirectory = path.join(directory, "observations", "example");
    const artifactDirectory = path.join(directory, "raw", "example");
    fs.mkdirSync(observationDirectory, { recursive: true });
    fs.mkdirSync(artifactDirectory, { recursive: true });
    const artifact = Buffer.from("authoritative HTML");
    fs.writeFileSync(path.join(artifactDirectory, "source.html"), artifact);
    const localObservation = structuredClone(observation);
    localObservation.retrieval = {
      content_sha256: crypto.createHash("sha256").update("different HTML").digest("hex"),
      raw_artifact_path: "../../raw/example/source.html",
    };
    const observationPath = path.join(observationDirectory, "source.json");
    fs.writeFileSync(observationPath, JSON.stringify(localObservation));
    let called = false;
    const provider: ReferenceNormalizationProvider = {
      id: "must-not-run",
      async normalize() {
        called = true;
        throw new Error("unexpected call");
      },
    };
    await expect(evaluateCorpus(
      [{ id: "hash-mismatch", observationPath, challenge: "fixture" }],
      provider,
    )).rejects.toThrow("original artifact hash mismatch");
    expect(called).toBe(false);
    fs.rmSync(directory, { recursive: true });
  });
});
