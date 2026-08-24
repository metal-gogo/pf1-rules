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
  ["tapestry’s embrace*", "Call the Void"],
]);

const reviewedOwnerSpellIds = new Map<string, string[]>([
  ["flesh to stone", ["spell.flesh-to-stone"]],
  ["bless water/curse water", ["spell.bless-water", "spell.curse-water"]],
  ["elemental body iii (water only)", ["spell.elemental-body-iii"]],
  ["elemental body iv (water only)", ["spell.elemental-body-iv"]],
  ["resist energy (cold only)", ["spell.resist-energy"]],
  ["globe of invulnerability (greater)", ["spell.globe-of-invulnerability"]],
  ["elemental touch (cold only)", ["spell.elemental-touch"]],
  ["elemental aura (cold only)", ["spell.elemental-aura"]],
  ["summon monster v (ice elementals only)", ["spell.summon-monster-5"]],
  ["repel metal and stone", ["spell.repel-metal-or-stone"]],
  ["slipsream", ["spell.slipstream"]],
  ["meteor swarm (dealing cold damage)", ["spell.meteor-swarm"]],
  ["summon monster viii (elementals only)", ["spell.summon-monster-8"]],
  ["planar binding (devils and creatures with the fiendish template only)", ["spell.planar-binding"]],
  ["transmute rock to mud", ["spell.transmute-rock-to-mud"]],
  ["transmute mud to rock", ["spell.transmute-mud-to-rock"]],
  ["stone to flesh", ["spell.stone-to-flesh"]],
  ["fire shield (warm shield)", ["spell.fire-shield"]],
  ["fire shield (warm only)", ["spell.fire-shield"]],
  ["giant vermin (scorpions only)", ["spell.giant-vermin"]],
  ["vermin shap ii", ["spell.vermin-shape-ii"]],
  ["summon monster iii (reptiles only)", ["spell.summon-monster-3"]],
  ["summon monster vii (reptiles only)", ["spell.summon-monster-7"]],
  ["shield of dawn", ["spell.shield-of-the-dawnflower"]],
  ["call lightning storm (dealing fire damage, damage increased outdoors at night)", ["spell.call-lightning-storm"]],
  ["summon monster ix (evil spell only)", ["spell.summon-monster-9"]],
  ["summon monster ix (law spell only)", ["spell.summon-monster-9"]],
  ["summon monster ix (chaos spell only)", ["spell.summon-monster-9"]],
  ["summon monster ix (good spell only)", ["spell.summon-monster-9"]],
  ["align weapon (law only)", ["spell.align-weapon"]],
  ["align weapon (chaos only)", ["spell.align-weapon"]],
  ["align weapon (evil only)", ["spell.align-weapon"]],
  ["align weapon (good only)", ["spell.align-weapon"]],
  ["align weapon (chaos or evil only)", ["spell.align-weapon"]],
  ["blindness/deafness (only to cause blindness)", ["spell.blindness-deafness"]],
  ["elemental body iv (earth only)", ["spell.elemental-body-iv"]],
  ["elemental body iv (air only)", ["spell.elemental-body-iv"]],
  ["elemental body iv (fire only)", ["spell.elemental-body-iv"]],
  ["elemental swarm (earth spell only)", ["spell.elemental-swarm"]],
  ["elemental swarm (water spell only)", ["spell.elemental-swarm"]],
  ["elemental swarm (fire spell only)", ["spell.elemental-swarm"]],
  ["elemental swarm (air spell only)", ["spell.elemental-swarm"]],
  ["summon monster v (summons 1d3 shadows)", ["spell.summon-monster-5"]],
  ["shapechange.*only reptiles", ["spell.shapechange"]],
  ["summon nature's ally iv (animals only)", ["spell.summon-natures-ally-4"]],
  ["summon nature’s ally iv (animals only)", ["spell.summon-natures-ally-4"]],
  ["summon nature's ally viii (animals only)", ["spell.summon-natures-ally-8"]],
  ["summon nature’s ally viii (animals only)", ["spell.summon-natures-ally-8"]],
  ["beast shape iii (animals only)", ["spell.beast-shape-iii"]],
  ["beast shape i (animals only)", ["spell.beast-shape-i"]],
  ["creeping doom (takes the form of diminutive-sized reptiles)", ["spell.creeping-doom"]],
  ["planar ally (azata only)", ["spell.planar-ally"]],
  ["planar ally (psychopomps only)", ["spell.planar-ally"]],
  ["planar ally (archon only)", ["spell.planar-ally"]],
  ["planar ally (agathions only)", ["spell.planar-ally"]],
  ["planar binding (demons only)", ["spell.planar-binding"]],
  ["planar binding (devils only)", ["spell.planar-binding"]],
  ["planar binding (proteans only)", ["spell.planar-binding"]],
  ["planar binding (daemons only)", ["spell.planar-binding"]],
  ["planar binding (aeons only)", ["spell.planar-binding"]],
  ["planar binding (inevitables only)", ["spell.planar-binding"]],
  ["paragon surge (pathfinder rpg advanced race guide 48; always matches your actual race)", ["spell.paragon-surge"]],
  ["flame blade (deals electricity damage and gains the electricity descriptor instead of fire)", ["spell.flame-blade"]],
  ["summon nature’s ally viii (1d3 goliath stag beetles; pathfinder rpg bestiary 2 44)", ["spell.summon-natures-ally-8"]],
  ["protection from chaos/evil/good/law", [
    "spell.protection-from-chaos",
    "spell.protection-from-evil",
    "spell.protection-from-good",
    "spell.protection-from-law",
  ]],
  ["antilife shield", ["spell.antilife-shell"]],
  ["summon nature’s ally iv (deinonychus or pteranodon only)", ["spell.summon-natures-ally-4"]],
  ["summon nature’s ally vii (brachiosaurus or tyrannosaurus only)", ["spell.summon-natures-ally-7"]],
]);

