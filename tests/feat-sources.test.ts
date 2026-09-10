import { expect, test } from "vitest";
import { featCandidates, sameFeatRules, sameFeatPublication } from "../src/ingestion/ingest-feat-sources.js";
import { buildFeatSourceGraph } from "../src/ingestion/feat-source-graph.js";

test("source candidates need matching rules, preserve numbers and reject same-name differences", () => {
  const html = '<div id="article-content"><a href="/feats/combat-feats/example/">Example (Combat)</a><a href="https://evil.invalid/feats/combat-feats/example/">Example</a><a href="/feats/combat-feats/example-other/">Example (Teamwork)</a></div>';
  expect(featCandidates(html, "Example (ARG)")).toHaveLength(2);
  const aon = [{ heading_raw: "Prerequisites", body_raw: "Strength 13." }, { heading_raw: "Benefit", body_raw: "You gain a +2 bonus on all the listed attack rolls." }];
  expect(sameFeatRules(aon, [{ heading_raw: "Prerequisite", body_raw: "Strength 13." }, aon[1]!])).toBe(true);
  expect(sameFeatRules(aon, [{ ...aon[0]!, body_raw: "Strength 15." }, aon[1]!])).toBe(false);
  expect(sameFeatRules(aon, [aon[0]!, { ...aon[1]!, body_raw: "Completely different rules despite the same title." }])).toBe(false);
  expect(sameFeatRules([], [])).toBe(false);
  expect(sameFeatPublication([{ text_raw: "Ultimate Combat pg. 89" }], [{ text_raw: "Pathfinder Roleplaying Game Ultimate Combat" }])).toBe(true);
  expect(sameFeatPublication([{ text_raw: "Ultimate Combat pg. 89" }], [{ text_raw: "Ultimate Magic" }])).toBe(false);
});

test("feat graph joins sources by URL, preserves evidence and leaves ambiguous targets unresolved", () => {
  const entities = ["feat.example", "feat.target", "spell.target"].map((entity_id) => ({
    entity_id, entity_type: entity_id.split(".")[0], name: entity_id, evidence: [],
  }));
  const target = (observation_id: string, url: string) => ({
    observation_id, entity_type: "feat", source: { url }, entity_raw: { links_raw: [] },
  });
  const hrefs = [
    "https://www.d20pfsrd.com/feats/combat-feats/target/",
    "https://www.aonprd.com/SpellDisplay.aspx?ItemName=Target",
    "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Missing",
    "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Missing",
    "javascript:alert(1)",
    "https://www.aonprd.com/ambiguous",
  ];
  const owner = target("aon:feat.example:12345678", "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Example");
  owner.entity_raw.links_raw = hrefs.map((href_resolved) => ({
    href_resolved, anchor_text_raw: "Same display name", role_hint: "prerequisite",
  })) as never[];
  const graph = buildFeatSourceGraph([
    owner,
    target("d20pfsrd:feat.target:23456789", hrefs[0]!),
    target("aon:spell.target:34567890", hrefs[1]!),
    target("aon:feat.target:45678901", hrefs[5]!),
    target("aon:spell.target:56789012", hrefs[5]!),
  ], entities);
  expect(graph.nodes).toHaveLength(1);
  expect(graph.nodes[0]!.status).toBe("stub");
  expect(graph.targets.get(owner.observation_id + ":0")).toBe("feat.target");
  expect(graph.targets.get(owner.observation_id + ":1")).toBe("spell.target");
  expect(graph.targets.has(owner.observation_id + ":4")).toBe(false);
  expect(graph.targets.has(owner.observation_id + ":5")).toBe(false);
  expect(graph.relationships).toHaveLength(3);
  expect(graph.relationships.find(({ record }) => record.target.entity_id === graph.nodes[0]!.entity_id)!.record.evidence).toHaveLength(2);
  expect(graph.relationships.every(({ record }) => record.type === "references")).toBe(true);
});

