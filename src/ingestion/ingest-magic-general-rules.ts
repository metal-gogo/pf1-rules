import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import { parseRichTextHtml, richTextLeafText, type RichTextDocument } from "../domain/rich-text.js";
import { artifactHash, readCapturedArtifact, writeCapturedArtifact } from "./artifact-store.js";


const entityId = "spellcasting";
const parser = { name: "magic-general-rules-adapter", version: "0.2.0" };
const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
let lastRequestAt = 0;

type CaptureMetadata = {
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
};

export type Source = {
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

type SourceLink = {
  anchor_text_raw: string;
  href_raw: string;
  href_resolved: string;
  source_field: string;
  context_raw: string;
  role_hint: "cross_reference" | "unknown";
  target_entity_type_hint: "rule" | "unknown";
  target_entity_id_hint: string | null;
};

type ParsedPage = {
  title: string;
  document: RichTextDocument | null;
  navigation_headings: string[];
  links: SourceLink[];
};

function aonContent(html: string): string {
  const openMarker = '<span id="MainContent_DetailedOutput">';
  const contentStart = html.indexOf(openMarker);
  const footerStart = html.indexOf('<div class="footer"');
  if (contentStart < 0 || footerStart <= contentStart) throw new Error("AoN magic content was not found");
  return html.slice(contentStart + openMarker.length, html.lastIndexOf("</span>", footerStart));
}

function normalizedRuleHeadings(html: string): string {
  return html.replace(/<\/?h([1-6])\b/gi, (tag, level: string) => {
    const normalized = Math.min(6, Number.parseInt(level, 10) + 1);
    return tag.startsWith("</") ? `</h${normalized}` : `<h${normalized}`;
  });
}

function sourceLinks(html: string, source: Source, sourceField: string): SourceLink[] {
  const $ = cheerio.load(html);
  return $("a[href]").toArray().flatMap((element) => {
    const anchor = cleanText($(element).text());
    const hrefRaw = $(element).attr("href");
    if (!anchor || !hrefRaw) return [];
    const hrefResolved = new URL(hrefRaw, source.url).href;
    const localMagicTarget = hrefResolved === source.url ? "/rules/magic" : null;
    return [{
      anchor_text_raw: anchor,
      href_raw: hrefRaw,
      href_resolved: hrefResolved,
      source_field: sourceField,
      context_raw: cleanText($(element).parent().text()) || anchor,
      role_hint: "cross_reference",
      target_entity_type_hint: localMagicTarget ? "rule" : "unknown",
      target_entity_id_hint: localMagicTarget ? entityId : null,
    }];
  });
}

export function parseMagicRulesPage(html: string, source: Source): ParsedPage {
  if (source.siteId === "aon") {
    const content = aonContent(html);
    const document = parseRichTextHtml(normalizedRuleHeadings(content));
    const headings = document.content.flatMap((block) => block.node_type === "heading"
      ? [richTextLeafText({ node_type: "document", content: [block] })]
      : []);
    if (!headings.length) throw new Error("No rule headings were parsed for aon");
    return {
      title: headings[0]!,
      document,
      navigation_headings: headings,
      links: sourceLinks(content, source, "/entity_raw/document_raw"),
    };
  }

  const doc = cheerio.load(html);
  const root = contentRoot(doc, source.siteId);
  if (!root.length) throw new Error("Main content was not found for d20pfsrd");
  const headings = root.find("h1, h2, h3, h4, h5, h6").toArray().flatMap((element) => {
    const heading = cleanText(doc(element).text());
    return heading ? [heading] : [];
  });
  return {
    title: headings[0] ?? "Magic",
    document: null,
    navigation_headings: headings,
    links: sourceLinks(root.html() ?? "", source, "/entity_raw/navigation_headings_raw"),
  };
}

function observation(source: Source, capture: { body: string; metadata: CaptureMetadata }) {
  const { body, metadata } = capture;
  const parsed = parseMagicRulesPage(body, source);
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
      links_raw: parsed.links,
      sections_raw: [],
      ...(parsed.document ? { document_raw: parsed.document } : {}),
      navigation_headings_raw: parsed.navigation_headings,
    },
    warnings: [
      ...(parsed.links.filter((link) => !link.target_entity_id_hint).length ? [{
        code: "UNRESOLVED_SOURCE_LINK",
        severity: "info" as const,
        field: "/entity_raw/links_raw",
        message: `${parsed.links.filter((link) => !link.target_entity_id_hint).length} source links remain in provenance because no uniquely evidenced local target is registered.`,
      }] : []),
      ...(source.siteId === "d20pfsrd" ? [{
        code: "THIRD_PARTY_COMPILATION",
        severity: "info" as const,
        field: "/entity_raw/navigation_headings_raw",
        message: "This source is retained only for navigation and link-discovery evidence. Its prose is not canonical Magic content.",
      }] : []),
    ],
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
  console.log(`Captured ${records.length} magic rule sources; AoN rich text and d20PFSRD discovery evidence were recorded separately.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\\\", "/"))) {
  await ingestMagicGeneralRules();
}
