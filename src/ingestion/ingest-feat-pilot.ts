import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import { parseRichTextHtml, richTextLeafText, type RichTextDocument } from "../domain/rich-text.js";
import { artifactHash, readCapturedArtifact, writeCapturedArtifact } from "./artifact-store.js";


const parser = { name: "aon-feat-adapter", version: "0.1.0" };
const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
const sourceBaseUrl = "https://www.aonprd.com/FeatDisplay.aspx";
const sectionLabels = new Set([
  "Source",
  "Prerequisites",
  "Benefit",
  "Normal",
  "Special",
  "Goal",
  "Completion Benefit",
]);
let lastRequestAt = 0;

type CaptureMetadata = {
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
};

export type PilotFeat = {
  entityId: string;
  name: string;
  sourceRecordKey: string;
};

export const pilotFeats: PilotFeat[] = [
  { entityId: "feat.channel-smite", name: "Channel Smite", sourceRecordKey: "Channel Smite" },
  { entityId: "feat.outflank", name: "Outflank", sourceRecordKey: "Outflank" },
  { entityId: "feat.blinding-critical", name: "Blinding Critical", sourceRecordKey: "Blinding Critical" },
  { entityId: "feat.jabbing-style", name: "Jabbing Style", sourceRecordKey: "Jabbing Style" },
  { entityId: "feat.craft-wondrous-item", name: "Craft Wondrous Item", sourceRecordKey: "Craft Wondrous Item" },
  { entityId: "feat.empower-spell", name: "Empower Spell", sourceRecordKey: "Empower Spell" },
  { entityId: "feat.accursed", name: "Accursed", sourceRecordKey: "Accursed" },
  { entityId: "feat.sahir-afiyun", name: "Sahir-Afiyun", sourceRecordKey: "Sahir-Afiyun" },
  { entityId: "feat.blazing-aura-arg", name: "Blazing Aura (ARG)", sourceRecordKey: "Blazing Aura (ARG)" },
  { entityId: "feat.blazing-aura-pa", name: "Blazing Aura (PA)", sourceRecordKey: "Blazing Aura (PA)" },
];

export type ParsedFeat = {
  name: string;
  featTypes: string[];
  summary: string | null;
  prerequisites: string | null;
  publications: Array<{ text_raw: string; href_raw: string | null; href_resolved: string | null }>;
  pfsMarker: { image_src_raw: string; title_raw: string | null } | null;
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
  supplements: Array<{ heading_raw: string; kind_hint: "combat_trick" | "mythic" | "unknown" }>;
  definitionRaw: string;
};

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function resolvedUrl(href: string, sourceUrl: string): string {
  return new URL(href.trim().replace(/[\r\n\t]+/g, ""), sourceUrl).href;
}

function featFragment(html: string): string {
  const fragment = cheerio.load(html)("#MainContent_DataListTypes_LabelName_0").html();
  if (!fragment) throw new Error("AoN feat content was not found");
  return fragment;
}

function nodeText($: cheerio.CheerioAPI, node: any): string {
  if (node.type === "text") return node.data ?? "";
  if (String(node.tagName ?? node.name).toLowerCase() === "br") return "\n";
  return $(node).text();
}

function nodesAfterLabel($: cheerio.CheerioAPI, label: any): any[] {
  const nodes: any[] = [];
  for (let node = label.next; node; node = node.next) {
    const tag = String(node.tagName ?? node.name ?? "").toLowerCase();
    if (tag === "b" && sectionLabels.has(cleanText($(node).text()))) break;
    nodes.push(node);
  }
  return nodes;
}

function fieldText($: cheerio.CheerioAPI, label: any): string {
  return cleanText(nodesAfterLabel($, label).map((node) => nodeText($, node)).join(""))
    .replace(/^:\s*/, "");
}

function summaryAfterSource($: cheerio.CheerioAPI, label: any): string | null {
  const parts: string[] = [];
  let started = false;
  for (const node of nodesAfterLabel($, label)) {
    const tag = String(node.tagName ?? node.name ?? "").toLowerCase();
    if (tag === "br") {
      if (started) break;
      started = true;
      continue;
    }
    if (started) parts.push(nodeText($, node));
  }
  return cleanText(parts.join("")) || null;
}

function supplementKind(heading: string): "combat_trick" | "mythic" | "unknown" {
  if (/combat trick/i.test(heading)) return "combat_trick";
  if (/^mythic\b/i.test(heading)) return "mythic";
  return "unknown";
}

