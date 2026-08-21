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
import {
  d20CandidateUrls,
  d20SearchResultUrls,
  d20SearchUrl,
} from "./d20-source-resolver.js";


const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
const requestIntervalMs = 1_000;
const parserVersion = "0.1.6";
const refreshCanonical = process.env.PF1_REFRESH_CANONICAL === "1";
const reviewedCanonicalIds = new Set(["spell.light"]);
const legacyIndexUrl = "https://legacy.aonprd.com/indices/spelllists.html";
let lastRequestAt = 0;


function levelPaths(level: number) {
  if (!Number.isInteger(level) || level < 0 || level > 9) {
    throw new Error("Spell level must be an integer from 0 through 9.");
  }
  const levelName = level === 0 ? "level-zero" : `level-${level}`;
  return {
    manifestPath: path.join(projectRoot, "data", "ingestion", `level-${level}-spells.json`),
    registryPath: path.join(projectRoot, "data", "entities", `${levelName}-bulk-entities.json`),
    artifactScope: levelName,
    registryId: `${levelName}-bulk-entities-v0.1`,
  };
}

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


async function assertIngestionSourcesAllowed(): Promise<void> {
  await assertRobotsAllows("https://www.aonprd.com", "/SpellDisplay.aspx");
  await assertRobotsAllows("https://legacy.aonprd.com", "/indices/spelllists.html");
  await assertRobotsAllows("https://www.d20pfsrd.com", "/magic/all-spells/");
  await assertRobotsAllows("https://www.d20pfsrd.com", "/?s=spell");
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


function writeObservationJson(filename: string, record: ValidatedJson): void {
  if (!fs.existsSync(filename)) {
    writeGeneratedJson(filename, record);
    return;
  }
  const existing = loadJson(filename);
  if (
    existing.observation_id !== record.observation_id ||
    existing.retrieval?.content_sha256 !== record.retrieval?.content_sha256 ||
    existing.parser?.version !== record.parser?.version
  ) {
    throw new Error(`Existing observation identity does not match the current immutable snapshot: ${filename}`);
  }
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


function writeCapture(rawPath: string, url: string, response: Response, body: string): CapturedArtifact {
  const metadata: CaptureMetadata = {
    url: response.url || url,
    retrieved_at: new Date().toISOString(),
    http_status: response.status,
    content_sha256: sha256(body),
    response_content_type: response.headers.get("content-type"),
  };
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, body, { encoding: "utf8", flag: "wx" });
  writeGeneratedJson(`${rawPath}.meta.json`, metadata);
  return { ...metadata, body, rawPath };
}


async function resolveD20Spell(
  spellName: string,
  rawDirectory: string,
): Promise<{ captureResult: CapturedArtifact; parsed: ParsedSpellPage } | { coverageCapture: CapturedArtifact }> {
  const primaryRawPath = path.join(rawDirectory, "d20pfsrd.html");
  const fallbackRawPath = path.join(rawDirectory, "d20pfsrd-resolved.html");
  for (const cachedPath of [primaryRawPath, fallbackRawPath]) {
    if (!fs.existsSync(cachedPath) && !fs.existsSync(`${cachedPath}.meta.json`)) continue;
    const cached = await capture(d20CandidateUrls(spellName)[0]!, cachedPath);
    try {
      const parsed = parseD20pfsrdSpell(cached.body, cached.url, spellName);
      return { captureResult: cached, parsed };
    } catch {
      // The old deterministic capture can be a valid grouped page for another entry.
    }
  }
  const resolvedRawPath = fs.existsSync(primaryRawPath) ? fallbackRawPath : primaryRawPath;

  const attempted = new Set<string>();
  const tryCandidates = async (urls: string[]) => {
    for (const url of urls) {
      if (attempted.has(url)) continue;
      attempted.add(url);
      const response = await throttledFetch(url);
      const body = await response.text();
      if (!response.ok) continue;
      let parsed: ParsedSpellPage;
      try {
        parsed = parseD20pfsrdSpell(body, response.url || url, spellName);
      } catch {
        continue;
      }
      if (slug(parsed.nameRaw) !== slug(spellName)) continue;
      const captureResult = writeCapture(resolvedRawPath, url, response, body);
      return { captureResult, parsed };
    }
    return null;
  };

  const aliased = await tryCandidates(d20CandidateUrls(spellName));
  if (aliased) return aliased;

  const searchCapture = await capture(
    d20SearchUrl(spellName),
    path.join(rawDirectory, "d20pfsrd-search.html"),
  );
  const searched = await tryCandidates(d20SearchResultUrls(searchCapture.body, searchCapture.url));
  return searched ?? { coverageCapture: searchCapture };
}


function observation(
  siteId: SiteId,
  spellId: string,
  captureResult: CapturedArtifact,
  parsed: ParsedSpellPage,
  observationDirectory: string,
): { record: ValidatedJson; input: ParsedObservationInput } {
  const observationVersionHash = sha256(`${captureResult.content_sha256}:${parserVersion}`);
  const observationId = `${siteId}:${spellId}:${captureResult.content_sha256.slice(0, 8)}${observationVersionHash.slice(0, 8)}`;
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
      name: `${siteId}-bounded-spell-adapter`,
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


function coverageScope(artifactScope: string): string {
  return /^(?:level-zero|level-[0-9])$/.test(artifactScope) ? `${artifactScope}:` : "";
}


function legacyCoverageCheck(
  spell: ValidatedJson,
  legacyIndex: CapturedArtifact,
  artifactScope: string,
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
    coverage_check_id: `coverage:legacy_aon:${coverageScope(artifactScope)}${spell.spell_id}:${legacyIndex.content_sha256.slice(0, 8)}`,
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


function d20CoverageCheck(
  spell: ValidatedJson,
  searchCapture: CapturedArtifact,
  artifactScope: string,
): ValidatedJson {
  const exactResults = d20SearchResultUrls(searchCapture.body, searchCapture.url).filter((url) =>
    slug(url.split("/").filter(Boolean).at(-1) ?? "") === slug(spell.name),
  );
  return {
    $schema: "../../schemas/source-coverage-check.schema.json",
    schema_version: "0.1.0",
    coverage_check_id: `coverage:d20pfsrd:${coverageScope(artifactScope)}${spell.spell_id}:${searchCapture.content_sha256.slice(0, 8)}`,
    entity_id: spell.spell_id,
    source: { site_id: "d20pfsrd", url: searchCapture.url },
    retrieval: {
      retrieved_at: searchCapture.retrieved_at,
      http_status: searchCapture.http_status,
      content_sha256: searchCapture.content_sha256,
      raw_artifact_path: path.relative(path.join(projectRoot, "data", "coverage"), searchCapture.rawPath).replaceAll("\\", "/"),
      response_content_type: searchCapture.response_content_type,
    },
    check: {
      method: "exact_text_search",
      query: spell.name,
      case_sensitive: false,
      scope_raw: "Captured d20PFSRD site-search results plus deterministic exact, grouped-name, and numbered-name article candidates",
    },
    result: {
      status: "not_found",
      match_count: 0,
      note: `${spell.name} had no exact bounded spell heading in the checked d20PFSRD candidates. This is a coverage result, not an empty observation.${exactResults.length > 0 ? " Exact-slug search links were rejected because their articles did not contain the requested heading." : ""}`,
    },
  };
}


function directJsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => path.join(directory, name));
}


function registeredIdsExcludingBulk(registryPath: string): Set<string> {
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


function titleCaseSpellName(value: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-US"));
}


function refreshDiscoveredDependencies(manifest: ValidatedJson, canonicalIds: Set<string>): void {
  const catalogIds = new Set(manifest.spells.map((spell: ValidatedJson) => spell.spell_id));
  const dependencies = new Map<string, ValidatedJson>(
    (manifest.discovered_dependencies ?? []).map((dependency: ValidatedJson) => [dependency.spell_id, dependency]),
  );
  const add = (
    spellId: string,
    name: string,
    sourceUrl: string | null,
    reason: "rules_inheritance" | "linked_spell",
    evidence: ValidatedJson,
  ) => {
    if (catalogIds.has(spellId)) return;
    const existing = dependencies.get(spellId);
    const resolvedUrl = sourceUrl ?? `https://www.aonprd.com/SpellDisplay.aspx?ItemName=${encodeURIComponent(name)}`;
    if (!existing) {
      dependencies.set(spellId, {
        spell_id: spellId,
        name,
        source_url: resolvedUrl,
        reason,
        status: canonicalIds.has(spellId) ? "ingested" : "pending",
        discovered_from: [evidence],
      });
      return;
    }
    if (reason === "rules_inheritance") existing.reason = reason;
    if (canonicalIds.has(spellId)) {
      existing.status = "ingested";
      delete existing.issue;
    }
    if (!existing.discovered_from.some((item: ValidatedJson) => JSON.stringify(item) === JSON.stringify(evidence))) {
      existing.discovered_from.push(evidence);
    }
  };

  for (const filename of jsonFilesUnder(path.join(projectRoot, "data", "observations"))) {
    const record = loadJson(filename);
    if (record.source?.site_id !== "aon" || record.entity_type !== "spell") continue;
    const ownerSpellId = String(record.observation_id).split(":")[1];
    if (!ownerSpellId || !catalogIds.has(ownerSpellId)) continue;
    const rawLinks = record.spell_raw?.links_raw ?? [];
    for (const link of rawLinks) {
      if (link.target_entity_type_hint !== "spell" || !link.target_entity_id_hint) continue;
      add(link.target_entity_id_hint, link.anchor_text_raw, link.href_resolved, "linked_spell", {
        owner_spell_id: ownerSpellId,
        observation_id: record.observation_id,
        source_field: link.source_field,
        anchor_text_raw: link.anchor_text_raw,
        source_href: link.href_resolved,
      });
    }
    const description = record.spell_raw?.description_raw ?? "";
    const inheritanceMatch = /^(?:this spell (?:functions|works) (?:as|like)|as)\s+(?:the\s+)?([a-z][a-z' -]+?)(?:,|\.| except| but)/i.exec(description);
    if (inheritanceMatch?.[1]) {
      const parentName = titleCaseSpellName(inheritanceMatch[1].trim());
      const parentId = `spell.${slug(parentName)}`;
      const linkedParent = rawLinks.find((link: ValidatedJson) => link.target_entity_id_hint === parentId);
      add(parentId, parentName, linkedParent?.href_resolved ?? null, "rules_inheritance", {
        owner_spell_id: ownerSpellId,
        observation_id: record.observation_id,
        source_field: "spell_raw.description_raw",
        anchor_text_raw: inheritanceMatch[0],
        source_href: linkedParent?.href_resolved ?? null,
      });
    }
  }
  manifest.discovered_dependencies = [...dependencies.values()].sort((left, right) =>
    left.spell_id.localeCompare(right.spell_id),
  );
}


function jsonFilesUnder(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? jsonFilesUnder(filename) : entry.name.endsWith(".json") ? [filename] : [];
  });
}


async function ingestSpell(
  spell: ValidatedJson,
  legacyIndex: CapturedArtifact,
  legacyEntries: ReturnType<typeof parseLegacyIndex>,
  availableCanonicalIds: Set<string>,
  bulkEntities: Map<string, GeneratedEntity>,
  baseEntityIds: Set<string>,
  artifactScope: string,
): Promise<"ingested" | "issue"> {
  const spellSlug = spell.spell_id.replace(/^spell\./, "");
  const rawDirectory = path.join(projectRoot, "data", "raw", artifactScope, spellSlug);
  const observationDirectory = path.join(projectRoot, "data", "observations", spellSlug);
  const inputs: ParsedObservationInput[] = [];
  try {
    const aonCapture = await capture(spell.source_url, path.join(rawDirectory, "aon.html"));
    const aonParsed = parseAonSpell(aonCapture.body, aonCapture.url);
    if (aonParsed.nameRaw.toLocaleLowerCase("en-US") !== spell.name.toLocaleLowerCase("en-US")) {
      throw new NormalizationIssue("source", "aon-name-mismatch", `Expected ${spell.name}, parsed ${aonParsed.nameRaw}.`);
    }
    const aonObservation = observation("aon", spell.spell_id, aonCapture, aonParsed, observationDirectory);
    writeObservationJson(path.join(observationDirectory, `aon-${parserVersion}.json`), aonObservation.record);
    inputs.push(aonObservation.input);

    const legacyEntry = legacyEntries.get(spell.name.toLocaleLowerCase("en-US"));
    if (legacyEntry) {
      const legacyCapture = await capture(legacyEntry.href, path.join(rawDirectory, "legacy_aon.html"));
      const legacyParsed = parseLegacySpell(legacyCapture.body, legacyEntry.href, legacyEntry);
      const legacyObservation = observation("legacy_aon", spell.spell_id, legacyCapture, legacyParsed, observationDirectory);
      writeObservationJson(path.join(observationDirectory, `legacy_aon-${parserVersion}.json`), legacyObservation.record);
      inputs.push(legacyObservation.input);
    } else {
      writeGeneratedJson(
        path.join(projectRoot, "data", "coverage", `${artifactScope}-${spellSlug}-legacy.json`),
        legacyCoverageCheck(spell, legacyIndex, artifactScope),
      );
    }

    const d20Resolution = await resolveD20Spell(spell.name, rawDirectory);
    if ("coverageCapture" in d20Resolution) {
      writeGeneratedJson(
        path.join(projectRoot, "data", "coverage", `${artifactScope}-${spellSlug}-d20pfsrd.json`),
        d20CoverageCheck(spell, d20Resolution.coverageCapture, artifactScope),
      );
    } else {
      const d20Observation = observation(
        "d20pfsrd",
        spell.spell_id,
        d20Resolution.captureResult,
        d20Resolution.parsed,
        observationDirectory,
      );
      writeObservationJson(path.join(observationDirectory, `d20pfsrd-${parserVersion}.json`), d20Observation.record);
      inputs.push(d20Observation.input);
    }

    const bundle = generateCanonicalBundle(spell.spell_id, inputs, availableCanonicalIds);
    for (const entity of bundle.entities) {
      if (!baseEntityIds.has(entity.entity_id)) mergeEntity(bulkEntities, entity);
    }
    writeGeneratedJson(path.join(projectRoot, "data", "canonical", `${spellSlug}.json`), bundle.canonical, refreshCanonical);
    writeGeneratedJson(path.join(projectRoot, "data", "decisions", `${spellSlug}.json`), bundle.decision, refreshCanonical);
    delete spell.issue;
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


export async function ingestSpellLevelBatch(
  level: number,
  batchNumber: number,
  assertSourcePolicy = true,
) {
  if (!Number.isInteger(batchNumber) || batchNumber < 1) throw new Error("Batch number must be a positive integer.");
  const { artifactScope, manifestPath, registryId, registryPath } = levelPaths(level);
  if (assertSourcePolicy) await assertIngestionSourcesAllowed();

  const legacyIndex = await capture(
    legacyIndexUrl,
    path.join(projectRoot, "data", "raw", artifactScope, "legacy-spell-index.html"),
  );
  const legacyEntries = parseLegacyIndex(legacyIndex.body, legacyIndex.url);
  const manifest = loadJson(manifestPath);
  const selected = manifest.spells.filter((spell: ValidatedJson) => spell.batch === batchNumber);
  if (selected.length === 0) throw new Error(`No level-${level} ingestion batch ${batchNumber} exists.`);

  const baseEntityIds = registeredIdsExcludingBulk(registryPath);
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
    if (
      (fs.existsSync(canonicalPath) && (!refreshCanonical || reviewedCanonicalIds.has(spell.spell_id))) ||
      spell.issue?.kind === "scope"
    ) {
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
      artifactScope,
    );
    report[result === "ingested" ? "ingested" : "issues"].push(spell.name);
    writeGeneratedJson(manifestPath, manifest, true);
    writeGeneratedJson(registryPath, {
      $schema: "../../schemas/entity-registry.schema.json",
      schema_version: "0.1.0",
      registry_id: registryId,
      entities: [...bulkEntities.values()].sort((left, right) => left.entity_id.localeCompare(right.entity_id)),
    }, true);
  }
  refreshDiscoveredDependencies(manifest, availableCanonicalIds);
  writeGeneratedJson(manifestPath, manifest, true);
  validatePackage();
  return report;
}


export async function ingestDiscoveredDependencies() {
  const { manifestPath, registryId, registryPath } = levelPaths(0);
  await assertIngestionSourcesAllowed();
  const legacyIndex = await capture(
    legacyIndexUrl,
    path.join(projectRoot, "data", "raw", "level-zero", "legacy-spell-index.html"),
  );
  const legacyEntries = parseLegacyIndex(legacyIndex.body, legacyIndex.url);
  const manifest = loadJson(manifestPath);
  const baseEntityIds = registeredIdsExcludingBulk(registryPath);
  const bulkEntities = new Map<string, GeneratedEntity>();
  if (fs.existsSync(registryPath)) {
    for (const entity of loadJson(registryPath).entities) bulkEntities.set(entity.entity_id, entity);
  }
  const availableCanonicalIds = new Set(
    directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => loadJson(filename).spell_id),
  );
  const report = { ingested: [] as string[], issues: [] as string[], skipped: [] as string[] };
  for (const dependency of manifest.discovered_dependencies ?? []) {
    if (availableCanonicalIds.has(dependency.spell_id) && !refreshCanonical) {
      dependency.status = "ingested";
      delete dependency.issue;
      report.skipped.push(dependency.name);
      continue;
    }
    const candidate: ValidatedJson = {
      spell_id: dependency.spell_id,
      name: dependency.name,
      source_url: dependency.source_url,
    };
    const result = await ingestSpell(
      candidate,
      legacyIndex,
      legacyEntries,
      availableCanonicalIds,
      bulkEntities,
      baseEntityIds,
      "dependencies",
    );
    dependency.status = result === "ingested" ? "ingested" : "issue";
    if (candidate.issue) dependency.issue = candidate.issue;
    else delete dependency.issue;
    report[result === "ingested" ? "ingested" : "issues"].push(dependency.name);
    writeGeneratedJson(manifestPath, manifest, true);
    writeGeneratedJson(registryPath, {
      $schema: "../../schemas/entity-registry.schema.json",
      schema_version: "0.1.0",
      registry_id: registryId,
      entities: [...bulkEntities.values()].sort((left, right) => left.entity_id.localeCompare(right.entity_id)),
    }, true);
  }
  refreshDiscoveredDependencies(manifest, availableCanonicalIds);
  writeGeneratedJson(manifestPath, manifest, true);
  validatePackage();
  return report;
}


export function ingestLevelZeroBatch(batchNumber: number) {
  return ingestSpellLevelBatch(0, batchNumber);
}


async function ingestAllSpellLevelBatches(level: number, startBatch = 1, endBatch?: number) {
  if (!Number.isInteger(startBatch) || startBatch < 1) {
    throw new Error("Start batch must be a positive integer.");
  }
  const { manifestPath } = levelPaths(level);
  const manifest = loadJson(manifestPath);
  const batchCount = Math.max(0, ...manifest.spells.map((spell: ValidatedJson) => Number(spell.batch)));
  if (startBatch > batchCount) {
    throw new Error(`No level-${level} ingestion batch ${startBatch} exists.`);
  }
  const finalBatch = endBatch ?? batchCount;
  if (!Number.isInteger(finalBatch) || finalBatch < startBatch || finalBatch > batchCount) {
    throw new Error(`End batch must be an integer from ${startBatch} through ${batchCount}.`);
  }
  const reports = [];
  await assertIngestionSourcesAllowed();
  for (let batch = startBatch; batch <= finalBatch; batch += 1) {
    reports.push(await ingestSpellLevelBatch(level, batch, false));
  }
  return reports;
}


const command = process.argv[2];
const level = Number(process.argv[3] ?? "0");
const startBatch = Number(process.argv[4] ?? "1");
const endBatch = process.argv[5] === undefined ? undefined : Number(process.argv[5]);
const run = command === "dependencies"
  ? ingestDiscoveredDependencies()
  : command === "all"
    ? ingestAllSpellLevelBatches(level, startBatch, endBatch)
    : ingestSpellLevelBatch(level, Number(command));
run
  .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
