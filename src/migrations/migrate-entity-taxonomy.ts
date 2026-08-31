import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";


interface Route {
  to: string;
  entity_type: string;
  source_hrefs: string[];
  relationship_ids?: string[];
}


interface MigrationDecision {
  from: string;
  action: "merge" | "reject" | "rename" | "split";
  to?: string;
  entity_type?: string;
  fields?: Record<string, unknown>;
  relationship_fields?: Record<string, unknown>;
  routes?: Route[];
  default_to?: string;
}


interface RegistryEntity {
  entity_id: string;
  entity_type: string;
  name: string;
  status: "resolved" | "stub";
  aliases: string[];
  evidence: Array<Record<string, unknown>>;
  notes: string[];
  relationships?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}


interface RegistryDocument {
  $schema?: string;
  schema_version: string;
  registry_id: string;
  entities: RegistryEntity[];
}


function jsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? jsonFiles(filename) :
      filename.endsWith(".json") ? [filename] : [];
  }).sort();
}


function unique<T>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function readableName(entityId: string): string {
  return entityId.split(".").at(-1)!.replaceAll("-", " ");
}


const migrationPath = path.join(
  projectRoot, "data", "migrations", "entity-taxonomy-v1.json",
);
const migration = JSON.parse(fs.readFileSync(migrationPath, "utf8")) as {
  decisions: MigrationDecision[];
};
const decisions = new Map(migration.decisions.map((decision) => [decision.from, decision]));

for (const decision of migration.decisions) {
  const targets = decision.action === "split" ? [
    ...(decision.routes ?? []).map((route) => route.to),
    decision.default_to,
  ] : [decision.to];
  const chainedTarget = targets.find((target) => {
    const targetDecision = target && decisions.get(target);
    return targetDecision && targetDecision.to !== target;
  });
  if (chainedTarget) {
    throw new Error(`Migration decision ${decision.from} points to another decision: ${chainedTarget}`);
  }
}


function hrefsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(hrefsIn);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.source_href === "string" ? [record.source_href] : []),
    ...Object.values(record).flatMap(hrefsIn),
  ];
}


function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}


function routeMatches(route: Route, routes: Route[], href: string): boolean {
  if (route.source_hrefs.includes(href)) return true;
  const lower = href.toLocaleLowerCase();
  const hrefSlug = slug(lower);
  const targetSlug = route.to.split(".").at(-1)!;
  const roleMatches: Record<string, boolean> = {
    bloodline: lower.includes("bloodline"),
    creature_subtype: lower.includes("creature-type") || lower.includes("creaturetype"),
    creature_template: lower.includes("template"),
    domain: lower.includes("/domains/") && !lower.includes("subdomain") &&
      !/\/[^/]+-domain\/[^/]+/.test(new URL(href).pathname),
    hazard: lower.includes("hazard"),
    monster: lower.includes("monster") && !lower.includes("template") &&
      !lower.includes("creature-type") && !lower.includes("monsters-by-type"),
    monster_type: lower.includes("creature-type") || lower.includes("creaturetype") ||
      lower.includes("monsters-by-type"),
    mystery: lower.includes("myster"),
    race: lower.includes("race"),
    special_ability: lower.includes("special-abilities"),
    subdomain: lower.includes("/domains/") &&
      (lower.includes("subdomain") || /\/[^/]+-domain\/[^/]+/.test(new URL(href).pathname)),
    universal_monster_rule: lower.includes("universal-monster-rules") || lower.includes("umr.aspx"),
  };
  if (!roleMatches[route.entity_type]) return false;
  const sameTypeRoutes = routes.filter((candidate) => candidate.entity_type === route.entity_type);
  return sameTypeRoutes.length === 1 || hrefSlug.includes(targetSlug);
}


