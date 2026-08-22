import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import { resolveCanonicalSpellReference } from "./normalize-level-zero.js";
import { slug } from "./spell-page-parser.js";
import { validatePackage } from "./validate.js";


const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
const parserVersion = "0.1.0";
let lastRequestAt = 0;

const reviewedOwnerSpellNames = new Map<string, string>([
  ["wail of the banshees", "Wail of the Banshee"],
  ["summon monster v (fire elementals only)", "Summon Monster V"],
  ["contact other plane (as a 6th-level spell)", "Contact Other Plane"],
  ["major creation (metal items only)", "Major Creation"],
  ["statue (metal statue instead of iron)", "Statue"],
  ["horrid withering", "Horrid Wilting"],
  ["minor creation (wood items only)", "Minor Creation"],
]);

const reviewedOwnerSpellIds = new Map<string, string[]>([
  ["flesh to stone", ["spell.flesh-to-stone"]],
  ["bless water/curse water", ["spell.bless-water", "spell.curse-water"]],
  ["elemental body iii (water only)", ["spell.elemental-body-iii"]],
  ["elemental body iv (water only)", ["spell.elemental-body-iv"]],
  ["resist energy (cold only)", ["spell.resist-energy"]],
  ["globe of invulnerability (greater)", ["spell.globe-of-invulnerability"]],
]);

interface Capture {
  body: string;
  url: string;
  retrieved_at: string;
  http_status: number;
  content_sha256: string;
  response_content_type: string | null;
}

interface OwnerSpell {
  spellName: string;
  spellLevel: number;
  raw: string;
}

interface OwnerRecord {
  entityId: string;
  entityType: "mystery" | "patron" | "spirit" | "bloodline";
  listId: string;
  listKind: "mystery" | "patron" | "spirit" | "bloodline";
  name: string;
  listName: string;
  className: "Oracle" | "Witch" | "Shaman" | "Sorcerer" | "Bloodrager";
  definitionType: string;
  sectionHeading: string;
  sourceUrl: string;
  sourceBook: string | null;
  definitionRaw: string;
  spells: OwnerSpell[];
  capture: Capture;
  rawPath: string;
}


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function writeJson(filename: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}


function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}


function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}


function directJsonFiles(directory: string): string[] {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(directory, name))
    .sort();
}


async function fetchPage(url: string, rawPath: string): Promise<Capture> {
  const metadataPath = `${rawPath}.meta.json`;
  if (fs.existsSync(rawPath) && fs.existsSync(metadataPath)) {
    const body = fs.readFileSync(rawPath, "utf8");
    const metadata = loadJson(metadataPath);
    if (sha256(body) !== metadata.content_sha256) {
      throw new Error(`Cached artifact hash mismatch: ${rawPath}`);
    }
    return { body, ...metadata } as Capture;
  }
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
    content_sha256: sha256(body),
    response_content_type: response.headers.get("content-type"),
  };
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, body, { encoding: "utf8", flag: "wx" });
  writeJson(metadataPath, metadata);
  return { body, ...metadata };
}


