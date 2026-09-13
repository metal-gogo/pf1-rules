import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import { parseRichTextHtml, richTextLeafText, type RichTextBlockNode, type RichTextDocument } from "../domain/rich-text.js";
import { standardSkills } from "../domain/skills.js";
import { artifactHash, readCapturedArtifact, writeCapturedArtifact } from "./artifact-store.js";


const catalogUrl = "https://www.d20pfsrd.com/skills/";
const parser = { name: "d20pfsrd-skill-adapter", version: "0.1.0" };
const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
let lastRequestAt = 0;

type CaptureMetadata = {
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
};

export type CatalogSkill = { entityId: string; name: string; d20Url: string; aonUrl: string };

type ParsedPage = {
  name: string;
  definitionRaw: string;
  document: RichTextDocument;
  sections: Array<{ heading_raw: string | null; body_raw: string }>;
  links: Array<{
    anchor_text_raw: string;
    href_raw: string;
    href_resolved: string;
    source_field: string;
    context_raw: string;
    role_hint: "cross_reference";
    target_entity_type_hint: "skill" | "feat" | "spell" | "rule" | "unknown";
    target_entity_id_hint: string | null;
  }>;
  keyAbility: string | null;
  trainedOnly: boolean | null;
  armorCheckPenalty: boolean | null;
};

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function catalogPath(): string {
  return path.join(projectRoot, "data", "raw", "catalogs", "skills", "d20pfsrd.html");
}

function rawPath(skill: CatalogSkill, siteId: "aon" | "d20pfsrd"): string {
  return path.join(projectRoot, "data", "raw", "skills", skill.entityId.slice(6), `${siteId}.html`);
}

function observationPath(entityId: string, siteId: "aon" | "d20pfsrd" = "d20pfsrd"): string {
  return path.join(projectRoot, "data", "observations", "skills", entityId.slice(entityId.indexOf(".") + 1), `${siteId}-${parser.version}.json`);
}

function writeJson(filename: string, value: Record<string, any>): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.existsSync(filename) && value.parser) {
    value.parser.parsed_at = JSON.parse(fs.readFileSync(filename, "utf8")).parser.parsed_at;
  }
  let serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === serialized) return;
  if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite differing generated file ${filename}`);
  if (value.parser) value.parser.parsed_at = new Date().toISOString();
  serialized = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filename, serialized, { encoding: "utf8", flag: "wx" });
}

async function assertCaptureAllowed(): Promise<void> {
  const response = await fetch("https://www.d20pfsrd.com/robots.txt", {
    headers: { accept: "text/plain", "user-agent": userAgent },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Cannot verify d20PFSRD robots policy: HTTP ${response.status}`);
  if (/^\s*disallow\s*:\s*\/skills(?:\/|\s*$)/im.test(await response.text())) {
    throw new Error("d20PFSRD robots.txt disallows skill capture");
  }
}

