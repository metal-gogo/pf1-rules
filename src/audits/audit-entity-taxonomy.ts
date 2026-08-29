import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";


interface EntityRelationship {
  relationship_id: string;
  type: string;
  target: {
    entity_id: string | null;
    entity_type: string;
  };
}


interface RegistryEntity {
  entity_id: string;
  entity_type: string;
  name: string;
  evidence?: Array<{
    source_field: string;
    source_href: string | null;
  }>;
  relationships?: EntityRelationship[];
}


const placeholderNames = new Set([
  "click here",
  "here",
  "see source blog post",
  "source",
]);

const creatureTypeNames = new Set([
  "aberration",
  "animal",
  "construct",
  "dragon",
  "fey",
  "humanoid",
  "magical beast",
  "monstrous humanoid",
  "ooze",
  "outsider",
  "plant",
  "undead",
  "vermin",
]);


function jsonFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? jsonFiles(filename) : [filename];
    })
    .filter((filename) => filename.endsWith(".json"))
    .sort();
}


function normalizedName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}


function expectedRoot(entityType: string): string {
  return entityType.replaceAll("_", "-");
}


function immediateParent(entityId: string): string | null {
  const segments = entityId.split(".");
  return segments.length > 2 ? segments.slice(0, -1).join(".") : null;
}


function sourceRole(sourceHref: string): string | null {
  let source: URL;
  try {
    source = new URL(sourceHref);
  } catch {
    return null;
  }
  const host = source.hostname.toLocaleLowerCase();
  const pathname = source.pathname.toLocaleLowerCase().replace(/\/+$/, "");

  if (pathname.includes("/bestiary/monster-listings/templates")) {
    return "creature_template";
  }
  const monsterPath = pathname.split("/bestiary/monster-listings/")[1];
  if (
    (monsterPath && monsterPath.split("/").length > 1) ||
    pathname.endsWith("/monsterdisplay.aspx")
  ) {
    return "monster";
  }
  if (pathname.includes("/bestiary/rules-for-monsters/universal-monster-rules")) {
    return "universal_monster_rule";
  }
  if (
    pathname.includes("/bestiary/rules-for-monsters/creature-types") ||
    pathname.endsWith("/bestiary/creaturetypes.html")
  ) {
    return "creature_classification";
  }
  if (pathname.includes("/equipment/weapons/weapon-descriptions/")) {
    return "weapon";
  }
  if (pathname.includes("/magic-items/magic-weapons/magic-weapon-special-abilities/")) {
    return "weapon_special_ability";
  }
  if (
    pathname.includes("/feats/") ||
    pathname.endsWith("/featdisplay.aspx") ||
    pathname.endsWith("/corerulebook/feats.html")
  ) {
    return "feat";
  }
  if (
    pathname.includes("/magic/all-spells/") ||
    pathname.endsWith("/spelldisplay.aspx") ||
    pathname.includes("/corerulebook/spells/")
  ) {
    return "spell";
  }
  if (pathname.includes("/gamemastering/conditions")) {
    return "condition";
  }
  if (
    pathname.includes("/skills/") ||
    pathname.endsWith("/skillsdisplay.aspx")
  ) {
    return "skill";
  }
  if (pathname.includes("/classes/core-classes/cleric/domains/")) {
    const domainPath = pathname.split("/paizo-domains/")[1];
    const segments = pathname.split("/");
    const nestedUnderDomain = segments.slice(0, -1).some((segment) =>
      segment.endsWith("-domain"),
    ) && !segments.at(-1)?.endsWith("-domain");
    return pathname.includes("subdomain") ||
      nestedUnderDomain || (domainPath && domainPath.split("/").length > 1) ?
      "subdomain" : "domain";
  }
  if (pathname.includes("/classes/base-classes/oracle/mysteries/")) {
    return "mystery";
  }
  if (pathname.includes("/classes/core-classes/sorcerer/bloodlines/")) {
    return "bloodline";
  }
  if (pathname.includes("/arcane-schools/")) {
    return "magic_school";
  }
  if (
    host.endsWith("paizo.com") &&
    (pathname.includes("/products/") || pathname.includes("/product/"))
  ) {
    return "publication";
  }
  return null;
}


