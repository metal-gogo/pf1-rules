import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import { observationEntityId, type ValidatedJson } from "../domain/json.js";
import { validatePackage } from "./validate.js";
import {
  type GeneratedEntity,
  detectSpellInheritance,
  generateCanonicalBundle,
  normalizeUnresolvedSpellReference,
  NormalizationIssue,
  type ParsedObservationInput,
  reviewedCanonicalOverrideSpellIds,
  resolveCanonicalSpellReference,
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
import {
  legacy35CanonicalizationEnabled,
  redMantisCatalogCanonicalizationEnabled,
} from "./scope-policy.js";


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
  offlineOnly = false,
): Promise<{ captureResult: CapturedArtifact; parsed: ParsedSpellPage } | { coverageCapture: CapturedArtifact }> {
  const primaryRawPath = path.join(rawDirectory, "d20pfsrd.html");
  const fallbackRawPath = path.join(rawDirectory, "d20pfsrd-resolved.html");
  let cachedCoverage: CapturedArtifact | null = null;
  for (const cachedPath of [primaryRawPath, fallbackRawPath]) {
    if (!fs.existsSync(cachedPath) && !fs.existsSync(`${cachedPath}.meta.json`)) continue;
    const cached = await capture(d20CandidateUrls(spellName)[0]!, cachedPath);
    try {
      const parsed = parseD20pfsrdSpell(cached.body, cached.url, spellName);
      return { captureResult: cached, parsed };
    } catch {
      // The old deterministic capture can be a valid grouped page for another entry.
      cachedCoverage ??= cached;
    }
  }
  const resolvedRawPath = fs.existsSync(primaryRawPath) ? fallbackRawPath : primaryRawPath;
  const searchRawPath = path.join(rawDirectory, "d20pfsrd-search.html");
  if (offlineOnly) {
    if (fs.existsSync(searchRawPath) && fs.existsSync(`${searchRawPath}.meta.json`)) {
      return { coverageCapture: await capture(d20SearchUrl(spellName), searchRawPath) };
    }
    if (cachedCoverage) return { coverageCapture: cachedCoverage };
    throw new Error(`No cached d20PFSRD capture or coverage artifact for ${spellName}.`);
  }

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
    searchRawPath,
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
  const query = d20CandidateUrls(spell.name)[0]!;
  const content = searchCapture.body.toLocaleLowerCase("en-US");
  const normalizedQuery = query.toLocaleLowerCase("en-US");
  let matchCount = 0;
  let offset = 0;
  while ((offset = content.indexOf(normalizedQuery, offset)) >= 0) {
    matchCount += 1;
    offset += normalizedQuery.length;
  }
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
      query,
      case_sensitive: false,
      scope_raw: "Captured d20PFSRD site-search results; exact deterministic spell-article URL after grouped-name, numbered-name, and search candidates failed bounded-heading validation",
    },
    result: {
      status: matchCount === 0 ? "not_found" : "found",
      match_count: matchCount,
      note: matchCount === 0
        ? `${spell.name} had no exact spell-article URL in the captured search results, and no checked alias or result article contained its bounded heading. This is negative coverage, not an empty observation.`
        : `${spell.name} had an exact spell-article URL in search results, but that article did not contain the requested bounded heading. No d20PFSRD observation was accepted.`,
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


function isD20ResolutionIssue(spell: ValidatedJson): boolean {
  if (spell.issue?.code === "d20-name-mismatch") return true;
  return /HTTP \d+ while retrieving https:\/\/www\.d20pfsrd\.com\//i.test(spell.issue?.message ?? "");
}


function refreshDiscoveredDependencies(
  manifest: ValidatedJson,
  canonicalSpells: Map<string, ValidatedJson>,
): void {
  const canonicalIds = new Set(canonicalSpells.keys());
  const catalogIds = new Set(manifest.spells.map((spell: ValidatedJson) => spell.spell_id));
  const dependencies = new Map<string, ValidatedJson>();
  const add = (
    spellId: string,
    name: string,
    sourceUrl: string | null,
    reason: "rules_inheritance" | "linked_spell",
    evidence: ValidatedJson,
  ) => {
    const canonical = resolveCanonicalSpellReference(name, canonicalSpells, spellId);
    const unresolved = canonical ? null : normalizeUnresolvedSpellReference(name);
    const resolvedSpellId = canonical?.spell_id ?? unresolved?.spellId ?? spellId;
    const resolvedName = canonical?.name ?? unresolved?.name ?? name;
    if (catalogIds.has(resolvedSpellId)) return;
    const existing = dependencies.get(resolvedSpellId);
    const resolvedUrl = sourceUrl ?? `https://www.aonprd.com/SpellDisplay.aspx?ItemName=${encodeURIComponent(resolvedName)}`;
    if (!existing) {
      dependencies.set(resolvedSpellId, {
        spell_id: resolvedSpellId,
        name: resolvedName,
        source_url: resolvedUrl,
        reason,
        status: canonicalIds.has(resolvedSpellId) ? "ingested" : "pending",
        discovered_from: [evidence],
      });
      return;
    }
    if (reason === "rules_inheritance") existing.reason = reason;
    if (canonicalIds.has(resolvedSpellId)) {
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
    const inheritance = detectSpellInheritance({
      descriptionRaw: record.spell_raw?.description_raw ?? "",
      links: rawLinks.map((link: ValidatedJson) => ({
        anchorTextRaw: link.anchor_text_raw,
        sourceField: link.source_field,
        targetEntityTypeHint: link.target_entity_type_hint,
        targetEntityIdHint: link.target_entity_id_hint,
      })),
    } as ParsedSpellPage, canonicalSpells);
    if (inheritance) {
      const linkedParent = rawLinks.find((link: ValidatedJson) =>
        link.target_entity_id_hint === inheritance.parentId ||
        link.anchor_text_raw.toLocaleLowerCase("en-US") === inheritance.parentName.toLocaleLowerCase("en-US"),
      );
      add(inheritance.parentId, inheritance.parentName, linkedParent?.href_resolved ?? null, "rules_inheritance", {
        owner_spell_id: ownerSpellId,
        observation_id: record.observation_id,
        source_field: "spell_raw.description_raw",
        anchor_text_raw: inheritance.basisRaw,
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
  availableCanonicalSpells: Map<string, ValidatedJson>,
  bulkEntities: Map<string, GeneratedEntity>,
  baseEntityIds: Set<string>,
  artifactScope: string,
  legacy35Material: boolean,
  offlineOnly = false,
  allowCanonicalUpdate = false,
  allowMissingPrintedLevels = false,
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
    const legacyRawPath = path.join(rawDirectory, "legacy_aon.html");
    const hasCachedLegacy = fs.existsSync(legacyRawPath) && fs.existsSync(`${legacyRawPath}.meta.json`);
    let acceptedLegacy = false;
    if (legacyEntry && (!offlineOnly || hasCachedLegacy)) {
      try {
        const legacyCapture = await capture(legacyEntry.href, legacyRawPath);
        const legacyParsed = parseLegacySpell(legacyCapture.body, legacyEntry.href, legacyEntry);
        const legacyObservation = observation("legacy_aon", spell.spell_id, legacyCapture, legacyParsed, observationDirectory);
        writeObservationJson(path.join(observationDirectory, `legacy_aon-${parserVersion}.json`), legacyObservation.record);
        inputs.push(legacyObservation.input);
        acceptedLegacy = true;
      } catch (error) {
        if (!offlineOnly) throw error;
        // AoN remains the canonical baseline when a grouped legacy page lacks the expected bounded entry.
      }
    }
    if (!acceptedLegacy && !legacyEntry) {
      writeGeneratedJson(
        path.join(projectRoot, "data", "coverage", `${artifactScope}-${spellSlug}-legacy.json`),
        legacyCoverageCheck(spell, legacyIndex, artifactScope),
      );
    }

    try {
      const d20Resolution = await resolveD20Spell(spell.name, rawDirectory, offlineOnly);
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
    } catch (error) {
      if (!offlineOnly) throw error;
    }

    const bundle = generateCanonicalBundle(
      spell.spell_id,
      inputs,
      availableCanonicalSpells,
      { legacy35Material, allowMissingPrintedLevels },
    );
    for (const entity of bundle.entities) {
      if (!baseEntityIds.has(entity.entity_id)) mergeEntity(bulkEntities, entity);
    }
    writeGeneratedJson(
      path.join(projectRoot, "data", "canonical", `${spellSlug}.json`),
      bundle.canonical,
      refreshCanonical || allowCanonicalUpdate,
    );
    writeGeneratedJson(
      path.join(projectRoot, "data", "decisions", `${spellSlug}.json`),
      bundle.decision,
      refreshCanonical || allowCanonicalUpdate,
    );
    delete spell.issue;
    availableCanonicalSpells.set(spell.spell_id, bundle.canonical);
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


const allSpellsCompletenessIdentities = [
  { spellId: "spell.armor-of-darkness", name: "Armor of Darkness", legacy35Material: true },
  { spellId: "spell.bolt-of-glory", name: "Bolt of Glory", legacy35Material: true },
  { spellId: "spell.bolts-of-bedevilment", name: "Bolts of Bedevilment", legacy35Material: true },
  { spellId: "spell.crown-of-glory", name: "Crown of Glory", legacy35Material: true },
  { spellId: "spell.fey-blight", name: "Fey Blight", legacy35Material: false },
  { spellId: "spell.fey-boon", name: "Fey Boon", legacy35Material: false },
] as const;


export async function ingestAllSpellsCompletenessIdentities() {
  await assertIngestionSourcesAllowed();
  const artifactScope = "all-spells-completeness";
  const registryPath = path.join(
    projectRoot,
    "data",
    "entities",
    "all-spells-completeness-entities.json",
  );
  const registryId = "all-spells-completeness-entities-v0.1";
  const legacyIndex = await capture(
    legacyIndexUrl,
    path.join(projectRoot, "data", "raw", artifactScope, "legacy-spell-index.html"),
  );
  const legacyEntries = parseLegacyIndex(legacyIndex.body, legacyIndex.url);
  const baseEntityIds = registeredIdsExcludingBulk(registryPath);
  const bulkEntities = new Map<string, GeneratedEntity>();
  if (fs.existsSync(registryPath)) {
    for (const entity of loadJson(registryPath).entities) {
      bulkEntities.set(entity.entity_id, entity);
    }
  }
  const availableCanonicalSpells = new Map(
    directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
      const record = loadJson(filename);
      return [record.spell_id, record] as const;
    }),
  );
  const report = {
    ingested: [] as string[],
    issues: [] as Array<{ name: string; issue: ValidatedJson | null }>,
    skipped: [] as string[],
  };

  for (const entry of allSpellsCompletenessIdentities) {
    const canonicalPath = path.join(
      projectRoot,
      "data",
      "canonical",
      `${entry.spellId.replace(/^spell\./, "")}.json`,
    );
    if (fs.existsSync(canonicalPath)) {
      report.skipped.push(entry.name);
      continue;
    }
    const spell: ValidatedJson = {
      spell_id: entry.spellId,
      name: entry.name,
      source_url: `https://www.aonprd.com/SpellDisplay.aspx?ItemName=${encodeURIComponent(entry.name)}`,
    };
    const result = await ingestSpell(
      spell,
      legacyIndex,
      legacyEntries,
      availableCanonicalSpells,
      bulkEntities,
      baseEntityIds,
      artifactScope,
      entry.legacy35Material,
      false,
      false,
      true,
    );
    if (result === "ingested") {
      report.ingested.push(entry.name);
    } else {
      report.issues.push({ name: entry.name, issue: spell.issue ?? null });
    }
    writeGeneratedJson(registryPath, {
      $schema: "../../schemas/entity-registry.schema.json",
      schema_version: "0.1.0",
      registry_id: registryId,
      entities: [...bulkEntities.values()].sort((left, right) =>
        left.entity_id.localeCompare(right.entity_id),
      ),
    }, true);
  }

  validatePackage();
  return report;
}


export async function ingestSpellLevelBatch(
  level: number,
  batchNumber: number,
  assertSourcePolicy = true,
  retryD20Only = false,
  finalize = true,
  offlineOnly = false,
  onlyIssueCode?: string,
  onlySpellIds?: ReadonlySet<string>,
  refreshSelected = false,
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
  const selected = manifest.spells.filter((spell: ValidatedJson) =>
    spell.batch === batchNumber &&
    (!retryD20Only || isD20ResolutionIssue(spell)) &&
    (!onlyIssueCode || spell.issue?.code === onlyIssueCode) &&
    (!onlySpellIds || onlySpellIds.has(spell.spell_id)),
  );
  if (selected.length === 0) throw new Error(`No level-${level} ingestion batch ${batchNumber} exists.`);

  const baseEntityIds = registeredIdsExcludingBulk(registryPath);
  const bulkEntities = new Map<string, GeneratedEntity>();
  if (fs.existsSync(registryPath)) {
    for (const entity of loadJson(registryPath).entities) bulkEntities.set(entity.entity_id, entity);
  }
  const availableCanonicalSpells = new Map(
    directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
      const record = loadJson(filename);
      return [record.spell_id, record] as const;
    }),
  );
  const report = { batch: batchNumber, ingested: [] as string[], issues: [] as string[], skipped: [] as string[] };
  for (const spell of selected) {
    const legacy35Material = spell.catalog_memberships.some(
      (membership: ValidatedJson) => membership.legacy_3_5_material === true,
    );
    const canonicalPath = path.join(projectRoot, "data", "canonical", `${spell.spell_id.replace(/^spell\./, "")}.json`);
    const canonicalExists = fs.existsSync(canonicalPath) &&
      !refreshSelected &&
      (!refreshCanonical || reviewedCanonicalIds.has(spell.spell_id));
    const scopeExcluded = spell.issue?.kind === "scope" &&
      !(legacy35CanonicalizationEnabled && legacy35Material);
    if (canonicalExists || scopeExcluded) {
      if (retryD20Only && canonicalExists && isD20ResolutionIssue(spell)) delete spell.issue;
      if (canonicalExists && onlyIssueCode && spell.issue?.code === onlyIssueCode) delete spell.issue;
      report.skipped.push(spell.name);
      continue;
    }
    const result = await ingestSpell(
      spell,
      legacyIndex,
      legacyEntries,
      availableCanonicalSpells,
      bulkEntities,
      baseEntityIds,
      artifactScope,
      legacy35Material,
      offlineOnly,
      refreshSelected,
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
  if (finalize) {
    refreshDiscoveredDependencies(manifest, availableCanonicalSpells);
    writeGeneratedJson(manifestPath, manifest, true);
    validatePackage();
  } else {
    writeGeneratedJson(manifestPath, manifest, true);
  }
  return report;
}


export async function rolloutSpellInheritance() {
  const inheritanceCandidates = new Set<string>();
  const legacyInheritancePattern = /^(?:this spell (?:functions|works) (?:as|like)|as)\s+(?:the\s+)?([a-z][a-z' -]+?)(?:,|\.| except| but)/i;
  for (const filename of jsonFilesUnder(path.join(projectRoot, "data", "observations"))) {
    const observation = loadJson(filename);
    if (observation.source?.site_id !== "aon") continue;
    if (legacyInheritancePattern.test(observation.spell_raw?.description_raw ?? "")) {
      inheritanceCandidates.add(observationEntityId(observation.observation_id));
    }
  }
  const summary = {
    batches: 0,
    ingested: 0,
    issues: 0,
    skipped: 0,
    reconciled: 0,
    levels: [] as Array<{ level: number; batches: number; ingested: number; issues: number; skipped: number }>,
  };
  for (let level = 0; level <= 9; level += 1) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    const affectedBatches = [...new Set<number>(
      manifest.spells
        .filter((spell: ValidatedJson) => inheritanceCandidates.has(spell.spell_id))
        .map((spell: ValidatedJson) => Number(spell.batch)),
    )].sort((left, right) => left - right);
    const levelSummary = { level, batches: affectedBatches.length, ingested: 0, issues: 0, skipped: 0 };
    for (const batch of affectedBatches) {
      const report = await ingestSpellLevelBatch(
        level,
        batch,
        false,
        false,
        false,
        true,
        undefined,
        inheritanceCandidates,
      );
      levelSummary.ingested += report.ingested.length;
      levelSummary.issues += report.issues.length;
      levelSummary.skipped += report.skipped.length;
      process.stderr.write(
        `Rolled out inheritance for level ${level} batch ${batch}: ` +
        `${report.ingested.length} ingested, ${report.issues.length} issues, ` +
        `${report.skipped.length} already canonical.\n`,
      );
    }
    const refreshedManifest = loadJson(manifestPath);
    const canonicalSpells = new Map(
      directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
        const record = loadJson(filename);
        return [record.spell_id, record] as const;
      }),
    );
    refreshDiscoveredDependencies(refreshedManifest, canonicalSpells);
    writeGeneratedJson(manifestPath, refreshedManifest, true);
    summary.batches += levelSummary.batches;
    summary.ingested += levelSummary.ingested;
    summary.issues += levelSummary.issues;
    summary.skipped += levelSummary.skipped;
    summary.levels.push(levelSummary);
  }

  const canonicalFiles = directJsonFiles(path.join(projectRoot, "data", "canonical"));
  const reconcileIds = new Set(
    canonicalFiles
      .map(loadJson)
      .filter((record) =>
        record.normalization?.normalizer_version === "0.1.2-explicit-inheritance" &&
        record.rules_inheritance?.length > 0,
      )
      .map((record) => record.spell_id),
  );
  const assigned = new Set<string>();
  for (let level = 0; level <= 9; level += 1) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    const byBatch = new Map<number, Set<string>>();
    for (const spell of manifest.spells) {
      if (!reconcileIds.has(spell.spell_id) || assigned.has(spell.spell_id)) continue;
      const batch = Number(spell.batch);
      const ids = byBatch.get(batch) ?? new Set<string>();
      ids.add(spell.spell_id);
      byBatch.set(batch, ids);
      assigned.add(spell.spell_id);
    }
    for (const [batch, ids] of [...byBatch].sort(([left], [right]) => left - right)) {
      const report = await ingestSpellLevelBatch(
        level,
        batch,
        false,
        false,
        false,
        true,
        undefined,
        ids,
        true,
      );
      summary.reconciled += report.ingested.length;
      summary.issues += report.issues.length;
      process.stderr.write(
        `Reconciled ${report.ingested.length} inheritance records from level ${level} batch ${batch}` +
        `${report.issues.length ? ` (${report.issues.length} issues)` : ""}.\n`,
      );
    }
  }
  validatePackage();
  return summary;
}


export async function retryD20SourceFailures(requestedLevel?: number) {
  const levels = requestedLevel === undefined ? Array.from({ length: 10 }, (_value, level) => level) : [requestedLevel];
  if (levels.some((level) => !Number.isInteger(level) || level < 0 || level > 9)) {
    throw new Error("Retry level must be an integer from 0 through 9, or omitted for all levels.");
  }
  await assertIngestionSourcesAllowed();
  const summary = {
    batches: 0,
    ingested: 0,
    issues: 0,
    skipped: 0,
    levels: [] as Array<{ level: number; batches: number; ingested: number; issues: number; skipped: number }>,
  };
  for (const level of levels) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    const affectedBatches = [...new Set<number>(
      manifest.spells.filter(isD20ResolutionIssue).map((spell: ValidatedJson) => Number(spell.batch)),
    )].sort((left, right) => left - right);
    const levelSummary = { level, batches: affectedBatches.length, ingested: 0, issues: 0, skipped: 0 };
    for (const batch of affectedBatches) {
      const report = await ingestSpellLevelBatch(level, batch, false, true, false);
      levelSummary.ingested += report.ingested.length;
      levelSummary.issues += report.issues.length;
      levelSummary.skipped += report.skipped.length;
      process.stderr.write(
        `Retried level ${level} batch ${batch}: ${report.ingested.length} ingested, ${report.issues.length} issues, ${report.skipped.length} skipped.\n`,
      );
    }
    const refreshedManifest = loadJson(manifestPath);
    const canonicalSpells = new Map(
      directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
        const record = loadJson(filename);
        return [record.spell_id, record] as const;
      }),
    );
    refreshDiscoveredDependencies(refreshedManifest, canonicalSpells);
    writeGeneratedJson(manifestPath, refreshedManifest, true);
    summary.batches += levelSummary.batches;
    summary.ingested += levelSummary.ingested;
    summary.issues += levelSummary.issues;
    summary.skipped += levelSummary.skipped;
    summary.levels.push(levelSummary);
  }
  validatePackage();
  return summary;
}


