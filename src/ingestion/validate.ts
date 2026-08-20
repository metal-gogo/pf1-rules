import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Ajv2020Module, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";


interface JsonSchemaValidator {
  errors: ErrorObject[] | null;
  compile(schema: ValidatedJson): ValidateFunction;
  errorsText(errors?: ErrorObject[] | null): string;
  validateSchema(schema: ValidatedJson): boolean;
}

const Ajv2020 = Ajv2020Module as unknown as new (
  options: Record<string, unknown>,
) => JsonSchemaValidator;
const addFormats = addFormatsModule as unknown as (
  validator: JsonSchemaValidator,
) => void;


export interface PackageStatistics {
  schemas: number;
  observations: number;
  coverageChecks: number;
  canonicalSpells: number;
  mythicSpellVariants: number;
  decisions: number;
  entityRegistries: number;
  linkedEntities: number;
  ingestionManifests: number;
  ingestionQueueItems: number;
  testSpells: number;
}


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function jsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? jsonFiles(fullPath) : [fullPath];
    })
    .filter((filename) => filename.endsWith(".json"))
    .sort();
}


function directJsonFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}


function compileSchema(
  ajv: JsonSchemaValidator,
  schemasDirectory: string,
  filename: string,
): ValidateFunction {
  return ajv.compile(loadJson(path.join(schemasDirectory, filename)));
}


function assertValid(
  validator: ValidateFunction,
  document: ValidatedJson,
  filename: string,
): void {
  if (validator(document)) {
    return;
  }
  const details = (validator.errors ?? [])
    .map((error) => `  - ${error.instancePath || "<root>"}: ${error.message}`)
    .join("\n");
  throw new Error(`Schema validation failed for ${filename}:\n${details}`);
}


function verifyArtifact(record: ValidatedJson, recordPath: string, idField: string): void {
  const artifactPath = path.resolve(
    path.dirname(recordPath),
    record.retrieval.raw_artifact_path,
  );
  const actualHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(artifactPath))
    .digest("hex");
  if (actualHash !== record.retrieval.content_sha256) {
    throw new Error(
      `Artifact hash mismatch for ${artifactPath}: expected ` +
        `${record.retrieval.content_sha256}, got ${actualHash}`,
    );
  }
  const idHash = String(record[idField]).split(":").at(-1) ?? "";
  if (!idHash.startsWith(actualHash.slice(0, 8))) {
    throw new Error(`${idField} lacks the artifact hash prefix in ${recordPath}`);
  }
}


function verifyCoverage(record: ValidatedJson, recordPath: string): void {
  const artifactPath = path.resolve(
    path.dirname(recordPath),
    record.retrieval.raw_artifact_path,
  );
  let content = fs.readFileSync(artifactPath, "utf8");
  let query = String(record.check.query);
  if (!record.check.case_sensitive) {
    content = content.toLocaleLowerCase();
    query = query.toLocaleLowerCase();
  }
  let matchCount = 0;
  let offset = 0;
  while (query.length > 0 && (offset = content.indexOf(query, offset)) >= 0) {
    matchCount += 1;
    offset += query.length;
  }
  if (matchCount !== record.result.match_count) {
    throw new Error(
      `Coverage mismatch for ${recordPath}: expected ` +
        `${record.result.match_count}, found ${matchCount}`,
    );
  }
  const expectedStatus = matchCount === 0 ? "not_found" : "found";
  if (record.result.status !== expectedStatus) {
    throw new Error(
      `Coverage status mismatch for ${recordPath}: expected ${expectedStatus}`,
    );
  }
}