function proposedEntityId(entity: RegistryEntity, entityType: string): string {
  const slug = entity.entity_id.replace(/^rule\./, "");
  if (entityType === "bloodline") return `bloodline.sorcerer.${slug}`;
  if (
    entityType === "magic_school" &&
    (entity.evidence ?? []).some((evidence) =>
      evidence.source_href?.includes("/elemental-arcane-schools/"),
    )
  ) {
    return `magic-school.${slug}-elemental`;
  }
  if (entityType === "creature_template" && slug === "advanced") {
    return "creature-template.simple.advanced";
  }
  return `${expectedRoot(entityType)}.${slug}`;
}


function sourceTargetId(
  entity: RegistryEntity,
  entityType: string,
  sourceHref: string,
): string {
  const source = new URL(sourceHref);
  const pathname = source.pathname.toLocaleLowerCase().replace(/\/+$/, "");
  const lastSegment = decodeURIComponent(pathname.split("/").at(-1) ?? "");
  const entitySlug = entity.entity_id.replace(/^rule\./, "");
  if (entityType === "domain") {
    return `domain.${lastSegment.replace(/-domain$/, "")}`;
  }
  if (entityType === "subdomain") return `subdomain.${lastSegment}`;
  if (entityType === "bloodline") {
    return `bloodline.sorcerer.${lastSegment.replace(/-bloodline$/, "")}`;
  }
  if (entityType === "mystery") {
    return `mystery.${lastSegment.replace(/-oracle-mystery$/, "")}`;
  }
  if (entityType === "magic_school") {
    const school = lastSegment.replace(/-elemental-school$/, "");
    return `magic-school.${school}-elemental`;
  }
  if (entityType === "monster" && pathname.endsWith("/monsterdisplay.aspx")) {
    const itemName = source.searchParams.get("ItemName");
    return `monster.${normalizedName(itemName ?? entity.name).replaceAll(" ", "-")}`;
  }
  if (
    entityType === "monster" &&
    (/^elemental-(air|earth|fire|water)$/.test(lastSegment) ||
      lastSegment === "skeleton-medium")
  ) {
    return `monster.${entitySlug.replace(/s$/, "")}`;
  }
  if (entityType === "monster" || entityType === "creature_template") {
    return `${expectedRoot(entityType)}.${lastSegment}`;
  }
  if (entityType === "spell" && pathname.endsWith("/spelldisplay.aspx")) {
    const itemName = source.searchParams.get("ItemName");
    return `spell.${normalizedName(itemName ?? entity.name).replaceAll(" ", "-")}`;
  }
  if (entityType === "spell") return `spell.${lastSegment}`;
  if (entityType === "weapon") return `weapon.${lastSegment}`;
  return proposedEntityId(entity, entityType);
}


const entities = jsonFiles(path.join(projectRoot, "data", "entities"))
  .flatMap((filename) => {
    const registry = JSON.parse(fs.readFileSync(filename, "utf8")) as {
      entities: RegistryEntity[];
    };
    return registry.entities;
  });
const byId = new Map(entities.map((entity) => [entity.entity_id, entity]));

const mismatchedRoots = entities
  .filter((entity) => entity.entity_id.split(".", 1)[0] !== expectedRoot(entity.entity_type))
  .map((entity) => ({
    entity_id: entity.entity_id,
    entity_type: entity.entity_type,
    expected_root: expectedRoot(entity.entity_type),
  }));

const missingParents = entities
  .map((entity) => ({ entity_id: entity.entity_id, parent_id: immediateParent(entity.entity_id) }))
  .filter(({ parent_id }) => parent_id !== null && !byId.has(parent_id));

const relationshipTypeMismatches: object[] = [];
const relationshipIdMismatches: object[] = [];
for (const entity of entities) {
  for (const relationship of entity.relationships ?? []) {
    const targetId = relationship.target.entity_id;
    if (!targetId) continue;
    const target = byId.get(targetId);
    if (target && target.entity_type !== relationship.target.entity_type) {
      relationshipTypeMismatches.push({
        relationship_id: relationship.relationship_id,
        declared_type: relationship.target.entity_type,
        actual_type: target.entity_type,
      });
    }
    const expectedId = `${entity.entity_id}:${relationship.type}:${targetId}`;
    if (relationship.relationship_id !== expectedId) {
      relationshipIdMismatches.push({
        relationship_id: relationship.relationship_id,
        expected_id: expectedId,
      });
    }
  }
}