export async function retrySpellLevelNormalizationIssues(requestedLevel?: number) {
  const levels = requestedLevel === undefined ? Array.from({ length: 10 }, (_value, level) => level) : [requestedLevel];
  if (levels.some((level) => !Number.isInteger(level) || level < 0 || level > 9)) {
    throw new Error("Retry level must be an integer from 0 through 9, or omitted for all levels.");
  }
  const issueCode = "unparsed-spell-level";
  const summary = {
    issueCode,
    batches: 0,
    ingested: 0,
    issues: 0,
    skipped: 0,
    levels: [] as Array<{ level: number; batches: number; ingested: number; issues: number; skipped: number }>,
  };
  for (const level of levels) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    const affectedBatches = [...new Set<number>(
      manifest.spells
        .filter((spell: ValidatedJson) => spell.issue?.code === issueCode)
        .map((spell: ValidatedJson) => Number(spell.batch)),
    )].sort((left, right) => left - right);
    const levelSummary = { level, batches: affectedBatches.length, ingested: 0, issues: 0, skipped: 0 };
    for (const batch of affectedBatches) {
      const report = await ingestSpellLevelBatch(
        level,
        batch,
        false,
        false,
        false,
        true,
        issueCode,
      );
      levelSummary.ingested += report.ingested.length;
      levelSummary.issues += report.issues.length;
      levelSummary.skipped += report.skipped.length;
      process.stderr.write(
        `Retried level ${level} batch ${batch} from cached sources: ${report.ingested.length} ingested, ` +
        `${report.issues.length} issues, ${report.skipped.length} skipped.\n`,
      );
    }
    const refreshedManifest = loadJson(manifestPath);
    const canonicalSpells = new Map(
      directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
        const record = loadJson(filename);
        return [record.spell_id, record] as const;
      }),
    );
    refreshDiscoveredDependencies(refreshedManifest, canonicalSpells);
    writeGeneratedJson(manifestPath, refreshedManifest, true);
    summary.batches += levelSummary.batches;
    summary.ingested += levelSummary.ingested;
    summary.issues += levelSummary.issues;
    summary.skipped += levelSummary.skipped;
    summary.levels.push(levelSummary);
  }
  validatePackage();
  return summary;
}