async function assertAonAllowsOwners(): Promise<void> {
  const response = await fetch("https://www.aonprd.com/robots.txt", {
    headers: { accept: "text/plain", "user-agent": userAgent },
    signal: AbortSignal.timeout(45_000),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Cannot verify AoN robots policy: HTTP ${response.status}`);
  const body = await response.text();
  const disallowed = body.split(/\r?\n/).some((line) =>
    /^\s*disallow\s*:\s*\/(?:OracleMysteries|MysteryDisplay|WitchPatrons|ShamanSpirits|ShamanSpiritDisplay|SorcererBloodlines|BloodlineDisplay|BloodragerBloodlines|BloodragerBloodlineDisplay)\.aspx/i.test(line),
  );
  if (disallowed) throw new Error("AoN robots.txt disallows spell-list owner capture.");
}


function mysteryLinks(html: string, baseUrl: string): Array<{ name: string; url: string }> {
  const doc = cheerio.load(html);
  const values = new Map<string, { name: string; url: string }>();
  doc('a[href*="MysteryDisplay.aspx?ItemName="]').each((_index, element) => {
    const name = cleanText(doc(element).text());
    const href = doc(element).attr("href");
    if (!name || !href) return;
    values.set(slug(name), { name, url: new URL(href, baseUrl).toString() });
  });
  return [...values.values()].sort((left, right) => left.name.localeCompare(right.name));
}


function parseMystery(capture: Capture, rawPath: string): OwnerRecord {
  const doc = cheerio.load(capture.body);
  const output = doc('span[id^="MainContent_DataListTypes_LabelName_"]').first();
  if (output.length !== 1) throw new Error(`AoN mystery detail block missing at ${capture.url}`);
  const heading = cleanText(output.find("h1.title").first().text());
  const name = heading.replace(/^PFS (?:Legal|Limited|Restricted)\s+/i, "").trim();
  const definitionRaw = cleanText(output.text());
  const bonusMatch = /Bonus Spells:\s*(.*?)\s*Revelations:/i.exec(definitionRaw);
  if (!bonusMatch?.[1]) throw new Error(`${name} lacks a bounded Bonus Spells section.`);
  const spells: OwnerSpell[] = [];
  const entryPattern = /(?:^|,\s*)(.+?)\s*\((\d+)(?:st|nd|rd|th)\)(?=,|\.|$)/gi;
  for (const match of bonusMatch[1].matchAll(entryPattern)) {
    const gainedLevel = Number(match[2]);
    if (gainedLevel < 2 || gainedLevel > 18 || gainedLevel % 2 !== 0) {
      throw new Error(`${name} has unexpected mystery bonus-spell level ${gainedLevel}.`);
    }
    spells.push({
      spellName: cleanText(match[1]!),
      spellLevel: gainedLevel / 2,
      raw: cleanText(match[0]!.replace(/^,\s*/, "")),
    });
  }
  if (spells.length !== 9) {
    throw new Error(`${name} parsed ${spells.length} bonus spells instead of 9: ${bonusMatch[1]}`);
  }
  const sourceBook = cleanText(output.find('a[href*="paizo.com"]').first().text()) || null;
  const ownerSlug = slug(name);
  return {
    entityId: `mystery.${ownerSlug}`,
    entityType: "mystery",
    listId: `spell-list.${ownerSlug}-mystery`,
    listKind: "mystery",
    name: `${name} Mystery`,
    listName: `${name} Mystery Bonus Spells`,
    className: "Oracle",
    definitionType: "Oracle Mystery",
    sectionHeading: "Bonus Spells",
    sourceUrl: capture.url,
    sourceBook,
    definitionRaw,
    spells,
    capture,
    rawPath,
  };
}


function parsePatrons(capture: Capture, rawPath: string): OwnerRecord[] {
  const doc = cheerio.load(capture.body);
  const owners: OwnerRecord[] = [];
  doc('span[id^="MainContent_DataListTypes_LabelName_"]').each((_index, element) => {
    const output = doc(element);
    const name = cleanText(output.children("b").first().text());
    if (!name) return;
    const normalized = output.clone();
    normalized.find("sup").remove();
    const definitionRaw = cleanText(normalized.text());
    const spells: OwnerSpell[] = [];
    const entryPattern = /(\d+)(?:st|nd|rd|th)\s*[—-]\s*(.+?)(?=,\s*\d+(?:st|nd|rd|th)\s*[—-]|\.\s*$)/gi;
    for (const match of definitionRaw.matchAll(entryPattern)) {
      const gainedLevel = Number(match[1]);
      if (gainedLevel < 2 || gainedLevel > 18 || gainedLevel % 2 !== 0) {
        throw new Error(`${name} has unexpected patron-spell level ${gainedLevel}.`);
      }
      spells.push({
        spellName: cleanText(match[2]!),
        spellLevel: gainedLevel / 2,
        raw: cleanText(match[0]!),
      });
    }
    if (spells.length !== 9) {
      throw new Error(`${name} parsed ${spells.length} patron spells instead of 9: ${definitionRaw}`);
    }
    const sourceBook = cleanText(output.find('a[href*="paizo.com"]').first().text()) || null;
    const ownerSlug = slug(name);
    owners.push({
      entityId: `patron.${ownerSlug}`,
      entityType: "patron",
      listId: `spell-list.${ownerSlug}-patron`,
      listKind: "patron",
      name: `${name} Patron`,
      listName: `${name} Patron Spells`,
      className: "Witch",
      definitionType: "Witch Patron",
      sectionHeading: "Patron Spells",
      sourceUrl: capture.url,
      sourceBook,
      definitionRaw,
      spells,
      capture,
      rawPath,
    });
  });
  return owners.sort((left, right) => left.name.localeCompare(right.name));
}


function sourceObservation(owner: OwnerRecord): ValidatedJson {
  const observationId = `aon:${owner.entityId}:${owner.capture.content_sha256.slice(0, 8)}`;
  const observationDirectory = path.join(projectRoot, "data", "observations", "entities", owner.entityId);
  return {
    $schema: "../../../../schemas/source-entity-observation.schema.json",
    schema_version: "0.1.0",
    observation_id: observationId,
    entity_type: owner.entityType,
    source: {
      site_id: "aon",
      url: owner.sourceUrl,
      license_url: "https://www.aonprd.com/Licenses.aspx",
      declared_publisher: "Paizo",
      first_party_status: "confirmed",
    },
    retrieval: {
      retrieved_at: owner.capture.retrieved_at,
      http_status: owner.capture.http_status,
      content_sha256: owner.capture.content_sha256,
      raw_artifact_path: path.relative(observationDirectory, owner.rawPath).replaceAll("\\", "/"),
      response_content_type: owner.capture.response_content_type,
    },
    parser: {
      name: `aon-${owner.entityType}-spell-list-adapter`,
      version: parserVersion,
      parsed_at: owner.capture.retrieved_at,
    },
    page: {
      title_raw: owner.name,
      breadcrumbs_raw: ["Classes", owner.className, owner.definitionType, owner.name],
      license_notice_raw: null,
      source_notice_raw: owner.sourceBook,
    },
    entity_raw: {
      name_raw: owner.name,
      definition_type_raw: owner.definitionType,
      source_book_raw: owner.sourceBook,
      definition_raw: owner.definitionRaw,
      links_raw: [],
      sections_raw: [{
        heading_raw: owner.sectionHeading,
        body_raw: owner.spells.map((spell) => spell.raw).join(", "),
      }],
    },
    warnings: [],
  };
}


function findEntityLocation(registries: Array<{ filename: string; record: ValidatedJson }>, entityId: string) {
  for (const registry of registries) {
    const entity = registry.record.entities.find((candidate: ValidatedJson) => candidate.entity_id === entityId);
    if (entity) return { registry, entity };
  }
  return null;
}


function upsertOwnerEntities(
  owner: OwnerRecord,
  observationId: string,
  registries: Array<{ filename: string; record: ValidatedJson }>,
): void {
  const ownerRegistry = registries.find(({ record }) => record.registry_id === "spell-list-owner-entities-v0.1");
  if (!ownerRegistry) throw new Error("Spell-list owner registry is missing.");
  const evidence = [{
    observation_id: observationId,
    source_field: "entity_raw.name_raw",
    anchor_text_raw: owner.name,
    source_href: owner.sourceUrl,
  }];
  const relationship = {
    relationship_id: `${owner.entityId}:owns_spell_list:${owner.listId}`,
    type: "owns_spell_list",
    target: { entity_type: "spell_list", entity_id: owner.listId, name: owner.listName },
    status: "accepted",
    evidence: [{
      observation_id: observationId,
      source_field: "entity_raw.sections_raw[0]",
      evidence_kind: "plain_text",
      anchor_text_raw: owner.sectionHeading,
      source_href: owner.sourceUrl,
    }],
    note: `This ${owner.definitionType.toLocaleLowerCase("en-US")} owns the listed spell access; it is not a class spell list.`,
  };
  const existingOwner = findEntityLocation(registries, owner.entityId);
  if (existingOwner) {
    existingOwner.entity.entity_type = owner.entityType;
    existingOwner.entity.name = owner.name;
    existingOwner.entity.status = "resolved";
    existingOwner.entity.evidence = evidence;
    existingOwner.entity.notes = ["Definition and complete granted-spell list captured from Archives of Nethys."];
    existingOwner.entity.relationships = [relationship];
  } else {
    ownerRegistry.record.entities.push({
      entity_id: owner.entityId,
      entity_type: owner.entityType,
      name: owner.name,
      status: "resolved",
      aliases: [],
      evidence,
      notes: ["Definition and complete granted-spell list captured from Archives of Nethys."],
      relationships: [relationship],
    });
  }

  const existingList = findEntityLocation(registries, owner.listId);
  if (existingList) {
    existingList.entity.name = owner.listName;
    existingList.entity.status = "resolved";
    existingList.entity.evidence = evidence;
    existingList.entity.notes = [`Complete ${owner.definitionType.toLocaleLowerCase("en-US")} spell list captured from its owning AoN page.`];
  } else {
    ownerRegistry.record.entities.push({
      entity_id: owner.listId,
      entity_type: "spell_list",
      name: owner.listName,
      status: "resolved",
      aliases: [],
      evidence,
      notes: [`Complete ${owner.definitionType.toLocaleLowerCase("en-US")} spell list captured from its owning AoN page.`],
    });
  }
}


function addOwnerSpellMembership(
  owner: OwnerRecord,
  ownerSpell: OwnerSpell,
  observationId: string,
  canonical: ValidatedJson,
  decision: ValidatedJson,
): "added" | "reclassified" | "existing" {
  const existing = canonical.levels.find((level: ValidatedJson) => level.spell_list_id === owner.listId);
  if (existing) return "existing";
  const qualifiedClass = canonical.levels.find((level: ValidatedJson) =>
    level.spell_list_id === `spell-list.${owner.className.toLocaleLowerCase("en-US")}` &&
    (level.qualifications ?? []).some((qualification: ValidatedJson) =>
      qualification.kind === owner.entityType && qualification[owner.entityType]?.entity_id === owner.entityId,
    ),
  );
  const levelIndex = qualifiedClass ? canonical.levels.indexOf(qualifiedClass) : canonical.levels.length;
  const oldRelationshipId = qualifiedClass
    ? `${canonical.spell_id}:appears_on_spell_list:spell-list.${owner.className.toLocaleLowerCase("en-US")}`
    : null;
  const relationshipId = `${canonical.spell_id}:appears_on_spell_list:${owner.listId}`;
  const level = {
    spell_list_id: owner.listId,
    list_kind: owner.listKind,
    list_name: owner.name,
    level: ownerSpell.spellLevel,
    scope: "later_first_party",
    raw: ownerSpell.raw,
    access_basis: "printed",
    qualifications: [],
  };
  if (qualifiedClass) canonical.levels[levelIndex] = level;
  else canonical.levels.push(level);

  const evidence = [{
    observation_id: observationId,
    source_field: "entity_raw.sections_raw[0]",
    evidence_kind: "plain_text",
    anchor_text_raw: ownerSpell.raw,
    source_href: owner.sourceUrl,
  }];
  const relationship = {
    relationship_id: relationshipId,
    type: "appears_on_spell_list",
    target: { entity_type: "spell_list", entity_id: owner.listId, name: owner.listName },
    status: "accepted",
    evidence,
    note: `Printed by the owning ${owner.definitionType.toLocaleLowerCase("en-US")}; this is ${owner.listKind} access, not general ${owner.className} class access.`,
  };
  const oldRelationship = oldRelationshipId
    ? canonical.relationships.find((candidate: ValidatedJson) => candidate.relationship_id === oldRelationshipId)
    : null;
  if (oldRelationship) Object.assign(oldRelationship, relationship);
  else canonical.relationships.push(relationship);

  canonical.provenance.push({
    field_path: `/levels/${levelIndex}`,
    observation_id: observationId,
    source_field: "entity_raw.sections_raw[0]",
    raw_value_sha256: sha256(ownerSpell.raw),
    decision: "normalized",
    note: "The owner page prints the class level when the bonus spell is gained; it is normalized to the corresponding spell level.",
  });
  canonical.normalization.warnings.push({
    code: "OWNER_GRANTED_SPELL_ACCESS",
    field_path: `/levels/${levelIndex}`,
    message: `${owner.name} grants ${canonical.name} as a level ${ownerSpell.spellLevel} spell; this is not general ${owner.className} class access.`,
  });

  if (!decision.observation_ids.includes(observationId)) decision.observation_ids.push(observationId);
  decision.field_decisions.push({
    canonical_path: `/levels/${levelIndex}`,
    decision: "normalize",
    selected_evidence: [{ observation_id: observationId, source_field: "entity_raw.sections_raw[0]" }],
    considered_observation_ids: [observationId],
    rationale: `AoN clearly transcribes the owning ${owner.definitionType.toLocaleLowerCase("en-US")}'s printed spell entry. The gained class level is normalized to spell level.`,
  });
  const oldDecision = oldRelationshipId
    ? decision.relationship_decisions.find((candidate: ValidatedJson) => candidate.relationship_id === oldRelationshipId)
    : null;
  const relationshipDecision = {
    relationship_id: relationshipId,
    decision: "accept",
    evidence: [{ observation_id: observationId, source_field: "entity_raw.sections_raw[0]" }],
    considered_observation_ids: [observationId],
    rationale: `AoN prints the spell on the owning ${owner.definitionType.toLocaleLowerCase("en-US")} page; it is modeled as ${owner.listKind} access rather than general ${owner.className} access.`,
  };
  if (oldDecision) Object.assign(oldDecision, relationshipDecision);
  else decision.relationship_decisions.push(relationshipDecision);
  return qualifiedClass ? "reclassified" : "added";
}


