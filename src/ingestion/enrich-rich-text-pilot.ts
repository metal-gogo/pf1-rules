import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import {
  comparableRichText,
  linkRichTextDocument,
  parseRichTextHtml,
  richTextLeafText,
  type RichTextDocument,
} from "../domain/rich-text.js";
import { resolveCanonicalSpellReference } from "./normalize-level-zero.js";
import { parseAonSpell } from "./spell-page-parser.js";


export const richTextPilotSpellIds = [
  "spell.break-enchantment",
  "spell.restoration",
  "spell.restoration-greater",
  "spell.restoration-lesser",
  "spell.bestow-curse",
  "spell.bestow-curse-greater",
  "spell.curse-major",
  "spell.conditional-curse",
  "spell.cure-light-wounds",
  "spell.cure-moderate-wounds",
  "spell.darkness",
] as const;


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function jsonFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory()
      ? jsonFiles(filename)
      : entry.isFile() && entry.name.endsWith(".json")
        ? [filename]
        : [];
  });
}


function canonicalFilename(spellId: string): string {
  return path.join(
    projectRoot,
    "data",
    "canonical",
    `${spellId.replace(/^spell\./, "")}.json`,
  );
}


function observationIndex(): Map<string, { filename: string; record: ValidatedJson }> {
  const observations = new Map<string, { filename: string; record: ValidatedJson }>();
  for (const filename of jsonFiles(path.join(projectRoot, "data", "observations"))) {
    const record = loadJson(filename);
    if (record.observation_id) observations.set(record.observation_id, { filename, record });
  }
  return observations;
}


const darknessMythicOnlyTargets = new Set([
  "publication.pathfinder-rpg-mythic-adventures",
  "rule.human",
  "rule.mythic-adventures-pg-90",
  "rule.see-in-darkness",
  "rule.source",
]);


function hasItalicValue(document: RichTextDocument, value: string): boolean {
  const expected = value.toLocaleLowerCase("en-US");
  return document.content.some((block) => {
    const content = block.node_type === "paragraph"
      ? block.content
      : block.content.flatMap((item) => item.content);
    return content.some((node) =>
      node.node_type !== "hard_break" &&
      node.marks?.includes("italic") &&
      node.value.toLocaleLowerCase("en-US") === expected
    );
  });
}