export async function retryCachedSourceIssues(requestedLevel?: number) {
  const levels = requestedLevel === undefined ? Array.from({ length: 10 }, (_value, level) => level) : [requestedLevel];
  if (levels.some((level) => !Number.isInteger(level) || level < 0 || level > 9)) {
    throw new Error("Retry level must be an integer from 0 through 9, or omitted for all levels.");
  }
  const summary = {
    batches: 0,
    ingested: 0,
    issues: 0,
    skipped: 0,
    levels: [] as Array<{ level: number; batches: number; ingested: number; issues: number; skipped: number }>,
  };
  for (const level of levels) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    const sourceIssueIdsByBatch = new Map<number, Set<string>>();
    for (const spell of manifest.spells.filter((entry: ValidatedJson) => entry.issue?.kind === "source")) {
      const batch = Number(spell.batch);
      const ids = sourceIssueIdsByBatch.get(batch) ?? new Set<string>();
      ids.add(spell.spell_id);
      sourceIssueIdsByBatch.set(batch, ids);
    }
    const affectedBatches = [...sourceIssueIdsByBatch.keys()].sort((left, right) => left - right);
    const levelSummary = { level, batches: affectedBatches.length, ingested: 0, issues: 0, skipped: 0 };
    for (const batch of affectedBatches) {
      const report = await ingestSpellLevelBatch(
        level,
        batch,
        false,
        false,
        false,
        true,
        undefined,
        sourceIssueIdsByBatch.get(batch),
      );
      levelSummary.ingested += report.ingested.length;
      levelSummary.issues += report.issues.length;
      levelSummary.skipped += report.skipped.length;
      process.stderr.write(
        `Retried cached source issues for level ${level} batch ${batch}: ${report.ingested.length} ingested, ` +
        `${report.issues.length} issues, ${report.skipped.length} skipped.\n`,
      );
    }
    const refreshedManifest = loadJson(manifestPath);
    const canonicalSpells = new Map(
      directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
        const record = loadJson(filename);
        return [record.spell_id, record] as const;
      }),
    );
    for (const spell of refreshedManifest.spells) {
      if (spell.issue?.kind === "source" && canonicalSpells.has(spell.spell_id)) delete spell.issue;
    }
    refreshDiscoveredDependencies(refreshedManifest, canonicalSpells);
    writeGeneratedJson(manifestPath, refreshedManifest, true);
    summary.batches += levelSummary.batches;
    summary.ingested += levelSummary.ingested;
    summary.issues += levelSummary.issues;
    summary.skipped += levelSummary.skipped;
    summary.levels.push(levelSummary);
  }
  validatePackage();
  return summary;
}