function ingestOwnerRecords(
  family: string,
  catalog: Capture,
  owners: OwnerRecord[],
) {
  const canonicalFiles = directJsonFiles(path.join(projectRoot, "data", "canonical"));
  const canonicals = new Map(canonicalFiles.map((filename) => {
    const record = loadJson(filename);
    return [record.spell_id, { filename, record }] as const;
  }));
  const available = new Map([...canonicals].map(([spellId, item]) => [spellId, item.record]));
  const registries = directJsonFiles(path.join(projectRoot, "data", "entities"))
    .map((filename) => ({ filename, record: loadJson(filename) }));
  const unresolved: Array<{ owner: string; spell: string; level: number }> = [];
  const normalizedReferences: Array<{ owner: string; printed: string; canonical: string }> = [];
  const report = {
    owners: 0,
    rows: 0,
    added: 0,
    reclassified: 0,
    existing: 0,
    normalizedReferences,
    unresolved,
  };

  for (const owner of owners) {
    const observation = sourceObservation(owner);
    const observationId = observation.observation_id;
    writeJson(
      path.join(projectRoot, "data", "observations", "entities", owner.entityId, `aon-${parserVersion}.json`),
      observation,
    );
    upsertOwnerEntities(owner, observationId, registries);
    report.owners += 1;
    for (const ownerSpell of owner.spells) {
      const referenceKey = ownerSpell.spellName.toLocaleLowerCase("en-US");
      const reviewedName = reviewedOwnerSpellNames.get(referenceKey);
      const reviewedIds = reviewedOwnerSpellIds.get(referenceKey);
      const resolved = reviewedIds
        ? reviewedIds.map((spellId) => available.get(spellId)).filter((record): record is ValidatedJson => Boolean(record))
        : [resolveCanonicalSpellReference(reviewedName ?? ownerSpell.spellName, available)]
          .filter((record): record is ValidatedJson => Boolean(record));
      if (resolved.length === 0 || (reviewedIds && resolved.length !== reviewedIds.length)) {
        unresolved.push({ owner: owner.name, spell: ownerSpell.spellName, level: ownerSpell.spellLevel });
        continue;
      }
      for (const canonical of resolved) {
        if (reviewedName || reviewedIds) {
          normalizedReferences.push({
            owner: owner.name,
            printed: ownerSpell.spellName,
            canonical: canonical.name,
          });
        }
        const item = canonicals.get(canonical.spell_id)!;
        const decisionPath = path.join(projectRoot, "data", "decisions", path.basename(item.filename));
        const decision = loadJson(decisionPath);
        const result = addOwnerSpellMembership(owner, ownerSpell, observationId, item.record, decision);
        report[result] += 1;
        report.rows += 1;
        if (result !== "existing") {
          writeJson(item.filename, item.record);
          writeJson(decisionPath, decision);
        }
      }
    }
  }

  for (const registry of registries) {
    registry.record.entities.sort((left: ValidatedJson, right: ValidatedJson) =>
      left.entity_id.localeCompare(right.entity_id),
    );
    writeJson(registry.filename, registry.record);
  }
  const ownerListIds = new Set(owners.map((owner) => owner.listId));
  const canonicalRows = [...available.values()].flatMap((record) =>
    record.levels.filter((level: ValidatedJson) => ownerListIds.has(level.spell_list_id)),
  );
  const rowsByList = Object.fromEntries([...ownerListIds].sort().map((listId) => [
    listId,
    canonicalRows.filter((level: ValidatedJson) => level.spell_list_id === listId).length,
  ]));
  writeJson(path.join(projectRoot, "data", "reports", `${family}-spell-list-ingestion.json`), {
    generated_at: catalog.retrieved_at,
    source_catalog_url: catalog.url,
    source_catalog_sha256: catalog.content_sha256,
    owner_count: owners.length,
    canonical_rows: canonicalRows.length,
    rows_by_list: rowsByList,
    normalized_references: normalizedReferences,
    unresolved,
  });
  if (unresolved.length > 0) {
    throw new Error(`${family} ingestion has ${unresolved.length} unresolved spell references.`);
  }
  validatePackage();
  return report;
}


