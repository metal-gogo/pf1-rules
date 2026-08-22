import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import { validatePackage } from "./validate.js";


interface SourceList {
  spellListId: string;
  maximumLevel?: number;
}

interface DerivedListSpec {
  targetSpellListId: string;
  targetListName: string;
  ownerEntityId: string;
  ownerName: string;
  ownerType: "class" | "npc_class";
  sourceLists: SourceList[];
  levelPolicy: string;
  sourceUrl: string;
  ruleScope: "core" | "later_first_party" | "legacy_3_5" | "third_party" | "unknown";
  includeSpellIds?: string[];
}

const derivedLists: DerivedListSpec[] = [
  {
    targetSpellListId: "spell-list.omdura",
    targetListName: "Omdura",
    ownerEntityId: "class.omdura",
    ownerName: "Omdura",
    ownerType: "class",
    sourceLists: [
      { spellListId: "spell-list.cleric", maximumLevel: 6 },
      { spellListId: "spell-list.inquisitor", maximumLevel: 6 },
    ],
    levelPolicy: "Use Cleric spells through level 6 and all Inquisitor spells; use the lower level when both lists contain the spell.",
    sourceUrl: "https://www.d20pfsrd.com/classes/base-classes/omdura/",
    ruleScope: "third_party",
  },
  {
    targetSpellListId: "spell-list.oracle",
    targetListName: "Oracle",
    ownerEntityId: "class.oracle",
    ownerName: "Oracle",
    ownerType: "class",
    sourceLists: [{ spellListId: "spell-list.cleric" }],
    levelPolicy: "Use the Cleric spell list at the same spell level; retain separately printed Oracle and mystery access.",
    sourceUrl: "https://legacy.aonprd.com/advancedPlayersGuide/baseClasses/oracle.html",
    ruleScope: "later_first_party",
  },
  {
    targetSpellListId: "spell-list.arcanist",
    targetListName: "Arcanist",
    ownerEntityId: "class.arcanist",
    ownerName: "Arcanist",
    ownerType: "class",
    sourceLists: [
      { spellListId: "spell-list.sorcerer" },
      { spellListId: "spell-list.wizard" },
    ],
    levelPolicy: "Use the Sorcerer/Wizard spell list; use the lower level if the source lists differ.",
    sourceUrl: "https://legacy.aonprd.com/advancedClassGuide/classes/arcanist.html",
    ruleScope: "later_first_party",
  },
  {
    targetSpellListId: "spell-list.investigator",
    targetListName: "Investigator",
    ownerEntityId: "class.investigator",
    ownerName: "Investigator",
    ownerType: "class",
    sourceLists: [{ spellListId: "spell-list.alchemist", maximumLevel: 6 }],
    levelPolicy: "Use the Alchemist formula list through level 6 at the same formula level; retain separately printed Investigator formulas.",
    sourceUrl: "https://legacy.aonprd.com/advancedclassguide/classes/investigator.html",
    ruleScope: "later_first_party",
  },
  {
    targetSpellListId: "spell-list.skald",
    targetListName: "Skald",
    ownerEntityId: "class.skald",
    ownerName: "Skald",
    ownerType: "class",
    sourceLists: [{ spellListId: "spell-list.bard", maximumLevel: 6 }],
    levelPolicy: "Use the Bard spell list through level 6 at the same spell level; retain separately printed Skald spells.",
    sourceUrl: "https://legacy.aonprd.com/advancedClassGuide/classes/skald.html",
    ruleScope: "later_first_party",
  },
  {
    targetSpellListId: "spell-list.warpriest",
    targetListName: "Warpriest",
    ownerEntityId: "class.warpriest",
    ownerName: "Warpriest",
    ownerType: "class",
    sourceLists: [{ spellListId: "spell-list.cleric", maximumLevel: 6 }],
    levelPolicy: "Use Cleric spells through level 6 at the same spell level; retain separately printed Warpriest spells.",
    sourceUrl: "https://legacy.aonprd.com/advancedClassGuide/classes/warpriest.html",
    ruleScope: "later_first_party",
  },
  {
    targetSpellListId: "spell-list.hunter",
    targetListName: "Hunter",
    ownerEntityId: "class.hunter",
    ownerName: "Hunter",
    ownerType: "class",
    sourceLists: [
      { spellListId: "spell-list.druid", maximumLevel: 6 },
      { spellListId: "spell-list.ranger", maximumLevel: 6 },
    ],
    levelPolicy: "Use Druid and Ranger spells through level 6; use the lower level when both lists contain the spell.",
    sourceUrl: "https://legacy.aonprd.com/advancedClassGuide/classes/hunter.html",
    ruleScope: "later_first_party",
  },
  {
    targetSpellListId: "spell-list.summoner-unchained",
    targetListName: "Summoner (Unchained)",
    ownerEntityId: "class.summoner-unchained",
    ownerName: "Summoner (Unchained)",
    ownerType: "class",
    sourceLists: [{ spellListId: "spell-list.summoner", maximumLevel: 6 }],
    levelPolicy: "Apply Monster Summoner's Handbook summoner spell options to both the base and Unchained Summoner at the printed Summoner level.",
    sourceUrl: "https://paizo.com/blog/i-can-call-spirits-from-the-vasty-deep",
    ruleScope: "later_first_party",
    includeSpellIds: [
      "spell.alter-summoned-monster",
      "spell.final-sacrifice",
      "spell.gird-ally",
      "spell.instant-restoration",
      "spell.masters-escape",
      "spell.masters-mutation",
      "spell.summon-laborers",
    ],
  },
];

