import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { projectRoot } from "../config.js";
import { readCapturedArtifact, artifactHash } from "./artifact-store.js";
import { parseAonFeatCatalog } from "./ingest-feat-batch.js";
import { assertD20AllowsFeatCapture, fetchFeat, observation, parseD20Feat, comparisonFeats, featSectionKey, parser as d20Parser, type CaptureMetadata } from "./ingest-d20-feat-comparison-pilot.js";

import { publicationComparable } from "./normalize-level-zero.js";

const catalogUrl = "https://www.d20pfsrd.com/feats/";
const catalogPath = path.join(projectRoot, "data/raw/catalogs/feats/d20pfsrd.html");

export function featCandidates(html: string | cheerio.CheerioAPI, name: string): Array<{ name: string; url: string }> {
  const $ = typeof html === "string" ? cheerio.load(html) : html;
  if (!$("#article-content a[href]").length) throw new Error("d20PFSRD feat catalog links were not found.");
  const baseName = name.replace(/\s+\([^()]+\)$/, "");
  const candidates = new Map<string, { name: string; url: string }>();
  $("#article-content a[href]").each((_index, anchor) => {
    const text = $(anchor).text().replace(/\s+/g, " ").trim();
    const candidateName = text.replace(/\s+\([^()]+\)$/, "");
    if (candidateName.toLowerCase() !== baseName.toLowerCase() && text.toLowerCase() !== name.toLowerCase()) return;
    let url: URL;
    try { url = new URL($(anchor).attr("href")!, catalogUrl); } catch { return; }
    if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "www.d20pfsrd.com" || !/^\/feats\/.+\/[^/]+\/?$/.test(url.pathname)) return;
    url.search = ""; url.hash = "";
    candidates.set(url.href, { name: candidateName, url: url.href });
  });
  return [...candidates.values()];
}