export async function ingestLegacy35ScopeEntries() {
  if (!legacy35CanonicalizationEnabled) {
    throw new Error("Legacy 3.5 canonicalization is not enabled by the accepted scope policy.");
  }
  await assertIngestionSourcesAllowed();
  const issueCode = "legacy-3.5-out-of-scope";
  const assignedSpellIds = new Set<string>();
  const summary = {
    issueCode,
    batches: 0,
    ingested: 0,
    issues: 0,
    skipped: 0,
    levels: [] as Array<{ level: number; batches: number; ingested: number; issues: number; skipped: number }>,
  };
  for (let level = 0; level <= 9; level += 1) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    const spellIdsByBatch = new Map<number, Set<string>>();
    for (const spell of manifest.spells) {
      const legacy35Material = spell.catalog_memberships.some(
        (membership: ValidatedJson) => membership.legacy_3_5_material === true,
      );
      if (!legacy35Material || assignedSpellIds.has(spell.spell_id)) continue;
      const batch = Number(spell.batch);
      const ids = spellIdsByBatch.get(batch) ?? new Set<string>();
      ids.add(spell.spell_id);
      spellIdsByBatch.set(batch, ids);
      assignedSpellIds.add(spell.spell_id);
    }
    const affectedBatches = [...spellIdsByBatch.keys()].sort((left, right) => left - right);
    const levelSummary = { level, batches: affectedBatches.length, ingested: 0, issues: 0, skipped: 0 };
    for (const batch of affectedBatches) {
      const spellIds = spellIdsByBatch.get(batch) ?? new Set<string>();
      const allCanonical = [...spellIds].every((spellId) => fs.existsSync(path.join(
        projectRoot,
        "data",
        "canonical",
        `${spellId.replace(/^spell\./, "")}.json`,
      )));
      const report = await ingestSpellLevelBatch(
        level,
        batch,
        false,
        false,
        false,
        allCanonical,
        undefined,
        spellIds,
        true,
      );
      levelSummary.ingested += report.ingested.length;
      levelSummary.issues += report.issues.length;
      levelSummary.skipped += report.skipped.length;
      process.stderr.write(
        `Ingested legacy 3.5 scope entries for level ${level} batch ${batch}: ` +
        `${report.ingested.length} ingested, ${report.issues.length} issues, ` +
        `${report.skipped.length} already canonical.\n`,
      );
    }
    const refreshedManifest = loadJson(manifestPath);
    const canonicalSpells = new Map(
      directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
        const record = loadJson(filename);
        return [record.spell_id, record] as const;
      }),
    );
    refreshDiscoveredDependencies(refreshedManifest, canonicalSpells);
    writeGeneratedJson(manifestPath, refreshedManifest, true);
    summary.batches += levelSummary.batches;
    summary.ingested += levelSummary.ingested;
    summary.issues += levelSummary.issues;
    summary.skipped += levelSummary.skipped;
    summary.levels.push(levelSummary);
  }
  validatePackage();
  return summary;
}


