import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import { artifactHash, readCapturedArtifact, writeCapturedArtifact } from "./artifact-store.js";


const entityId = "rule.magic";
const parser = { name: "magic-general-rules-adapter", version: "0.1.0" };
const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
let lastRequestAt = 0;

type CaptureMetadata = {
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
};

type Source = {
  siteId: "aon" | "d20pfsrd";
  url: string;
  rawPath: string;
  declaredPublisher: string;
  firstPartyStatus: "confirmed" | "third_party";
  sourceNotice: string | null;
};

const sources: Source[] = [
  {
    siteId: "aon",
    url: "https://aonprd.com/Rules.aspx?ID=68",
    rawPath: path.join(projectRoot, "data", "raw", "rules", "magic", "aon.html"),
    declaredPublisher: "Paizo",
    firstPartyStatus: "confirmed",
    sourceNotice: "PRPG Core Rulebook, pages 83 and 206–218",
  },
  {
    siteId: "d20pfsrd",
    url: "https://www.d20pfsrd.com/magic/",
    rawPath: path.join(projectRoot, "data", "raw", "rules", "magic", "d20pfsrd.html"),
    declaredPublisher: "d20PFSRD",
    firstPartyStatus: "third_party",
    sourceNotice: null,
  },
];

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function writeJson(filename: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchPage(source: Source): Promise<{ body: string; metadata: CaptureMetadata }> {
  const cached = readCapturedArtifact<CaptureMetadata>(source.rawPath);
  if (cached) return cached;
  const remaining = 1_000 - (Date.now() - lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  const response = await fetch(source.url, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": userAgent },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  lastRequestAt = Date.now();
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} while retrieving ${source.url}`);
  const metadata: CaptureMetadata = {
    url: response.url,
    retrieved_at: new Date().toISOString(),
    http_status: response.status,
    content_sha256: artifactHash(body),
    response_content_type: response.headers.get("content-type"),
  };
  writeCapturedArtifact(source.rawPath, body, metadata);
  return { body, metadata };
}

function contentRoot(doc: cheerio.CheerioAPI, siteId: Source["siteId"]) {
  // AoN places block headings inside an inline span. HTML parsing repairs those
  // headings as siblings, so the span's parent is the smallest stable container.
  if (siteId === "aon") return doc("#MainContent_DetailedOutput").first().parent();
  const candidates = doc("main, article, .entry-content, .post-content").toArray();
  return doc(candidates.sort((left, right) => doc(right).text().length - doc(left).text().length)[0]);
}

function parseSections(html: string, siteId: Source["siteId"]): { title: string; sections: { heading_raw: string | null; body_raw: string }[] } {
  const openMarker = '<span id="MainContent_DetailedOutput">';
  const contentStart = html.indexOf(openMarker);
  const footerStart = html.indexOf('<div class="footer"');
  if (siteId === "aon" && contentStart >= 0 && footerStart > contentStart) {
    const content = html.slice(contentStart + openMarker.length, footerStart);
    const headings = [...content.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)];
    const sections = headings.map((match, index) => {
      const bodyStart = match.index! + match[0].length;
      const bodyEnd = headings[index + 1]?.index ?? content.length;
      return {
        heading_raw: cleanText(cheerio.load(match[2] ?? "").text()),
        body_raw: cleanText(cheerio.load(content.slice(bodyStart, bodyEnd)).text()),
      };
    }).filter((section) => section.heading_raw && section.body_raw);
    if (!sections.length) throw new Error("No rule sections were parsed for aon");
    return { title: sections[0]!.heading_raw!, sections };
  }
  const normalizedHtml = siteId === "aon" && contentStart >= 0 && footerStart > contentStart
    ? `<div id="MainContent_DetailedOutput">${html.slice(contentStart + openMarker.length, html.lastIndexOf("</span>", footerStart))}</div>`
    : html;
  const doc = cheerio.load(normalizedHtml);
  const root = contentRoot(doc, siteId);
  if (!root.length) throw new Error(`Main content was not found for ${siteId}`);
  const title = cleanText(root.find("h1").first().text()) || "Magic";
  const sections: { heading_raw: string | null; body_raw: string }[] = [];
  let heading: string | null = null;
  let body: string[] = [];
  const flush = () => {
    const bodyRaw = cleanText(body.join("\n"));
    if (bodyRaw) sections.push({ heading_raw: heading, body_raw: bodyRaw });
    body = [];
  };
  root.find("h1, h2, h3, h4, h5, h6, p, li, table").each((_, element) => {
    const tag = element.tagName.toLowerCase();
    const text = cleanText(doc(element).text());
    if (!text) return;
    if (tag.startsWith("h")) {
      flush();
      heading = text;
      return;
    }
    body.push(text);
  });
  flush();
  if (!sections.length) throw new Error(`No rule sections were parsed for ${siteId}`);
  return { title, sections };
}

function observation(source: Source, capture: { body: string; metadata: CaptureMetadata }) {
  const { body, metadata } = capture;
  const parsed = parseSections(body, source.siteId);
  const observationId = `${source.siteId}:${entityId}:${metadata.content_sha256.slice(0, 8)}`;
  const observationDirectory = path.join(projectRoot, "data", "observations", "rules", "magic");
  const record = {
    $schema: "../../../schemas/source-entity-observation.schema.json",
    schema_version: "0.1.0",
    observation_id: observationId,
    entity_type: "rule",
    source: {
      site_id: source.siteId,
      url: metadata.url,
      license_url: source.siteId === "aon" ? "https://www.aonprd.com/Licenses.aspx" : null,
      declared_publisher: source.declaredPublisher,
      first_party_status: source.firstPartyStatus,
    },
    retrieval: {
      retrieved_at: metadata.retrieved_at,
      http_status: metadata.http_status,
      content_sha256: metadata.content_sha256,
      raw_artifact_path: path.relative(observationDirectory, source.rawPath).replaceAll("\\\\", "/"),
      response_content_type: metadata.response_content_type,
    },
    parser: { ...parser, parsed_at: new Date().toISOString() },
    page: {
      title_raw: cleanText(cheerio.load(body)("title").text()) || parsed.title,
      breadcrumbs_raw: ["Rules", "Magic"],
      license_notice_raw: null,
      source_notice_raw: source.sourceNotice,
    },
    entity_raw: {
      name_raw: "Magic",
      definition_type_raw: "General rules",
      source_book_raw: source.sourceNotice,
      definition_raw: "General Pathfinder rules for magic, including casting, spell descriptions, and preparation.",
      links_raw: [],
      sections_raw: parsed.sections,
    },
    warnings: source.siteId === "d20pfsrd" ? [{
      code: "THIRD_PARTY_COMPILATION",
      severity: "info",
      field: "/entity_raw/sections_raw",
      message: "This source includes third-party editorial material, FAQs, and optional subsystems; use the first-party AoN observation for core-rule authority.",
    }] : [],
  };
  writeJson(path.join(observationDirectory, `${source.siteId}-${parser.version}.json`), record);
  return { observationId, record };
}

export async function ingestMagicGeneralRules(): Promise<void> {
  const captures = await Promise.all(sources.map(async (source) => ({ source, capture: await fetchPage(source) })));
  const records = captures.map(({ source, capture }) => observation(source, capture));
  const registryPath = path.join(projectRoot, "data", "entities", "level-1-bulk-entities.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { entities: Array<Record<string, unknown>> };
  const entity = registry.entities.find((candidate) => candidate.entity_id === entityId);
  if (!entity) throw new Error(`${entityId} is missing from ${registryPath}`);
  entity.name = "Magic";
  entity.status = "resolved";
  entity.aliases = ["Magic Basics"];
  entity.evidence = records.map(({ observationId, record }) => ({
    observation_id: observationId,
    source_field: "entity_raw.sections_raw",
    anchor_text_raw: "Magic",
    source_href: record.source.url,
  }));
  entity.notes = [
    "The AoN observation is the first-party source for the Core Rulebook magic rules.",
    "The d20PFSRD observation is retained separately for its navigation and supplementary material; it is not canonical authority.",
  ];
  writeJson(registryPath, registry);
  console.log(`Captured ${records.length} magic rule sources with ${records.map(({ record }) => record.entity_raw.sections_raw.length).join(" and ")} sections.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\\\", "/"))) {
  await ingestMagicGeneralRules();
}
