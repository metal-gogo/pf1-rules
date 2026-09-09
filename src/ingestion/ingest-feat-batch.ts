import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import { artifactHash, readCapturedArtifact, writeCapturedArtifact } from "./artifact-store.js";
import { parseAonFeat, type ParsedFeat } from "./ingest-feat-pilot.js";


const catalogUrl = "https://www.aonprd.com/Feats.aspx";
const parser = { name: "aon-feat-batch-adapter", version: "0.1.0" };
const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
let lastRequestAt = 0;

type CaptureMetadata = {
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
};

type CatalogFeat = { entityId: string; name: string; sourceRecordKey: string };

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function slug(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US").replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function catalogPath(): string {
  return path.join(projectRoot, "data", "raw", "catalogs", "feats", "aon-all.html");
}

function rawPath(feat: CatalogFeat): string {
  return path.join(projectRoot, "data", "raw", "feats", "batch", feat.entityId.slice(5), "aon.html");
}

function observationPath(feat: CatalogFeat): string {
  return path.join(projectRoot, "data", "observations", "feats", feat.entityId.slice(5), `aon-batch-${parser.version}.json`);
}

function writeJson(filename: string, value: { parser?: { parsed_at: string }; [key: string]: unknown }): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.existsSync(filename) && value.parser) value.parser.parsed_at = JSON.parse(fs.readFileSync(filename, "utf8")).parser.parsed_at;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === serialized) return;
  if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite differing generated file ${filename}`);
  if (value.parser) value.parser.parsed_at = new Date().toISOString();
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function assertAonAllowsFeatCapture(): Promise<void> {
  const response = await fetch("https://www.aonprd.com/robots.txt", {
    headers: { accept: "text/plain", "user-agent": userAgent }, signal: AbortSignal.timeout(45_000),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Cannot verify AoN robots policy: HTTP ${response.status}`);
  if (/^\s*disallow\s*:\s*\/(?:\s*$|Feats\.aspx|FeatDisplay\.aspx)/im.test(await response.text())) {
    throw new Error("AoN robots.txt disallows feat capture");
  }
}

