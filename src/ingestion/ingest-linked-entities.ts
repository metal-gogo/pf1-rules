import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import { validatePackage } from "./validate.js";
import { slug } from "./spell-page-parser.js";
import {
  artifactHash,
  readCapturedArtifact,
  writeCapturedArtifact,
} from "./artifact-store.js";


const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
const parserVersion = "0.1.0";
let lastRequestAt = 0;


interface CaptureMetadata {
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
}


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function writeJson(filename: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}


function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}


async function fetchPage(url: string, filename: string) {
  const cached = readCapturedArtifact<CaptureMetadata>(filename);
  if (cached) return { body: cached.body, ...cached.metadata };
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
  return { body, ...metadata };
}


function parseDefinition(html: string, url: string) {
  const doc = cheerio.load(html);
  const output = doc("#MainContent_DetailedOutput").first();
  if (output.length !== 1) throw new Error("AoN detailed definition block was not found");
  const name = cleanText(output.find("h1.title").first().text());
  const allText = cleanText(output.text());
  const match = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*Source\\s*(.*?)\\s*Definition Type\\s*(School|Descriptor|Subschool)\\s*(.+)$`, "i").exec(allText);
  if (!match?.[1] || !match[2] || !match[3]) throw new Error(`Cannot bound definition fields for ${name}`);
  const sourceBook = cleanText(match[1]);
  const definitionType = cleanText(match[2]);
  const definition = cleanText(match[3]);
  const links = output.find("a[href]").toArray().flatMap((element) => {
    const anchor = cleanText(doc(element).text());
    const hrefRaw = doc(element).attr("href");
    if (!anchor || !hrefRaw) return [];
    const hrefResolved = new URL(hrefRaw, url).toString();
    const isPublication = /paizo\.com/i.test(hrefResolved);
    return [{
      anchor_text_raw: anchor,
      href_raw: hrefRaw,
      href_resolved: hrefResolved,
      source_field: isPublication ? "entity_raw.source_book_raw" : "entity_raw.definition_raw",
      context_raw: isPublication ? `Source ${anchor}` : definition,
      role_hint: isPublication ? "publication" : "definition",
      target_entity_type_hint: isPublication ? "publication" : "unknown",
      target_entity_id_hint: isPublication ? `publication.${slug(anchor)}` : null,
    }];
  });
  return { name, sourceBook, definitionType, definition, links, title: cleanText(doc("title").text()) };
}


function registryFiles(): string[] {
  return fs.readdirSync(path.join(projectRoot, "data", "entities"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(projectRoot, "data", "entities", name));
}


export async function ingestLinkedSpellDefinitions() {
  const registries = registryFiles().map((filename) => ({ filename, record: loadJson(filename) }));
  const entityLocations = new Map<string, { registry: ValidatedJson; entity: ValidatedJson }>();
  for (const item of registries) {
    for (const entity of item.record.entities) entityLocations.set(entity.entity_id, { registry: item.record, entity });
  }
  const candidates = [...entityLocations.values()].filter(({ entity }) =>
    entity.status === "stub" &&
    ["magic_school", "subschool", "descriptor"].includes(entity.entity_type) &&
    entity.evidence.some((evidence: ValidatedJson) => /aonprd\.com\/SpellDefinitions\.aspx\?ID=/i.test(evidence.source_href ?? "")),
  );
  const report = { attempted: candidates.length, resolved: [] as string[], issues: [] as Array<{ entity_id: string; message: string }> };
  for (const { entity } of candidates) {
    try {
      const discoveredSourceUrl = entity.evidence.find((evidence: ValidatedJson) => /aonprd\.com\/SpellDefinitions\.aspx\?ID=/i.test(evidence.source_href ?? ""))!.source_href;
      // The preserved Inflict Light Wounds observation points "necromancy" at ID=8,
      // but the current AoN definition catalog resolves ID=8 to Transmutation and ID=7
      // to Necromancy. Keep the old evidence and record this case-specific correction.
      const sourceUrl = entity.entity_id === "magic-school.necromancy"
        ? "https://www.aonprd.com/SpellDefinitions.aspx?ID=7"
        : discoveredSourceUrl;
      const rawPath = path.join(projectRoot, "data", "raw", "entities", entity.entity_id, entity.entity_id === "magic-school.necromancy" ? "aon-corrected.html" : "aon.html");
      const capture = await fetchPage(sourceUrl, rawPath);
      const parsed = parseDefinition(capture.body, capture.url);
      const expectedType = entity.entity_type.replace("magic_school", "school");
      if (slug(parsed.name) !== entity.entity_id.split(".").slice(1).join("-") || slug(parsed.definitionType) !== expectedType) {
        throw new Error(`Expected ${entity.entity_id}, parsed ${parsed.name} (${parsed.definitionType})`);
      }
      const observationId = `aon:${entity.entity_id}:${capture.content_sha256.slice(0, 8)}`;
      const observationDirectory = path.join(projectRoot, "data", "observations", "entities", entity.entity_id);
      const observation = {
        $schema: "../../../../schemas/source-entity-observation.schema.json",
        schema_version: "0.1.0",
        observation_id: observationId,
        entity_type: entity.entity_type,
        source: {
          site_id: "aon",
          url: capture.url,
          license_url: "https://www.aonprd.com/Licenses.aspx",
          declared_publisher: "Paizo",
          first_party_status: "confirmed",
        },
        retrieval: {
          retrieved_at: capture.retrieved_at,
          http_status: capture.http_status,
          content_sha256: capture.content_sha256,
          raw_artifact_path: path.relative(observationDirectory, rawPath).replaceAll("\\", "/"),
          response_content_type: capture.response_content_type,
        },
        parser: { name: "aon-spell-definition-adapter", version: parserVersion, parsed_at: new Date().toISOString() },
        page: {
          title_raw: parsed.title,
          breadcrumbs_raw: ["Spells", "Definitions", parsed.name],
          license_notice_raw: null,
          source_notice_raw: parsed.sourceBook,
        },
        entity_raw: {
          name_raw: parsed.name,
          definition_type_raw: parsed.definitionType,
          source_book_raw: parsed.sourceBook,
          definition_raw: parsed.definition,
          links_raw: parsed.links,
          sections_raw: [{ heading_raw: "Definition", body_raw: parsed.definition }],
        },
        warnings: [],
      };
      writeJson(path.join(observationDirectory, `aon-${parserVersion}.json`), observation);
      entity.name = parsed.name;
      entity.status = "resolved";
      entity.notes = entity.notes.filter((note: string) => !/not yet been imported/i.test(note));
      if (!entity.notes.includes("Definition wording captured from Archives of Nethys.")) {
        entity.notes.push("Definition wording captured from Archives of Nethys.");
      }
      if (entity.entity_id === "magic-school.necromancy" && !entity.notes.some((note: string) => /ID=8/i.test(note))) {
        entity.notes.push("Case-specific source correction: the preserved spell link used AoN definition ID=8, which currently resolves to Transmutation; Necromancy was verified at ID=7.");
      }
      const definitionEvidence = { observation_id: observationId, source_field: "entity_raw.name_raw", anchor_text_raw: parsed.name, source_href: sourceUrl };
      if (!entity.evidence.some((evidence: ValidatedJson) => JSON.stringify(evidence) === JSON.stringify(definitionEvidence))) {
        entity.evidence.push(definitionEvidence);
      }
      for (const link of parsed.links) {
        if (!link.target_entity_id_hint) continue;
        let publication = entityLocations.get(link.target_entity_id_hint)?.entity;
        if (!publication) {
          const bulkRegistry = registries.find(({ record }) => record.registry_id === "level-zero-bulk-entities-v0.1")!.record;
          publication = {
            entity_id: link.target_entity_id_hint,
            entity_type: "publication",
            name: link.anchor_text_raw,
            status: "stub",
            aliases: [],
            evidence: [],
            notes: [],
          };
          bulkRegistry.entities.push(publication);
          entityLocations.set(publication.entity_id, { registry: bulkRegistry, entity: publication });
        }
        const publicationEvidence = { observation_id: observationId, source_field: link.source_field, anchor_text_raw: link.anchor_text_raw, source_href: link.href_resolved };
        if (!publication.evidence.some((evidence: ValidatedJson) => JSON.stringify(evidence) === JSON.stringify(publicationEvidence))) {
          publication.evidence.push(publicationEvidence);
        }
      }
      report.resolved.push(entity.entity_id);
    } catch (error) {
      report.issues.push({ entity_id: entity.entity_id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const actionDefinitions = [
    { entityId: "action.standard-action", fragment: "standard-action", name: "Standard Action" },
    { entityId: "action.free-action", fragment: "free-action", name: "Free Action" },
    { entityId: "action.swift-action", fragment: "swift-action", name: "Swift Action" },
    { entityId: "action.immediate-action", fragment: "immediate-action", name: "Immediate Action" },
  ].filter((definition) => entityLocations.get(definition.entityId)?.entity.status === "stub");
  report.attempted += actionDefinitions.length;
  if (actionDefinitions.length > 0) {
    const sourceUrl = "https://legacy.aonprd.com/coreRulebook/combat.html";
    const rawPath = path.join(projectRoot, "data", "raw", "entities", "actions", "legacy_aon-combat.html");
    try {
      const capture = await fetchPage(sourceUrl, rawPath);
      const doc = cheerio.load(capture.body);
      for (const definition of actionDefinitions) {
        try {
          const entity = entityLocations.get(definition.entityId)!.entity;
          const paragraph = doc(`#${definition.fragment}`).first();
          if (paragraph.length !== 1) throw new Error(`Legacy action paragraph #${definition.fragment} was not found`);
          const rawText = cleanText(paragraph.text());
          const prefix = `${definition.name}:`;
          if (!rawText.startsWith(prefix)) throw new Error(`Expected ${prefix}, parsed ${rawText.slice(0, prefix.length)}`);
          const definitionRaw = rawText.slice(prefix.length).trim();
          const links = paragraph.find("a[href]").toArray().flatMap((element) => {
            const anchor = cleanText(doc(element).text());
            const hrefRaw = doc(element).attr("href");
            if (!anchor || !hrefRaw) return [];
            return [{
              anchor_text_raw: anchor,
              href_raw: hrefRaw,
              href_resolved: new URL(hrefRaw, sourceUrl).toString(),
              source_field: "entity_raw.definition_raw",
              context_raw: definitionRaw,
              role_hint: "definition",
              target_entity_type_hint: "unknown",
              target_entity_id_hint: null,
            }];
          });
          const observationId = `legacy_aon:${definition.entityId}:${capture.content_sha256.slice(0, 8)}`;
          const observationDirectory = path.join(projectRoot, "data", "observations", "entities", definition.entityId);
          writeJson(path.join(observationDirectory, `legacy_aon-${parserVersion}.json`), {
            $schema: "../../../../schemas/source-entity-observation.schema.json",
            schema_version: "0.1.0",
            observation_id: observationId,
            entity_type: "action",
            source: {
              site_id: "legacy_aon",
              url: `${sourceUrl}#${definition.fragment}`,
              license_url: "https://legacy.aonprd.com/openGameLicense.html",
              declared_publisher: "Paizo",
              first_party_status: "confirmed",
            },
            retrieval: {
              retrieved_at: capture.retrieved_at,
              http_status: capture.http_status,
              content_sha256: capture.content_sha256,
              raw_artifact_path: path.relative(observationDirectory, rawPath).replaceAll("\\", "/"),
              response_content_type: capture.response_content_type,
            },
            parser: { name: "legacy-core-action-adapter", version: parserVersion, parsed_at: new Date().toISOString() },
            page: {
              title_raw: definition.name,
              breadcrumbs_raw: ["Core Rulebook", "Combat", definition.name],
              license_notice_raw: null,
              source_notice_raw: "Pathfinder RPG Core Rulebook",
            },
            entity_raw: {
              name_raw: definition.name,
              definition_type_raw: "Action",
              source_book_raw: "Pathfinder RPG Core Rulebook",
              definition_raw: definitionRaw,
              links_raw: links,
              sections_raw: [{ heading_raw: "Definition", body_raw: definitionRaw }],
            },
            warnings: [],
          });
          entity.name = definition.name;
          entity.status = "resolved";
          if (!entity.notes.includes("Definition wording captured from the Legacy Pathfinder Reference Document.")) {
            entity.notes.push("Definition wording captured from the Legacy Pathfinder Reference Document.");
          }
          const evidence = {
            observation_id: observationId,
            source_field: "entity_raw.name_raw",
            anchor_text_raw: definition.name,
            source_href: `${sourceUrl}#${definition.fragment}`,
          };
          if (!entity.evidence.some((item: ValidatedJson) => JSON.stringify(item) === JSON.stringify(evidence))) entity.evidence.push(evidence);
          report.resolved.push(definition.entityId);
        } catch (error) {
          report.issues.push({ entity_id: definition.entityId, message: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      for (const definition of actionDefinitions) {
        report.issues.push({ entity_id: definition.entityId, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  for (const { filename, record } of registries) {
    record.entities.sort((left: ValidatedJson, right: ValidatedJson) => left.entity_id.localeCompare(right.entity_id));
    writeJson(filename, record);
  }
  const resolvedTotal = [...entityLocations.values()]
    .filter(({ entity }) => entity.status === "resolved" && entity.notes.some((note: string) => /Definition wording captured/i.test(note)))
    .map(({ entity }) => entity.entity_id)
    .sort();
  writeJson(path.join(projectRoot, "data", "reports", "linked-entity-enrichment.json"), {
    generated_at: new Date().toISOString(),
    ...report,
    resolved_total: resolvedTotal,
  });
  validatePackage();
  return report;
}


ingestLinkedSpellDefinitions()
  .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
