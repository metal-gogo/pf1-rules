import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import { validatePackage } from "./validate.js";
import {
  type GeneratedEntity,
  generateCanonicalBundle,
  NormalizationIssue,
  type ParsedObservationInput,
} from "./normalize-level-zero.js";
import {
  parseAonSpell,
  parseD20pfsrdSpell,
  parseLegacyIndex,
  parseLegacySpell,
  type ParsedSpellPage,
  type SiteId,
  slug,
} from "./spell-page-parser.js";


const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
const requestIntervalMs = 1_000;
const parserVersion = "0.1.0";
const manifestPath = path.join(projectRoot, "data", "ingestion", "level-0-spells.json");
const registryPath = path.join(projectRoot, "data", "entities", "level-zero-bulk-entities.json");
const legacyIndexUrl = "https://legacy.aonprd.com/indices/spelllists.html";
let lastRequestAt = 0;

interface CaptureMetadata {
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
}

interface CapturedArtifact extends CaptureMetadata {
  body: string;
  rawPath: string;
}


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}


function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}


async function throttledFetch(url: string): Promise<Response> {
  const remaining = requestIntervalMs - (Date.now() - lastRequestAt);
  if (remaining > 0) await sleep(remaining);
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": userAgent },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  lastRequestAt = Date.now();
  return response;
}


async function assertRobotsAllows(origin: string, targetPath: string): Promise<void> {
  const response = await throttledFetch(new URL("/robots.txt", origin).toString());
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Cannot verify robots policy for ${origin}: HTTP ${response.status}`);
  const text = await response.text();
  let applies = false;
  const rules: Array<{ allow: boolean; path: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLocaleLowerCase("en-US");
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      applies = value === "*" || userAgent.toLocaleLowerCase("en-US").startsWith(value.toLocaleLowerCase("en-US"));
    } else if (applies && value && (field === "allow" || field === "disallow")) {
      rules.push({ allow: field === "allow", path: value });
    }
  }
  const match = rules
    .filter((rule) => targetPath.startsWith(rule.path.replace(/\*.*$/, "")))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow))[0];
  if (match && !match.allow) throw new Error(`robots.txt disallows ${origin}${targetPath}`);
}


function writeGeneratedJson(filename: string, value: unknown, allowUpdate = false): void {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.existsSync(filename)) {
    const current = fs.readFileSync(filename, "utf8");
    if (current === content) return;
    if (!allowUpdate) throw new Error(`Refusing to overwrite differing generated file ${filename}`);
  }
  fs.writeFileSync(filename, content, "utf8");
}


async function capture(url: string, rawPath: string): Promise<CapturedArtifact> {
  const metadataPath = `${rawPath}.meta.json`;
  if (fs.existsSync(rawPath) && fs.existsSync(metadataPath)) {
    const body = fs.readFileSync(rawPath, "utf8");
    const metadata = loadJson(metadataPath) as CaptureMetadata;
    if (sha256(body) !== metadata.content_sha256) throw new Error(`Cached artifact hash mismatch: ${rawPath}`);
    return { ...metadata, body, rawPath };
  }
  if (fs.existsSync(rawPath) || fs.existsSync(metadataPath)) {
    throw new Error(`Incomplete cached capture pair for ${rawPath}`);
  }
  const response = await throttledFetch(url);
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} while retrieving ${url}`);
  const metadata: CaptureMetadata = {
    url: response.url,
    retrieved_at: new Date().toISOString(),
    http_status: response.status,
    content_sha256: sha256(body),
    response_content_type: response.headers.get("content-type"),
  };
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, body, { encoding: "utf8", flag: "wx" });
  writeGeneratedJson(metadataPath, metadata);
  return { ...metadata, body, rawPath };
}


function d20Url(name: string): string {
  const spellSlug = slug(name);
  return `https://www.d20pfsrd.com/magic/all-spells/${spellSlug[0]}/${spellSlug}/`;
}