function verifyIngestionManifest(record: ValidatedJson, recordPath: string): void {
  const pageIds = new Set<string>();
  const expectedMembershipCounts = new Map<string, number>();
  for (const page of record.catalog_pages) {
    if (pageIds.has(page.spell_list_id)) {
      throw new Error(`Duplicate catalog page ${page.spell_list_id} in ${recordPath}`);
    }
    pageIds.add(page.spell_list_id);
    expectedMembershipCounts.set(page.spell_list_id, page.level_entry_count);
    const artifactPath = path.resolve(path.dirname(recordPath), page.raw_artifact_path);
    const actualHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(artifactPath))
      .digest("hex");
    if (actualHash !== page.content_sha256) {
      throw new Error(
        `Catalog artifact hash mismatch for ${artifactPath}: expected ` +
          `${page.content_sha256}, got ${actualHash}`,
      );
    }
  }

  const spellIds = new Set<string>();
  const spellNames = new Set<string>();
  const priorities = new Set<number>();
  const actualMembershipCounts = new Map<string, number>();
  for (const [index, spell] of record.spells.entries()) {
    if (spellIds.has(spell.spell_id) || spellNames.has(spell.name)) {
      throw new Error(`Duplicate ingestion spell identity ${spell.spell_id} / ${spell.name}`);
    }
    if (priorities.has(spell.priority)) {
      throw new Error(`Duplicate ingestion priority ${spell.priority} in ${recordPath}`);
    }
    const expectedBatch = Math.floor(index / record.batch_size) + 1;
    if (spell.batch !== expectedBatch || spell.priority !== index + 1) {
      throw new Error(
        `Unstable ingestion ordering for ${spell.spell_id}: expected batch ` +
          `${expectedBatch} and priority ${index + 1}`,
      );
    }
    spellIds.add(spell.spell_id);
    spellNames.add(spell.name);
    priorities.add(spell.priority);
    for (const membership of spell.catalog_memberships) {
      if (!pageIds.has(membership.spell_list_id)) {
        throw new Error(
          `${spell.spell_id} references unknown catalog page ${membership.spell_list_id}`,
        );
      }
      actualMembershipCounts.set(
        membership.spell_list_id,
        (actualMembershipCounts.get(membership.spell_list_id) ?? 0) + 1,
      );
    }
  }
  for (const [spellListId, expected] of expectedMembershipCounts) {
    const actual = actualMembershipCounts.get(spellListId) ?? 0;
    if (actual !== expected) {
      throw new Error(
        `Catalog membership count mismatch for ${spellListId}: expected ${expected}, got ${actual}`,
      );
    }
  }
}