function routeFor(decision: MigrationDecision, context: unknown): Route | null {
  const hrefs = hrefsIn(context);
  const routes = decision.routes ?? [];
  const relationshipId = context && typeof context === "object" ?
    (context as Record<string, unknown>).relationship_id : undefined;
  const relationshipRoute = routes.find((route) =>
    typeof relationshipId === "string" && route.relationship_ids?.includes(relationshipId),
  );
  if (relationshipRoute) return relationshipRoute;
  const matches = routes.filter((route) =>
    hrefs.some((href) => routeMatches(route, routes, href)),
  );
  if (matches.length === 1) return matches[0]!;
  return routes.find((route) => route.to === decision.default_to) ?? null;
}


function directTarget(
  entityId: string,
  context: unknown,
): { entity_id: string; entity_type: string; decision: MigrationDecision } | null {
  const decision = decisions.get(entityId);
  if (!decision || decision.action === "reject") return null;
  if (decision.action === "split") {
    const route = routeFor(decision, context);
    return route ? { entity_id: route.to, entity_type: route.entity_type, decision } : null;
  }
  return {
    entity_id: decision.to!,
    entity_type: decision.entity_type!,
    decision,
  };
}


const registryDirectory = path.join(projectRoot, "data", "entities");
const registryFiles = jsonFiles(registryDirectory);
const registries = new Map<string, RegistryDocument>();
const originalEntities = new Map<string, { entity: RegistryEntity; filename: string }>();
for (const filename of registryFiles) {
  const registry = JSON.parse(fs.readFileSync(filename, "utf8")) as RegistryDocument;
  registries.set(filename, registry);
  for (const entity of registry.entities) {
    if (originalEntities.has(entity.entity_id)) {
      throw new Error(`Duplicate entity before migration: ${entity.entity_id}`);
    }
    originalEntities.set(entity.entity_id, { entity, filename });
  }
}


const candidates = new Map<string, Array<{
  entity: RegistryEntity;
  filename: string;
  exact: boolean;
}>>();
for (const { entity, filename } of originalEntities.values()) {
  const decision = decisions.get(entity.entity_id);
  if (!decision) {
    candidates.set(entity.entity_id, [
      ...(candidates.get(entity.entity_id) ?? []),
      { entity, filename, exact: true },
    ]);
    continue;
  }
  if (decision.action === "reject") continue;
  if (decision.action === "split") {
    for (const route of decision.routes ?? []) {
      const sourceHrefs = new Set(route.source_hrefs);
      const evidence = entity.evidence.filter((item) =>
        sourceHrefs.has(String(item.source_href ?? "")),
      );
      const split = {
        ...entity,
        entity_id: route.to,
        entity_type: route.entity_type,
        status: evidence.length > 0 ? entity.status : "stub",
        evidence,
      };
      candidates.set(route.to, [
        ...(candidates.get(route.to) ?? []),
        { entity: split, filename, exact: false },
      ]);
    }
    continue;
  }
  const migrated = {
    ...entity,
    ...decision.fields,
    entity_id: decision.to!,
    entity_type: decision.entity_type!,
  };
  candidates.set(decision.to!, [
    ...(candidates.get(decision.to!) ?? []),
    { entity: migrated, filename, exact: false },
  ]);
}


function mergeEntities(items: Array<{
  entity: RegistryEntity;
  filename: string;
  exact: boolean;
}>): {
  entity: RegistryEntity;
  filename: string;
} {
  const exact = items.find((item) => item.exact);
  const preferred = exact ?? [...items].sort((left, right) =>
    right.entity.name.length - left.entity.name.length,
  )[0]!;
  return {
    filename: preferred.filename,
    entity: {
      ...preferred.entity,
      status: items.some(({ entity }) => entity.status === "resolved") ? "resolved" : "stub",
      aliases: unique(items.flatMap(({ entity }) => entity.aliases)),
      evidence: unique(items.flatMap(({ entity }) => entity.evidence)),
      notes: unique(items.flatMap(({ entity }) => entity.notes)),
      relationships: unique(items.flatMap(({ entity }) => entity.relationships ?? [])),
      ...Object.assign({}, ...items.map(({ entity }) =>
        Object.fromEntries(Object.entries(entity).filter(([key]) => key.endsWith("_type"))),
      )),
    },
  };
}