function observation(
  siteId: SiteId,
  spellId: string,
  captureResult: CapturedArtifact,
  parsed: ParsedSpellPage,
  observationDirectory: string,
): { record: ValidatedJson; input: ParsedObservationInput } {
  const observationId = `${siteId}:${spellId}:${captureResult.content_sha256.slice(0, 8)}`;
  const sourceDetails = {
    aon: {
      license_url: "https://www.aonprd.com/Licenses.aspx",
      declared_publisher: "Paizo",
      first_party_status: "confirmed",
    },
    legacy_aon: {
      license_url: "https://legacy.aonprd.com/openGameLicense.html",
      declared_publisher: "Paizo",
      first_party_status: "confirmed",
    },
    d20pfsrd: {
      license_url: "https://www.d20pfsrd.com/extras/legal/",
      declared_publisher: /paizo/i.test(captureResult.body) ? "Paizo" : null,
      first_party_status: /publisher-paizo|Paizo Publishing|Paizo Inc/i.test(captureResult.body) ? "confirmed" : "unknown",
    },
  } as const;
  const record = {
    $schema: "../../../schemas/source-spell-observation.schema.json",
    schema_version: "0.1.0",
    observation_id: observationId,
    entity_type: "spell",
    source: {
      site_id: siteId,
      url: captureResult.url,
      ...sourceDetails[siteId],
    },
    retrieval: {
      retrieved_at: captureResult.retrieved_at,
      http_status: captureResult.http_status,
      content_sha256: captureResult.content_sha256,
      raw_artifact_path: path.relative(observationDirectory, captureResult.rawPath).replaceAll("\\", "/"),
      response_content_type: captureResult.response_content_type,
    },
    parser: {
      name: `${siteId}-bounded-level-zero-adapter`,
      version: parserVersion,
      parsed_at: new Date().toISOString(),
    },
    page: {
      title_raw: parsed.titleRaw,
      breadcrumbs_raw: ["Spells", parsed.nameRaw],
      license_notice_raw: null,
      source_notice_raw: parsed.sourceNoticeRaw,
    },
    spell_raw: {
      name_raw: parsed.nameRaw,
      alternate_names_raw: [],
      school_raw: parsed.schoolRaw,
      subschool_raw: parsed.subschoolRaw,
      descriptors_raw: parsed.descriptorsRaw,
      levels_raw: parsed.levelsRaw,
      domains_raw: parsed.domainsRaw,
      casting_time_raw: parsed.castingTimeRaw,
      components_raw: parsed.componentsRaw,
      range_raw: parsed.rangeRaw,
      delivery_fields_raw: parsed.deliveryFieldsRaw,
      duration_raw: parsed.durationRaw,
      saving_throw_raw: parsed.savingThrowRaw,
      spell_resistance_raw: parsed.spellResistanceRaw,
      description_raw: parsed.descriptionRaw,
      links_raw: parsed.links.map((link) => ({
        anchor_text_raw: link.anchorTextRaw,
        href_raw: link.hrefRaw,
        href_resolved: link.hrefResolved,
        source_field: link.sourceField,
        context_raw: link.contextRaw,
        role_hint: link.roleHint,
        target_entity_type_hint: link.targetEntityTypeHint,
        target_entity_id_hint: link.targetEntityIdHint,
      })),
      references_raw: parsed.references.map((reference) => ({
        anchor_text_raw: reference.anchorTextRaw,
        href_raw: reference.hrefRaw,
        evidence_kind: reference.evidenceKind,
        source_field: reference.sourceField,
        context_raw: reference.contextRaw,
        target_entity_type: reference.targetEntityType,
        target_name_hint: reference.targetNameHint,
        relationship_hint: reference.relationshipHint,
      })),
      mythic_text_raw: null,
      source_book_raw: parsed.sourceBookRaw,
      source_page_raw: parsed.sourcePageRaw,
      supplemental_sources_raw: [],
      pfs_status_raw: parsed.pfsStatusRaw,
      sections_raw: [{ heading_raw: null, body_raw: parsed.descriptionRaw }],
    },
    warnings: parsed.warnings,
  };
  return { record, input: { siteId, observationId, parsed } };
}


function coverageCheck(
  spell: ValidatedJson,
  legacyIndex: CapturedArtifact,
): ValidatedJson {
  const query = `>${spell.name}</a>`;
  const lowerContent = legacyIndex.body.toLocaleLowerCase("en-US");
  const lowerQuery = query.toLocaleLowerCase("en-US");
  let count = 0;
  let offset = 0;
  while ((offset = lowerContent.indexOf(lowerQuery, offset)) >= 0) {
    count += 1;
    offset += lowerQuery.length;
  }
  if (count !== 0) throw new Error(`Legacy index parser missed an exact entry for ${spell.name}`);
  return {
    $schema: "../../schemas/source-coverage-check.schema.json",
    schema_version: "0.1.0",
    coverage_check_id: `coverage:legacy_aon:${spell.spell_id}:${legacyIndex.content_sha256.slice(0, 8)}`,
    entity_id: spell.spell_id,
    source: { site_id: "legacy_aon", url: legacyIndex.url },
    retrieval: {
      retrieved_at: legacyIndex.retrieved_at,
      http_status: legacyIndex.http_status,
      content_sha256: legacyIndex.content_sha256,
      raw_artifact_path: path.relative(path.join(projectRoot, "data", "coverage"), legacyIndex.rawPath).replaceAll("\\", "/"),
      response_content_type: legacyIndex.response_content_type,
    },
    check: {
      method: "exact_text_search",
      query,
      case_sensitive: false,
      scope_raw: "Complete captured Legacy Pathfinder Reference Document Spell List Index; exact closing anchor text",
    },
    result: {
      status: "not_found",
      match_count: 0,
      note: `${spell.name} has no exact spell-name anchor in the captured Legacy index. This is a coverage result, not an empty observation.`,
    },
  };
}


function directJsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => path.join(directory, name));
}


function registeredIdsExcludingBulk(): Set<string> {
  const ids = new Set<string>();
  for (const filename of directJsonFiles(path.join(projectRoot, "data", "entities"))) {
    if (path.resolve(filename) === path.resolve(registryPath)) continue;
    for (const entity of loadJson(filename).entities) ids.add(entity.entity_id);
  }
  return ids;
}


function mergeEntity(map: Map<string, GeneratedEntity>, entity: GeneratedEntity): void {
  const existing = map.get(entity.entity_id);
  if (!existing) {
    map.set(entity.entity_id, entity);
    return;
  }
  if (existing.entity_type !== entity.entity_type) {
    throw new Error(`Entity type collision for ${entity.entity_id}: ${existing.entity_type} / ${entity.entity_type}`);
  }
  if (entity.status === "resolved") existing.status = "resolved";
  for (const evidence of entity.evidence) {
    if (!existing.evidence.some((item) => JSON.stringify(item) === JSON.stringify(evidence))) existing.evidence.push(evidence);
  }
}


function entitiesFromObservation(spellId: string, input: ParsedObservationInput): GeneratedEntity[] {
  const entities: GeneratedEntity[] = [{
    entity_id: spellId,
    entity_type: "spell",
    name: input.parsed.nameRaw,
    status: "stub",
    aliases: [],
    evidence: [{ observation_id: input.observationId, source_field: "spell_raw.name_raw", anchor_text_raw: input.parsed.nameRaw, source_href: null }],
    notes: ["Source observation captured; canonical ingestion is currently blocked."],
  }];
  for (const [index, link] of input.parsed.links.entries()) {
    entities.push({
      entity_id: link.targetEntityIdHint,
      entity_type: link.targetEntityTypeHint,
      name: link.anchorTextRaw,
      status: "stub",
      aliases: [],
      evidence: [{ observation_id: input.observationId, source_field: `spell_raw.links_raw[${index}]`, anchor_text_raw: link.anchorTextRaw, source_href: link.hrefResolved }],
      notes: [],
    });
  }
  return entities;
}


function setIssue(spell: ValidatedJson, kind: "schema" | "source", code: string, message: string): void {
  spell.issue = { kind, code: slug(code), message };
}