export async function retryReviewedCanonicalOverrides() {
  const reconciledSpellIds = new Set<string>();
  const replayLevelBySpellId = new Map<string, number>();
  for (const spellId of reviewedCanonicalOverrideSpellIds) {
    const observationDirectory = path.join(
      projectRoot,
      "data",
      "observations",
      spellId.replace(/^spell\./, ""),
    );
    const aonObservations = directJsonFiles(observationDirectory)
      .map(loadJson)
      .filter((observation) => observation.source?.site_id === "aon")
      .sort((left, right) => String(left.parser?.version).localeCompare(
        String(right.parser?.version),
        "en-US",
        { numeric: true },
      ));
    const rawArtifactPath = String(aonObservations.at(-1)?.retrieval?.raw_artifact_path ?? "");
    const levelMatch = /\/raw\/level-(zero|[0-9])\//.exec(rawArtifactPath);
    if (!levelMatch?.[1]) {
      throw new Error(`${spellId} lacks a level-scoped immutable AoN observation.`);
    }
    replayLevelBySpellId.set(
      spellId,
      levelMatch[1] === "zero" ? 0 : Number(levelMatch[1]),
    );
  }
  const summary = {
    batches: 0,
    ingested: 0,
    issues: 0,
    skipped: 0,
    levels: [] as Array<{ level: number; batches: number; ingested: number; issues: number; skipped: number }>,
  };
  for (let level = 0; level <= 9; level += 1) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    const affectedBatches = [...new Set<number>(
      manifest.spells
        .filter((spell: ValidatedJson) =>
          reviewedCanonicalOverrideSpellIds.has(spell.spell_id) &&
          replayLevelBySpellId.get(spell.spell_id) === level &&
          !reconciledSpellIds.has(spell.spell_id)
        )
        .map((spell: ValidatedJson) => Number(spell.batch)),
    )].sort((left, right) => left - right);
    const levelSummary = { level, batches: affectedBatches.length, ingested: 0, issues: 0, skipped: 0 };
    for (const batch of affectedBatches) {
      const selected = manifest.spells.filter((spell: ValidatedJson) =>
        Number(spell.batch) === batch &&
        reviewedCanonicalOverrideSpellIds.has(spell.spell_id) &&
        replayLevelBySpellId.get(spell.spell_id) === level &&
        !reconciledSpellIds.has(spell.spell_id)
      );
      const selectedIds = new Set<string>(
        selected.map((spell: ValidatedJson) => String(spell.spell_id)),
      );
      const selectedIdsByName = new Map<string, string>(
        selected.map((spell: ValidatedJson) => [
          String(spell.name),
          String(spell.spell_id),
        ] as const),
      );
      const report = await ingestSpellLevelBatch(
        level,
        batch,
        false,
        false,
        false,
        true,
        undefined,
        selectedIds,
        true,
      );
      for (const name of report.ingested) {
        const spellId = selectedIdsByName.get(name);
        if (spellId) reconciledSpellIds.add(spellId);
      }
      levelSummary.ingested += report.ingested.length;
      levelSummary.issues += report.issues.length;
      levelSummary.skipped += report.skipped.length;
    }
    summary.batches += levelSummary.batches;
    summary.ingested += levelSummary.ingested;
    summary.issues += levelSummary.issues;
    summary.skipped += levelSummary.skipped;
    summary.levels.push(levelSummary);
  }
  const unreconciled = [...reviewedCanonicalOverrideSpellIds]
    .filter((spellId) => !reconciledSpellIds.has(spellId));
  if (unreconciled.length > 0) {
    throw new Error(
      `Could not replay reviewed canonical decisions for: ${unreconciled.join(", ")}`,
    );
  }
  for (let level = 0; level <= 9; level += 1) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    for (const spell of manifest.spells) {
      if (reconciledSpellIds.has(spell.spell_id)) delete spell.issue;
    }
    writeGeneratedJson(manifestPath, manifest, true);
  }
  validatePackage();
  return summary;
}