async function capture(url: string, filename: string): Promise<{ body: string; metadata: CaptureMetadata }> {
  const cached = readCapturedArtifact<CaptureMetadata>(filename);
  if (cached) return cached;
  const remaining = 1_000 - (Date.now() - lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
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

export function parseSkillCatalog(html: string, sourceUrl = catalogUrl): CatalogSkill[] {
  const $ = cheerio.load(html);
  const rows = $("table").filter((_, table) => cleanText($(table).find("caption").text()) === "Table: Skill Summary")
    .first().find("tr");
  const byId = new Map<string, CatalogSkill>();
  for (const row of rows.toArray()) {
    const anchor = $(row).children("td").first().find("a[href]").first();
    const href = anchor.attr("href");
    const name = cleanText(anchor.text());
    if (!href || !name) continue;
    const url = new URL(href, sourceUrl);
    const expected = standardSkills.find(([, expectedName]) => expectedName === name);
    if (!expected) continue;
    const aonUrl = new URL("https://www.aonprd.com/Skills.aspx");
    aonUrl.searchParams.set("ItemName", name);
    byId.set(expected[0], { entityId: expected[0], name, d20Url: url.href, aonUrl: aonUrl.href });
  }
  const missing = standardSkills.filter(([id]) => !byId.has(id));
  if (missing.length) throw new Error(`Skill catalog is missing: ${missing.map(([, name]) => name).join(", ")}`);
  return standardSkills.map(([id]) => byId.get(id)!);
}

const blockTags = new Set(["p", "h2", "h3", "h4", "h5", "h6", "ul", "table"]);

function blockHtml($: cheerio.CheerioAPI, root: any): string[] {
  const blocks: string[] = [];
  const visit = (node: any): void => {
    const tag = String((node as any).tagName ?? (node as any).name ?? "").toLocaleLowerCase("en-US");
    if (blockTags.has(tag)) {
      if (tag === "table") {
        const caption = cleanText($(node).find("caption").first().text());
        if (caption) blocks.push(`<h3>${caption.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</h3>`);
      }
      blocks.push($.html(node));
      return;
    }
    for (const child of $(node).contents().toArray()) {
      if (child.type === "tag") visit(child);
    }
  };
  for (const child of $(root).contents().toArray()) {
    if (child.type === "tag") visit(child);
  }
  return blocks;
}

function sections(document: RichTextDocument): ParsedPage["sections"] {
  const result: ParsedPage["sections"] = [];
  let heading: string | null = null;
  let content: RichTextBlockNode[] = [];
  const flush = (): void => {
    const body = richTextLeafText({ node_type: "document", content }).trim();
    if (body) result.push({ heading_raw: heading, body_raw: body });
    content = [];
  };
  for (const block of document.content) {
    if (block.node_type === "heading") {
      flush();
      heading = richTextLeafText({ node_type: "document", content: [block] });
    } else content.push(block);
  }
  flush();
  return result;
}

function targetHint(url: URL, catalog: CatalogSkill[]): Pick<ParsedPage["links"][number], "target_entity_type_hint" | "target_entity_id_hint"> {
  const aonName = /aonprd\.com$/i.test(url.hostname) && /\/Skills\.aspx$/i.test(url.pathname)
    ? url.searchParams.get("ItemName")
    : null;
  if (aonName) {
    const skill = catalog.find((candidate) => candidate.name === aonName);
    if (skill) return { target_entity_type_hint: "skill", target_entity_id_hint: skill.entityId };
  }
  const skill = catalog.find((candidate) => new URL(candidate.d20Url).pathname.replace(/\/$/, "") === url.pathname.replace(/\/$/, ""));
  if (skill) return { target_entity_type_hint: "skill", target_entity_id_hint: skill.entityId };
  if (url.pathname.startsWith("/feats/")) return { target_entity_type_hint: "feat", target_entity_id_hint: null };
  if (url.pathname.startsWith("/magic/all-spells/")) return { target_entity_type_hint: "spell", target_entity_id_hint: null };
  if (url.hostname.endsWith("d20pfsrd.com")) return { target_entity_type_hint: "rule", target_entity_id_hint: null };
  return { target_entity_type_hint: "unknown", target_entity_id_hint: null };
}

export function parseSkillPage(html: string, sourceUrl: string, catalog: CatalogSkill[], general = false): ParsedPage {
  const $ = cheerio.load(html);
  const aonContent = $("#MainContent_DataListTalentsAll_LabelName_0").first();
  const article = aonContent.length
    ? cheerio.load(`<div id="article-content">${aonContent.html() ?? ""}</div>`)("#article-content")
    : $("#article-content").first().clone();
  if (!article.length) throw new Error(`Skill article content was not found at ${sourceUrl}`);
  const title = cleanText(article.children("h1").first().text());
  article.find("script, style, #toc_container, .product-right, .flexbox, .section15").remove();
  article.find("p").filter((_, element) => /^Editor(?:’|')s Note:/i.test(cleanText($(element).text()))).remove();
  article.find("p").filter((_, element) => /^Support John Reyst/i.test(cleanText($(element).text()))).remove();
  article.find("p").filter((_, element) => ["C = Class Skill", "[Source]"].includes(cleanText($(element).text()))).remove();
  article.find("table").filter((_, table) => cleanText($(table).find("caption").text()) === "Table: Skill Summary").remove();
  article.find("table").filter((_, table) => cleanText($(table).text()).includes("Skill Ranks per Level")).remove();
  const thirdParty = article.find("tr").filter((_, row) => cleanText($(row).text()) === "3rd-Party Classes");
  thirdParty.nextAll().remove();
  thirdParty.remove();
  const psionic = article.find("tr").filter((_, row) => cleanText($(row).text()).startsWith("Psionic Class"));
  psionic.nextAll().remove();
  psionic.remove();
  article.children("h1").remove();
  const blocks = aonContent.length ? [article.html() ?? ""] : blockHtml($, article.get(0)!);
  const document = parseRichTextHtml(blocks.join("\n"), { sourceLinks: true, baseUrl: sourceUrl });
  const definitionRaw = richTextLeafText(document).trim();
  if (!definitionRaw) throw new Error(`Skill rules content was empty at ${sourceUrl}`);
  const links = blocks.flatMap((block, blockIndex) => {
    const fragment = cheerio.load(block);
    return fragment("a[href]").toArray().flatMap((anchor) => {
      const hrefRaw = fragment(anchor).attr("href");
      const anchorText = cleanText(fragment(anchor).text());
      if (!hrefRaw || !anchorText || hrefRaw.startsWith("#")) return [];
      const url = new URL(hrefRaw, sourceUrl);
      return [{
        anchor_text_raw: anchorText,
        href_raw: hrefRaw,
        href_resolved: url.href,
        source_field: `entity_raw.document_raw.content[${blockIndex}]`,
        context_raw: cleanText(fragment.root().text()),
        role_hint: "cross_reference" as const,
        ...targetHint(url, catalog),
      }];
    });
  });
  const metadata = title.match(/\(([^)]+)\)\s*$/)?.[1]?.split(";").map(cleanText) ?? [];
  return {
    name: general ? "Skill rules" : title.replace(/\s*\([^)]+\)\s*$/, ""),
    definitionRaw,
    document,
    sections: sections(document),
    links,
    keyAbility: general ? null : metadata.find((value) => /^(Str|Dex|Con|Int|Wis|Cha)$/i.test(value)) ?? null,
    trainedOnly: general ? null : metadata.some((value) => /Trained Only/i.test(value)),
    armorCheckPenalty: general ? null : metadata.some((value) => /Armor Check Penalty/i.test(value)),
  };
}

function writeRegistry(catalog: CatalogSkill[]): void {
  const directory = path.join(projectRoot, "data", "entities");
  const registered = new Set(fs.readdirSync(directory).filter((name) => name.endsWith(".json")).flatMap((name) => {
    const registry = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    return registry.entities.map((entity: { entity_id: string }) => entity.entity_id);
  }));
  const entities = [
    ...catalog.filter((skill) => !registered.has(skill.entityId)).map((skill) => ({
      entity_id: skill.entityId,
      entity_type: "skill",
      name: skill.name,
      status: "stub",
      aliases: [],
      evidence: [],
      notes: ["Captured from the d20PFSRD standard skill catalog; canonicalization remains pending."],
      relationships: [],
    })),
    ...(!registered.has("rule.skills-general") ? [{
      entity_id: "rule.skills-general",
      entity_type: "rule",
      name: "Skill rules",
      status: "stub",
      aliases: [],
      evidence: [],
      notes: ["General skill rules captured from d20PFSRD; canonicalization remains pending."],
      relationships: [],
    }] : []),
  ];
  if (!entities.length) return;
  writeJson(path.join(directory, "skill-entities.json"), {
    $schema: "../../schemas/entity-registry.schema.json",
    schema_version: "0.1.0",
    registry_id: "skill-entities",
    entities,
  });
}

function writeObservation(entityId: string, siteId: "aon" | "d20pfsrd", captureResult: { body: string; metadata: CaptureMetadata }, parsed: ParsedPage): void {
  const filename = observationPath(entityId, siteId);
  const hash = captureResult.metadata.content_sha256.slice(0, 8)
    + artifactHash(`${captureResult.metadata.content_sha256}:${parser.name}:${parser.version}`).slice(0, 8);
  writeJson(filename, {
    $schema: "../../../../schemas/source-entity-observation.schema.json",
    schema_version: "0.1.0",
    observation_id: `${siteId}:${entityId}:${hash}`,
    entity_type: entityId.startsWith("skill.") ? "skill" : "rule",
    source: {
      site_id: siteId,
      url: captureResult.metadata.url,
      license_url: siteId === "aon" ? "https://www.aonprd.com/Licenses.aspx" : "https://www.d20pfsrd.com/extras/legal/",
      declared_publisher: siteId === "aon" ? "Paizo" : null,
      first_party_status: siteId === "aon" ? "confirmed" : "unknown",
    },
    retrieval: {
      retrieved_at: captureResult.metadata.retrieved_at,
      http_status: captureResult.metadata.http_status,
      content_sha256: captureResult.metadata.content_sha256,
      raw_artifact_path: path.relative(path.dirname(filename), entityId === "rule.skills-general"
        ? catalogPath()
        : rawPath({ entityId, name: parsed.name, d20Url: captureResult.metadata.url, aonUrl: captureResult.metadata.url }, siteId)).replaceAll("\\", "/"),
      response_content_type: captureResult.metadata.response_content_type,
    },
    parser: { ...parser, parsed_at: new Date().toISOString() },
    page: { title_raw: parsed.name, breadcrumbs_raw: ["Skills"], license_notice_raw: null, source_notice_raw: null },
    entity_raw: {
      name_raw: parsed.name,
      definition_type_raw: entityId.startsWith("skill.") ? "skill" : "general skill rules",
      source_book_raw: null,
      definition_raw: parsed.definitionRaw,
      links_raw: parsed.links,
      sections_raw: parsed.sections,
      document_raw: parsed.document,
      key_ability_raw: parsed.keyAbility,
      trained_only_raw: parsed.trainedOnly,
      armor_check_penalty_raw: parsed.armorCheckPenalty,
    },
    warnings: [],
  });
}

function selectBatch(catalog: CatalogSkill[], count: number, batchFile?: string): CatalogSkill[] {
  if (!batchFile) return catalog.slice(0, count);
  if (fs.existsSync(batchFile)) {
    const ids: unknown = JSON.parse(fs.readFileSync(batchFile, "utf8"));
    if (!Array.isArray(ids) || ids.length !== count || new Set(ids).size !== count) {
      throw new Error("Pending skill batch does not match the requested count; retry with its original count.");
    }
    const byId = new Map(catalog.map((skill) => [skill.entityId, skill]));
    return ids.map((id) => {
      const skill = typeof id === "string" ? byId.get(id) : undefined;
      if (!skill) throw new Error("Pending skill batch contains an unknown skill ID.");
      return skill;
    });
  }
  const remaining = catalog.filter((skill) => !fs.existsSync(observationPath(skill.entityId, "aon")) || !fs.existsSync(observationPath(skill.entityId)));
  if (remaining.length < count) throw new Error(`Only ${remaining.length} unprocessed skills remain; requested ${count}.`);
  const selected = remaining.slice(0, count);
  fs.writeFileSync(batchFile, `${JSON.stringify(selected.map((skill) => skill.entityId))}\n`, { flag: "wx" });
  return selected;
}

export async function ingestSkillBatch(count: number, offline = false, batchFile?: string): Promise<void> {
  if (!readCapturedArtifact(catalogPath()) && offline) throw new Error("d20PFSRD skill catalog capture is missing; offline replay cannot continue");
  if (!readCapturedArtifact(catalogPath())) await assertCaptureAllowed();
  const catalogCapture = await capture(catalogUrl, catalogPath());
  const catalog = parseSkillCatalog(catalogCapture.body, catalogCapture.metadata.url);
  if (!Number.isInteger(count) || count < 0 || count > catalog.length) throw new Error(`Skill count must be an integer from 0 through ${catalog.length}.`);
  writeRegistry(catalog);
  writeObservation("rule.skills-general", "d20pfsrd", catalogCapture, parseSkillPage(catalogCapture.body, catalogCapture.metadata.url, catalog, true));
  const selected = selectBatch(catalog, count, batchFile);
  if (selected.some((skill) => !readCapturedArtifact(rawPath(skill, "aon")) || !readCapturedArtifact(rawPath(skill, "d20pfsrd"))) && offline) {
    throw new Error("Requested skill capture is missing; offline replay cannot continue");
  }
  if (selected.some((skill) => !readCapturedArtifact(rawPath(skill, "aon")) || !readCapturedArtifact(rawPath(skill, "d20pfsrd")))) await assertCaptureAllowed();
  for (const skill of selected) {
    for (const [siteId, url] of [["aon", skill.aonUrl], ["d20pfsrd", skill.d20Url]] as const) {
      const result = await capture(url, rawPath(skill, siteId));
      writeObservation(skill.entityId, siteId, result, parseSkillPage(result.body, result.metadata.url, catalog));
    }
  }
  console.log(`Parsed the general skill rules and ${selected.length} AoN/d20PFSRD skill pairs.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  const offline = process.argv.includes("--offline");
  const batchFile = process.argv.find((argument) => argument.startsWith("--batch-file="))?.slice("--batch-file=".length);
  const countValue = process.argv.find((argument) => argument.startsWith("--count="))?.slice("--count=".length) ?? "0";
  await ingestSkillBatch(Number(countValue), offline, batchFile);
}