const reviewedUnavailableOwnerSpells = new Set(["lightning rod (?)"]);

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
  accessBasis?: "printed" | "derived";
  derivation?: ValidatedJson;
}

interface OwnerRecord {
  entityId: string;
  entityType: "domain" | "subdomain" | "mystery" | "patron" | "spirit" | "bloodline" | "magic_school";
  listId: string;
  listKind: "domain" | "subdomain" | "mystery" | "patron" | "spirit" | "bloodline" | "elemental_school";
  name: string;
  listName: string;
  membershipName?: string;
  legacyListId?: string;
  className: "Cleric" | "Oracle" | "Witch" | "Shaman" | "Sorcerer" | "Bloodrager" | "Wizard";
  definitionType: string;
  sectionHeading: string;
  sourceUrl: string;
  sourceBook: string | null;
  scope?: "core" | "later_first_party";
  definitionRaw: string;
  sectionBodyRaw?: string;
  parentList?: { entityId: string; listId: string; name: string; raw: string };
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
    /^\s*disallow\s*:\s*\/(?:OracleMysteries|MysteryDisplay|WitchPatrons|ShamanSpirits|ShamanSpiritDisplay|SorcererBloodlines|BloodlineDisplay|BloodragerBloodlines|BloodragerBloodlineDisplay|ClericDomains|DomainDisplay)\.aspx/i.test(line),
  );
  if (disallowed) throw new Error("AoN robots.txt disallows spell-list owner capture.");
}