export async function reconcileRedMantisCatalogMemberships() {
  if (!redMantisCatalogCanonicalizationEnabled) {
    throw new Error("Red Mantis Assassin catalog canonicalization is not enabled.");
  }

  const catalogListId = "spell-list.red-mantis-assassin";
  const compactListId = "spell-list.redmantisassassin";
  const summary = {
    catalogListId,
    normalized: 0,
    levels: [] as Array<{ level: number; normalized: number }>,
  };

  for (let level = 0; level <= 9; level += 1) {
    const { manifestPath } = levelPaths(level);
    const manifest = loadJson(manifestPath);
    let normalizedCount = 0;

    for (const spell of manifest.spells) {
      const catalogMembership = spell.catalog_memberships.find(
        (membership: ValidatedJson) => membership.spell_list_id === catalogListId,
      );
      if (!catalogMembership) continue;

      const canonicalPath = path.join(
        projectRoot,
        "data",
        "canonical",
        `${spell.spell_id.replace(/^spell\./, "")}.json`,
      );
      if (!fs.existsSync(canonicalPath)) continue;
      const canonical = loadJson(canonicalPath);
      const exact = canonical.levels.find(
        (entry: ValidatedJson) => entry.spell_list_id === catalogListId,
      );
      if (exact) {
        if (exact.level !== catalogMembership.level) {
          throw new Error(
            `${spell.spell_id} has Red Mantis Assassin level ${exact.level}, ` +
              `but the catalog records level ${catalogMembership.level}.`,
          );
        }
        continue;
      }

      const compact = canonical.levels.find(
        (entry: ValidatedJson) => entry.spell_list_id === compactListId,
      );
      if (!compact || compact.level !== catalogMembership.level) {
        throw new Error(
          `${spell.spell_id} lacks matching spell-page evidence for the Red Mantis ` +
            `Assassin level ${catalogMembership.level}; refusing to infer a level.`,
        );
      }

      compact.spell_list_id = catalogListId;
      compact.list_name = "red mantis assassin";
      const canonicalRelationship = canonical.relationships.find(
        (relationship: ValidatedJson) =>
          relationship.type === "appears_on_spell_list" &&
          relationship.target?.entity_id === compactListId,
      );
      if (!canonicalRelationship) {
        throw new Error(
          `${spell.spell_id} lacks its compact Red Mantis Assassin relationship.`,
        );
      }
      canonicalRelationship.relationship_id =
        `${spell.spell_id}:appears_on_spell_list:${catalogListId}`;
      canonicalRelationship.target.entity_id = catalogListId;
      canonicalRelationship.target.name = "red mantis assassin Spell List";
      writeGeneratedJson(canonicalPath, canonical, true);

      const decisionPath = path.join(
        projectRoot,
        "data",
        "decisions",
        `${spell.spell_id.replace(/^spell\./, "")}.json`,
      );
      const decision = loadJson(decisionPath);
      const relationshipDecision = decision.relationship_decisions.find(
        (entry: ValidatedJson) =>
          entry.relationship_id ===
            `${spell.spell_id}:appears_on_spell_list:${compactListId}`,
      );
      if (!relationshipDecision) {
        throw new Error(
          `${spell.spell_id} lacks its compact Red Mantis Assassin decision.`,
        );
      }
      relationshipDecision.relationship_id =
        `${spell.spell_id}:appears_on_spell_list:${catalogListId}`;
      writeGeneratedJson(decisionPath, decision, true);
      normalizedCount += 1;
    }
    summary.normalized += normalizedCount;
    summary.levels.push({ level, normalized: normalizedCount });
  }

  for (const registryPath of directJsonFiles(path.join(projectRoot, "data", "entities"))) {
    const registry = loadJson(registryPath);
    const compact = registry.entities.find(
      (entity: ValidatedJson) => entity.entity_id === compactListId,
    );
    if (!compact) continue;
    const normalized = registry.entities.find(
      (entity: ValidatedJson) => entity.entity_id === catalogListId,
    );
    if (!normalized) {
      throw new Error(`${registryPath} lacks the normalized Red Mantis Assassin entity.`);
    }
    for (const evidence of compact.evidence) {
      if (!normalized.evidence.some(
        (item: ValidatedJson) => JSON.stringify(item) === JSON.stringify(evidence),
      )) {
        normalized.evidence.push(evidence);
      }
    }
    normalized.evidence.sort((left: ValidatedJson, right: ValidatedJson) =>
      String(left.observation_id).localeCompare(String(right.observation_id)) ||
      String(left.anchor_text_raw).localeCompare(String(right.anchor_text_raw))
    );
    registry.entities = registry.entities.filter(
      (entity: ValidatedJson) => entity.entity_id !== compactListId,
    );
    writeGeneratedJson(registryPath, registry, true);
  }

  validatePackage();
  return summary;
}


