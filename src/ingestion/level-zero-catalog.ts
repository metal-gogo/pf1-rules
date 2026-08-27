import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import { artifactHash, writeCapturedArtifact } from "./artifact-store.js";
import { legacy35CanonicalizationEnabled } from "./scope-policy.js";


const parserVersion = "0.1.0";
const userAgent = "PF1RulesPrivateResearch/0.1 (local archival experiment)";
const requestIntervalMs = 1_000;
const batchSize = 10;

const classNames = [
  "Adept", "Alchemist", "Antipaladin", "Arcanist", "Bard", "Bloodrager",
  "Cleric", "Druid", "Hunter", "Inquisitor", "Investigator", "Magus",
  "Medium", "Mesmerist", "Occultist", "Oracle", "Paladin", "Psychic",
  "Ranger", "Red Mantis Assassin", "Sahir-Afiyun", "Shaman", "Skald",
  "Sorcerer", "Spiritualist", "Summoner", "Summoner (Unchained)",
  "Warpriest", "Witch", "Wizard",
] as const;

interface CatalogEntry {
  name: string;
  summaryRaw: string;
  flags: string[];
  pfsLegal: boolean;
  legacy35Material: boolean;
}

interface CatalogMembership {
  spell_list_id: string;
  list_name: string;
  level: number;
  catalog_source_url: string;
  summary_raw: string;
  flags: string[];
  pfs_legal: boolean;
  legacy_3_5_material: boolean;
}


function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}


function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}


function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return named[entity.toLocaleLowerCase("en-US")] ?? whole;
  });
}


function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}


function classUrl(className: string): string {
  const url = new URL("https://www.aonprd.com/Spells.aspx");
  url.searchParams.set("Class", className.replaceAll(" ", ""));
  if (className === "Summoner (Unchained)") url.searchParams.set("Class", className);
  return url.toString();
}


function spellUrl(name: string): string {
  const url = new URL("https://www.aonprd.com/SpellDisplay.aspx");
  url.searchParams.set("ItemName", name);
  return url.toString();
}


function levelHeading(level: number): string {
  if (level === 0) return "0-Level";
  const suffix = level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th";
  return `${level}${suffix}-Level`;
}


function parseLevelEntries(html: string, sourceUrl: string, level: number): CatalogEntry[] {
  const heading = new RegExp(
    `<h2\\s+class="title">\\s*${levelHeading(level)}\\s*<\\/h2>`,
    "i",
  ).exec(html);
  if (!heading || heading.index === undefined) return [];
  const remaining = html.slice(heading.index + heading[0].length);
  const nextHeading = /<h2\s+class="title">/i.exec(remaining);
  const section = remaining.slice(0, nextHeading?.index ?? remaining.length);
  const entries: CatalogEntry[] = [];
  for (const segment of section.split(/<br\s*\/?>/i)) {
    const hrefMatch = /href="(SpellDisplay\.aspx\?ItemName=[^"]+)"/i.exec(segment);
    if (!hrefMatch?.[1]) continue;
    const href = decodeHtml(hrefMatch[1]);
    const name = new URL(href, sourceUrl).searchParams.get("ItemName");
    if (!name) throw new Error(`Level-${level} entry has no ItemName on ${sourceUrl}: ${href}`);
    const flags = [...segment.matchAll(/<sup>([FMRTY])<\/sup>/gi)]
      .map((match) => match[1]?.toLocaleUpperCase("en-US"))
      .filter((flag): flag is string => Boolean(flag));
    const summarySeparator = segment.lastIndexOf("</b>:");
    entries.push({
      name,
      summaryRaw: summarySeparator >= 0
        ? stripHtml(segment.slice(summarySeparator + "</b>:".length))
        : "",
      flags: [...new Set(flags)].sort(),
      pfsLegal: /PathfinderSocietySymbol/i.test(segment),
      legacy35Material: /ThreeFiveSymbol/i.test(segment),
    });
  }
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length) {
    throw new Error(`Duplicate level-${level} entries found on ${sourceUrl}`);
  }
  return entries;
}


async function fetchText(url: string): Promise<{
  body: string;
  contentType: string;
  retrievedAt: string;
  status: number;
}> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": userAgent,
    },
    redirect: "follow",
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`AoN catalog request failed (${response.status}) for ${url}`);
  }
  return {
    body,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    retrievedAt: new Date().toISOString(),
    status: response.status,
  };
}


async function assertCatalogAllowedByRobots(): Promise<void> {
  const robotsUrl = "https://www.aonprd.com/robots.txt";
  const response = await fetch(robotsUrl, { headers: { "user-agent": userAgent } });
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`Cannot verify AoN robots policy (${response.status}) at ${robotsUrl}`);
  }
  const lines = (await response.text())
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  let applies = false;
  const rules: Array<{ allow: boolean; path: string }> = [];
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLocaleLowerCase("en-US");
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      applies = value === "*" || userAgent.toLocaleLowerCase("en-US").startsWith(
        value.toLocaleLowerCase("en-US"),
      );
      continue;
    }
    if (applies && (field === "allow" || field === "disallow") && value) {
      rules.push({ allow: field === "allow", path: value });
    }
  }
  const targetPath = "/Spells.aspx";
  const matching = rules
    .filter((rule) => targetPath.startsWith(rule.path.replace(/\*.*$/, "")))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow));
  if (matching[0] && !matching[0].allow) {
    throw new Error(`AoN robots policy disallows catalog capture at ${targetPath}`);
  }
}