const placeholders = entities
  .filter((entity) => placeholderNames.has(normalizedName(entity.name)))
  .map((entity) => ({ entity_id: entity.entity_id, name: entity.name }));

const byName = new Map<string, RegistryEntity[]>();
for (const entity of entities) {
  const name = normalizedName(entity.name);
  byName.set(name, [...(byName.get(name) ?? []), entity]);
}
const crossTypeNames = [...byName.entries()]
  .filter(([, matches]) => new Set(matches.map((entity) => entity.entity_type)).size > 1)
  .map(([name, matches]) => ({
    name,
    entity_ids: matches.map((entity) => entity.entity_id).sort(),
    entity_types: [...new Set(matches.map((entity) => entity.entity_type))].sort(),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

const ruleRoleCandidates: object[] = [];
const ambiguousRuleRoles: object[] = [];
for (const entity of entities.filter((candidate) => candidate.entity_type === "rule")) {
  if (placeholderNames.has(normalizedName(entity.name))) continue;
  const classifications = [...new Map(
    (entity.evidence ?? []).flatMap((evidence) => {
      if (!evidence.source_href || !evidence.source_field.includes("links_raw")) return [];
      const sourceEntityRole = sourceRole(evidence.source_href);
      if (!sourceEntityRole) return [];
      const entityType = sourceEntityRole === "creature_classification" ?
        creatureTypeNames.has(normalizedName(entity.name)) ? "creature_type" :
          "creature_subtype" : sourceEntityRole;
      const entityId = sourceTargetId(entity, entityType, evidence.source_href);
      return [[`${entityType}:${entityId}`, { entity_type: entityType, entity_id: entityId }]];
    }),
  ).values()].sort((left, right) => left.entity_id.localeCompare(right.entity_id));
  if (classifications.length === 1) {
    const proposedEntityType = classifications[0]!.entity_type;
    const proposedId = classifications[0]!.entity_id;
    const existingTargets = [...new Set([
      ...(byName.get(normalizedName(entity.name)) ?? [])
        .filter((candidate) => candidate.entity_type === proposedEntityType)
        .map((candidate) => candidate.entity_id),
      ...(byId.get(proposedId)?.entity_type === proposedEntityType ? [proposedId] : []),
    ])].sort();
    ruleRoleCandidates.push({
      entity_id: entity.entity_id,
      name: entity.name,
      proposed_entity_type: proposedEntityType,
      proposed_entity_id: proposedId,
      existing_targets: existingTargets,
      action: existingTargets.length === 1 ? "merge" :
        existingTargets.length === 0 ? "rename" : "review",
    });
  } else if (classifications.length > 1) {
    ambiguousRuleRoles.push({
      entity_id: entity.entity_id,
      name: entity.name,
      proposed_entities: classifications,
      action: "split",
    });
  }
}

const migrationActions = [
  ...ruleRoleCandidates,
  ...ambiguousRuleRoles,
  ...placeholders.map((entity) => ({ ...entity, action: "reject" })),
];

const findings = {
  mismatched_roots: mismatchedRoots,
  missing_parents: missingParents,
  relationship_type_mismatches: relationshipTypeMismatches,
  relationship_id_mismatches: relationshipIdMismatches,
  placeholder_entities: placeholders,
  cross_type_names: crossTypeNames,
  rule_role_candidates: ruleRoleCandidates,
  ambiguous_rule_roles: ambiguousRuleRoles,
  migration_actions: migrationActions,
};
const summary = Object.fromEntries(
  Object.entries(findings).map(([name, values]) => [name, values.length]),
);
const details = process.argv.includes("--details");
console.log(JSON.stringify({ entities: entities.length, summary, ...(details ? { findings } : {}) }, null, 2));

if (process.argv.includes("--strict") && Object.values(summary).some((count) => count > 0)) {
  process.exitCode = 1;
}