export async function reconcileSahirAfiyunOwnership() {
  const legacySpellListId = "spell-list.sahirafiyun";
  const spellListId = "spell-list.sahir-afiyun";
  const summary = { spellListId, reclassified: 0, registriesUpdated: 0 };

  for (const canonicalPath of directJsonFiles(path.join(projectRoot, "data", "canonical"))) {
    const canonical = loadJson(canonicalPath);
    const level = canonical.levels.find(
      (entry: ValidatedJson) =>
        entry.spell_list_id === legacySpellListId || entry.spell_list_id === spellListId,
    );
    if (!level) continue;

    if (level.list_kind !== "class" && level.list_kind !== "feat") {
      throw new Error(
        `${canonical.spell_id} has unexpected Sahir-Afiyun list kind ${level.list_kind}.`,
      );
    }
    level.spell_list_id = spellListId;
    level.list_kind = "feat";
    level.list_name = "Sahir-Afiyun";

    const relationship = canonical.relationships.find(
      (entry: ValidatedJson) =>
        entry.type === "appears_on_spell_list" &&
        (entry.target?.entity_id === legacySpellListId ||
          entry.target?.entity_id === spellListId),
    );
    if (!relationship) {
      throw new Error(`${canonical.spell_id} lacks its Sahir-Afiyun list relationship.`);
    }
    relationship.relationship_id =
      `${canonical.spell_id}:appears_on_spell_list:${spellListId}`;
    relationship.target.entity_id = spellListId;
    relationship.target.name = "Sahir-Afiyun spell choices";
    relationship.note =
      "AoN prints this level under Sahirafiyun. The Sahir-Afiyun feat grants " +
      "selectable access to the spell; this is not a class spell-list membership.";
    writeGeneratedJson(canonicalPath, canonical, true);

    const decisionPath = path.join(
      projectRoot,
      "data",
      "decisions",
      `${canonical.spell_id.replace(/^spell\./, "")}.json`,
    );
    const decision = loadJson(decisionPath);
    const relationshipDecision = decision.relationship_decisions.find(
      (entry: ValidatedJson) =>
        entry.relationship_id ===
          `${canonical.spell_id}:appears_on_spell_list:${legacySpellListId}` ||
        entry.relationship_id ===
          `${canonical.spell_id}:appears_on_spell_list:${spellListId}`,
    );
    if (!relationshipDecision) {
      throw new Error(`${canonical.spell_id} lacks its Sahir-Afiyun relationship decision.`);
    }
    relationshipDecision.relationship_id =
      `${canonical.spell_id}:appears_on_spell_list:${spellListId}`;
    relationshipDecision.rationale =
      "AoN prints the named level. Sahir-Afiyun is a feat-owned selectable spell set, " +
      "not a class, so the level remains canonical with list kind feat.";
    writeGeneratedJson(decisionPath, decision, true);
    summary.reclassified += 1;
  }

  for (const registryPath of directJsonFiles(path.join(projectRoot, "data", "entities"))) {
    const registry = loadJson(registryPath);
    const entity = registry.entities.find(
      (entry: ValidatedJson) =>
        entry.entity_id === legacySpellListId || entry.entity_id === spellListId,
    );
    if (!entity) continue;
    entity.entity_id = spellListId;
    entity.name = "Sahir-Afiyun spell choices";
    const note = "This level-bearing list is owned by the Sahir-Afiyun feat, not a class.";
    if (!entity.notes.includes(note)) entity.notes.push(note);
    writeGeneratedJson(registryPath, registry, true);
    summary.registriesUpdated += 1;
  }

  if (summary.reclassified !== 17) {
    throw new Error(`Expected 17 Sahir-Afiyun spells, reclassified ${summary.reclassified}.`);
  }
  if (summary.registriesUpdated !== 1) {
    throw new Error(
      `Expected one Sahir-Afiyun spell-list registry, updated ${summary.registriesUpdated}.`,
    );
  }
  validatePackage();
  return summary;
}


