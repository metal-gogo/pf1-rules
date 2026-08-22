import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import { validatePackage } from "./validate.js";


interface ListOverride {
  spellId: string;
  spellName: string;
  sourceSpellListId: string;
  sourceListName: string;
  targetSpellListId: string;
  targetListName: string;
  level: number;
}

const reviewedAdditions: ListOverride[] = [
  ["blood-transcription", "Blood Transcription", 2],
  ["deceitful-veneer", "Deceitful Veneer", 5],
  ["firewalkers-meditation", "Firewalker's Meditation", 4],
  ["mages-lucubration", "Mage's Lucubration", 6],
  ["mnemonic-enhancer", "Mnemonic Enhancer", 4],
  ["rite-of-centered-mind", "Rite of Centered Mind", 1],
  ["spirit-bonds", "Spirit Bonds", 3],
  ["temporal-regression", "Temporal Regression", 8],
  ["visualization-of-the-body", "Visualization of the Body", 2],
  ["visualization-of-the-mind", "Visualization of the Mind", 2],
].map(([slug, spellName, level]) => ({
  spellId: `spell.${slug}`,
  spellName: String(spellName),
  sourceSpellListId: "spell-list.wizard",
  sourceListName: "wizard",
  targetSpellListId: "spell-list.sorcerer",
  targetListName: "sorcerer",
  level: Number(level),
})).concat([
  ["borrow-fortune", "Borrow Fortune", 3],
  ["divine-vessel", "Divine Vessel", 8],
  ["embrace-destiny", "Embrace Destiny", 1],
  ["find-fault", "Find Fault", 3],
  ["foretell-failure", "Foretell Failure", 4],
  ["jungle-mind", "Jungle Mind", 5],
].map(([slug, spellName, level]) => ({
  spellId: `spell.${slug}`,
  spellName: String(spellName),
  sourceSpellListId: "spell-list.oracle",
  sourceListName: "oracle",
  targetSpellListId: "spell-list.cleric",
  targetListName: "cleric",
  level: Number(level),
})));

const reviewedExclusions: ListOverride[] = [
  {
    spellId: "spell.oracles-burden",
    spellName: "Oracle's Burden",
    sourceSpellListId: "spell-list.oracle",
    sourceListName: "oracle",
    targetSpellListId: "spell-list.cleric",
    targetListName: "cleric",
    level: 2,
  },
  {
    spellId: "spell.oracles-vessel",
    spellName: "Oracle's Vessel",
    sourceSpellListId: "spell-list.oracle",
    sourceListName: "oracle",
    targetSpellListId: "spell-list.cleric",
    targetListName: "cleric",
    level: 4,
  },
];


function readJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function writeJson(filename: string, value: unknown): void {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}