function resolveJsonPointer(document: unknown, pointer: string): unknown {
  let current: any = document;
  for (const encoded of pointer.replace(/^\//, "").split("/")) {
    if (!encoded && pointer === "") {
      return current;
    }
    const token = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (current === null || current === undefined || !(token in current)) {
      throw new Error(`Stale JSON pointer: ${pointer}`);
    }
    current = current[token];
  }
  return current;
}


export function validatePackage(): PackageStatistics {
  const schemasDirectory = path.join(projectRoot, "schemas");
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schemaPaths = directJsonFiles(schemasDirectory);
  for (const schemaPath of schemaPaths) {
    if (!ajv.validateSchema(loadJson(schemaPath))) {
      throw new Error(
        `Invalid JSON Schema ${schemaPath}: ${ajv.errorsText(ajv.errors)}`,
      );
    }
  }

  const observationValidator = compileSchema(
    ajv,
    schemasDirectory,
    "source-spell-observation.schema.json",
  );
  const entityObservationValidator = compileSchema(
    ajv,
    schemasDirectory,
    "source-entity-observation.schema.json",
  );
  const coverageValidator = compileSchema(
    ajv,
    schemasDirectory,
    "source-coverage-check.schema.json",
  );
  const canonicalValidator = compileSchema(
    ajv,
    schemasDirectory,
    "canonical-spell.schema.json",
  );
  const variantValidator = compileSchema(
    ajv,
    schemasDirectory,
    "mythic-spell-variant.schema.json",
  );
  const decisionValidator = compileSchema(
    ajv,
    schemasDirectory,
    "canonical-decision.schema.json",
  );
  const registryValidator = compileSchema(
    ajv,
    schemasDirectory,
    "entity-registry.schema.json",
  );
  const testSetValidator = compileSchema(
    ajv,
    schemasDirectory,
    "test-spell-set.schema.json",
  );
  const ingestionManifestValidator = compileSchema(
    ajv,
    schemasDirectory,
    "spell-ingestion-manifest.schema.json",
  );

  const ingestionManifestPaths = directJsonFiles(
    path.join(projectRoot, "data", "ingestion"),
  );
  const ingestionSpellIds = new Set<string>();
  let ingestionQueueItems = 0;
  for (const filename of ingestionManifestPaths) {
    const record = loadJson(filename);
    assertValid(ingestionManifestValidator, record, filename);
    verifyIngestionManifest(record, filename);
    for (const spell of record.spells) ingestionSpellIds.add(spell.spell_id);
    ingestionQueueItems += record.spells.length;
    ingestionQueueItems += (record.discovered_dependencies ?? []).length;
  }

  const observationPaths = jsonFiles(path.join(projectRoot, "data", "observations"));
  const observations = new Map<string, ValidatedJson>();
  for (const filename of observationPaths) {
    const record = loadJson(filename);
    assertValid(record.entity_type === "spell" ? observationValidator : entityObservationValidator, record, filename);
    verifyArtifact(record, filename, "observation_id");
    if (observations.has(record.observation_id)) {
      throw new Error(`Duplicate observation ID: ${record.observation_id}`);
    }
    observations.set(record.observation_id, record);
  }

  const coveragePaths = directJsonFiles(path.join(projectRoot, "data", "coverage"));
  const coverageIds = new Set<string>();
  for (const filename of coveragePaths) {
    const record = loadJson(filename);
    assertValid(coverageValidator, record, filename);
    verifyArtifact(record, filename, "coverage_check_id");
    if (coverageIds.has(record.coverage_check_id)) {
      throw new Error(`Duplicate coverage-check ID: ${record.coverage_check_id}`);
    }
    coverageIds.add(record.coverage_check_id);
    verifyCoverage(record, filename);
  }

  const registryPaths = directJsonFiles(path.join(projectRoot, "data", "entities"));
  const registeredIds = new Set<string>();
  for (const filename of registryPaths) {
    const registry = loadJson(filename);
    assertValid(registryValidator, registry, filename);
    for (const entity of registry.entities) {
      if (registeredIds.has(entity.entity_id)) {
        throw new Error(`Duplicate registered entity: ${entity.entity_id}`);
      }
      registeredIds.add(entity.entity_id);
    }
  }

  for (const [observationId, observation] of observations) {
    const raw = observation.spell_raw ?? observation.entity_raw;
    for (const link of raw.links_raw ?? []) {
      const targetId = link.target_entity_id_hint;
      if (targetId && !registeredIds.has(targetId)) {
        throw new Error(`${observationId} links to unregistered entity ${targetId}`);
      }
    }
  }

  const canonicalPaths = directJsonFiles(path.join(projectRoot, "data", "canonical"));
  const canonicalById = new Map<string, ValidatedJson>();
  for (const filename of canonicalPaths) {
    const record = loadJson(filename);
    assertValid(canonicalValidator, record, filename);
    if (!registeredIds.has(record.spell_id)) {
      throw new Error(`${record.spell_id} has no entity registry entry`);
    }
    canonicalById.set(record.spell_id, record);
    if (
      record.levels.some((level: any) => level.level === 0) &&
      !ingestionSpellIds.has(record.spell_id)
    ) {
      throw new Error(
        `Level-0 canonical spell is absent from the ingestion manifest: ${record.spell_id}`,
      );
    }
    const referenced = new Set<string>(record.levels.map((level: any) => level.spell_list_id));
    for (const relationship of record.relationships) {
      if (relationship.target.entity_id) {
        referenced.add(relationship.target.entity_id);
      }
    }
    for (const inheritance of record.rules_inheritance) {
      referenced.add(inheritance.from_spell_id);
    }
    for (const entityId of referenced) {
      if (!registeredIds.has(entityId)) {
        throw new Error(`${record.spell_id} references unregistered entity ${entityId}`);
      }
    }
  }

  const variantPaths = directJsonFiles(path.join(projectRoot, "data", "variants"));
  const variantsById = new Map<string, ValidatedJson>();
  const baseSpellIds = new Set<string>();
  for (const filename of variantPaths) {
    const record = loadJson(filename);
    assertValid(variantValidator, record, filename);
    const variantId = record.mythic_spell_variant_id;
    const baseId = record.base_spell.spell_id;
    if (variantsById.has(variantId) || baseSpellIds.has(baseId)) {
      throw new Error(`Duplicate mythic identity for ${variantId} / ${baseId}`);
    }
    if (!registeredIds.has(variantId) || !canonicalById.has(baseId)) {
      throw new Error(`Unregistered or missing mythic/base entity: ${variantId} / ${baseId}`);
    }
    const expected = `mythic-spell-variant.${baseId.replace(/^spell\./, "")}`;
    if (variantId !== expected) {
      throw new Error(`Mythic ID ${variantId} must be ${expected}`);
    }
    const reciprocal = canonicalById
      .get(baseId)
      ?.relationships.filter(
        (relationship: any) =>
          relationship.type === "has_mythic_variant" &&
          relationship.target.entity_id === variantId,
      );
    if (reciprocal?.length !== 1) {
      throw new Error(`${baseId} lacks one reciprocal link to ${variantId}`);
    }
    variantsById.set(variantId, record);
    baseSpellIds.add(baseId);
  }

  const decisionPaths = directJsonFiles(path.join(projectRoot, "data", "decisions"));
  for (const filename of decisionPaths) {
    const record = loadJson(filename);
    assertValid(decisionValidator, record, filename);
    for (const observationId of record.observation_ids) {
      if (!observations.has(observationId)) {
        throw new Error(`${record.decision_id} uses unknown observation ${observationId}`);
      }
    }
    if (!record.observation_ids.includes(record.baseline_observation_id)) {
      throw new Error(`${record.decision_id} baseline is not a considered observation`);
    }
    const recordPath = path.resolve(path.dirname(filename), record.canonical_record_path);
    const canonical = loadJson(recordPath);
    const entityId = canonical.spell_id ?? canonical.mythic_spell_variant_id;
    if (entityId !== record.entity_id) {
      throw new Error(`${record.decision_id} points to mismatched entity ${entityId}`);
    }
    for (const field of record.field_decisions) {
      resolveJsonPointer(canonical, field.canonical_path);
    }
  }

  const testSetPath = path.join(projectRoot, "fixtures", "test-spells.json");
  const testSet = loadJson(testSetPath);
  assertValid(testSetValidator, testSet, testSetPath);
  const testSpellIds = testSet.spells.map((spell: any) => spell.id);
  if (new Set(testSpellIds).size !== testSpellIds.length) {
    throw new Error("Test spell IDs are not unique");
  }
  for (const smokeId of testSet.smoke_test_ids) {
    if (!testSpellIds.includes(smokeId)) {
      throw new Error(`Smoke-test ID is absent from test set: ${smokeId}`);
    }
  }

  const rubric = loadJson(path.join(projectRoot, "rubric", "source-comparison-rubric.json"));
  const totalWeight = rubric.criteria.reduce(
    (total: number, criterion: any) => total + criterion.weight_percent,
    0,
  );
  if (totalWeight !== 100) {
    throw new Error(`Rubric weights total ${totalWeight}, expected 100`);
  }

  return {
    schemas: schemaPaths.length,
    observations: observationPaths.length,
    coverageChecks: coveragePaths.length,
    canonicalSpells: canonicalPaths.length,
    mythicSpellVariants: variantPaths.length,
    decisions: decisionPaths.length,
    entityRegistries: registryPaths.length,
    linkedEntities: registeredIds.size,
    ingestionManifests: ingestionManifestPaths.length,
    ingestionQueueItems,
    testSpells: testSpellIds.length,
  };
}