function addDisambiguatedSelfReference(
  canonical: ValidatedJson,
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const sameNamedDescriptor = relationships.find((relationship) =>
    relationship.status === "accepted" &&
    relationship.type === "has_descriptor" &&
    String(relationship.target.name).toLocaleLowerCase("en-US") ===
      String(canonical.name).toLocaleLowerCase("en-US")
  );
  if (!sameNamedDescriptor || !hasItalicValue(document, canonical.name)) return relationships;

  const movedEvidence = sameNamedDescriptor.evidence.filter((evidence: ValidatedJson) =>
    evidence.evidence_kind === "hyperlink" &&
    /\/magic\/all-spells\//i.test(String(evidence.source_href ?? ""))
  );
  sameNamedDescriptor.evidence = sameNamedDescriptor.evidence.filter(
    (evidence: ValidatedJson) => !movedEvidence.includes(evidence),
  );
  const relationshipId = `${canonical.spell_id}:references:${canonical.spell_id}`;
  if (!relationships.some((relationship) => relationship.relationship_id === relationshipId)) {
    relationships.push({
      relationship_id: relationshipId,
      type: "references",
      target: {
        entity_type: "spell",
        entity_id: canonical.spell_id,
        name: canonical.name,
      },
      status: "accepted",
      evidence: [
        ...movedEvidence,
        {
          observation_id: observationId,
          source_field: "spell_raw.description_raw",
          evidence_kind: "manual_verification",
          anchor_text_raw: canonical.name,
          source_href: sourceUrl,
        },
      ],
      note:
        "Italicized same-name occurrences refer to the spell; unmarked occurrences retain their ordinary rules meaning.",
    });
  }
  return relationships.sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function mergeRelationships(
  relationships: ValidatedJson[],
  spellId: string,
  canonicalSpells: Map<string, ValidatedJson>,
): { relationships: ValidatedJson[]; changedIds: Map<string, string> } {
  const merged = new Map<string, ValidatedJson>();
  const changedIds = new Map<string, string>();
  for (const original of relationships) {
    const relationship = structuredClone(original);
    if (relationship.status === "accepted" && relationship.target.entity_type === "spell") {
      const resolved = resolveCanonicalSpellReference(
        String(relationship.target.name),
        canonicalSpells,
        relationship.target.entity_id ?? undefined,
      );
      if (resolved) {
        relationship.target.entity_id = resolved.spell_id;
        relationship.target.name = resolved.name;
        relationship.relationship_id = `${spellId}:${relationship.type}:${resolved.spell_id}`;
      }
    }
    changedIds.set(String(original.relationship_id), String(relationship.relationship_id));
    const existing = merged.get(relationship.relationship_id);
    if (!existing) {
      merged.set(relationship.relationship_id, relationship);
      continue;
    }
    for (const evidence of relationship.evidence) {
      if (!existing.evidence.some((item: ValidatedJson) =>
        JSON.stringify(item) === JSON.stringify(evidence)
      )) existing.evidence.push(evidence);
    }
  }
  return {
    relationships: [...merged.values()].sort((left, right) =>
      String(left.relationship_id).localeCompare(String(right.relationship_id))
    ),
    changedIds,
  };
}


function updateDecision(
  spellId: string,
  observationId: string,
  changedIds: Map<string, string>,
  relationships: ValidatedJson[],
  warningMessages: string[],
): void {
  const filename = path.join(
    projectRoot,
    "data",
    "decisions",
    `${spellId.replace(/^spell\./, "")}.json`,
  );
  const decision = loadJson(filename);
  const canonicalRelationshipIds = new Set(
    relationships.map((relationship) => String(relationship.relationship_id)),
  );
  const relationshipDecisions = new Map<string, ValidatedJson>();
  for (const original of decision.relationship_decisions) {
    const item = structuredClone(original);
    item.relationship_id = changedIds.get(item.relationship_id) ?? item.relationship_id;
    if (!canonicalRelationshipIds.has(item.relationship_id)) continue;
    const existing = relationshipDecisions.get(item.relationship_id);
    if (!existing) {
      relationshipDecisions.set(item.relationship_id, item);
      continue;
    }
    existing.evidence = [...existing.evidence, ...item.evidence].filter(
      (evidence: ValidatedJson, index: number, all: ValidatedJson[]) =>
        all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(evidence)) === index,
    );
  }
  for (const relationship of relationships) {
    if (relationshipDecisions.has(relationship.relationship_id)) continue;
    relationshipDecisions.set(relationship.relationship_id, {
      relationship_id: relationship.relationship_id,
      decision: "accept",
      evidence: relationship.evidence.map((evidence: ValidatedJson) => ({
        observation_id: evidence.observation_id,
        source_field: evidence.source_field,
      })),
      considered_observation_ids: decision.observation_ids,
      rationale: relationship.note ??
        "The accepted relationship is explicit in the selected source evidence.",
    });
  }
  decision.relationship_decisions = [...relationshipDecisions.values()].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
  if (!decision.field_decisions.some((field: ValidatedJson) =>
    field.canonical_path === "/description/document"
  )) {
    decision.field_decisions.push({
      canonical_path: "/description/document",
      decision: "derived",
      selected_evidence: [{
        observation_id: observationId,
        source_field: "spell_raw.description_raw",
      }],
      considered_observation_ids: decision.observation_ids,
      rationale:
        "AoN supplies block structure and emphasis; accepted canonical relationships supply entity links.",
    });
  }
  decision.unresolved_questions = [
    ...decision.unresolved_questions.filter((question: string) =>
      !question.startsWith("Rich-text link:")
    ),
    ...warningMessages.map((message) => `Rich-text link: ${message}`),
  ];
  fs.writeFileSync(filename, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
}


export function enrichRichTextPilot(): void {
  const canonicalSpells = new Map<string, ValidatedJson>();
  for (const filename of jsonFiles(path.join(projectRoot, "data", "canonical"))) {
    const spell = loadJson(filename);
    canonicalSpells.set(spell.spell_id, spell);
  }
  const observations = observationIndex();

  for (const spellId of richTextPilotSpellIds) {
    const filename = canonicalFilename(spellId);
    const canonical = loadJson(filename);
    const baselineObservationId = canonical.provenance.find((item: ValidatedJson) =>
      item.field_path === "/description" || item.source_field === "spell_raw.description_raw"
    )?.observation_id ?? canonical.relationships.flatMap(
      (relationship: ValidatedJson) => relationship.evidence,
    ).find((evidence: ValidatedJson) =>
      evidence.source_field === "spell_raw.description_raw" &&
      String(evidence.observation_id).startsWith("aon:")
    )?.observation_id;
    const observation = observations.get(baselineObservationId);
    if (!observation || observation.record.source.site_id !== "aon") {
      throw new Error(`${spellId} has no indexed AoN baseline observation`);
    }
    const artifactPath = path.resolve(
      path.dirname(observation.filename),
      observation.record.retrieval.raw_artifact_path,
    );
    const parsed = parseAonSpell(
      fs.readFileSync(artifactPath, "utf8"),
      observation.record.source.url,
    );
    const canonicalRaw = String(canonical.description.raw);
    const exactSourceDescription = comparableRichText(parsed.descriptionRaw) ===
      comparableRichText(canonicalRaw);
    const leakedMythicSuffix = canonicalRaw.startsWith(parsed.descriptionRaw) &&
      /\bMythic\b/.test(canonicalRaw.slice(parsed.descriptionRaw.length));
    if (!exactSourceDescription && !leakedMythicSuffix) {
      throw new Error(
        `${spellId} AoN HTML differs from the canonical description:\n` +
        `AoN: ${JSON.stringify(parsed.descriptionRaw)}\n` +
        `Canonical: ${JSON.stringify(canonical.description.raw)}`,
      );
    }
    if (leakedMythicSuffix) {
      canonical.description.raw = parsed.descriptionRaw;
      canonical.description.search_text = JSON.stringify(parsed.descriptionRaw)
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en-US");
    }
    const sourceDocument = parseRichTextHtml(parsed.descriptionHtml);

    const reconciled = mergeRelationships(
      canonical.relationships.filter((relationship: ValidatedJson) =>
        !leakedMythicSuffix ||
        !darknessMythicOnlyTargets.has(String(relationship.target.entity_id))
      ),
      spellId,
      canonicalSpells,
    );
    reconciled.relationships = addDisambiguatedSelfReference(
      canonical,
      sourceDocument,
      reconciled.relationships,
      baselineObservationId,
      observation.record.source.url,
    );
    const richText = linkRichTextDocument(
      sourceDocument,
      reconciled.relationships,
      { ownerEntityId: spellId },
    );
    if (
      comparableRichText(richTextLeafText(richText.document)) !==
      comparableRichText(String(canonical.description.raw))
    ) {
      throw new Error(`${spellId} rich-text parsing changed the visible description`);
    }

    canonical.schema_version = "0.2.0";
    canonical.relationships = reconciled.relationships;
    canonical.description.document = richText.document;
    canonical.provenance = canonical.provenance.filter((item: ValidatedJson) =>
      item.field_path !== "/description/document"
    );
    canonical.provenance.push({
      field_path: "/description/document",
      observation_id: baselineObservationId,
      source_field: "spell_raw.description_raw",
      raw_value_sha256: crypto.createHash("sha256").update(JSON.stringify(parsed.descriptionRaw)).digest("hex"),
      decision: "normalized",
      note:
        "Block structure and emphasis come from the selected AoN HTML; entity links come from accepted canonical relationships.",
    });
    canonical.normalization.normalizer_version = "0.2.0-rich-text-pilot";
    canonical.normalization.warnings = canonical.normalization.warnings.filter(
      (warning: ValidatedJson) =>
        warning.code !== "AMBIGUOUS_RICH_TEXT_LINK" &&
        warning.code !== "UNMATCHED_RICH_TEXT_LINK" &&
        warning.code !== "RICH_TEXT_SOURCE_STRUCTURE_FALLBACK",
    );
    const warningMessages: string[] = [];
    for (const warning of richText.warnings) {
      const message = warning.code === "AMBIGUOUS_RICH_TEXT_LINK"
        ? `The phrase ${JSON.stringify(warning.phrase)} matches multiple accepted relationships ` +
          `(${warning.relationship_ids.join(", ")}); it remains unlinked.`
        : `No occurrence of ${JSON.stringify(warning.phrase)} matched accepted relationship ` +
          `${warning.relationship_ids[0]}; the relationship remains under Related rules.`;
      warningMessages.push(message);
      canonical.normalization.warnings.push({
        code: warning.code,
        field_path: "/description/document",
        message,
      });
    }
    if (richText.warnings.length > 0) {
      canonical.normalization.status = "needs_review";
    } else if (leakedMythicSuffix) {
      canonical.normalization.status = "validated";
    }

    fs.writeFileSync(filename, `${JSON.stringify(canonical, null, 2)}\n`, "utf8");
    updateDecision(
      spellId,
      baselineObservationId,
      reconciled.changedIds,
      reconciled.relationships,
      warningMessages,
    );
    canonicalSpells.set(spellId, canonical);
  }
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  enrichRichTextPilot();
  console.log(`Enriched ${richTextPilotSpellIds.length} pilot spells with rich text.`);
}