const migratedEntities = new Map(
  [...candidates].map(([entityId, items]) => [entityId, mergeEntities(items)]),
);


const parentEntities: RegistryEntity[] = [];
for (const { entity } of [...migratedEntities.values()]) {
  const segments = entity.entity_id.split(".");
  while (segments.length > 2) {
    segments.pop();
    const parentId = segments.join(".");
    if (migratedEntities.has(parentId)) continue;
    const parent: RegistryEntity = {
      entity_id: parentId,
      entity_type: entity.entity_type,
      name: readableName(parentId),
      status: "stub",
      aliases: [],
      evidence: [],
      notes: [],
      relationships: [],
    };
    migratedEntities.set(parentId, {
      entity: parent,
      filename: path.join(registryDirectory, "entity-taxonomy-parents.json"),
    });
    parentEntities.push(parent);
  }
}


const unresolvedReferences: string[] = [];
function resolvedRelationshipIds(value: unknown): Map<string, string> {
  const resolved = new Map<string, string>();
  function visit(item: unknown): void {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    if (typeof record.relationship_id === "string") {
      const [owner, relationshipType, targetId] = record.relationship_id.split(":");
      if (owner && relationshipType && targetId) {
        const target = directTarget(targetId, record);
        if (target) resolved.set(
          record.relationship_id,
          `${directTarget(owner, record)?.entity_id ?? owner}:${relationshipType}:${target.entity_id}`,
        );
      }
    }
    for (const child of Object.values(record)) visit(child);
  }
  visit(value);
  return resolved;
}


function migrateValue(
  value: unknown,
  location: string,
  relationshipIds = new Map<string, string>(),
): unknown {
  if (Array.isArray(value)) {
    const migratedItems = value.flatMap((item, index) => {
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const target = record.target as Record<string, unknown> | undefined;
        const targetId = typeof target?.entity_id === "string" ? target.entity_id : null;
        const targetDecision = targetId ? decisions.get(targetId) : null;
        const relationshipId = typeof record.relationship_id === "string" ?
          record.relationship_id : null;
        if (targetDecision?.action === "reject") return [];
        if (
          relationshipId &&
          [...decisions.values()].some((decision) =>
            decision.action === "reject" && relationshipId.endsWith(`:${decision.from}`),
          )
        ) {
          if (record.node_type === "entity_link") {
            return [{
              node_type: "text",
              value: record.value,
              ...(record.marks ? { marks: record.marks } : {}),
            }];
          }
          return [];
        }
      }
      return [migrateValue(item, `${location}[${index}]`, relationshipIds)];
    });
    const relationshipIndexes = new Map<string, number>();
    const mergedItems: unknown[] = [];
    for (const item of migratedItems) {
      const relationshipId = item && typeof item === "object" && "target" in item ?
        (item as Record<string, unknown>).relationship_id : undefined;
      if (typeof relationshipId !== "string") {
        mergedItems.push(item);
        continue;
      }
      const existingIndex = relationshipIndexes.get(relationshipId);
      if (existingIndex === undefined) {
        relationshipIndexes.set(relationshipId, mergedItems.length);
        mergedItems.push(item);
        continue;
      }
      const existing = mergedItems[existingIndex] as Record<string, unknown>;
      const duplicate = item as Record<string, unknown>;
      mergedItems[existingIndex] = {
        ...existing,
        evidence: unique([
          ...((existing.evidence as unknown[]) ?? []),
          ...((duplicate.evidence as unknown[]) ?? []),
        ]),
      };
    }
    return mergedItems;
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const migrated: Record<string, unknown> = {};
  const resolvedRelationshipId = typeof record.relationship_id === "string" ?
    relationshipIds.get(record.relationship_id) : undefined;
  const resolvedRelationshipTarget = resolvedRelationshipId?.split(":").at(-1);
  for (const [key, item] of Object.entries(record)) {
    if (
      key === "target" && resolvedRelationshipTarget &&
      item && typeof item === "object"
    ) {
      const target = { ...(item as Record<string, unknown>) };
      target.entity_id = resolvedRelationshipTarget;
      target.entity_type = migratedEntities.get(resolvedRelationshipTarget)?.entity.entity_type ?? target.entity_type;
      migrated[key] = target;
      continue;
    }
    if ((key === "entity_id" || key.endsWith("_entity_id")) &&
        typeof item === "string" && decisions.has(item)) {
      const target = directTarget(item, record);
      if (!target) {
        if (decisions.get(item)!.action === "split") unresolvedReferences.push(`${location}: ${item}`);
        migrated[key] = item;
      } else {
        migrated[key] = target.entity_id;
        if ("entity_type" in record) migrated.entity_type = target.entity_type;
      }
      continue;
    }
    if (key === "relationship_id" && typeof item === "string") {
      if (relationshipIds.has(item)) {
        migrated[key] = relationshipIds.get(item)!;
        continue;
      }
      const [owner, relationshipType, targetId] = item.split(":");
      if (owner && relationshipType && targetId) {
        const ownerTarget = directTarget(owner, record);
        const target = directTarget(targetId, record);
        const targetDecision = decisions.get(targetId);
        if (targetDecision?.action === "reject" && !("target" in record)) continue;
        if (targetDecision?.action === "split" && !target) {
          unresolvedReferences.push(`${location}: ${item}`);
        }
        migrated[key] = `${ownerTarget?.entity_id ?? owner}:${relationshipType}:${target?.entity_id ?? targetId}`;
        continue;
      }
    }
    migrated[key] = migrateValue(item, `${location}.${key}`, relationshipIds);
  }
  const target = migrated.target as Record<string, unknown> | undefined;
  if (target && typeof target.entity_id === "string") {
    const decision = decisions.get(String((record.target as Record<string, unknown>)?.entity_id ?? ""));
    if (decision?.relationship_fields) Object.assign(migrated, decision.relationship_fields);
  }
  return migrated;
}