const npcClasses = ["Adept", "Aristocrat", "Commoner", "Expert", "Warrior"] as const;


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function writeJson(filename: string, value: unknown): void {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}


function directJsonFiles(directory: string): string[] {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(directory, name))
    .sort();
}


function slug(value: string): string {
  return value.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}


function uniqueEvidence(evidence: ValidatedJson[]): ValidatedJson[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function sourceLevels(record: ValidatedJson, spec: DerivedListSpec): ValidatedJson[] {
  if (spec.includeSpellIds && !spec.includeSpellIds.includes(record.spell_id)) return [];
  return record.levels.filter((level: ValidatedJson) => {
    const source = spec.sourceLists.find((item) => item.spellListId === level.spell_list_id);
    return source && (source.maximumLevel === undefined || level.level <= source.maximumLevel);
  });
}


function relationshipEvidenceForSources(
  record: ValidatedJson,
  sources: ValidatedJson[],
): ValidatedJson[] {
  const sourceIds = new Set(sources.map((source) => source.spell_list_id));
  const relationshipEvidence = uniqueEvidence(record.relationships
    .filter((relationship: ValidatedJson) =>
      relationship.type === "appears_on_spell_list" &&
      sourceIds.has(relationship.target?.entity_id),
    )
    .flatMap((relationship: ValidatedJson) => relationship.evidence));
  if (relationshipEvidence.length > 0) return relationshipEvidence;

  const levelProvenance = record.provenance.filter(
    (item: ValidatedJson) => item.field_path === "/levels" || /^\/levels\/\d+$/.test(item.field_path),
  );
  return uniqueEvidence(levelProvenance.map((item: ValidatedJson) => ({
    observation_id: item.observation_id,
    source_field: item.source_field,
    evidence_kind: "plain_text",
    anchor_text_raw: sources.map((source) => source.raw).join("; "),
    source_href: null,
  })));
}


function ensureOwnerRegistry(
  registry: ValidatedJson,
  registries: ValidatedJson[],
): void {
  const entitiesById = new Map<string, ValidatedJson>();
  for (const candidateRegistry of registries) {
    for (const entity of candidateRegistry.entities) entitiesById.set(entity.entity_id, entity);
  }

  for (const spec of derivedLists) {
    const list = entitiesById.get(spec.targetSpellListId);
    if (!list) {
      const newList = {
        entity_id: spec.targetSpellListId,
        entity_type: "spell_list",
        name: `${spec.targetListName} Spell List`,
        status: "stub",
        aliases: [],
        evidence: [],
        notes: ["Effective spell list includes source-backed derived access; derived rows are not printed spell-page values."],
      };
      registry.entities.push(newList);
      entitiesById.set(spec.targetSpellListId, newList);
    }
    if (entitiesById.has(spec.ownerEntityId)) continue;
    const evidence = list?.evidence?.slice(0, 1) ?? [];
    const relationships = evidence.length === 0 ? [] : [{
      relationship_id: `${spec.ownerEntityId}:owns_spell_list:${spec.targetSpellListId}`,
      type: "owns_spell_list",
      target: {
        entity_type: "spell_list",
        entity_id: spec.targetSpellListId,
        name: `${spec.targetListName} Spell List`,
      },
      status: "accepted",
      evidence: evidence.map((item: ValidatedJson) => ({
        observation_id: item.observation_id,
        source_field: item.source_field,
        evidence_kind: "plain_text",
        anchor_text_raw: item.anchor_text_raw,
        source_href: item.source_href,
      })),
      note: "The named class owns this effective spell list. Source-rule enrichment is tracked separately from spell-page evidence.",
    }];
    registry.entities.push({
      entity_id: spec.ownerEntityId,
      entity_type: spec.ownerType,
      name: spec.ownerName,
      status: "stub",
      aliases: [],
      evidence,
      notes: [
        `Class-rule source: ${spec.sourceUrl}`,
        "Full class-page source observation is pending.",
      ],
      relationships,
    });
    entitiesById.set(spec.ownerEntityId, registry.entities.at(-1));
  }

  for (const name of npcClasses) {
    const entityId = `npc-class.${slug(name)}`;
    if (entitiesById.has(entityId)) continue;
    const listId = name === "Adept" ? "spell-list.adept" : null;
    const list = listId ? entitiesById.get(listId) : null;
    const evidence = list?.evidence?.slice(0, 1) ?? [];
    const relationships = listId && evidence.length > 0 ? [{
      relationship_id: `${entityId}:owns_spell_list:${listId}`,
      type: "owns_spell_list",
      target: { entity_type: "spell_list", entity_id: listId, name: "Adept Spell List" },
      status: "accepted",
      evidence: evidence.map((item: ValidatedJson) => ({
        observation_id: item.observation_id,
        source_field: item.source_field,
        evidence_kind: "plain_text",
        anchor_text_raw: item.anchor_text_raw,
        source_href: item.source_href,
      })),
      note: "The Adept NPC class owns its printed spell list.",
    }] : [];
    registry.entities.push({
      entity_id: entityId,
      entity_type: "npc_class",
      name,
      status: "stub",
      aliases: [],
      evidence,
      notes: [
        "NPC class in the Pathfinder RPG Core Rulebook.",
        "Full NPC-class source observation is pending.",
      ],
      relationships,
    });
    entitiesById.set(entityId, registry.entities.at(-1));
  }

  registry.entities.sort((left: ValidatedJson, right: ValidatedJson) =>
    left.entity_id.localeCompare(right.entity_id),
  );
}


export function reconcileInheritedClassLists() {
  const canonicalDirectory = path.join(projectRoot, "data", "canonical");
  const decisionDirectory = path.join(projectRoot, "data", "decisions");
  const registryDirectory = path.join(projectRoot, "data", "entities");
  const registryPath = path.join(registryDirectory, "spell-list-owner-entities.json");
  const registryFiles = directJsonFiles(registryDirectory);
  const registries = registryFiles.map(loadJson);
  const ownerRegistry = loadJson(registryPath);
  ensureOwnerRegistry(ownerRegistry, registries);
  writeJson(registryPath, ownerRegistry);

  const summary: Record<string, { added: number; explicitRetained: number }> = {};
  for (const spec of derivedLists) summary[spec.targetSpellListId] = { added: 0, explicitRetained: 0 };

  for (const canonicalPath of directJsonFiles(canonicalDirectory)) {
    const record = loadJson(canonicalPath);
    let changed = false;
    const decisionPath = path.join(decisionDirectory, path.basename(canonicalPath));
    const decision = loadJson(decisionPath);

    for (const spec of derivedLists) {
      const sources = sourceLevels(record, spec);
      if (sources.length === 0) continue;
      const existingTarget = record.levels.find(
        (level: ValidatedJson) => level.spell_list_id === spec.targetSpellListId,
      );
      if (existingTarget) {
        if (
          existingTarget.access_basis === "derived" &&
          existingTarget.derivation?.rule_owner_entity_id === spec.ownerEntityId
        ) {
          const sourceLevel = Math.min(...sources.map((source) => Number(source.level)));
          const sourceScope = sources.find((source) => source.level === sourceLevel)?.scope ?? "unknown";
          if (existingTarget.scope !== sourceScope) {
            existingTarget.scope = sourceScope;
            changed = true;
          }
          if (existingTarget.derivation.rule_scope !== spec.ruleScope) {
            existingTarget.derivation.rule_scope = spec.ruleScope;
            changed = true;
          }
        }
        summary[spec.targetSpellListId]!.explicitRetained += 1;
        continue;
      }
      const evidence = relationshipEvidenceForSources(record, sources);
      if (evidence.length === 0) {
        throw new Error(`${record.spell_id} lacks relationship evidence for ${spec.targetSpellListId}`);
      }
      const level = Math.min(...sources.map((source) => Number(source.level)));
      const sourceMemberships = sources
        .map((source) => ({ spell_list_id: source.spell_list_id, level: source.level }))
        .filter((source, index, all) => all.findIndex((candidate) =>
          candidate.spell_list_id === source.spell_list_id && candidate.level === source.level,
        ) === index)
        .sort((left, right) => left.level - right.level || left.spell_list_id.localeCompare(right.spell_list_id));
      const levelIndex = record.levels.length;
      const sourceLabel = sourceMemberships
        .map((source) => `${source.spell_list_id.replace("spell-list.", "")} ${source.level}`)
        .join(" and ");
      record.levels.push({
        spell_list_id: spec.targetSpellListId,
        list_kind: "class",
        list_name: spec.targetListName,
        level,
        scope: sources.find((source) => source.level === level)?.scope ?? "unknown",
        raw: `Derived access from ${sourceLabel}; effective level ${level}.`,
        access_basis: "derived",
        derivation: {
          rule_owner_entity_id: spec.ownerEntityId,
          rule_scope: spec.ruleScope,
          source_memberships: sourceMemberships,
          level_policy: spec.levelPolicy,
          source_url: spec.sourceUrl,
          note: "This is effective class access derived from the class rule, not a value printed on the spell page.",
        },
        qualifications: [],
      });

      const relationshipId = `${record.spell_id}:appears_on_spell_list:${spec.targetSpellListId}`;
      record.relationships.push({
        relationship_id: relationshipId,
        type: "appears_on_spell_list",
        target: {
          entity_type: "spell_list",
          entity_id: spec.targetSpellListId,
          name: `${spec.targetListName} Spell List`,
        },
        status: "accepted",
        evidence,
        note: `${spec.levelPolicy} This edge records derived access, not a printed spell-page membership.`,
      });
      record.normalization.warnings.push({
        code: "DERIVED_SPELL_LIST_ACCESS",
        field_path: `/levels/${levelIndex}`,
        message: `${spec.targetListName} ${level} access is derived from an explicit class rule; no printed spell-page value was inferred.`,
      });

      const decisionEvidence = uniqueEvidence(evidence.map((item: ValidatedJson) => ({
        observation_id: item.observation_id,
        source_field: item.source_field,
      })));
      const consideredObservationIds = [...new Set(
        decisionEvidence.map((item: ValidatedJson) => item.observation_id),
      )];
      decision.field_decisions.push({
        canonical_path: `/levels/${levelIndex}`,
        decision: "derived",
        selected_evidence: decisionEvidence,
        considered_observation_ids: consideredObservationIds,
        rationale: `${spec.levelPolicy} The source spell-list rows remain preserved separately.`,
      });
      decision.relationship_decisions.push({
        relationship_id: relationshipId,
        decision: "accept",
        evidence: decisionEvidence,
        considered_observation_ids: consideredObservationIds,
        rationale: `${spec.targetListName} access is derived from the class rule and is not treated as a printed spell-page value.`,
      });
      summary[spec.targetSpellListId]!.added += 1;
      changed = true;
    }

    if (changed) {
      writeJson(canonicalPath, record);
      writeJson(decisionPath, decision);
    }
  }

  validatePackage();
  return summary;
}


const report = reconcileInheritedClassLists();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
