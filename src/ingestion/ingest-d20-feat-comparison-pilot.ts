import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import { parseRichTextHtml, richTextLeafText, type RichTextDocument } from "../domain/rich-text.js";
import { artifactHash, readCapturedArtifact, writeCapturedArtifact } from "./artifact-store.js";


export const parser = { name: "d20pfsrd-feat-comparison-adapter", version: "0.1.2" };
const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
let lastRequestAt = 0;
const labels = new Set(["Prerequisite", "Prerequisites", "Benefit", "Normal", "Special", "Goal", "Completion Benefit"]);

export type CaptureMetadata = {
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
};

type ComparisonFeat = {
  entityId: string;
  name: string;
  url: string;
};

// These URLs were manually reviewed against the AoN observations; a title match alone is not identity evidence.
export const comparisonFeats: ComparisonFeat[] = [
  { entityId: "feat.channel-smite", name: "Channel Smite", url: "https://www.d20pfsrd.com/feats/combat-feats/channel-smite-combat/" },
  { entityId: "feat.outflank", name: "Outflank", url: "https://www.d20pfsrd.com/feats/combat-feats/outflank-combat-teamwork/" },
  { entityId: "feat.blinding-critical", name: "Blinding Critical", url: "https://www.d20pfsrd.com/feats/combat-feats/blinding-critical-combat-critical/" },
];

export type ParsedD20Feat = {
  name: string;
  featTypes: string[];
  summary: string | null;
  prerequisites: string | null;
  publications: Array<{ text_raw: string; href_raw: string | null; href_resolved: string | null }>;
  sections: Array<{ heading_raw: string; body_raw: string }>;
  document: RichTextDocument;
  links: Array<{
    anchor_text_raw: string;
    href_raw: string;
    href_resolved: string;
    source_field: string;
    context_raw: string;
    role_hint: "publication" | "prerequisite" | "cross_reference";
    target_entity_type_hint: "publication" | "feat" | "unknown";
    target_entity_id_hint: null;
  }>;
  copyrightNotice: string | null;
  excluded: string[];
  definitionRaw: string;
};

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function resolvedUrl(href: string, sourceUrl: string): string {
  return new URL(href.trim().replace(/[\r\n\t]+/g, ""), sourceUrl).href;
}

function rawPath(feat: ComparisonFeat): string {
  return path.join(projectRoot, "data", "raw", "feats", "comparison-pilot", feat.entityId.slice(5), "d20pfsrd.html");
}

function writeJson(filename: string, value: { parser: { parsed_at: string }; [key: string]: unknown }): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.existsSync(filename)) value.parser.parsed_at = JSON.parse(fs.readFileSync(filename, "utf8")).parser.parsed_at;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === serialized) return;
  if (fs.existsSync(filename)) throw new Error(`Observation differs at ${filename}; use a new parser version`);
  value.parser.parsed_at = new Date().toISOString();
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function featSectionKey(heading: string): string {
  return heading.replace(/^Prerequisite(?:s|\(s\))?$/, "Prerequisites").replace(/^Benefit\(s\)$/, "Benefit");
}