async function capture(url: string, filename: string): Promise<{ body: string; metadata: CaptureMetadata }> {
  const cached = readCapturedArtifact<CaptureMetadata>(filename);
  if (cached) return cached;
  const remaining = 1_000 - (Date.now() - lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": userAgent }, redirect: "follow", signal: AbortSignal.timeout(45_000),
  });
  lastRequestAt = Date.now();
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} while retrieving ${url}`);
  const metadata = { url: response.url, retrieved_at: new Date().toISOString(), http_status: response.status, content_sha256: artifactHash(body), response_content_type: response.headers.get("content-type") };
  writeCapturedArtifact(filename, body, metadata);
  return { body, metadata };
}

export function parseAonFeatCatalog(html: string, sourceUrl = catalogUrl): CatalogFeat[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const feats = $("#MainContent_GridView6 tr").toArray().flatMap((row) => {
    const anchor = $(row).find('td:first-child a[href*="FeatDisplay.aspx?ItemName="]').first();
    const href = anchor.attr("href");
    if (!href) return [];
    const sourceRecordKey = new URL(href, sourceUrl).searchParams.get("ItemName");
    if (!sourceRecordKey) throw new Error(`Feat catalog entry has no ItemName: ${href}`);
    const name = cleanText(anchor.text()).replace(/\*+$/, "");
    if (!name) throw new Error(`Feat catalog entry has no displayed name: ${href}`);
    const entityId = `feat.${slug(sourceRecordKey)}`;
    if (seen.has(entityId)) throw new Error(`Ambiguous catalog identity ${entityId}; add a reviewed source-qualified queue entry instead.`);
    seen.add(entityId);
    return [{ entityId, name: sourceRecordKey, sourceRecordKey }];
  });
  if (!feats.length) throw new Error("AoN feat catalog entries were not found");
  return feats;
}

function countFromArguments(arguments_: string[], available: number): number {
  const value = arguments_.find((argument) => argument.startsWith("--count="));
  if (!value) throw new Error("Use --count=N to select catalog feats.");
  const count = Number(value.slice("--count=".length));
  if (!Number.isInteger(count) || count < 1 || count > available) throw new Error(`Feat count must be an integer from 1 through ${available}.`);
  return count;
}

function registeredEntityIds(): Set<string> {
  const directory = path.join(projectRoot, "data", "entities");
  return new Set(fs.readdirSync(directory).filter((name) => name.endsWith(".json")).flatMap((name) => {
    const record = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")) as { entities: Array<{ entity_id: string }> };
    return record.entities.map((entity) => entity.entity_id);
  }));
}

function writeRegistry(feats: CatalogFeat[]): void {
  const filename = path.join(projectRoot, "data", "entities", "feat-batch-entities.json");
  const existing = fs.existsSync(filename)
    ? JSON.parse(fs.readFileSync(filename, "utf8")) as { entities: Array<{ entity_id: string; entity_type: string; name: string; status: string; aliases: string[]; evidence: unknown[]; notes: string[] }> }
    : { entities: [] };
  const registered = registeredEntityIds();
  const additions = [...new Map(feats.map((feat) => [feat.entityId, feat])).values()].filter((feat) => !registered.has(feat.entityId)).map((feat) => ({
    entity_id: feat.entityId, entity_type: "feat", name: feat.name, status: "stub", aliases: [], evidence: [], notes: ["Captured from the AoN all-feats catalog; canonicalization remains pending."],
  }));
  const entities = [...existing.entities, ...additions].sort((left, right) => left.entity_id.localeCompare(right.entity_id));
  const record = { $schema: "../../schemas/entity-registry.schema.json", schema_version: "0.1.0", registry_id: "feat-batch-entities", entities };
  if (!fs.existsSync(filename)) return writeJson(filename, record);
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  if (fs.readFileSync(filename, "utf8") !== serialized) fs.writeFileSync(filename, serialized, "utf8");
}

export function resolveCatalogFeatLinks(parsed: ParsedFeat, catalogBySourceKey: ReadonlyMap<string, CatalogFeat>): ParsedFeat["links"] {
  return parsed.links.map((link) => {
    if (link.target_entity_type_hint !== "feat") return link;
    const sourceRecordKey = new URL(link.href_resolved).searchParams.get("ItemName");
    const target = sourceRecordKey ? catalogBySourceKey.get(sourceRecordKey) : undefined;
    return target ? { ...link, target_entity_id_hint: target.entityId } : link;
  });
}

function writeObservation(feat: CatalogFeat, captureResult: { body: string; metadata: CaptureMetadata }, parsed: ParsedFeat, catalogBySourceKey: ReadonlyMap<string, CatalogFeat>): void {
  const directory = path.dirname(observationPath(feat));
  const sourceBookRaw = parsed.publications.map((publication) => publication.text_raw).join("; ") || null;
  const observationHash = artifactHash(`${captureResult.metadata.content_sha256}:${parser.name}:${parser.version}`);
  writeJson(observationPath(feat), {
    $schema: "../../../../schemas/source-entity-observation.schema.json", schema_version: "0.1.0",
    observation_id: `aon:${feat.entityId}:${observationHash.slice(0, 8)}`, entity_type: "feat",
    source: { site_id: "aon", url: captureResult.metadata.url, license_url: "https://www.aonprd.com/Licenses.aspx", declared_publisher: "Paizo", first_party_status: "confirmed" },
    retrieval: { retrieved_at: captureResult.metadata.retrieved_at, http_status: captureResult.metadata.http_status, content_sha256: captureResult.metadata.content_sha256, raw_artifact_path: path.relative(directory, rawPath(feat)).replaceAll("\\", "/"), response_content_type: captureResult.metadata.response_content_type },
    parser: { ...parser, parsed_at: new Date().toISOString() },
    page: { title_raw: cleanText(cheerio.load(captureResult.body)("title").text()) || parsed.name, breadcrumbs_raw: [], license_notice_raw: null, source_notice_raw: sourceBookRaw },
    entity_raw: { name_raw: parsed.name, definition_type_raw: parsed.featTypes.join(", ") || null, source_book_raw: sourceBookRaw, definition_raw: parsed.definitionRaw, links_raw: resolveCatalogFeatLinks(parsed, catalogBySourceKey), sections_raw: parsed.sections, document_raw: parsed.document, feat_types_raw: parsed.featTypes, source_tags_raw: [], prerequisites_raw: parsed.prerequisites, summary_raw: parsed.summary, publications_raw: parsed.publications, pfs_marker_raw: parsed.pfsMarker, catalog_memberships_raw: ["aon-all-feats"], supplements_raw: parsed.supplements, source_record_key_raw: feat.sourceRecordKey },
    warnings: parsed.supplements.map((supplement) => ({ code: "SUPPLEMENT_EXCLUDED", severity: "info", field: "/entity_raw/supplements_raw", message: `${supplement.heading_raw} remains in the immutable source artifact and is excluded from the base feat observation.` })),
  });
}

export async function ingestAonFeatBatch(count: number, offline = false): Promise<void> {
  if (!readCapturedArtifact(catalogPath()) && offline) throw new Error("AoN feat catalog capture is missing; offline replay cannot continue");
  if (!readCapturedArtifact(catalogPath())) await assertAonAllowsFeatCapture();
  const catalog = parseAonFeatCatalog((await capture(catalogUrl, catalogPath())).body);
  if (!Number.isInteger(count) || count < 1 || count > catalog.length) {
    throw new Error(`Feat count must be an integer from 1 through ${catalog.length}.`);
  }
  const selected = catalog.slice(0, count);
  if (selected.some((feat) => !readCapturedArtifact(rawPath(feat))) && offline) throw new Error("Requested feat capture is missing; offline replay cannot continue");
  if (selected.some((feat) => !readCapturedArtifact(rawPath(feat)))) await assertAonAllowsFeatCapture();
  const catalogBySourceKey = new Map(catalog.map((feat) => [feat.sourceRecordKey, feat]));
  const catalogByEntityId = new Map(catalog.map((feat) => [feat.entityId, feat]));
  const captured = [] as Array<{ feat: CatalogFeat; result: { body: string; metadata: CaptureMetadata }; parsed: ParsedFeat }>;
  for (const feat of selected) {
    const url = new URL("https://www.aonprd.com/FeatDisplay.aspx");
    url.searchParams.set("ItemName", feat.sourceRecordKey);
    const result = await capture(url.href, rawPath(feat));
    captured.push({ feat, result, parsed: parseAonFeat(result.body, result.metadata.url, feat.name) });
  }
  const linkedFeats = captured.flatMap(({ parsed }) => resolveCatalogFeatLinks(parsed, catalogBySourceKey))
    .flatMap((link) => link.target_entity_id_hint ? [catalogByEntityId.get(link.target_entity_id_hint)] : [])
    .filter((feat): feat is CatalogFeat => feat !== undefined);
  writeRegistry([...selected, ...linkedFeats]);
  for (const { feat, result, parsed } of captured) writeObservation(feat, result, parsed, catalogBySourceKey);
  console.log(`Parsed ${selected.length} AoN all-feats catalog pages.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  const offline = process.argv.includes("--offline");
  const catalog = readCapturedArtifact<CaptureMetadata>(catalogPath());
  const available = catalog ? parseAonFeatCatalog(catalog.body).length : Number.MAX_SAFE_INTEGER;
  await ingestAonFeatBatch(countFromArguments(process.argv.slice(2), available), offline);
}