export async function captureSpellLevelCatalog(level: number): Promise<Record<string, unknown>> {
  if (!Number.isInteger(level) || level < 0 || level > 9) {
    throw new Error("Spell level must be an integer from 0 through 9.");
  }
  const generatedAt = new Date().toISOString();
  const captureId = generatedAt.replaceAll(/[-:.]/g, "");
  const rawDirectory = path.join(projectRoot, "data", "raw", "catalogs", captureId);
  const manifestDirectory = path.join(projectRoot, "data", "ingestion");
  const manifestPath = path.join(manifestDirectory, `level-${level}-spells.json`);
  if (fs.existsSync(manifestPath)) {
    throw new Error(`Refusing to overwrite ${manifestPath}; archive it before a new capture.`);
  }
  fs.mkdirSync(manifestDirectory, { recursive: true });

  await assertCatalogAllowedByRobots();
  await sleep(requestIntervalMs);

  const catalogPages: Record<string, unknown>[] = [];
  const membershipsByName = new Map<string, CatalogMembership[]>();
  for (const [index, className] of classNames.entries()) {
    if (index > 0) await sleep(requestIntervalMs);
    const sourceUrl = classUrl(className);
    const response = await fetchText(sourceUrl);
    const rawPath = path.join(rawDirectory, `${slug(className)}.html`);
    const contentHash = artifactHash(response.body);
    writeCapturedArtifact(rawPath, response.body, {
      url: sourceUrl,
      retrieved_at: response.retrievedAt,
      http_status: response.status,
      content_sha256: contentHash,
      response_content_type: response.contentType,
    });
    const entries = parseLevelEntries(response.body, sourceUrl, level);
    const spellListId = `spell-list.${slug(className)}`;
    catalogPages.push({
      spell_list_id: spellListId,
      list_name: className,
      source_url: sourceUrl,
      retrieved_at: response.retrievedAt,
      http_status: response.status,
      content_sha256: contentHash,
      raw_artifact_path: path.relative(manifestDirectory, rawPath).replaceAll("\\", "/"),
      response_content_type: response.contentType,
      level_entry_count: entries.length,
    });
    for (const entry of entries) {
      const memberships = membershipsByName.get(entry.name) ?? [];
      memberships.push({
        spell_list_id: spellListId,
        list_name: className,
        level,
        catalog_source_url: sourceUrl,
        summary_raw: entry.summaryRaw,
        flags: entry.flags,
        pfs_legal: entry.pfsLegal,
        legacy_3_5_material: entry.legacy35Material,
      });
      membershipsByName.set(entry.name, memberships);
    }
  }

  const names = [...membershipsByName.keys()].sort((left, right) =>
    left.localeCompare(right, "en-US", { sensitivity: "base" }),
  );
  const ids = new Set<string>();
  const spells = names.map((name, index) => {
    const spellId = `spell.${slug(name)}`;
    if (ids.has(spellId)) throw new Error(`Entity ID collision for ${name}: ${spellId}`);
    ids.add(spellId);
    const catalogMemberships = membershipsByName.get(name)?.sort((left, right) =>
      left.list_name.localeCompare(right.list_name, "en-US"),
    ) ?? [];
    const issue = !legacy35CanonicalizationEnabled &&
      catalogMemberships.some((membership) => membership.legacy_3_5_material)
      ? {
          kind: "scope",
          code: "legacy-3.5-out-of-scope",
          message:
            "AoN marks this entry as 3.5 material. Accepted policy excludes it from PF1 " +
            "canonicalization unless an official PF1 conversion is found or legacy " +
            "first-party 3.5 material is deliberately enabled.",
        }
      : undefined;
    return {
      spell_id: spellId,
      name,
      source_url: spellUrl(name),
      batch: Math.floor(index / batchSize) + 1,
      priority: index + 1,
      catalog_memberships: catalogMemberships,
      ...(issue ? { issue } : {}),
    };
  });
  const manifest = {
    $schema: "../../schemas/spell-ingestion-manifest.schema.json",
    schema_version: "0.1.0",
    manifest_id: `aon-level-${level}-${generatedAt.slice(0, 10)}`,
    generated_at: generatedAt,
    level,
    batch_size: batchSize,
    source: {
      site_id: "aon",
      catalog_root_url: "https://www.aonprd.com/Spells.aspx?Class=All",
      license_url: "https://www.aonprd.com/Licenses.aspx",
      first_party_status: "confirmed",
    },
    parser: { name: `aon-level-${level}-class-catalog`, version: parserVersion },
    catalog_pages: catalogPages,
    discovered_dependencies: [],
    spells,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return {
    manifestPath,
    rawDirectory,
    catalogPages: catalogPages.length,
    spells: spells.length,
    batches: Math.ceil(spells.length / batchSize),
  };
}


export function captureLevelZeroCatalog(): Promise<Record<string, unknown>> {
  return captureSpellLevelCatalog(0);
}


if (import.meta.url === `file://${process.argv[1]}`) {
  captureSpellLevelCatalog(Number(process.argv[2] ?? "0"))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