export function parseD20Feat(html: string, sourceUrl: string, expectedName: string): ParsedD20Feat {
  const $ = cheerio.load(html);
  const content = $("#article-content").first();
  if (!content.length) throw new Error("d20PFSRD feat content was not found");
  const title = cleanText(content.children("h1").first().text());
  const comparableName = (value: string) => value.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").toLowerCase();
  if (!comparableName(title).startsWith(comparableName(expectedName))) throw new Error(`Expected ${expectedName}, found ${title || "no feat heading"}`);
  const typeSuffix = title.slice(expectedName.length).trim();
  if (typeSuffix && !/^\([^()]+\)$/.test(typeSuffix)) throw new Error(`Unrecognized feat type suffix for ${expectedName}: ${typeSuffix}`);
  const featTypes = typeSuffix ? typeSuffix.slice(1, -1).split(",").map(cleanText).filter(Boolean) : [];

  const excluded = content.find(".ed-note-outer, .section15").toArray().map((node) => {
    const heading = cleanText($(node).find(".ed-note-header, div").first().text());
    return heading || "Unclassified supplemental content";
  });
  const base = content.clone();
  base.find("h1, script, .breadcrumbs, .ed-note-outer, .section15").remove();
  const blocks = base.find("p, table, ul, ol").filter((_index, node) => !$(node).parents("p, table, ul, ol").length).toArray();
  const sections: ParsedD20Feat["sections"] = [];
  for (const block of blocks) {
    const label = cleanText($(block).children("b, strong").first().text()).replace(/:$/, "");
    const text = cleanText($(block).text());
    if (labels.has(featSectionKey(label))) {
      sections.push({ heading_raw: label, body_raw: text.slice(label.length).replace(/^:?\s*/, "") });
    } else if (sections.length && text) {
      sections[sections.length - 1]!.body_raw += "\n" + text;
    }
  }
  if (!sections.some((section) => featSectionKey(section.heading_raw) === "Benefit" && section.body_raw)) {
    throw new Error("d20PFSRD feat benefit section was not found");
  }
  const prerequisites = sections.find((section) => featSectionKey(section.heading_raw) === "Prerequisites")?.body_raw ?? null;
  const summary = cleanText($(blocks.find((block) => $(block).hasClass("description"))).text()) || null;
  const links: ParsedD20Feat["links"] = [];
  let sectionLabel = "";
  for (const paragraph of blocks) {
    const text = cleanText($(paragraph).text());
    const label = cleanText($(paragraph).children("b, strong").first().text()).replace(/:$/, "");
    if (labels.has(featSectionKey(label))) sectionLabel = featSectionKey(label);
    for (const anchor of $(paragraph).find("a").toArray()) {
      const anchorText = cleanText($(anchor).text());
      const hrefRaw = $(anchor).attr("href");
      if (!anchorText || !hrefRaw) continue;
      const hrefResolved = resolvedUrl(hrefRaw, sourceUrl);
      links.push({
        anchor_text_raw: anchorText,
        href_raw: hrefRaw,
        href_resolved: hrefResolved,
        source_field: sectionLabel === "Prerequisites" ? "/entity_raw/prerequisites_raw" : "/entity_raw/sections_raw",
        context_raw: text,
        role_hint: sectionLabel === "Prerequisites" ? "prerequisite" : "cross_reference",
        target_entity_type_hint: hrefResolved.includes("/feats/") ? "feat" : "unknown",
        target_entity_id_hint: null,
      });
    }
  }
  const document = parseRichTextHtml(base.html() ?? "");
  const definitionRaw = richTextLeafText(document);
  if (!definitionRaw) throw new Error(`No base feat definition was parsed for ${expectedName}`);
  const publications = content.children(".section15").find("a").toArray().flatMap((anchor) => {
    const text_raw = cleanText($(anchor).text());
    const href_raw = $(anchor).attr("href") ?? null;
    return text_raw ? [{ text_raw, href_raw, href_resolved: href_raw ? resolvedUrl(href_raw, sourceUrl) : null }] : [];
  });
  for (const publication of publications) {
    if (!publication.href_raw || !publication.href_resolved) continue;
    links.push({
      anchor_text_raw: publication.text_raw,
      href_raw: publication.href_raw,
      href_resolved: publication.href_resolved,
      source_field: "/entity_raw/publications_raw",
      context_raw: cleanText(content.children(".section15").text()),
      role_hint: "publication",
      target_entity_type_hint: "publication",
      target_entity_id_hint: null,
    });
  }
  return {
    name: expectedName,
    featTypes,
    summary,
    prerequisites,
    publications,
    sections,
    document,
    links,
    copyrightNotice: cleanText(content.children(".section15").text()) || null,
    excluded,
    definitionRaw,
  };
}

async function fetchD20(url: string): Promise<{ response: Response; body: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const delay = Math.max(1000 - (Date.now() - lastRequestAt), attempt ? 2000 * attempt : 0);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    let response: Response;
    let body: string;
    try {
      response = await fetch(url, { headers: { accept: "text/html,application/xhtml+xml,text/plain", "user-agent": userAgent }, redirect: "follow", signal: AbortSignal.timeout(45_000) });
      body = await response.text();
    } catch (error) {
      lastRequestAt = Date.now();
      if (attempt === 2) throw new Error(`Retrieving ${url} failed after 3 attempts`, { cause: error });
      console.warn(`Retrying ${url} after network failure (attempt ${attempt + 2}/3).`);
      continue;
    }
    lastRequestAt = Date.now();
    if ([408, 429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      console.warn(`Retrying ${url} after HTTP ${response.status} (attempt ${attempt + 2}/3).`);
      continue;
    }
    return { response, body };
  }
  throw new Error(`Retrieving ${url} failed after 3 attempts`);
}