async function ingestSpell(
  spell: ValidatedJson,
  legacyIndex: CapturedArtifact,
  legacyEntries: ReturnType<typeof parseLegacyIndex>,
  availableCanonicalIds: Set<string>,
  bulkEntities: Map<string, GeneratedEntity>,
  baseEntityIds: Set<string>,
): Promise<"ingested" | "issue"> {
  const spellSlug = spell.spell_id.replace(/^spell\./, "");
  const rawDirectory = path.join(projectRoot, "data", "raw", "level-zero", spellSlug);
  const observationDirectory = path.join(projectRoot, "data", "observations", spellSlug);
  const inputs: ParsedObservationInput[] = [];
  try {
    const aonCapture = await capture(spell.source_url, path.join(rawDirectory, "aon.html"));
    const aonParsed = parseAonSpell(aonCapture.body, aonCapture.url);
    if (aonParsed.nameRaw.toLocaleLowerCase("en-US") !== spell.name.toLocaleLowerCase("en-US")) {
      throw new NormalizationIssue("source", "aon-name-mismatch", `Expected ${spell.name}, parsed ${aonParsed.nameRaw}.`);
    }
    const aonObservation = observation("aon", spell.spell_id, aonCapture, aonParsed, observationDirectory);
    writeGeneratedJson(path.join(observationDirectory, "aon.json"), aonObservation.record);
    inputs.push(aonObservation.input);

    const legacyEntry = legacyEntries.get(spell.name.toLocaleLowerCase("en-US"));
    if (legacyEntry) {
      const legacyCapture = await capture(legacyEntry.href, path.join(rawDirectory, "legacy_aon.html"));
      const legacyParsed = parseLegacySpell(legacyCapture.body, legacyCapture.url, legacyEntry);
      const legacyObservation = observation("legacy_aon", spell.spell_id, legacyCapture, legacyParsed, observationDirectory);
      writeGeneratedJson(path.join(observationDirectory, "legacy_aon.json"), legacyObservation.record);
      inputs.push(legacyObservation.input);
    } else {
      writeGeneratedJson(
        path.join(projectRoot, "data", "coverage", `level-zero-${spellSlug}-legacy.json`),
        coverageCheck(spell, legacyIndex),
      );
    }

    const d20Capture = await capture(d20Url(spell.name), path.join(rawDirectory, "d20pfsrd.html"));
    const d20Parsed = parseD20pfsrdSpell(d20Capture.body, d20Capture.url);
    if (d20Parsed.nameRaw.toLocaleLowerCase("en-US") !== spell.name.toLocaleLowerCase("en-US")) {
      throw new NormalizationIssue("source", "d20-name-mismatch", `Expected ${spell.name}, parsed ${d20Parsed.nameRaw}.`);
    }
    const d20Observation = observation("d20pfsrd", spell.spell_id, d20Capture, d20Parsed, observationDirectory);
    writeGeneratedJson(path.join(observationDirectory, "d20pfsrd.json"), d20Observation.record);
    inputs.push(d20Observation.input);

    const bundle = generateCanonicalBundle(spell.spell_id, inputs, availableCanonicalIds);
    for (const entity of bundle.entities) {
      if (!baseEntityIds.has(entity.entity_id)) mergeEntity(bulkEntities, entity);
    }
    writeGeneratedJson(path.join(projectRoot, "data", "canonical", `${spellSlug}.json`), bundle.canonical);
    writeGeneratedJson(path.join(projectRoot, "data", "decisions", `${spellSlug}.json`), bundle.decision);
    availableCanonicalIds.add(spell.spell_id);
    return "ingested";
  } catch (error) {
    for (const input of inputs) {
      for (const entity of entitiesFromObservation(spell.spell_id, input)) {
        if (!baseEntityIds.has(entity.entity_id)) mergeEntity(bulkEntities, entity);
      }
    }
    if (error instanceof NormalizationIssue) {
      setIssue(spell, error.kind, error.code, error.message);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      setIssue(spell, "source", "ingestion-failure", message);
    }
    return "issue";
  }
}


export async function ingestLevelZeroBatch(batchNumber: number) {
  if (!Number.isInteger(batchNumber) || batchNumber < 1) throw new Error("Batch number must be a positive integer.");
  await assertRobotsAllows("https://www.aonprd.com", "/SpellDisplay.aspx");
  await assertRobotsAllows("https://legacy.aonprd.com", "/indices/spelllists.html");
  await assertRobotsAllows("https://www.d20pfsrd.com", "/magic/all-spells/");

  const legacyIndex = await capture(
    legacyIndexUrl,
    path.join(projectRoot, "data", "raw", "level-zero", "legacy-spell-index.html"),
  );
  const legacyEntries = parseLegacyIndex(legacyIndex.body, legacyIndex.url);
  const manifest = loadJson(manifestPath);
  const selected = manifest.spells.filter((spell: ValidatedJson) => spell.batch === batchNumber);
  if (selected.length === 0) throw new Error(`No level-0 ingestion batch ${batchNumber} exists.`);

  const baseEntityIds = registeredIdsExcludingBulk();
  const bulkEntities = new Map<string, GeneratedEntity>();
  if (fs.existsSync(registryPath)) {
    for (const entity of loadJson(registryPath).entities) bulkEntities.set(entity.entity_id, entity);
  }
  const availableCanonicalIds = new Set(
    directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => loadJson(filename).spell_id),
  );
  const report = { batch: batchNumber, ingested: [] as string[], issues: [] as string[], skipped: [] as string[] };
  for (const spell of selected) {
    const canonicalPath = path.join(projectRoot, "data", "canonical", `${spell.spell_id.replace(/^spell\./, "")}.json`);
    if (fs.existsSync(canonicalPath) || spell.issue) {
      report.skipped.push(spell.name);
      continue;
    }
    const result = await ingestSpell(
      spell,
      legacyIndex,
      legacyEntries,
      availableCanonicalIds,
      bulkEntities,
      baseEntityIds,
    );
    report[result === "ingested" ? "ingested" : "issues"].push(spell.name);
    writeGeneratedJson(manifestPath, manifest, true);
    writeGeneratedJson(registryPath, {
      $schema: "../../schemas/entity-registry.schema.json",
      schema_version: "0.1.0",
      registry_id: "level-zero-bulk-entities-v0.1",
      entities: [...bulkEntities.values()].sort((left, right) => left.entity_id.localeCompare(right.entity_id)),
    }, true);
  }
  validatePackage();
  return report;
}


const batchNumber = Number(process.argv[2]);
ingestLevelZeroBatch(batchNumber)
  .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
