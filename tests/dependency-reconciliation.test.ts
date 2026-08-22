import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { projectRoot } from "../src/config.js";


function jsonFiles(directory: string): string[] {
  return fs.readdirSync(directory)
    .filter((filename) => filename.endsWith(".json"))
    .map((filename) => path.join(directory, filename));
}


describe("dependency reconciliation", () => {
  it("has no pending discovered dependencies", () => {
    const pending = jsonFiles(path.join(projectRoot, "data", "ingestion"))
      .flatMap((filename) => JSON.parse(fs.readFileSync(filename, "utf8")).discovered_dependencies ?? [])
      .filter((dependency) => dependency.status === "pending")
      .map((dependency) => dependency.spell_id);

    expect(pending).toEqual([]);
  });

  it("has no unresolved canonical inheritance rules", () => {
    const unresolvedInheritance = jsonFiles(path.join(projectRoot, "data", "canonical"))
      .flatMap((filename) => {
        const spell = JSON.parse(fs.readFileSync(filename, "utf8"));
        return (spell.rules_inheritance ?? [])
          .filter((rule: { resolution_status?: string }) => rule.resolution_status !== "resolved")
          .map((rule: { from_spell_id?: string; resolution_status?: string }) =>
            `${spell.spell_id} -> ${rule.from_spell_id} (${rule.resolution_status ?? "unknown"})`
          );
      });

    expect(unresolvedInheritance).toEqual([]);
  });
});