async function assertD20AllowsElementalSchools(): Promise<void> {
  const targetPath = "/classes/core-classes/wizard/arcane-schools/paizo-arcane-schools/elemental-arcane-schools/";
  const response = await fetch("https://www.d20pfsrd.com/robots.txt", {
    headers: { accept: "text/plain", "user-agent": userAgent },
    signal: AbortSignal.timeout(45_000),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Cannot verify d20PFSRD robots policy: HTTP ${response.status}`);
  let applies = false;
  const rules: Array<{ allow: boolean; path: string }> = [];
  for (const rawLine of (await response.text()).split(/\r?\n/)) {
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
  if (match && !match.allow) throw new Error(`robots.txt disallows https://www.d20pfsrd.com${targetPath}`);
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


function spiritLinks(html: string, baseUrl: string): Array<{ name: string; url: string }> {
  const doc = cheerio.load(html);
  const values = new Map<string, { name: string; url: string }>();
  doc('a[href*="ShamanSpiritDisplay.aspx?ItemName="]').each((_index, element) => {
    const name = cleanText(doc(element).text());
    const href = doc(element).attr("href");
    if (!name || !href) return;
    values.set(slug(name), { name, url: new URL(href, baseUrl).toString() });
  });
  return [...values.values()].sort((left, right) => left.name.localeCompare(right.name));
}


function bloodlineLinks(
  html: string,
  baseUrl: string,
  displayPage: "BloodlineDisplay.aspx" | "BloodragerBloodlineDisplay.aspx",
): Array<{ name: string; url: string }> {
  const doc = cheerio.load(html);
  const values = new Map<string, { name: string; url: string }>();
  doc(`a[href*="${displayPage}?ItemName="]`).each((_index, element) => {
    const name = cleanText(doc(element).text());
    const href = doc(element).attr("href");
    if (!name || !href) return;
    values.set(slug(name), { name, url: new URL(href, baseUrl).toString() });
  });
  return [...values.values()].sort((left, right) => left.name.localeCompare(right.name));
}


function domainLinks(html: string, baseUrl: string): Array<{ name: string; url: string }> {
  const doc = cheerio.load(html);
  const values = new Map<string, { name: string; url: string }>();
  doc('a[href*="DomainDisplay.aspx?ItemName="]').each((_index, element) => {
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
  const normalized = output.clone();
  normalized.find("sup").remove();
  const definitionRaw = cleanText(normalized.text());
  const bonusMatch = /Bonus Spells:\s*(.*?)\s*Revelations:/i.exec(definitionRaw);
  if (!bonusMatch?.[1]) throw new Error(`${name} lacks a bounded Bonus Spells section.`);
  const spells: OwnerSpell[] = [];
  const entryPattern = /(?:^|,\s*)(.+?)\s*\((\d+)(?:st|nd|rd|th)\)(?=,|\.|Spells marked|$)/gi;
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


function parseSpirit(capture: Capture, rawPath: string): OwnerRecord {
  const doc = cheerio.load(capture.body);
  const output = doc('span[id^="MainContent_DataListTypes_LabelName_"]').first();
  if (output.length !== 1) throw new Error(`AoN spirit detail block missing at ${capture.url}`);
  const heading = cleanText(output.find("h1.title").first().text());
  const baseName = heading
    .replace(/^PFS (?:Legal|Limited|Restricted)\s+/i, "")
    .replace(/\s+Spirit$/i, "")
    .trim();
  const definitionRaw = cleanText(output.text());
  const spellMatch = /Spirit Magic Spells:\s*(.*?)\s*Hexes:/i.exec(definitionRaw);
  if (!spellMatch?.[1]) throw new Error(`${baseName} lacks a bounded Spirit Magic Spells section.`);
  const spells: OwnerSpell[] = [];
  const entryPattern = /(?:^|,\s*)(.+?)\s*\((\d+)(?:st|nd|rd|th)\)(?=,|\.|$)/gi;
  for (const match of spellMatch[1].matchAll(entryPattern)) {
    const spellLevel = Number(match[2]);
    if (spellLevel < 1 || spellLevel > 9) {
      throw new Error(`${baseName} has unexpected spirit spell level ${spellLevel}.`);
    }
    spells.push({
      spellName: cleanText(match[1]!),
      spellLevel,
      raw: cleanText(match[0]!.replace(/^,\s*/, "")),
    });
  }
  if (spells.length !== 9) {
    throw new Error(`${baseName} parsed ${spells.length} spirit spells instead of 9: ${spellMatch[1]}`);
  }
  const sourceBook = cleanText(output.find('a[href*="paizo.com"]').first().text()) || null;
  const ownerSlug = slug(baseName);
  return {
    entityId: `spirit.${ownerSlug}`,
    entityType: "spirit",
    listId: `spell-list.${ownerSlug}-spirit`,
    listKind: "spirit",
    name: `${baseName} Spirit`,
    listName: `${baseName} Spirit Magic Spells`,
    className: "Shaman",
    definitionType: "Shaman Spirit",
    sectionHeading: "Spirit Magic Spells",
    sourceUrl: capture.url,
    sourceBook,
    definitionRaw,
    spells,
    capture,
    rawPath,
  };
}


function parseBloodline(
  capture: Capture,
  rawPath: string,
  className: "Sorcerer" | "Bloodrager",
): OwnerRecord {
  const doc = cheerio.load(capture.body);
  const output = doc('span[id^="MainContent_DataListTypes_LabelName_"]').first();
  if (output.length !== 1) throw new Error(`AoN bloodline detail block missing at ${capture.url}`);
  const heading = cleanText(output.find("h1.title").first().text());
  const baseName = heading
    .replace(/^PFS (?:Legal|Limited|Restricted)\s+/i, "")
    .replace(/\s+Bloodline$/i, "")
    .trim();
  const normalized = output.clone();
  normalized.find("sup").remove();
  const definitionRaw = cleanText(normalized.text());
  const endHeading = className === "Sorcerer" ? "Bonus Feats" : "Bloodline Powers";
  const bonusMatch = new RegExp(`Bonus Spells:\\s*(.*?)\\s*${endHeading}:`, "i").exec(definitionRaw);
  if (!bonusMatch?.[1]) throw new Error(`${className} ${baseName} lacks a bounded Bonus Spells section.`);
  const spells: OwnerSpell[] = [];
  const entryPattern = /(?:^|,\s*)(.+?)\s*\((\d+)(?:st|nd|rd|th)\)(?=,|\.|Spells marked|$)/gi;
  for (const match of bonusMatch[1].matchAll(entryPattern)) {
    const gainedLevel = Number(match[2]);
    const spellLevel = className === "Sorcerer" ? (gainedLevel - 1) / 2 : (gainedLevel - 4) / 3;
    const expected = className === "Sorcerer"
      ? gainedLevel >= 3 && gainedLevel <= 19 && gainedLevel % 2 === 1
      : [7, 10, 13, 16].includes(gainedLevel);
    if (!expected || !Number.isInteger(spellLevel)) {
      throw new Error(`${className} ${baseName} has unexpected bonus-spell level ${gainedLevel}.`);
    }
    spells.push({
      spellName: cleanText(match[1]!),
      spellLevel,
      raw: cleanText(match[0]!.replace(/^,\s*/, "")),
    });
  }
  const expectedCount = className === "Sorcerer" ? 9 : 4;
  if (spells.length !== expectedCount) {
    throw new Error(`${className} ${baseName} parsed ${spells.length} bonus spells instead of ${expectedCount}: ${bonusMatch[1]}`);
  }
  const sourceBook = cleanText(output.find('a[href*="paizo.com"]').first().text()) || null;
  const ownerSlug = slug(baseName);
  const classSlug = className.toLocaleLowerCase("en-US");
  return {
    entityId: `bloodline.${classSlug}.${ownerSlug}`,
    entityType: "bloodline",
    listId: `spell-list.${classSlug}-${ownerSlug}-bloodline`,
    ...(className === "Sorcerer" ? { legacyListId: `spell-list.${ownerSlug}-bloodline` } : {}),
    listKind: "bloodline",
    name: `${className} ${baseName} Bloodline`,
    listName: `${className} ${baseName} Bloodline Bonus Spells`,
    className,
    definitionType: `${className} Bloodline`,
    sectionHeading: "Bonus Spells",
    sourceUrl: capture.url,
    sourceBook,
    definitionRaw,
    spells,
    capture,
    rawPath,
  };
}


function parseElementalSchool(capture: Capture, rawPath: string, name: string): OwnerRecord {
  const doc = cheerio.load(capture.body);
  doc("script, style, nav, footer").remove();
  const pageText = cleanText(doc("body").text());
  const headings = [`${name} Elementalist Wizard Spells`, `${name} Elementalist Spells`];
  const headingNode = doc(
    'span[id$="_elementalist_spells"], span[id$="_elementalist_wizard_spells"]',
  ).last();
  const listElement = headingNode.length
    ? headingNode.closest("h4").nextAll("p").first()
    : doc("b").filter((_index, element) => headings.includes(cleanText(doc(element).text()))).last().closest("p");
  if (listElement.length !== 1) throw new Error(`${name} lacks a bounded elementalist spell list.`);
  const listHeading = headings.find((heading) => cleanText(listElement.text()).startsWith(heading));
  const listRaw = cleanText(listElement.text())
    .slice(listHeading?.length ?? 0)
    .replace(/^:\s*/, "")
    .replace(/\.$/, "");
  const spells: OwnerSpell[] = [];
  const levelPattern = /(\d+)(?:st|nd|rd|th)?\s*[—-]\s*(.*?)(?=\s*\d+(?:st|nd|rd|th)?\s*[—-]|$)/gi;
  for (const levelMatch of listRaw.matchAll(levelPattern)) {
    const spellLevel = Number(levelMatch[1]);
    if (spellLevel < 0 || spellLevel > 9) {
      throw new Error(`${name} has unexpected elementalist spell level ${spellLevel}.`);
    }
    for (const spellName of levelMatch[2]!.split(/,\s*/)) {
      const normalizedName = cleanText(spellName);
      if (normalizedName) {
        spells.push({ spellName: normalizedName, spellLevel, raw: `${levelMatch[1]}—${normalizedName}` });
      }
    }
  }
  const levels = new Set(spells.map((spell) => spell.spellLevel));
  if (spells.length < 20 || levels.size !== 10) {
    throw new Error(`${name} parsed ${spells.length} spells across ${levels.size} levels.`);
  }
  const schoolSlug = slug(name);
  const definitionStart = pageText.toLocaleLowerCase("en-US").indexOf(name.toLocaleLowerCase("en-US"));
  const definitionEnd = pageText.indexOf("Section 15", definitionStart);
  return {
    entityId: `magic-school.${schoolSlug}-elemental`,
    entityType: "magic_school",
    listId: `spell-list.${schoolSlug}-elemental-school`,
    listKind: "elemental_school",
    name: `${name} Elemental School`,
    listName: `${name} Elemental School`,
    membershipName: `${name} Elemental School`,
    className: "Wizard",
    definitionType: "Wizard Elemental Arcane School",
    sectionHeading: `${name} Elementalist Spells`,
    sourceUrl: capture.url,
    sourceBook: null,
    scope: "later_first_party",
    definitionRaw: pageText.slice(Math.max(0, definitionStart), definitionEnd < 0 ? undefined : definitionEnd),
    sectionBodyRaw: listRaw,
    spells,
    capture,
    rawPath,
  };
}


interface ParsedSubdomain {
  baseName: string;
  name: string;
  associatedDomains: string[];
  associationRaw: string;
  sourceBook: string | null;
  definitionRaw: string;
  replacements: OwnerSpell[];
  capture: Capture;
  rawPath: string;
}


function parseNumberedDashSpells(raw: string, context: string): OwnerSpell[] {
  const spells: OwnerSpell[] = [];
  const entryPattern = /(\d+)(?:st|nd|rd|th)\s*[—-]\s*(.+?)(?=,\s*\d+(?:st|nd|rd|th)\s*[—-]|\.\s*$)/gi;
  for (const match of raw.matchAll(entryPattern)) {
    const spellLevel = Number(match[1]);
    if (spellLevel < 1 || spellLevel > 9) {
      throw new Error(`${context} has unexpected spell level ${spellLevel}.`);
    }
    spells.push({ spellName: cleanText(match[2]!), spellLevel, raw: cleanText(match[0]!) });
  }
  return spells;
}


function parseDomainPage(capture: Capture, rawPath: string): {
  base: OwnerRecord;
  subdomains: ParsedSubdomain[];
} {
  const doc = cheerio.load(capture.body);
  const output = doc('span[id^="MainContent_DataListTypes_LabelName_"]').first();
  if (output.length !== 1) throw new Error(`AoN domain detail block missing at ${capture.url}`);
  const html = output.html();
  if (!html) throw new Error(`AoN domain detail HTML missing at ${capture.url}`);
  const segments = html.split(/(?=<h2\s+class="title"|<h1\s+class="title">Variant Domain Powers)/i);
  const baseDoc = cheerio.load(`<div>${segments[0] ?? ""}</div>`);
  const baseHeading = cleanText(baseDoc("h1.title").first().text());
  const baseName = baseHeading.replace(/^PFS (?:Legal|Limited|Restricted)\s+/i, "").trim();
  const normalizedBase = baseDoc("div").first().clone();
  normalizedBase.find("sup").remove();
  const baseDefinitionRaw = cleanText(normalizedBase.text());
  const baseSpellMatch = /Domain Spells:\s*(.*?\.)(?:\s|$)/i.exec(baseDefinitionRaw)
    ?? /Domain Spells:\s*(.*?)\s*$/i.exec(baseDefinitionRaw);
  if (!baseSpellMatch?.[1]) throw new Error(`${baseName} lacks a Domain Spells section.`);
  const baseSpells = parseNumberedDashSpells(baseSpellMatch[1], `${baseName} Domain`);
  if (baseSpells.length !== 9) {
    throw new Error(`${baseName} parsed ${baseSpells.length} domain spells instead of 9: ${baseSpellMatch[1]}`);
  }
  const baseSourceBook = cleanText(baseDoc('a[href*="paizo.com"]').first().text()) || null;
  const baseSlug = slug(baseName);
  const base: OwnerRecord = {
    entityId: `domain.${baseSlug}`,
    entityType: "domain",
    listId: `spell-list.${baseSlug}-domain`,
    listKind: "domain",
    name: `${baseName} Domain`,
    listName: `${baseName} Domain Spells`,
    className: "Cleric",
    definitionType: "Cleric/Inquisitor Domain",
    sectionHeading: "Domain Spells",
    sourceUrl: capture.url,
    sourceBook: baseSourceBook,
    scope: /Core Rulebook/i.test(baseSourceBook ?? "") ? "core" : "later_first_party",
    definitionRaw: baseDefinitionRaw,
    spells: baseSpells,
    capture,
    rawPath,
  };

  const subdomains: ParsedSubdomain[] = [];
  for (const segment of segments.slice(1)) {
    const subDoc = cheerio.load(`<div>${segment}</div>`);
    const heading = cleanText(subDoc("h2.title").first().text());
    if (!/\s+Subdomain$/i.test(heading)) continue;
    const name = heading
      .replace(/^PFS (?:Legal|Limited|Restricted)\s+/i, "")
      .replace(/\s+Subdomain$/i, "")
      .trim();
    if (!name) continue;
    const normalized = subDoc("div").first().clone();
    normalized.find("sup").remove();
    const definitionRaw = cleanText(normalized.text());
    const associationMatch = /Associated Domain\(s\):\s*(.*?)\s*Associated Deities:/i.exec(definitionRaw);
    if (!associationMatch?.[1]) throw new Error(`${name} lacks Associated Domain(s) on ${capture.url}.`);
    const associatedDomains = associationMatch[1].split(",").map(cleanText).filter(Boolean);
    const replacementMatch = /Replacement Domain Spells:\s*(.*?\.)(?:\s|$)/i.exec(definitionRaw)
      ?? /Replacement Domain Spells:\s*(.*?)\s*$/i.exec(definitionRaw);
    const replacements = replacementMatch?.[1]
      ? parseNumberedDashSpells(replacementMatch[1], `${name} Subdomain`)
      : [];
    const sourceBook = cleanText(subDoc('a[href*="paizo.com"]').first().text()) || null;
    subdomains.push({
      baseName,
      name,
      associatedDomains,
      associationRaw: `Associated Domain(s): ${associationMatch[1]}`,
      sourceBook,
      definitionRaw,
      replacements,
      capture,
      rawPath,
    });
  }
  return { base, subdomains };
}


function sourceObservation(owner: OwnerRecord): ValidatedJson {
  const siteId = owner.sourceUrl.includes("d20pfsrd.com") ? "d20pfsrd" : "aon";
  const observationId = `${siteId}:${owner.entityId}:${owner.capture.content_sha256.slice(0, 8)}`;
  const observationDirectory = path.join(projectRoot, "data", "observations", "entities", owner.entityId);
  return {
    $schema: "../../../../schemas/source-entity-observation.schema.json",
    schema_version: "0.1.0",
    observation_id: observationId,
    entity_type: owner.entityType,
    source: {
      site_id: siteId,
      url: owner.sourceUrl,
      license_url: siteId === "aon"
        ? "https://www.aonprd.com/Licenses.aspx"
        : "https://www.d20pfsrd.com/extras/legal/",
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
      name: `${siteId}-${owner.entityType}-spell-list-adapter`,
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
        body_raw: owner.sectionBodyRaw ?? owner.spells.map((spell) => spell.raw).join(", "),
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
  const sourceName = owner.sourceUrl.includes("d20pfsrd.com")
    ? "d20PFSRD"
    : "Archives of Nethys";
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
  const parentRelationship = owner.parentList ? {
    relationship_id: `${owner.entityId}:inherits_spell_list:${owner.parentList.listId}`,
    type: "inherits_spell_list",
    target: { entity_type: "spell_list", entity_id: owner.parentList.listId, name: owner.parentList.name },
    status: "accepted",
    evidence: [{
      observation_id: observationId,
      source_field: "entity_raw.definition_raw",
      evidence_kind: "plain_text",
      anchor_text_raw: owner.parentList.raw,
      source_href: owner.sourceUrl,
    }],
    note: "The subdomain inherits its associated domain spell list except at explicitly replaced levels.",
  } : null;
  const existingOwner = findEntityLocation(registries, owner.entityId);
  if (existingOwner) {
    existingOwner.entity.entity_type = owner.entityType;
    existingOwner.entity.name = owner.name;
    existingOwner.entity.status = "resolved";
    existingOwner.entity.evidence = [
      ...(existingOwner.entity.evidence ?? []).filter((item: ValidatedJson) => item.observation_id !== observationId),
      ...evidence,
    ];
    existingOwner.entity.notes = [`Definition and complete granted-spell list captured from ${sourceName}.`];
    const relationships = [...(existingOwner.entity.relationships ?? [])];
    const relationshipCandidates = parentRelationship ? [relationship, parentRelationship] : [relationship];
    for (const candidate of relationshipCandidates) {
      const index = relationships.findIndex((item: ValidatedJson) => item.relationship_id === candidate.relationship_id);
      if (index >= 0) relationships[index] = candidate;
      else relationships.push(candidate);
    }
    existingOwner.entity.relationships = relationships;
  } else {
    ownerRegistry.record.entities.push({
      entity_id: owner.entityId,
      entity_type: owner.entityType,
      name: owner.name,
      status: "resolved",
      aliases: [],
      evidence,
      notes: [`Definition and complete granted-spell list captured from ${sourceName}.`],
      relationships: [relationship, parentRelationship].filter(Boolean),
    });
  }

  const existingList = findEntityLocation(registries, owner.listId);
  if (existingList) {
    existingList.entity.name = owner.listName;
    existingList.entity.status = "resolved";
    existingList.entity.evidence = evidence;
    existingList.entity.notes = [`Complete ${owner.definitionType.toLocaleLowerCase("en-US")} spell list captured from its owning ${sourceName} page.`];
  } else {
    ownerRegistry.record.entities.push({
      entity_id: owner.listId,
      entity_type: "spell_list",
      name: owner.listName,
      status: "resolved",
      aliases: [],
      evidence,
      notes: [`Complete ${owner.definitionType.toLocaleLowerCase("en-US")} spell list captured from its owning ${sourceName} page.`],
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
  const sourceName = owner.sourceUrl.includes("d20pfsrd.com") ? "d20PFSRD" : "AoN";
  const existing = canonical.levels.find((level: ValidatedJson) => level.spell_list_id === owner.listId);
  const accessBasis = ownerSpell.accessBasis ?? "printed";
  const exactExisting = existing &&
    existing.list_kind === owner.listKind &&
    existing.list_name === (owner.membershipName ?? owner.name) &&
    existing.level === ownerSpell.spellLevel &&
    existing.raw === ownerSpell.raw &&
    existing.access_basis === accessBasis &&
    JSON.stringify(existing.derivation ?? null) === JSON.stringify(ownerSpell.derivation ?? null);
  if (exactExisting) return "existing";
  const qualifiedClass = canonical.levels.find((level: ValidatedJson) =>
    level.spell_list_id === `spell-list.${owner.className.toLocaleLowerCase("en-US")}` &&
    (level.qualifications ?? []).some((qualification: ValidatedJson) =>
      qualification.kind === owner.entityType && qualification[owner.entityType]?.entity_id === owner.entityId,
    ),
  );
  const legacyMembership = owner.legacyListId
    ? canonical.levels.find((level: ValidatedJson) => level.spell_list_id === owner.legacyListId)
    : null;
  const replaceableMembership = existing ?? qualifiedClass ?? legacyMembership;
  const levelIndex = replaceableMembership
    ? canonical.levels.indexOf(replaceableMembership)
    : canonical.levels.length;
  const oldRelationshipId = replaceableMembership
    ? `${canonical.spell_id}:appears_on_spell_list:${replaceableMembership.spell_list_id}`
    : null;
  const relationshipId = `${canonical.spell_id}:appears_on_spell_list:${owner.listId}`;
  const level = {
    spell_list_id: owner.listId,
    list_kind: owner.listKind,
    list_name: owner.membershipName ?? owner.name,
    level: ownerSpell.spellLevel,
    scope: owner.scope ?? "later_first_party",
    raw: ownerSpell.raw,
    access_basis: accessBasis,
    ...(ownerSpell.derivation ? { derivation: ownerSpell.derivation } : {}),
    qualifications: [],
  };
  if (replaceableMembership) canonical.levels[levelIndex] = level;
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
    note: accessBasis === "derived"
      ? "The effective membership is derived from the owner's printed replacement rule and its associated parent spell list."
      : "The owner page prints the class level when the spell is gained; it is normalized to the corresponding spell level.",
  });
  canonical.normalization.warnings.push({
    code: "OWNER_GRANTED_SPELL_ACCESS",
    field_path: `/levels/${levelIndex}`,
    message: `${owner.name} grants ${canonical.name} as a level ${ownerSpell.spellLevel} ${accessBasis} spell; this is not general ${owner.className} class access.`,
  });

  if (!decision.observation_ids.includes(observationId)) decision.observation_ids.push(observationId);
  decision.field_decisions.push({
    canonical_path: `/levels/${levelIndex}`,
    decision: "normalize",
    selected_evidence: [{ observation_id: observationId, source_field: "entity_raw.sections_raw[0]" }],
    considered_observation_ids: [observationId],
    rationale: accessBasis === "derived"
      ? `The owning ${owner.definitionType.toLocaleLowerCase("en-US")} prints a replacement rule. This effective entry inherits the unchanged level from its associated domain and is marked derived.`
      : `${sourceName} clearly transcribes the owning ${owner.definitionType.toLocaleLowerCase("en-US")}'s printed spell entry. The gained class level is normalized to spell level.`,
  });
  const oldDecision = oldRelationshipId
    ? decision.relationship_decisions.find((candidate: ValidatedJson) => candidate.relationship_id === oldRelationshipId)
    : null;
  const relationshipDecision = {
    relationship_id: relationshipId,
    decision: "accept",
    evidence: [{ observation_id: observationId, source_field: "entity_raw.sections_raw[0]" }],
    considered_observation_ids: [observationId],
    rationale: accessBasis === "derived"
      ? `The owning ${owner.definitionType.toLocaleLowerCase("en-US")} replaces only named domain spell levels; this unchanged level is inherited from the associated domain and marked derived.`
      : `${sourceName} prints the spell on the owning ${owner.definitionType.toLocaleLowerCase("en-US")} page; it is modeled as ${owner.listKind} access rather than general ${owner.className} access.`,
  };
  if (oldDecision) Object.assign(oldDecision, relationshipDecision);
  else decision.relationship_decisions.push(relationshipDecision);
  return replaceableMembership ? "reclassified" : "added";
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
  const unavailable: Array<{ owner: string; spell: string; level: number }> = [];
  const normalizedReferences: Array<{ owner: string; printed: string; canonical: string }> = [];
  const report = {
    owners: new Set(owners.map((owner) => owner.entityId)).size,
    spellLists: owners.length,
    rows: 0,
    added: 0,
    reclassified: 0,
    existing: 0,
    normalizedReferences,
    unavailable,
    unresolved,
  };
  const ownerRecordCounts = new Map<string, number>();
  for (const owner of owners) {
    ownerRecordCounts.set(owner.entityId, (ownerRecordCounts.get(owner.entityId) ?? 0) + 1);
  }

  for (const owner of owners) {
    const observation = sourceObservation(owner);
    const observationId = observation.observation_id;
    const siteId = owner.sourceUrl.includes("d20pfsrd.com") ? "d20pfsrd" : "aon";
    const observationFilename = (ownerRecordCounts.get(owner.entityId) ?? 0) > 1
      ? `${siteId}-${parserVersion}-${owner.capture.content_sha256.slice(0, 8)}.json`
      : `${siteId}-${parserVersion}.json`;
    writeJson(
      path.join(projectRoot, "data", "observations", "entities", owner.entityId, observationFilename),
      observation,
    );
    upsertOwnerEntities(owner, observationId, registries);
    for (const ownerSpell of owner.spells) {
      const referenceKey = ownerSpell.spellName.toLocaleLowerCase("en-US");
      const reviewedName = reviewedOwnerSpellNames.get(referenceKey);
      const reviewedIds = reviewedOwnerSpellIds.get(referenceKey);
      const resolved = reviewedIds
        ? reviewedIds.map((spellId) => available.get(spellId)).filter((record): record is ValidatedJson => Boolean(record))
        : [resolveCanonicalSpellReference(reviewedName ?? ownerSpell.spellName, available)]
          .filter((record): record is ValidatedJson => Boolean(record));
      if (resolved.length === 0 || (reviewedIds && resolved.length !== reviewedIds.length)) {
        const target = reviewedUnavailableOwnerSpells.has(referenceKey) ? unavailable : unresolved;
        target.push({ owner: owner.name, spell: ownerSpell.spellName, level: ownerSpell.spellLevel });
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
    owner_count: new Set(owners.map((owner) => owner.entityId)).size,
    spell_list_count: owners.length,
    canonical_rows: canonicalRows.length,
    rows_by_list: rowsByList,
    normalized_references: normalizedReferences,
    reviewed_unavailable_references: unavailable,
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


export async function ingestSpiritSpellLists() {
  await assertAonAllowsOwners();
  const catalogRawPath = path.join(
    projectRoot,
    "data",
    "raw",
    "catalogs",
    "spell-list-owners",
    "spirits-aon.html",
  );
  const catalog = await fetchPage("https://www.aonprd.com/ShamanSpirits.aspx", catalogRawPath);
  const links = spiritLinks(catalog.body, catalog.url);
  if (links.length !== 17) throw new Error(`Expected 17 AoN spirits, found ${links.length}.`);
  const owners: OwnerRecord[] = [];
  for (const link of links) {
    const ownerSlug = slug(link.name);
    const rawPath = path.join(projectRoot, "data", "raw", "entities", `spirit.${ownerSlug}`, "aon.html");
    owners.push(parseSpirit(await fetchPage(link.url, rawPath), rawPath));
  }
  return ingestOwnerRecords("spirit", catalog, owners);
}


async function ingestBloodlineSpellLists(className: "Sorcerer" | "Bloodrager") {
  await assertAonAllowsOwners();
  const classSlug = className.toLocaleLowerCase("en-US");
  const catalogPage = className === "Sorcerer" ? "SorcererBloodlines.aspx" : "BloodragerBloodlines.aspx";
  const displayPage = className === "Sorcerer" ? "BloodlineDisplay.aspx" : "BloodragerBloodlineDisplay.aspx";
  const expectedOwners = className === "Sorcerer" ? 51 : 24;
  const catalogRawPath = path.join(
    projectRoot,
    "data",
    "raw",
    "catalogs",
    "spell-list-owners",
    `${classSlug}-bloodlines-aon.html`,
  );
  const catalog = await fetchPage(`https://www.aonprd.com/${catalogPage}`, catalogRawPath);
  const links = bloodlineLinks(catalog.body, catalog.url, displayPage);
  if (links.length !== expectedOwners) {
    throw new Error(`Expected ${expectedOwners} AoN ${className} bloodlines, found ${links.length}.`);
  }
  const owners: OwnerRecord[] = [];
  for (const link of links) {
    const ownerSlug = slug(link.name);
    const entityId = `bloodline.${classSlug}.${ownerSlug}`;
    const rawPath = path.join(projectRoot, "data", "raw", "entities", entityId, "aon.html");
    owners.push(parseBloodline(await fetchPage(link.url, rawPath), rawPath, className));
  }
  return ingestOwnerRecords(`${classSlug}-bloodline`, catalog, owners);
}


export const ingestSorcererBloodlineSpellLists = () => ingestBloodlineSpellLists("Sorcerer");
export const ingestBloodragerBloodlineSpellLists = () => ingestBloodlineSpellLists("Bloodrager");


export async function ingestElementalSchoolSpellLists() {
  await assertD20AllowsElementalSchools();
  const baseUrl = "https://www.d20pfsrd.com/classes/core-classes/wizard/arcane-schools/paizo-arcane-schools/elemental-arcane-schools/";
  const catalogRawPath = path.join(
    projectRoot,
    "data",
    "raw",
    "catalogs",
    "spell-list-owners",
    "elemental-schools-d20pfsrd.html",
  );
  const catalog = await fetchPage(baseUrl, catalogRawPath);
  const pages = [
    ["Aether", "aether-elemental-school/"],
    ["Air", "air/"],
    ["Earth", "earth/"],
    ["Fire", "fire/"],
    ["Metal", "metal/"],
    ["Void", "void-elemental-school/"],
    ["Water", "water/"],
    ["Wood", "wood/"],
  ] as const;
  const owners: OwnerRecord[] = [];
  for (const [name, pagePath] of pages) {
    const rawPath = path.join(
      projectRoot,
      "data",
      "raw",
      "entities",
      `magic-school.${slug(name)}-elemental`,
      "d20pfsrd.html",
    );
    const capture = await fetchPage(new URL(pagePath, baseUrl).toString(), rawPath);
    owners.push(parseElementalSchool(capture, rawPath, name));
  }
  return ingestOwnerRecords("elemental-school", catalog, owners);
}


export async function ingestDomainSpellLists() {
  await assertAonAllowsOwners();
  const catalogRawPath = path.join(
    projectRoot,
    "data",
    "raw",
    "catalogs",
    "spell-list-owners",
    "domains-aon.html",
  );
  const catalog = await fetchPage("https://www.aonprd.com/ClericDomains.aspx", catalogRawPath);
  const links = domainLinks(catalog.body, catalog.url);
  if (links.length !== 35) throw new Error(`Expected 35 AoN domains, found ${links.length}.`);
  const parsedPages: Array<ReturnType<typeof parseDomainPage>> = [];
  for (const link of links) {
    const ownerSlug = slug(link.name);
    const rawPath = path.join(projectRoot, "data", "raw", "entities", `domain.${ownerSlug}`, "aon.html");
    parsedPages.push(parseDomainPage(await fetchPage(link.url, rawPath), rawPath));
  }
  const bases = parsedPages.map((page) => page.base);
  const baseByName = new Map(bases.map((base) => [
    base.name.replace(/\s+Domain$/i, "").toLocaleLowerCase("en-US"),
    base,
  ]));
  const subdomainLists = new Map<string, OwnerRecord>();
  for (const specification of parsedPages.flatMap((page) => page.subdomains)) {
    for (const associatedName of specification.associatedDomains) {
      if (specification.baseName.toLocaleLowerCase("en-US") !== associatedName.toLocaleLowerCase("en-US")) {
        continue;
      }
      const parent = baseByName.get(associatedName.toLocaleLowerCase("en-US"));
      if (!parent) {
        throw new Error(`${specification.name} references unknown associated domain ${associatedName}.`);
      }
      const replacementByLevel = new Map<number, OwnerSpell>();
      for (const replacement of specification.replacements) {
        if (replacementByLevel.has(replacement.spellLevel)) {
          throw new Error(`${specification.name} has multiple replacements at level ${replacement.spellLevel}.`);
        }
        replacementByLevel.set(replacement.spellLevel, replacement);
      }
      const parentSlug = slug(associatedName);
      const subdomainSlug = slug(specification.name);
      const multipleParents = specification.associatedDomains.length > 1;
      const listId = multipleParents
        ? `spell-list.${subdomainSlug}-subdomain-from-${parentSlug}`
        : `spell-list.${subdomainSlug}-subdomain`;
      const spells = parent.spells.map((parentSpell) => {
        const replacement = replacementByLevel.get(parentSpell.spellLevel);
        if (replacement) return replacement;
        return {
          spellName: parentSpell.spellName,
          spellLevel: parentSpell.spellLevel,
          raw: `Inherited from ${parent.name}: ${parentSpell.raw}`,
          accessBasis: "derived" as const,
          derivation: {
            rule_owner_entity_id: `subdomain.${subdomainSlug}`,
            rule_scope: /Core Rulebook/i.test(specification.sourceBook ?? "") ? "core" : "later_first_party",
            source_memberships: [{ spell_list_id: parent.listId, level: parentSpell.spellLevel }],
            level_policy: "Inherit the associated domain spell at every level not named by Replacement Domain Spells.",
            source_url: specification.capture.url,
            note: "This effective subdomain membership is derived from the printed replacement rule and the associated domain list.",
          },
        };
      });
      if (spells.length !== 9 || new Set(spells.map((spell) => spell.spellLevel)).size !== 9) {
        throw new Error(`${specification.name} from ${associatedName} did not produce one effective spell at each level.`);
      }
      const entityId = `subdomain.${subdomainSlug}`;
      const owner: OwnerRecord = {
        entityId,
        entityType: "subdomain",
        listId,
        listKind: "subdomain",
        name: `${specification.name} Subdomain`,
        listName: multipleParents
          ? `${specification.name} Subdomain Spells (${associatedName} Domain)`
          : `${specification.name} Subdomain Spells`,
        membershipName: multipleParents
          ? `${specification.name} Subdomain (${associatedName} Domain)`
          : `${specification.name} Subdomain`,
        className: "Cleric",
        definitionType: "Cleric/Inquisitor Subdomain",
        sectionHeading: specification.replacements.length > 0
          ? "Replacement Domain Spells"
          : "Associated Domain(s)",
        sectionBodyRaw: specification.replacements.length > 0
          ? specification.replacements.map((spell) => spell.raw).join(", ")
          : specification.associationRaw,
        parentList: {
          entityId: parent.entityId,
          listId: parent.listId,
          name: parent.listName,
          raw: specification.associationRaw,
        },
        sourceUrl: specification.capture.url,
        sourceBook: specification.sourceBook,
        scope: /Core Rulebook/i.test(specification.sourceBook ?? "") ? "core" : "later_first_party",
        definitionRaw: specification.definitionRaw,
        spells,
        capture: specification.capture,
        rawPath: specification.rawPath,
      };
      const key = `${entityId}:${listId}`;
      const existing = subdomainLists.get(key);
      if (existing && JSON.stringify(existing.spells) !== JSON.stringify(owner.spells)) {
        throw new Error(`Conflicting duplicate subdomain definition for ${key}.`);
      }
      subdomainLists.set(key, owner);
    }
  }
  const missingAssociatedLists = parsedPages.flatMap((page) => page.subdomains).flatMap((specification) =>
    specification.associatedDomains.flatMap((associatedName) => {
      const listId = specification.associatedDomains.length > 1
        ? `spell-list.${slug(specification.name)}-subdomain-from-${slug(associatedName)}`
        : `spell-list.${slug(specification.name)}-subdomain`;
      return subdomainLists.has(`subdomain.${slug(specification.name)}:${listId}`)
        ? []
        : [`${specification.name} from ${associatedName}`];
    }),
  );
  if (missingAssociatedLists.length > 0) {
    throw new Error(`Subdomain pages are missing associated-parent definitions: ${[...new Set(missingAssociatedLists)].join(", ")}`);
  }
  const uniqueSubdomains = new Set([...subdomainLists.values()].map((owner) => owner.entityId));
  if (uniqueSubdomains.size !== 136 || subdomainLists.size !== 150) {
    throw new Error(`Expected 136 subdomains and 150 effective subdomain lists; found ${uniqueSubdomains.size} and ${subdomainLists.size}.`);
  }
  const report = ingestOwnerRecords("domain", catalog, [...bases, ...subdomainLists.values()]);
  if (report.rows !== 1668) throw new Error(`Expected 1,668 domain/subdomain memberships, found ${report.rows}.`);
  return report;
}


const command = process.argv[2];
const operation = command === "mysteries"
  ? ingestMysterySpellLists
  : command === "patrons"
    ? ingestPatronSpellLists
    : command === "spirits"
      ? ingestSpiritSpellLists
    : command === "sorcerer-bloodlines"
      ? ingestSorcererBloodlineSpellLists
    : command === "bloodrager-bloodlines"
      ? ingestBloodragerBloodlineSpellLists
    : command === "domains"
      ? ingestDomainSpellLists
    : command === "elemental-schools"
      ? ingestElementalSchoolSpellLists
    : null;
if (!operation) throw new Error(`Unknown owner-list command: ${command ?? "<missing>"}`);
operation()
  .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
