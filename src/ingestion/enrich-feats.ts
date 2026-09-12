import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import { buildFeatSourceGraph } from "./feat-source-graph.js";


type RegistryEntry = {
  entity: ValidatedJson;
  filename: string;
  registry: ValidatedJson;
};

export type FeatEnrichmentStatistics = {
  entitiesAdded: number;
  relationshipsAdded: number;
  evidenceAdded: number;
  filesChanged: number;
};


function jsonFiles(directory: string, recursive = false): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return recursive && entry.isDirectory() ? jsonFiles(filename, true) : [filename];
  }).filter((filename) => filename.endsWith(".json")).sort();
}


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function evidenceKey(evidence: ValidatedJson): string {
  return JSON.stringify([
    evidence.observation_id,
    evidence.source_field,
    evidence.evidence_kind,
    evidence.anchor_text_raw ?? null,
    evidence.source_href ?? null,
  ]);
}


function assertSameRelationship(existing: ValidatedJson, incoming: ValidatedJson): void {
  if (existing.type !== incoming.type
    || existing.target.entity_type !== incoming.target.entity_type
    || existing.target.entity_id !== incoming.target.entity_id) {
    throw new Error(`Conflicting relationship identity ${incoming.relationship_id}`);
  }
}


export function enrichFeatRegistries(write = false): FeatEnrichmentStatistics {
  const entityDirectory = path.join(projectRoot, "data", "entities");
  const registryFiles = jsonFiles(entityDirectory).map((filename) => ({
    filename,
    registry: loadJson(filename),
  }));
  const byId = new Map<string, RegistryEntry>();
  for (const { filename, registry } of registryFiles) {
    for (const entity of registry.entities) {
      const existing = byId.get(entity.entity_id);
      if (existing) {
        throw new Error(`Duplicate registered entity ${entity.entity_id} in ${existing.filename} and ${filename}`);
      }
      byId.set(entity.entity_id, { entity, filename, registry });
    }
  }

  const observations = jsonFiles(path.join(projectRoot, "data", "observations"), true).map(loadJson);
  const graph = buildFeatSourceGraph(observations, [...byId.values()].map(({ entity }) => entity));
  const changed = new Set<string>();
  const generatedFilename = path.join(entityDirectory, "feat-source-link-entities.json");
  let generated = registryFiles.find(({ filename }) => filename === generatedFilename)?.registry;
  if (graph.nodes.length && !generated) {
    generated = {
      $schema: "../../schemas/entity-registry.schema.json",
      schema_version: "0.1.0",
      registry_id: "feat-source-link-entities",
      entities: [],
    };
    registryFiles.push({ filename: generatedFilename, registry: generated });
  }
  for (const entity of graph.nodes) {
    if (byId.has(entity.entity_id)) continue;
    generated!.entities.push(entity);
    byId.set(entity.entity_id, { entity, filename: generatedFilename, registry: generated! });
    changed.add(generatedFilename);
  }
  if (generated) generated.entities.sort((left: ValidatedJson, right: ValidatedJson) =>
    left.entity_id.localeCompare(right.entity_id));

  let relationshipsAdded = 0;
  let evidenceAdded = 0;
  for (const { owner, record } of graph.relationships) {
    const entry = byId.get(owner);
    if (!entry) throw new Error(`Relationship owner is not registered: ${owner}`);
    entry.entity.relationships ??= [];
    const existing = entry.entity.relationships.find((relationship: ValidatedJson) =>
      relationship.relationship_id === record.relationship_id);
    if (!existing) {
      entry.entity.relationships.push(record);
      relationshipsAdded += 1;
      evidenceAdded += record.evidence.length;
      changed.add(entry.filename);
      continue;
    }
    assertSameRelationship(existing, record);
    const evidence = new Set(existing.evidence.map(evidenceKey));
    for (const item of record.evidence) {
      if (evidence.has(evidenceKey(item))) continue;
      existing.evidence.push(item);
      evidence.add(evidenceKey(item));
      evidenceAdded += 1;
      changed.add(entry.filename);
    }
  }
  if (write) {
    for (const { filename, registry } of registryFiles) {
      if (changed.has(filename)) fs.writeFileSync(filename, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    }
  }
  return {
    entitiesAdded: graph.nodes.length,
    relationshipsAdded,
    evidenceAdded,
    filesChanged: changed.size,
  };
}


if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  const write = process.argv.includes("--write");
  const result = enrichFeatRegistries(write);
  console.log(`${write ? "Enriched" : "Would enrich"} feats: ${result.entitiesAdded} entities, ${result.relationshipsAdded} relationships, ${result.evidenceAdded} evidence records in ${result.filesChanged} files.`);
}