export async function ingestMysterySpellLists() {
  await assertAonAllowsOwners();
  const catalogRawPath = path.join(
    projectRoot,
    "data",
    "raw",
    "catalogs",
    "spell-list-owners",
    "mysteries-aon.html",
  );
  const catalog = await fetchPage("https://www.aonprd.com/OracleMysteries.aspx", catalogRawPath);
  const links = mysteryLinks(catalog.body, catalog.url);
  if (links.length !== 34) throw new Error(`Expected 34 AoN mysteries, found ${links.length}.`);
  const owners: OwnerRecord[] = [];
  for (const link of links) {
    const ownerSlug = slug(link.name);
    const rawPath = path.join(projectRoot, "data", "raw", "entities", `mystery.${ownerSlug}`, "aon.html");
    owners.push(parseMystery(await fetchPage(link.url, rawPath), rawPath));
  }
  return ingestOwnerRecords("mystery", catalog, owners);
}


export async function ingestPatronSpellLists() {
  await assertAonAllowsOwners();
  const rawPath = path.join(
    projectRoot,
    "data",
    "raw",
    "catalogs",
    "spell-list-owners",
    "patrons-aon.html",
  );
  const catalog = await fetchPage("https://www.aonprd.com/WitchPatrons.aspx", rawPath);
  const owners = parsePatrons(catalog, rawPath);
  if (owners.length !== 52) throw new Error(`Expected 52 AoN patrons, found ${owners.length}.`);
  return ingestOwnerRecords("patron", catalog, owners);
}


const command = process.argv[2];
const operation = command === "mysteries"
  ? ingestMysterySpellLists
  : command === "patrons"
    ? ingestPatronSpellLists
    : null;
if (!operation) throw new Error(`Unknown owner-list command: ${command ?? "<missing>"}`);
operation()
  .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