function uniqueEvidence(evidence: ValidatedJson[]): ValidatedJson[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.observation_id}:${item.source_field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function sourceEvidence(record: ValidatedJson, sourceSpellListId: string): ValidatedJson[] {
  const relationship = record.relationships.find((item: ValidatedJson) =>
    item.type === "appears_on_spell_list" && item.target?.entity_id === sourceSpellListId,
  );
  return uniqueEvidence(relationship?.evidence ?? []);
}


function decisionEvidence(evidence: ValidatedJson[]): ValidatedJson[] {
  return uniqueEvidence(evidence.map((item: ValidatedJson) => ({
    observation_id: item.observation_id,
    source_field: item.source_field,
  })));
}


function reviewedRationale(spec: ListOverride, action: "add" | "exclude"): string {
  if (action === "exclude") {
    return `Reviewed project decision: keep ${spec.spellName} off the ${spec.targetListName} list. The preserved ${spec.sourceListName} ${spec.level} value is source evidence, not proof of ${spec.targetListName} access.`;
  }
  return `Reviewed project decision: add ${spec.targetListName} ${spec.level} access to match the preserved ${spec.sourceListName} ${spec.level} membership. This is a canonical override, not a printed or derived value.`;
}


function loadSpecFiles(spec: ListOverride): {
  canonicalPath: string;
  decisionPath: string;
  record: ValidatedJson;
  decision: ValidatedJson;
} {
  const slug = spec.spellId.replace("spell.", "");
  const canonicalPath = path.join(projectRoot, "data", "canonical", `${slug}.json`);
  const decisionPath = path.join(projectRoot, "data", "decisions", `${slug}.json`);
  const record = readJson(canonicalPath);
  const decision = readJson(decisionPath);
  if (record.spell_id !== spec.spellId || record.name !== spec.spellName) {
    throw new Error(`Reviewed override identity mismatch for ${spec.spellId}.`);
  }
  return { canonicalPath, decisionPath, record, decision };
}


function evidenceContext(
  record: ValidatedJson,
  decision: ValidatedJson,
  spec: ListOverride,
): { full: ValidatedJson[]; selected: ValidatedJson[]; considered: string[] } {
  const full = sourceEvidence(record, spec.sourceSpellListId);
  const selected = decisionEvidence(full);
  const considered = [...new Set(selected.map((item) => item.observation_id))];
  if (considered.length === 0) considered.push(...decision.observation_ids);
  return { full, selected, considered };
}


function applyAddition(spec: ListOverride): boolean {
  const { canonicalPath, decisionPath, record, decision } = loadSpecFiles(spec);
  const sourceLevel = record.levels.find((item: ValidatedJson) =>
    item.spell_list_id === spec.sourceSpellListId && item.level === spec.level,
  );
  if (!sourceLevel) throw new Error(`${spec.spellId} lacks ${spec.sourceListName} ${spec.level}.`);
  const existing = record.levels.filter((item: ValidatedJson) =>
    item.spell_list_id === spec.targetSpellListId,
  );
  if (existing.length > 0) {
    if (existing.length === 1 && existing[0].level === spec.level && existing[0].access_basis === "reviewed_override") {
      return false;
    }
    throw new Error(`${spec.spellId} already has incompatible ${spec.targetListName} access.`);
  }

  const evidence = evidenceContext(record, decision, spec);
  const levelIndex = record.levels.length;
  const relationshipId = `${spec.spellId}:appears_on_spell_list:${spec.targetSpellListId}`;
  const rationale = reviewedRationale(spec, "add");
  record.levels.push({
    spell_list_id: spec.targetSpellListId,
    list_kind: "class",
    list_name: spec.targetListName,
    level: spec.level,
    scope: sourceLevel.scope,
    raw: `Reviewed canonical override: ${spec.targetListName} ${spec.level}; source membership ${spec.sourceListName} ${spec.level}.`,
    access_basis: "reviewed_override",
    qualifications: [],
  });
  record.relationships.push({
    relationship_id: relationshipId,
    type: "appears_on_spell_list",
    target: {
      entity_type: "spell_list",
      entity_id: spec.targetSpellListId,
      name: spec.targetListName,
    },
    status: "accepted",
    evidence: evidence.full,
    note: rationale,
  });
  record.normalization.warnings.push({
    code: "REVIEWED_SPELL_LIST_OVERRIDE",
    field_path: `/levels/${levelIndex}`,
    message: rationale,
  });
  decision.field_decisions.push({
    canonical_path: `/levels/${levelIndex}`,
    decision: "normalize",
    selected_evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale,
  });
  decision.relationship_decisions.push({
    relationship_id: relationshipId,
    decision: "accept",
    evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale,
  });
  writeJson(canonicalPath, record);
  writeJson(decisionPath, decision);
  return true;
}


function applyExclusion(spec: ListOverride): boolean {
  const { decisionPath, record, decision } = loadSpecFiles(spec);
  if (record.levels.some((item: ValidatedJson) => item.spell_list_id === spec.targetSpellListId)) {
    throw new Error(`${spec.spellId} unexpectedly has ${spec.targetListName} access.`);
  }
  const relationshipId = `${spec.spellId}:appears_on_spell_list:${spec.targetSpellListId}`;
  const existing = decision.relationship_decisions.find((item: ValidatedJson) =>
    item.relationship_id === relationshipId,
  );
  if (existing) {
    if (existing.decision === "reject") return false;
    throw new Error(`${spec.spellId} has an incompatible ${spec.targetListName} relationship decision.`);
  }
  const evidence = evidenceContext(record, decision, spec);
  decision.relationship_decisions.push({
    relationship_id: relationshipId,
    decision: "reject",
    evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale: reviewedRationale(spec, "exclude"),
  });
  writeJson(decisionPath, decision);
  return true;
}


export function applyReviewedListOverrides(): { additions: number; exclusions: number } {
  const additions = reviewedAdditions.filter(applyAddition).length;
  const exclusions = reviewedExclusions.filter(applyExclusion).length;
  validatePackage();
  return { additions, exclusions };
}


process.stdout.write(`${JSON.stringify(applyReviewedListOverrides(), null, 2)}\n`);