export async function assertD20AllowsFeatCapture(): Promise<void> {
  const { response, body } = await fetchD20("https://www.d20pfsrd.com/robots.txt");
  if (!response.ok) throw new Error(`Cannot verify d20PFSRD robots policy: HTTP ${response.status}`);
  if (/^\s*disallow\s*:\s*\/feats\//im.test(body)) throw new Error("d20PFSRD robots.txt disallows feat capture");
}

export async function fetchFeat(feat: ComparisonFeat, filename = rawPath(feat), allowMissing = false): Promise<{ body: string; metadata: CaptureMetadata }> {
  const cached = readCapturedArtifact<CaptureMetadata>(filename);
  if (cached) return cached;
  const { response, body } = await fetchD20(feat.url);
  if (!response.ok && !(allowMissing && [404, 410].includes(response.status))) throw new Error(`HTTP ${response.status} while retrieving ${feat.url}`);
  const metadata = { url: response.url, retrieved_at: new Date().toISOString(), http_status: response.status, content_sha256: artifactHash(body), response_content_type: response.headers.get("content-type") };
  writeCapturedArtifact(filename, body, metadata);
  return { body, metadata };
}

export function observation(feat: ComparisonFeat, capture: { body: string; metadata: CaptureMetadata }, identity = "reviewed", filename = rawPath(feat)): void {
  const parsed = parseD20Feat(capture.body, capture.metadata.url, feat.name);
  const directory = path.join(projectRoot, "data", "observations", "feats", feat.entityId.slice(5));
  writeJson(path.join(directory, `d20pfsrd-${parser.version}.json`), {
    $schema: "../../../../schemas/source-entity-observation.schema.json",
    schema_version: "0.1.0",
    observation_id: `d20pfsrd:${feat.entityId}:${capture.metadata.content_sha256.slice(0, 8)}${artifactHash(parser.name + ":" + parser.version).slice(0, 8)}`,
    entity_type: "feat",
    source: { site_id: "d20pfsrd", url: capture.metadata.url, license_url: null, declared_publisher: null, first_party_status: "unknown" },
    retrieval: { retrieved_at: capture.metadata.retrieved_at, http_status: capture.metadata.http_status, content_sha256: capture.metadata.content_sha256, raw_artifact_path: path.relative(directory, filename).replaceAll("\\", "/"), response_content_type: capture.metadata.response_content_type },
    parser: { ...parser, parsed_at: new Date().toISOString() },
    page: { title_raw: cleanText(cheerio.load(capture.body)("title").text()) || parsed.name, breadcrumbs_raw: [], license_notice_raw: null, source_notice_raw: parsed.copyrightNotice },
    entity_raw: {
      name_raw: parsed.name,
      definition_type_raw: parsed.featTypes.join(", ") || null,
      source_book_raw: parsed.publications.map((publication) => publication.text_raw).join("; ") || null,
      definition_raw: parsed.definitionRaw,
      links_raw: parsed.links,
      sections_raw: parsed.sections,
      document_raw: parsed.document,
      feat_types_raw: parsed.featTypes,
      source_tags_raw: parsed.featTypes,
      prerequisites_raw: parsed.prerequisites,
      summary_raw: parsed.summary,
      publications_raw: parsed.publications,
      pfs_marker_raw: null,
      catalog_memberships_raw: [identity === "reviewed" ? "d20pfsrd-reviewed-comparison-pilot" : "d20pfsrd-feat-catalog-comparison"],
      supplements_raw: parsed.excluded.map((heading_raw) => ({ heading_raw, kind_hint: "unknown" as const })),
      source_record_key_raw: feat.url,
    },
    warnings: [
      { code: identity === "reviewed" ? "COMPARISON_IDENTITY_REVIEWED" : identity === "matching_sections" ? "COMPARISON_SECTIONS_MATCH" : "COMPARISON_PUBLICATION_MATCH", severity: "info", field: null, message: identity === "reviewed" ? `Reviewed d20PFSRD URL is compared with ${feat.entityId}; the match is not inferred from the displayed name.` : identity === "matching_sections" ? `All parsed rule sections match AoN for ${feat.entityId}; source-specific text and tags remain separate.` : `Unique feat name and publication match AoN for ${feat.entityId}; rule differences remain source-attributed.` },
      ...parsed.excluded.map((heading) => ({ code: "SUPPLEMENT_EXCLUDED", severity: "info", field: "/entity_raw/supplements_raw", message: `${heading} remains in the immutable source artifact and is excluded from the base feat observation.` })),
    ],
  });
}

export async function ingestD20FeatComparisonPilot(offline = false): Promise<void> {
  if (comparisonFeats.some((feat) => !readCapturedArtifact(rawPath(feat)))) {
    if (offline) throw new Error("d20PFSRD feat comparison capture is missing; offline replay cannot continue");
    await assertD20AllowsFeatCapture();
  }
  for (const feat of comparisonFeats) observation(feat, await fetchFeat(feat));
  console.log(`Parsed ${comparisonFeats.length} d20PFSRD feat comparison pages.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  await ingestD20FeatComparisonPilot(process.argv.includes("--offline"));
}
