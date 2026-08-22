import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import { resolveCanonicalSpellReference } from "../ingestion/normalize-level-zero.js";


interface FoundrySpell {
  name: string;
  filename: string;
  classes: Record<string, number>;
  sources: Array<{ id: string; pages: string | null }>;
}

const reviewedFoundrySpellIds = new Map<string, string>([
  ["Ablative Sphere", "spell.ablative-sphere-garundi"],
  ["Burning Arc", "spell.burning-arc-keleshite"],
  ["Call Spirit", "spell.call-spirit"],
  ["Companion Transposition", "spell.companion-transportation"],
  ["Flesh to Stone", "spell.flesh-to-stone"],
  ["Fleshwarping Swarm", "spell.fleshwarping-swarm-drow"],
  ["Malediction (APG)", "spell.malediction-hero-points"],
  ["Phantasmal Asphyxiation", "spell.phantasmal-asphixiation"],
  ["Snow Shape", "spell.snow-shape-ulfen"],
  ["Spirit Call", "spell.spirit-call"],
  ["Stone to Flesh", "spell.stone-to-flesh"],
  ["Summon Totem Creature", "spell.summon-totem-creature-shoanti"],
  ["Transmute Mud to Rock", "spell.transmute-mud-to-rock"],
  ["Transmute Rock to Mud", "spell.transmute-rock-to-mud"],
]);


function directJsonFiles(directory: string): string[] {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(directory, name))
    .sort();
}


function yamlScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed) as string;
  }
  return trimmed;
}


function parseFoundrySpell(filename: string): FoundrySpell {
  const lines = fs.readFileSync(filename, "utf8").split(/\r?\n/);
  if (!lines.includes("type: spell")) throw new Error(`${filename} is not a spell record.`);
  const nameLine = lines.find((line) => line.startsWith("name: "));
  if (!nameLine) throw new Error(`${filename} lacks a top-level name.`);
  const learnedAtIndex = lines.findIndex((line) => line === "  learnedAt:");
  const classes: Record<string, number> = {};
  if (learnedAtIndex >= 0 && lines[learnedAtIndex + 1] === "    class:") {
    for (const line of lines.slice(learnedAtIndex + 2)) {
      const match = /^      ([A-Za-z][A-Za-z0-9]*):\s+([0-9])$/.exec(line);
      if (!match?.[1] || match[2] === undefined) break;
      classes[match[1]] = Number(match[2]);
    }
  }
  const sources: Array<{ id: string; pages: string | null }> = [];
  const sourcesIndex = lines.findIndex((line) => line === "  sources:");
  if (sourcesIndex >= 0) {
    for (let index = sourcesIndex + 1; index < lines.length; index += 1) {
      const idMatch = /^    - id:\s+(\S+)$/.exec(lines[index] ?? "");
      if (!idMatch?.[1]) break;
      const pagesMatch = /^      pages:\s+(.+)$/.exec(lines[index + 1] ?? "");
      sources.push({ id: idMatch[1], pages: pagesMatch?.[1] ? yamlScalar(pagesMatch[1]) : null });
      if (pagesMatch) index += 1;
    }
  }
  return { name: yamlScalar(nameLine.slice("name: ".length)), filename, classes, sources };
}


function walkYaml(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkYaml(filename);
    if (!entry.name.endsWith(".yaml")) return [];
    return fs.readFileSync(filename, "utf8").split(/\r?\n/).includes("type: spell") ? [filename] : [];
  }).sort();
}


function spellListId(foundryClass: string): string {
  if (foundryClass === "summonerUnchained") return "spell-list.summoner-unchained";
  return `spell-list.${foundryClass.toLocaleLowerCase("en-US")}`;
}


export function auditFoundryMemberships(foundryRoot: string) {
  const spellsDirectory = path.join(foundryRoot, "packs", "spells");
  if (!fs.existsSync(spellsDirectory)) {
    throw new Error(`Foundry spell directory does not exist: ${spellsDirectory}`);
  }
  const canonical = new Map(directJsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) => {
    const record = JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
    return [record.spell_id, record] as const;
  }));
  const unmapped: Array<{ name: string; filename: string }> = [];
  const missing: ValidatedJson[] = [];
  const competing: ValidatedJson[] = [];
  const foundryCommit = execFileSync("git", ["-C", foundryRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  let memberships = 0;
  const foundrySpells = walkYaml(spellsDirectory).map(parseFoundrySpell);
  for (const foundry of foundrySpells) {
    const reviewedId = reviewedFoundrySpellIds.get(foundry.name);
    const record = reviewedId
      ? canonical.get(reviewedId) ?? null
      : resolveCanonicalSpellReference(foundry.name, canonical);
    if (!record) {
      unmapped.push({ name: foundry.name, filename: foundry.filename });
      continue;
    }
    for (const [foundryClass, level] of Object.entries(foundry.classes)) {
      memberships += 1;
      const listId = spellListId(foundryClass);
      if (record.levels.some((item: ValidatedJson) =>
        item.spell_list_id === listId && item.level === level,
      )) continue;
      const item = {
        spell_id: record.spell_id,
        spell_name: record.name,
        foundry_class: foundryClass,
        spell_list_id: listId,
        foundry_level: level,
        canonical_levels: record.levels
          .filter((candidate: ValidatedJson) => candidate.spell_list_id === listId)
          .map((candidate: ValidatedJson) => ({
            level: candidate.level,
            access_basis: candidate.access_basis ?? "printed",
            raw: candidate.raw,
          })),
        foundry_path: path.relative(foundryRoot, foundry.filename).replaceAll("\\", "/"),
        foundry_url: `https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/${foundryCommit}/${path.relative(foundryRoot, foundry.filename).replaceAll("\\", "/")}`,
        foundry_sources: foundry.sources,
        aon_url: `https://www.aonprd.com/SpellDisplay.aspx?ItemName=${encodeURIComponent(record.name)}`,
      };
      if (item.canonical_levels.length > 0) competing.push(item);
      else missing.push(item);
    }
  }
  return {
    foundry_commit: foundryCommit,
    foundry_repository: "https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1",
    foundry_spell_count: foundrySpells.length,
    foundry_class_membership_count: memberships,
    mapped_spell_count: foundrySpells.length - unmapped.length,
    unmapped,
    missing_memberships: missing,
    competing_levels: competing,
  };
}


const foundryRoot = process.argv[2];
if (!foundryRoot) throw new Error("Usage: pnpm audit:foundry-memberships /path/to/foundryvtt-pathfinder1");
const report = auditFoundryMemberships(path.resolve(foundryRoot));
const outputPath = process.argv[3];
if (outputPath) {
  const resolvedOutput = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
