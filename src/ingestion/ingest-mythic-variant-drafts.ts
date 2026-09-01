import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import { mythicVariantCandidates } from "./generate-mythic-variant-candidates.js";
import { slug } from "./spell-page-parser.js";

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
    .flatMap((entry) => entry.isFile() && entry.name.endsWith(".json")
      ? [path.join(directory, entry.name)]
      : [])
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

function source(candidate: Json): { book: string; page: number; rules: string } {
  const matched = candidate.raw.match(/^Source (.+?) pg\. (\d+)\s+(.+)$/s);
  if (!matched) {
    throw new Error(`Cannot separate source citation for ${candidate.mythic_spell_variant_id}`);
  }
  return { book: matched[1]!, page: Number(matched[2]), rules: matched[3]!.trim() };
}

function augmentations(variantId: string, rules: string): { rules: string; records: Json[] } {
  const matches = [...rules.matchAll(/\s+(Augmented \((\d+)(?:st|nd|rd|th)\))\s*:\s*/g)];
  if (!matches.length) return { rules, records: [] };
  return {
    rules: rules.slice(0, matches[0]!.index).trim(),
    records: matches.map((match, index) => ({
      augmentation_id: `${variantId}.augmentation-${match[2]}`,
      name: match[1],
      minimum_tier: Number(match[2]),
      total_mythic_power_uses: null,
      raw: rules.slice(match.index! + match[0].length, matches[index + 1]?.index).trim(),
      relationships: [],
    })),
  };
}

function variant(candidate: Json): Json {
  const citation = source(candidate);
  const split = augmentations(candidate.mythic_spell_variant_id, citation.rules);
  const itemEvidence = evidence(candidate);
  return {
    $schema: "../../schemas/mythic-spell-variant.schema.json",
    schema_version: "0.1.0",
    mythic_spell_variant_id: candidate.mythic_spell_variant_id,
    ruleset: "Pathfinder First Edition",
    name: candidate.name,
    base_spell: {
      spell_id: candidate.base_spell_id,
      relationship: "mythic_version_of",
      rules_combination: "inherits_unless_replaced",
      evidence: [itemEvidence],
    },
    rules_text: { raw: split.rules, search_text: split.rules },
    augmentations: split.records,
    publication: {
      publisher: "Paizo",
      book: citation.book,
      page: citation.page,
      first_party_status: "confirmed",
    },
    relationships: [],
    provenance: [
      {
        field_path: "/rules_text/raw",
        observation_id: candidate.observation_id,
        source_field: sourceField,
        decision: "copied",
        note: "AoN mythic subsection copied after its source citation.",
      },
      {
        field_path: "/publication",
        observation_id: candidate.observation_id,
        source_field: sourceField,
        decision: "normalized",
        note: "Publication citation separated from the mythic rules text.",
      },
    ],
    normalization: {
      status: "draft",
      normalizer_version: "mythic-draft-0.1.0",
      warnings: [
        {
          code: "MYTHIC_EFFECT_MODEL_DEFERRED",
          field_path: "/rules_text",
          message: "Mythic effects remain source-backed rules text pending a reusable structured effect model.",
        },
      ],
    },
  };
}

function decision(candidate: Json): Json {
  const itemEvidence = { observation_id: candidate.observation_id, source_field: sourceField };
  const variantId = candidate.mythic_spell_variant_id;
  return {
    $schema: "../../schemas/canonical-decision.schema.json",
    schema_version: "0.1.0",
    decision_id: `canonical-decision:${variantId}:v0.1`,
    entity_id: variantId,
    canonical_record_path: `../variants/${slug(candidate.name)}.json`,
    observation_ids: [candidate.observation_id],
    policy_id: "provenance-first-v0",
    baseline_observation_id: candidate.observation_id,
    status: "draft",
    field_decisions: [
      {
        canonical_path: "/rules_text/raw",
        decision: "select_source",
        selected_evidence: [itemEvidence],
        considered_observation_ids: [candidate.observation_id],
        rationale: "AoN's explicitly named mythic subsection is the available first-party source evidence.",
      },
      {
        canonical_path: "/publication",
        decision: "normalize",
        selected_evidence: [itemEvidence],
        considered_observation_ids: [candidate.observation_id],
        rationale: "The source citation is separated from the copied rules text.",
      },
    ],
    relationship_decisions: [
      {
        relationship_id: `${variantId}:mythic_version_of:${candidate.base_spell_id}`,
        decision: "accept",
        evidence: [itemEvidence],
        considered_observation_ids: [candidate.observation_id],
        rationale: "AoN labels this section with the mythic version's exact name.",
      },
    ],
    unresolved_questions: ["What reusable structured effect model should represent this mythic variant?"],
  };
}

function registryEntity(candidate: Json): Json {
  return {
    entity_id: candidate.mythic_spell_variant_id,
    entity_type: "mythic_spell_variant",
    name: candidate.name,
    status: "resolved",
    aliases: [],
    evidence: [
      {
        observation_id: candidate.observation_id,
        source_field: sourceField,
        anchor_text_raw: candidate.name,
        source_href: candidate.source_url,
      },
    ],
    notes: ["Generated from an explicitly named AoN mythic subsection."],
    relationships: [],
  };
}

function addReciprocal(candidate: Json, canonicalFiles: Map<string, string>): void {
  const filename = canonicalFiles.get(candidate.base_spell_id);
  if (!filename) throw new Error(`Missing canonical base spell ${candidate.base_spell_id}`);
  const record = readJson(filename);
  const relationshipId = `${candidate.base_spell_id}:has_mythic_variant:${candidate.mythic_spell_variant_id}`;
  if (!record.relationships.some((relationship: Json) => relationship.relationship_id === relationshipId)) {
    record.relationships.push({
      relationship_id: relationshipId,
      type: "has_mythic_variant",
      target: {
        entity_type: "mythic_spell_variant",
        entity_id: candidate.mythic_spell_variant_id,
        name: candidate.name,
      },
      status: "accepted",
      evidence: [evidence(candidate)],
      note: "The mythic rules are owned by the linked spell-variant entity.",
    });
    writeJson(filename, record);
  }
}

const drafts = mythicVariantCandidates()
  .filter((candidate) => candidate.status === "draft")
  .sort((left, right) => left.base_spell_id.localeCompare(right.base_spell_id));
const write = process.argv.includes("--write");

if (write) {
  const canonicalFiles = new Map(jsonFiles(path.join(projectRoot, "data", "canonical"))
    .map((filename) => [readJson(filename).spell_id, filename] as const));
  const registryPath = path.join(projectRoot, "data", "entities", "mythic-spell-variants.json");
  const registry = readJson(registryPath);
  const known = new Set(registry.entities.map((entity: Json) => entity.entity_id));
  for (const candidate of drafts) {
    writeJson(path.join(projectRoot, "data", "variants", `${slug(candidate.name)}.json`), variant(candidate));
    writeJson(path.join(projectRoot, "data", "decisions", `${slug(candidate.name)}.json`), decision(candidate));
    if (!known.has(candidate.mythic_spell_variant_id)) registry.entities.push(registryEntity(candidate));
    addReciprocal(candidate, canonicalFiles);
  }
  registry.entities.sort((left: Json, right: Json) => left.entity_id.localeCompare(right.entity_id));
  writeJson(registryPath, registry);
}

process.stdout.write(`${JSON.stringify({ drafts: drafts.length, write }, null, 2)}\n`);
