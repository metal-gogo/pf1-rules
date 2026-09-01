import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as cheerio from "cheerio";

import { projectRoot } from "../config.js";
import { resolveArtifactPath } from "./artifact-store.js";
import { slug } from "./spell-page-parser.js";

type Json = Record<string, unknown>;

function jsonFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory()
      ? jsonFiles(filename)
      : entry.isFile() && filename.endsWith(".json") ? [filename] : [];
  });
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalSpellIds(): Set<string> {
  return new Set(jsonFiles(path.join(projectRoot, "data", "canonical")).map((filename) =>
    String((JSON.parse(fs.readFileSync(filename, "utf8")) as Json).spell_id)
  ));
}

function modeledBaseSpellIds(): Set<string> {
  return new Set(jsonFiles(path.join(projectRoot, "data", "variants")).map((filename) =>
    String(((JSON.parse(fs.readFileSync(filename, "utf8")) as Json).base_spell as Json).spell_id)
  ));
}

export function mythicVariantCandidates(): Json[] {
  const canonical = canonicalSpellIds();
  const modeled = modeledBaseSpellIds();
  const found = new Map<string, Json>();
  for (const filename of jsonFiles(path.join(projectRoot, "data", "observations"))) {
    const observation = JSON.parse(fs.readFileSync(filename, "utf8")) as Json;
    const source = observation.source as Json;
    if (source.site_id !== "aon" || observation.entity_type !== "spell") continue;
    const retrieval = observation.retrieval as Json;
    const artifact = resolveArtifactPath(
      filename,
      String(retrieval.raw_artifact_path),
      String(retrieval.content_sha256),
    );
    const $ = cheerio.load(fs.readFileSync(artifact, "utf8"));
    const titles = $("h1.title,h2.title").toArray();
    for (const title of titles) {
      const name = cleanText($(title).text());
      if (!name.startsWith("Mythic ")) continue;
      const baseName = name.slice("Mythic ".length);
      if (!titles.some((item) => cleanText($(item).text()) === baseName)) continue;
      const baseSpellId = `spell.${slug(baseName)}`;
      const nodes = $(title).parent().contents().toArray();
      const start = nodes.indexOf(title);
      const end = nodes.findIndex((item, index) => index > start && $(item).is("h1.title,h2.title"));
      const raw = cleanText(nodes.slice(start + 1, end < 0 ? undefined : end).map((item) => $(item).text()).join(" "));
      if (!canonical.has(baseSpellId) || !raw) continue;
      found.set(baseSpellId, {
        mythic_spell_variant_id: `mythic-spell-variant.${slug(baseName)}`,
        name,
        base_spell_id: baseSpellId,
        observation_id: observation.observation_id,
        source_url: source.url,
        source_field: "raw_aon_mythic_section",
        raw,
        status: modeled.has(baseSpellId) ? "modeled" : "draft",
      });
    }
  }
  return [...found.values()].sort((left, right) =>
    String(left.base_spell_id).localeCompare(String(right.base_spell_id))
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv.find((argument) => argument.startsWith("--output="));
  const document = { schema_version: "0.1.0", candidates: mythicVariantCandidates() };
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (output) fs.writeFileSync(path.resolve(output.slice("--output=".length)), serialized, "utf8");
  else process.stdout.write(serialized);
}