const write = process.argv.includes("--write");
const rewrittenFiles: string[] = [];
for (const [filename, registry] of registries) {
  const entities = [...migratedEntities.values()]
    .filter((item) => item.filename === filename)
    .map((item) => migrateValue(item.entity, filename) as RegistryEntity)
    .sort((left, right) => left.entity_id.localeCompare(right.entity_id));
  const document = { ...registry, entities };
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (serialized !== fs.readFileSync(filename, "utf8")) rewrittenFiles.push(filename);
  if (write) fs.writeFileSync(filename, serialized);
}
if (parentEntities.length > 0) {
  const filename = path.join(registryDirectory, "entity-taxonomy-parents.json");
  const document: RegistryDocument = {
    $schema: "../../schemas/entity-registry.schema.json",
    schema_version: "0.1.0",
    registry_id: "entity-taxonomy-parents-v1",
    entities: parentEntities
      .map((entity) => migrateValue(entity, filename) as RegistryEntity)
      .sort((left, right) => left.entity_id.localeCompare(right.entity_id)),
  };
  if (write) fs.writeFileSync(filename, `${JSON.stringify(document, null, 2)}\n`);
  rewrittenFiles.push(filename);
}


for (const directory of ["canonical", "coverage", "decisions", "manifests", "queue", "variants"]
  .map((name) => path.join(projectRoot, "data", name))) {
  for (const filename of jsonFiles(directory)) {
    const original = JSON.parse(fs.readFileSync(filename, "utf8")) as unknown;
    const migrated = migrateValue(original, filename, resolvedRelationshipIds(original));
    const serialized = `${JSON.stringify(migrated, null, 2)}\n`;
    if (serialized === fs.readFileSync(filename, "utf8")) continue;
    rewrittenFiles.push(filename);
    if (write) fs.writeFileSync(filename, serialized);
  }
}


const report = {
  mode: write ? "write" : "dry-run",
  decisions: migration.decisions.length,
  entities_before: originalEntities.size,
  entities_after: migratedEntities.size,
  structural_parents_added: parentEntities.length,
  files_rewritten: unique(rewrittenFiles).length,
  unresolved_references: unique(unresolvedReferences),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.unresolved_references.length > 0) process.exitCode = 1;