export async function ingestDiscoveredDependencies() {
  let availableCanonicalSpells = new Map(
    directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
      const record = loadJson(filename);
      return [record.spell_id, record] as const;
    }),
  );

  const manifests = Array.from({ length: 10 }, (_, level) => {
    const paths = levelPaths(level);
    return { level, paths, manifest: loadJson(paths.manifestPath) };
  });
  const requestedIds = new Set<string>();
  for (const { manifest } of manifests) {
    for (const dependency of manifest.discovered_dependencies ?? []) {
      if (dependency.status !== "pending") continue;
      const canonical = resolveCanonicalSpellReference(
        dependency.name,
        availableCanonicalSpells,
        dependency.spell_id,
      );
      if (canonical) continue;
      const unresolved = normalizeUnresolvedSpellReference(dependency.name);
      requestedIds.add(unresolved?.spellId ?? dependency.spell_id);
    }
  }

  const catalogCandidates = new Map<string, Array<{ level: number; spell: ValidatedJson }>>();
  for (const { level, manifest } of manifests) {
    for (const spell of manifest.spells) {
      const candidates = catalogCandidates.get(spell.spell_id) ?? [];
      candidates.push({ level, spell });
      catalogCandidates.set(spell.spell_id, candidates);
    }
  }

  const report = {
    ingested: [] as string[],
    reconciled: [] as string[],
    issues: [] as string[],
    skipped: [] as string[],
    pending: [] as string[],
  };
  for (const spellId of [...requestedIds].sort()) {
    if (availableCanonicalSpells.has(spellId)) {
      report.skipped.push(spellId);
      continue;
    }
    const candidates = catalogCandidates.get(spellId) ?? [];
    const candidate = candidates.find(({ level }) => {
      const { artifactScope } = levelPaths(level);
      const rawDirectory = path.join(projectRoot, "data", "raw", artifactScope, spellId.replace(/^spell\./, ""));
      return fs.existsSync(path.join(rawDirectory, "aon.html")) &&
        fs.existsSync(path.join(rawDirectory, "aon.html.meta.json"));
    });
    if (!candidate) {
      report.pending.push(spellId);
      continue;
    }
    const batchReport = await ingestSpellLevelBatch(
      candidate.level,
      Number(candidate.spell.batch),
      false,
      false,
      false,
      true,
      undefined,
      new Set([spellId]),
      true,
    );
    report.ingested.push(...batchReport.ingested);
    report.issues.push(...batchReport.issues);
    report.skipped.push(...batchReport.skipped);
  }

  availableCanonicalSpells = new Map(
    directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
      const record = loadJson(filename);
      return [record.spell_id, record] as const;
    }),
  );
  const ingestedDependencyIds = new Set(
    [...requestedIds].filter((spellId) => availableCanonicalSpells.has(spellId)),
  );
  const reconciliationGroups = new Map<string, { level: number; batch: number; spellIds: Set<string> }>();
  for (const record of availableCanonicalSpells.values()) {
    if (!(record.rules_inheritance ?? []).some((rule: ValidatedJson) =>
      rule.resolution_status === "missing_parent" || rule.resolution_status === "pending"
    )) {
      continue;
    }
    const candidates = catalogCandidates.get(record.spell_id) ?? [];
    const candidate = candidates.find(({ level }) => {
      const { artifactScope } = levelPaths(level);
      const rawDirectory = path.join(projectRoot, "data", "raw", artifactScope, record.spell_id.replace(/^spell\./, ""));
      return fs.existsSync(path.join(rawDirectory, "aon.html")) &&
        fs.existsSync(path.join(rawDirectory, "aon.html.meta.json"));
    });
    if (!candidate) continue;
    const batch = Number(candidate.spell.batch);
    const key = `${candidate.level}:${batch}`;
    const group = reconciliationGroups.get(key) ?? { level: candidate.level, batch, spellIds: new Set<string>() };
    group.spellIds.add(record.spell_id);
    reconciliationGroups.set(key, group);
  }
  for (const group of [...reconciliationGroups.values()].sort((left, right) =>
    left.level - right.level || left.batch - right.batch
  )) {
    const batchReport = await ingestSpellLevelBatch(
      group.level,
      group.batch,
      false,
      false,
      false,
      true,
      undefined,
      group.spellIds,
      true,
    );
    report.reconciled.push(...batchReport.ingested);
    report.issues.push(...batchReport.issues);
  }

  availableCanonicalSpells = new Map(
    directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
      const record = loadJson(filename);
      return [record.spell_id, record] as const;
    }),
  );
  report.pending = [];
  for (const { paths } of manifests) {
    const manifest = loadJson(paths.manifestPath);
    for (const spell of manifest.spells) {
      if (ingestedDependencyIds.has(spell.spell_id)) delete spell.issue;
    }
    refreshDiscoveredDependencies(manifest, availableCanonicalSpells);
    writeGeneratedJson(paths.manifestPath, manifest, true);
    for (const dependency of manifest.discovered_dependencies ?? []) {
      if (dependency.status === "pending" && !report.pending.includes(dependency.spell_id)) {
        report.pending.push(dependency.spell_id);
      }
    }
  }
  report.pending.sort();
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
const run = command === "retry-d20"
  ? retryD20SourceFailures(process.argv[3] === undefined || process.argv[3] === "all" ? undefined : level)
  : command === "retry-normalization"
  ? retrySpellLevelNormalizationIssues(process.argv[3] === undefined || process.argv[3] === "all" ? undefined : level)
  : command === "retry-source-issues"
  ? retryCachedSourceIssues(process.argv[3] === undefined || process.argv[3] === "all" ? undefined : level)
  : command === "retry-reviewed-overrides"
  ? retryReviewedCanonicalOverrides()
  : command === "legacy-3.5"
  ? ingestLegacy35ScopeEntries()
  : command === "reconcile-red-mantis"
  ? reconcileRedMantisCatalogMemberships()
  : command === "reconcile-sahir-afiyun"
  ? reconcileSahirAfiyunOwnership()
  : command === "all-spells-completeness"
  ? ingestAllSpellsCompletenessIdentities()
  : command === "dependencies"
  ? ingestDiscoveredDependencies()
  : command === "rollout-inheritance"
  ? rolloutSpellInheritance()
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
