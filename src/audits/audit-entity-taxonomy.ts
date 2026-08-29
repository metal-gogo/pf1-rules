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
  relationships?: EntityRelationship[];
}


const placeholderNames = new Set([
  "click here",
  "here",
  "see source blog post",
  "source",
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

const findings = {
  mismatched_roots: mismatchedRoots,
  missing_parents: missingParents,
  relationship_type_mismatches: relationshipTypeMismatches,
  relationship_id_mismatches: relationshipIdMismatches,
  placeholder_entities: placeholders,
  cross_type_names: crossTypeNames,
};
const summary = Object.fromEntries(
  Object.entries(findings).map(([name, values]) => [name, values.length]),
);
const details = process.argv.includes("--details");
console.log(JSON.stringify({ entities: entities.length, summary, ...(details ? { findings } : {}) }, null, 2));

if (process.argv.includes("--strict") && Object.values(summary).some((count) => count > 0)) {
  process.exitCode = 1;
}