export function parseAonFeat(html: string, sourceUrl: string, expectedName: string): ParsedFeat {
  const fragment = featFragment(html);
  const supplementStart = fragment.search(/<h2\b/i);
  const baseHtml = supplementStart < 0 ? fragment : fragment.slice(0, supplementStart);
  const supplementHtml = supplementStart < 0 ? "" : fragment.slice(supplementStart);
  const $ = cheerio.load(`<div id="feat-root">${baseHtml}</div>`, undefined, false);
  const root = $("#feat-root");
  const heading = root.children("h1").first();
  const title = cleanText(heading.text());
  if (!title.startsWith(expectedName)) {
    throw new Error(`Expected ${expectedName}, found ${title || "no feat heading"}`);
  }
  const typeSuffix = title.slice(expectedName.length).trim();
  if (typeSuffix && !/^\([^()]+\)$/.test(typeSuffix)) {
    throw new Error(`Unrecognized feat type suffix for ${expectedName}: ${typeSuffix}`);
  }
  const featTypes = typeSuffix
    ? typeSuffix.slice(1, -1).split(",").map(cleanText).filter(Boolean)
    : [];
  const pfsImage = heading.find("img[title]").first();
  const pfsMarker = pfsImage.length
    ? {
        image_src_raw: pfsImage.attr("src")!,
        title_raw: pfsImage.attr("title") ?? null,
      }
    : null;

  const labels = root.children("b").toArray().filter((label) => sectionLabels.has(cleanText($(label).text())));
  const labelByName = new Map(labels.map((label) => [cleanText($(label).text()), label]));
  const sourceLabel = labelByName.get("Source");
  if (!sourceLabel) throw new Error(`Source label was not found for ${expectedName}`);
  const sections = labels.flatMap((label) => {
    const headingRaw = cleanText($(label).text());
    if (headingRaw === "Source") return [];
    const bodyRaw = fieldText($, label);
    return bodyRaw ? [{ heading_raw: headingRaw, body_raw: bodyRaw }] : [];
  });
  const prerequisites = sections.find((section) => section.heading_raw === "Prerequisites")?.body_raw ?? null;
  const sourceNodes = nodesAfterLabel($, sourceLabel);
  const sourceEnd = sourceNodes.findIndex((node) => node.name === "br");
  if (sourceEnd >= 0) sourceNodes.splice(sourceEnd);
  const publications = sourceNodes.flatMap((node) => {
    const anchors = String(node.tagName ?? node.name ?? "").toLowerCase() === "a"
      ? [node]
      : $(node).find("a").toArray();
    return anchors.flatMap((anchor) => {
      const textRaw = cleanText($(anchor).text());
      const hrefRaw = $(anchor).attr("href") ?? null;
      return textRaw
        ? [{
            text_raw: textRaw,
            href_raw: hrefRaw,
            href_resolved: hrefRaw ? resolvedUrl(hrefRaw, sourceUrl) : null,
          }]
        : [];
    });
  });

  const sectionBodies = new Map(sections.map((section) => [section.heading_raw, section.body_raw]));
  const links: ParsedFeat["links"] = [];
  let activeLabel = "";
  for (const node of root.contents().toArray()) {
    const tag = String((node as any).tagName ?? (node as any).name ?? "").toLowerCase();
    if (tag === "b") activeLabel = cleanText($(node).text());
    if (tag === "br" && activeLabel === "Source") activeLabel = "Summary";
    const anchors = tag === "a" ? [node] : $(node).find("a").toArray();
    for (const anchor of anchors) {
      const anchorText = cleanText($(anchor).text());
      const hrefRaw = $(anchor).attr("href");
      if (!anchorText || !hrefRaw) continue;
      const hrefResolved = resolvedUrl(hrefRaw, sourceUrl);
      const isFeat = new URL(hrefResolved).pathname.toLowerCase().endsWith("/featdisplay.aspx");
      const isPublication = activeLabel === "Source";
      links.push({
        anchor_text_raw: anchorText,
        href_raw: hrefRaw,
        href_resolved: hrefResolved,
        source_field: isPublication
          ? "/entity_raw/publications_raw"
          : activeLabel === "Prerequisites"
            ? "/entity_raw/prerequisites_raw"
            : activeLabel === "Summary" ? "/entity_raw/summary_raw" : "/entity_raw/sections_raw",
        context_raw: sectionBodies.get(activeLabel) ?? anchorText,
        role_hint: isPublication
          ? "publication"
          : activeLabel === "Prerequisites"
            ? "prerequisite"
            : "cross_reference",
        target_entity_type_hint: isPublication ? "publication" : isFeat ? "feat" : "unknown",
        target_entity_id_hint: null,
      });
    }
  }

  const supplements$ = cheerio.load(`<div id="supplements">${supplementHtml}</div>`, undefined, false);
  const supplements = supplements$("#supplements h2").toArray().flatMap((element) => {
    const headingRaw = cleanText(supplements$(element).text());
    return headingRaw ? [{ heading_raw: headingRaw, kind_hint: supplementKind(headingRaw) }] : [];
  });
  heading.remove();
  const document = parseRichTextHtml(root.html() ?? "");
  const definitionRaw = richTextLeafText(document);
  if (!definitionRaw) throw new Error(`No base feat definition was parsed for ${expectedName}`);

  return {
    name: expectedName,
    featTypes,
    summary: summaryAfterSource($, sourceLabel),
    prerequisites,
    publications,
    pfsMarker,
    sections,
    document,
    links,
    supplements,
    definitionRaw,
  };
}