test("source comparison replays cached matches, dead links and ambiguous candidates without network", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createHash } = await import("node:crypto");
  const { vi } = await import("vitest");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-feat-sources-"));
  vi.resetModules();
  vi.doMock("../src/config.js", () => ({ projectRoot: root }));
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network access"));
  try {
    const { ingestFeatSources } = await import("../src/ingestion/ingest-feat-sources.js");
    const hash = (body: string) => createHash("sha256").update(body).digest("hex");
    const capture = (relative: string, body: string, url: string, status = 200) => {
      const filename = path.join(root, "data/raw", relative);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, body);
      fs.writeFileSync(filename + ".meta.json", JSON.stringify({
        url, retrieved_at: "2026-09-09T00:00:00.000Z", http_status: status,
        content_sha256: hash(body), response_content_type: "text/html",
      }));
    };
    const names = ["Example", "Missing", "Ambiguous"];
    capture("catalogs/feats/aon-all.html",
      '<table id="MainContent_GridView6">' + names.map((name) =>
        `<tr><td><a href="FeatDisplay.aspx?ItemName=${name}">${name}</a></td></tr>`).join("") + "</table>",
      "https://www.aonprd.com/Feats.aspx");
    const benefit = "You gain a +2 bonus on all the listed attack rolls.";
    for (const name of names) {
      const directory = path.join(root, "data/observations/feats", name.toLowerCase());
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "aon-batch-0.1.0.json"), JSON.stringify({
        observation_id: `aon:feat.${name.toLowerCase()}:12345678`,
        entity_raw: { sections_raw: [{ heading_raw: "Prerequisites", body_raw: "Strength 13." }, { heading_raw: "Benefit", body_raw: benefit }] },
      }));
    }
    const candidates = [
      ["Example", "https://www.d20pfsrd.com/feats/general-feats/example/"],
      ["Missing", "https://www.d20pfsrd.com/feats/general-feats/missing/"],
      ["Ambiguous", "https://www.d20pfsrd.com/feats/general-feats/ambiguous/"],
      ["Ambiguous", "https://www.d20pfsrd.com/feats/combat-feats/ambiguous/"],
    ];
    capture("catalogs/feats/d20pfsrd.html", '<div id="article-content">' +
      candidates.map(([name, url]) => `<a href="${url}">${name}</a>`).join("") + "</div>",
      "https://www.d20pfsrd.com/feats/");
    for (const [name, url] of candidates) {
      capture("feats/source-candidates/" + hash(url!) + ".html",
        name === "Missing" ? "Not found" : `<div id="article-content"><h1>${name}</h1><p><strong>Prerequisite(s)</strong>: Strength 13.</p><p><strong>Benefit(s)</strong>: ${benefit}</p></div>`,
        url!, name === "Missing" ? 404 : 200);
    }
    await ingestFeatSources(names, true);
    const report = (name: string) => JSON.parse(fs.readFileSync(path.join(root, "data/feat-source-matches", name + ".json"), "utf8"));
    expect(report("example").status).toBe("matched");
    expect(report("missing").candidates[0].outcome).toBe("http_404");
    expect(report("ambiguous").status).toBe("pending_review");
    expect(fs.existsSync(path.join(root, "data/observations/feats/ambiguous/d20pfsrd-0.1.2.json"))).toBe(false);
    const observation = path.join(root, "data/observations/feats/example/d20pfsrd-0.1.2.json");
    const before = fs.readFileSync(observation, "utf8");
    expect(JSON.parse(before).entity_raw.prerequisites_raw).toBe("Strength 13.");
    expect(JSON.parse(before).entity_raw.sections_raw[1]).toEqual({ heading_raw: "Benefit(s)", body_raw: benefit });
    await ingestFeatSources(names, true);
    expect(fs.readFileSync(observation, "utf8")).toBe(before);
    const corrupted = JSON.parse(before);
    corrupted.entity_raw.definition_raw = "Unverified replacement";
    fs.writeFileSync(observation, JSON.stringify(corrupted));
    await expect(ingestFeatSources(["Example"], true)).rejects.toThrow("Observation differs");
    fs.writeFileSync(observation, before);
    fs.unlinkSync(path.join(root, "data/raw/catalogs/feats/d20pfsrd.html"));
    fs.unlinkSync(path.join(root, "data/raw/catalogs/feats/d20pfsrd.html.meta.json"));
    vi.stubEnv("PF1_ARTIFACT_ROOT", path.join(root, "empty-artifacts"));
    await expect(ingestFeatSources(names, true)).rejects.toThrow("Missing cached d20PFSRD");
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
    vi.unstubAllEnvs();
    vi.doUnmock("../src/config.js");
    vi.resetModules();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