type Sections = Array<{ heading_raw: string; body_raw: string }>;
export function sameFeatRules(aon: Sections, d20: Sections): boolean {
  const normalize = (text: string) => text.normalize("NFKC").replace(/[’‘]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  const fields = (sections: Sections) => new Map(sections.map((section) => [
    featSectionKey(section.heading_raw), normalize(section.body_raw),
  ]));
  const left = fields(aon), right = fields(d20);
  return (left.get("Benefit")?.length ?? 0) >= 40
    && left.size === aon.length && right.size === d20.length && left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

export function sameFeatPublication(aon: Array<{ text_raw: string }>, d20: Array<{ text_raw: string }>): boolean {
  const books = new Set(aon.map((item) => publicationComparable(item.text_raw)).filter((book) => book.length > 6));
  return d20.some((item) => books.has(publicationComparable(item.text_raw)));
}

export async function ingestFeatSources(keys: string[], offline = false): Promise<void> {
  const aonCapture = readCapturedArtifact(path.join(projectRoot, "data/raw/catalogs/feats/aon-all.html"));
  if (!aonCapture) throw new Error("AoN catalog capture is required before source comparison.");
  const byKey = new Map(parseAonFeatCatalog(aonCapture.body).map((feat) => [feat.sourceRecordKey, feat]));
  let policyChecked = false;
  const capture = async (name: string, url: string, filename: string) => {
    const cached = readCapturedArtifact<CaptureMetadata>(filename);
    if (cached) return cached;
    if (offline) throw new Error(`Missing cached d20PFSRD artifact: ${filename}`);
    if (!policyChecked) { await assertD20AllowsFeatCapture(); policyChecked = true; }
    return fetchFeat({ entityId: "feat.catalog", name, url }, filename, url !== catalogUrl);
  };
  const catalog = await capture("Feats", catalogUrl, catalogPath);
  const catalogDocument = cheerio.load(catalog.body);
  for (const key of keys) {
    const feat = byKey.get(key);
    if (!feat) throw new Error(`Unknown AoN ItemName: ${key}`);
    const slug = feat.entityId.slice(5);
    const directory = path.join(projectRoot, "data/observations/feats", slug);
    const aon = JSON.parse(fs.readFileSync(path.join(directory, "aon-batch-0.1.0.json"), "utf8"));
    const baseName = key.replace(/\s+\([^()]+\)$/, "").toLowerCase();
    const distinctSourceIdentities = [...byKey.keys()].filter((name) => name.replace(/\s+\([^()]+\)$/, "").toLowerCase() === baseName).length;
    const reviewed = comparisonFeats.find((item) => item.entityId === feat.entityId);
    const candidates = reviewed ? [{ name: reviewed.name, url: reviewed.url }] : featCandidates(catalogDocument, key);
    const matches: Array<{ candidate: typeof candidates[number]; result: Awaited<ReturnType<typeof capture>>; basis: string }> = [];
    const evidence: Array<{ url: string; content_sha256: string; outcome: string; differing_sections?: string[] }> = [];
    for (const candidate of candidates) {
      const filename = path.join(projectRoot, "data/raw/feats/source-candidates", artifactHash(candidate.url) + ".html");
      const result = await capture(candidate.name, candidate.url, filename);
      if ([404, 410].includes(result.metadata.http_status)) {
        evidence.push({ url: candidate.url, content_sha256: result.metadata.content_sha256, outcome: `http_${result.metadata.http_status}` });
        continue;
      }
      let differingSections: string[] | undefined;
      let outcome = distinctSourceIdentities > 1 ? "ambiguous_aon_identity" : "rules_differ";
      try {
        const parsed = parseD20Feat(result.body, candidate.url, candidate.name);
        const sameRules = sameFeatRules(aon.entity_raw.sections_raw, parsed.sections);
        const samePublication = sameFeatPublication(aon.entity_raw.publications_raw ?? [], parsed.publications);
        if (reviewed || (distinctSourceIdentities === 1 && (sameRules || samePublication))) {
          outcome = reviewed ? "reviewed" : sameRules ? "matching_sections" : "matching_name_and_publication";
          matches.push({ candidate, result, basis: outcome });
        }
        const aonSections = new Map<string, string>(aon.entity_raw.sections_raw.map((section: { heading_raw: string; body_raw: string }) => [featSectionKey(section.heading_raw), section.body_raw]));
        const d20Sections = new Map(parsed.sections.map((section) => [featSectionKey(section.heading_raw), section.body_raw]));
        differingSections = [...new Set([...aonSections.keys(), ...d20Sections.keys()])].filter((heading) => aonSections.get(heading) !== d20Sections.get(heading));
      } catch (error) { outcome = `parse_error: ${(error as Error).message}`; }
      evidence.push({ url: candidate.url, content_sha256: result.metadata.content_sha256, outcome, ...(differingSections ? { differing_sections: differingSections } : {}) });
    }
    const uniqueMatches = [...new Map(matches.map((match) => [
      match.result.metadata.url.replace(/\/$/, "") + ":" + match.result.metadata.content_sha256, match,
    ])).values()];
    if (uniqueMatches.length === 1) {
      const { candidate, result, basis } = uniqueMatches[0]!;
      const existingPath = path.join(directory, `d20pfsrd-${d20Parser.version}.json`);
      if (fs.existsSync(existingPath)) {
        const existing = JSON.parse(fs.readFileSync(existingPath, "utf8"));
        if (existing.retrieval.content_sha256 !== result.metadata.content_sha256) {
          throw new Error(`d20PFSRD capture differs from existing observation: ${existingPath}`);
        }
        observation({ entityId: feat.entityId, ...candidate }, {
          body: result.body, metadata: { ...existing.retrieval, url: existing.source.url },
        }, basis, path.resolve(directory, existing.retrieval.raw_artifact_path));
      } else {
        observation({ entityId: feat.entityId, ...candidate }, result, basis, path.join(projectRoot, "data/raw/feats/source-candidates", artifactHash(candidate.url) + ".html"));
      }
    }
    const report = {
      entity_id: feat.entityId, aon_observation_id: aon.observation_id,
      source: "d20pfsrd", catalog_url: catalogUrl, catalog_sha256: catalog.metadata.content_sha256,
      status: uniqueMatches.length === 1 ? "matched" : candidates.length === 0 ? "not_found_in_catalog" : "pending_review",
      candidates: evidence,
    };
    const filename = path.join(projectRoot, "data/feat-source-matches", slug + ".json");
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const serialized = JSON.stringify(report, null, 2) + "\n";
    if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") !== serialized) {
      throw new Error(`Source comparison changed; review ${filename} before replacing it.`);
    }
    fs.writeFileSync(filename, serialized);
    console.log(`${feat.entityId}: d20pfsrd ${report.status}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  const batchFile = process.argv.find((arg) => arg.startsWith("--batch-file="))?.slice(13);
  if (!batchFile) throw new Error("Use --batch-file=PATH with the saved AoN batch.");
  const keys: unknown = JSON.parse(fs.readFileSync(batchFile, "utf8"));
  if (!Array.isArray(keys) || !keys.length || keys.some((key) => typeof key !== "string") || new Set(keys).size !== keys.length) {
    throw new Error("Source comparison requires a nonempty batch of unique AoN ItemNames.");
  }
  await ingestFeatSources(keys, process.argv.includes("--offline"));
}
