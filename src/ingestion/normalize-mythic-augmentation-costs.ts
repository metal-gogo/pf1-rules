import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import { fixedTotalMythicPowerUses } from "./mythic-augmentation-cost.js";

type Json = Record<string, any>;

const sourceField = "raw_aon_mythic_section";

function readJson(filename: string): Json {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as Json;
}

function writeJson(filename: string, value: Json): void {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function jsonFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isFile() && entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : [])
    .sort();
}

function evidence(candidate: Json): Json {
  return {
    observation_id: candidate.observation_id,
    source_field: sourceField,
    evidence_kind: "plain_text",
    anchor_text_raw: candidate.name,
    source_href: candidate.source_url,
  };
}

function ownedObservation(record: Json): Json {
  const baseName = record.name.slice("Mythic ".length);
  const directory = path.join(projectRoot, "data", "observations", record.base_spell.spell_id.slice("spell.".length));
  const observations = jsonFiles(directory).map(readJson).filter((observation) =>
    observation.entity_type === "spell" && observation.source.site_id === "aon" &&
    observation.spell_raw.name_raw === baseName &&
    observation.spell_raw.description_raw.includes(`Mythic ${baseName}Source `),
  );
  if (!observations.length) throw new Error(`Missing owned AoN observation for ${record.mythic_spell_variant_id}`);
  return observations.sort((left, right) => right.retrieval.retrieved_at.localeCompare(left.retrieval.retrieved_at))[0]!;
}

function candidateFromObservation(record: Json): Json {
  const observation = ownedObservation(record);
  return {
    mythic_spell_variant_id: record.mythic_spell_variant_id,
    name: record.name,
    observation_id: observation.observation_id,
    source_url: observation.source.url,
  };
}

function replaceEvidence(record: Json, candidate: Json): number {
  let relationshipCorrections = 0;
  record.base_spell.evidence = [evidence(candidate)];
  for (const item of record.provenance) {
    if (item.field_path === "/rules_text/raw" || item.field_path === "/publication") {
      item.observation_id = candidate.observation_id;
      item.source_field = sourceField;
    }
  }
  for (const item of [...record.relationships, ...record.augmentations.flatMap((augmentation: Json) => augmentation.relationships)]) {
    for (const itemEvidence of item.evidence) {
      if (itemEvidence.observation_id.startsWith("aon:") && itemEvidence.observation_id !== candidate.observation_id) {
        itemEvidence.observation_id = candidate.observation_id;
        relationshipCorrections += 1;
      }
    }
  }
  return relationshipCorrections;
}

function updateDecision(decision: Json, candidate: Json, costs: number[]): void {
  const selected = { observation_id: candidate.observation_id, source_field: sourceField };
  decision.observation_ids = [candidate.observation_id];
  decision.baseline_observation_id = candidate.observation_id;
  for (const item of [...decision.field_decisions, ...decision.relationship_decisions]) {
    if (item.selected_evidence) item.selected_evidence = [selected];
    if (item.evidence) item.evidence = [selected];
    item.considered_observation_ids = [candidate.observation_id];
  }
  if (!costs.length) return;
  decision.policy_id = "mythic-magic-total-cost-v1";
  decision.status = "accepted";
  decision.field_decisions = decision.field_decisions.filter((item: Json) =>
    !item.canonical_path.startsWith("/augmentations/") && item.canonical_path !== "/normalization/status",
  );
  decision.field_decisions.push(...costs.map((total, index) => ({
    canonical_path: `/augmentations/${index}/total_mythic_power_uses`,
    decision: "derived",
    selected_evidence: [selected],
    considered_observation_ids: [candidate.observation_id],
    rationale: `The augmented entry explicitly states a total cost of ${total} mythic power use${total === 1 ? "" : "s"}; Mythic Magic defines that stated augmented cost as including the base mythic casting use.`,
  })));
  decision.field_decisions.push({
    canonical_path: "/normalization/status",
    decision: "normalize",
    selected_evidence: [selected],
    considered_observation_ids: [candidate.observation_id],
    rationale: "The source-backed mythic text, base-spell relationship, tier, and total augmented cost are complete. Detailed effects remain lossless rules text.",
  });
  decision.unresolved_questions = [];
}

const decisions = new Map(jsonFiles(path.join(projectRoot, "data", "decisions"))
  .map((filename) => [readJson(filename).entity_id, filename]));
const write = process.argv.includes("--write");
let fixed = 0;
let variable = 0;
let sourceCorrections = 0;
let relationshipCorrections = 0;

for (const filename of jsonFiles(path.join(projectRoot, "data", "variants"))) {
  const record = readJson(filename);
  if (!record.mythic_spell_variant_id ||
      (record.normalization.status !== "draft" && record.normalization.normalizer_version !== "mythic-augmentation-cost-0.1.0")) continue;
  const candidate = candidateFromObservation(record);
  const previousObservation = record.base_spell.evidence[0]?.observation_id;
  relationshipCorrections += replaceEvidence(record, candidate);
  if (previousObservation !== candidate.observation_id) sourceCorrections += 1;
  const costs = record.augmentations.map((item: Json) => fixedTotalMythicPowerUses(item.raw));
  const decisionFilename = decisions.get(record.mythic_spell_variant_id);
  if (!decisionFilename) throw new Error(`Missing decision for ${record.mythic_spell_variant_id}`);
  const decision = readJson(decisionFilename);
  if (costs.every((cost: number | null): cost is number => cost !== null)) {
    record.augmentations.forEach((item: Json, index: number) => { item.total_mythic_power_uses = costs[index]; });
    record.normalization.status = "validated";
    record.normalization.normalizer_version = "mythic-augmentation-cost-0.1.0";
    updateDecision(decision, candidate, costs);
    fixed += 1;
  } else {
    const warnings = record.normalization.warnings as Json[];
    if (!warnings.some((warning) => warning.code === "MYTHIC_POWER_COST_VARIABLE")) {
      warnings.push({
        code: "MYTHIC_POWER_COST_VARIABLE",
        field_path: "/augmentations",
        message: "The augmentation has alternative, repeated, or scaled mythic-power costs; raw text is preserved pending a cost-expression model.",
      });
    }
    updateDecision(decision, candidate, []);
    variable += 1;
  }
  if (write) {
    writeJson(filename, record);
    writeJson(decisionFilename, decision);
  }
}

process.stdout.write(`${JSON.stringify({ fixed, variable, sourceCorrections, relationshipCorrections, write }, null, 2)}\n`);