function writeJson(filename: string, value: { parser: { parsed_at: string }; [key: string]: unknown }): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.existsSync(filename)) {
    value.parser.parsed_at = JSON.parse(fs.readFileSync(filename, "utf8")).parser.parsed_at;
  }
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === serialized) return;
  if (fs.existsSync(filename)) throw new Error(`Observation differs at ${filename}; use a new parser version`);
  value.parser.parsed_at = new Date().toISOString();
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceUrl(feat: PilotFeat): string {
  const url = new URL(sourceBaseUrl);
  url.searchParams.set("ItemName", feat.sourceRecordKey);
  return url.href;
}

function rawPath(feat: PilotFeat): string {
  return path.join(projectRoot, "data", "raw", "feats", "pilot", feat.entityId.slice(5), "aon.html");
}

async function assertAonAllowsFeatCapture(): Promise<void> {
  const response = await fetch("https://www.aonprd.com/robots.txt", {
    headers: { accept: "text/plain", "user-agent": userAgent },
    signal: AbortSignal.timeout(45_000),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Cannot verify AoN robots policy: HTTP ${response.status}`);
  const body = await response.text();
  if (/^\s*disallow\s*:\s*\/FeatDisplay\.aspx/im.test(body)) {
    throw new Error("AoN robots.txt disallows feat capture");
  }
}

async function fetchFeat(feat: PilotFeat): Promise<{ body: string; metadata: CaptureMetadata }> {
  const filename = rawPath(feat);
  const cached = readCapturedArtifact<CaptureMetadata>(filename);
  if (cached) return cached;
  const remaining = 1_000 - (Date.now() - lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  const url = sourceUrl(feat);
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": userAgent },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  lastRequestAt = Date.now();
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} while retrieving ${url}`);
  const metadata = {
    url: response.url,
    retrieved_at: new Date().toISOString(),
    http_status: response.status,
    content_sha256: artifactHash(body),
    response_content_type: response.headers.get("content-type"),
  };
  writeCapturedArtifact(filename, body, metadata);
  return { body, metadata };
}

function observation(feat: PilotFeat, capture: { body: string; metadata: CaptureMetadata }): void {
  const parsed = parseAonFeat(capture.body, capture.metadata.url, feat.name);
  const observationDirectory = path.join(projectRoot, "data", "observations", "feats", feat.entityId.slice(5));
  const observationId = `aon:${feat.entityId}:${capture.metadata.content_sha256.slice(0, 8)}`;
  const sourceBookRaw = parsed.publications.map((publication) => publication.text_raw).join("; ") || null;
  writeJson(path.join(observationDirectory, `aon-${parser.version}.json`), {
    $schema: "../../../../schemas/source-entity-observation.schema.json",
    schema_version: "0.1.0",
    observation_id: observationId,
    entity_type: "feat",
    source: {
      site_id: "aon",
      url: capture.metadata.url,
      license_url: "https://www.aonprd.com/Licenses.aspx",
      declared_publisher: "Paizo",
      first_party_status: "confirmed",
    },
    retrieval: {
      retrieved_at: capture.metadata.retrieved_at,
      http_status: capture.metadata.http_status,
      content_sha256: capture.metadata.content_sha256,
      raw_artifact_path: path.relative(observationDirectory, rawPath(feat)).replaceAll("\\", "/"),
      response_content_type: capture.metadata.response_content_type,
    },
    parser: { ...parser, parsed_at: new Date().toISOString() },
    page: {
      title_raw: cleanText(cheerio.load(capture.body)("title").text()) || parsed.name,
      breadcrumbs_raw: [],
      license_notice_raw: null,
      source_notice_raw: sourceBookRaw,
    },
    entity_raw: {
      name_raw: parsed.name,
      definition_type_raw: parsed.featTypes.length ? parsed.featTypes.join(", ") : null,
      source_book_raw: sourceBookRaw,
      definition_raw: parsed.definitionRaw,
      links_raw: parsed.links,
      sections_raw: parsed.sections,
      document_raw: parsed.document,
      feat_types_raw: parsed.featTypes,
      source_tags_raw: [],
      prerequisites_raw: parsed.prerequisites,
      summary_raw: parsed.summary,
      publications_raw: parsed.publications,
      pfs_marker_raw: parsed.pfsMarker,
      catalog_memberships_raw: [],
      supplements_raw: parsed.supplements,
      source_record_key_raw: feat.sourceRecordKey,
    },
    warnings: parsed.supplements.map((supplement) => ({
      code: "SUPPLEMENT_EXCLUDED",
      severity: "info",
      field: "/entity_raw/supplements_raw",
      message: `${supplement.heading_raw} remains in the immutable source artifact and is excluded from the base feat observation.`,
    })),
  });
}

export async function ingestFeatPilot(offline = false): Promise<void> {
  if (pilotFeats.some((feat) => !readCapturedArtifact(rawPath(feat)))) {
    if (offline) throw new Error("Feat pilot capture is missing; offline replay cannot continue");
    await assertAonAllowsFeatCapture();
  }
  for (const feat of pilotFeats) observation(feat, await fetchFeat(feat));
  console.log(`Parsed ${pilotFeats.length} AoN feat pilot pages.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  await ingestFeatPilot(process.argv.includes("--offline"));
}
