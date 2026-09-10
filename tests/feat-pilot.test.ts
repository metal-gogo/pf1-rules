import { expect, test } from "vitest";

import { ingestFeatPilot, parseAonFeat } from "../src/ingestion/ingest-feat-pilot.js";
import { parseAonFeatCatalog, resolveCatalogFeatLinks } from "../src/ingestion/ingest-feat-batch.js";
import { parseD20Feat } from "../src/ingestion/ingest-d20-feat-comparison-pilot.js";

test("feat boundaries preserve prerequisites and exclude appended rules and summary citations", () => {
  const html = `<span id="MainContent_DataListTypes_LabelName_0">
    <h1>Blazing Aura (PA) (Combat, Conduit)</h1>
    <b>Source</b> <a href="Book.aspx?name=Planar\nAdventures">Planar Adventures pg. 1</a><br>
    An introduction with <a href="FeatDisplay.aspx?ItemName=Spell Focus">Spell Focus</a>.<br>
    <b>Prerequisites</b>: <a href="FeatDisplay.aspx?ItemName=Spell Focus">Spell Focus</a>, caster level 5th.<br>
    <b>Benefit</b>: Gain <span><b>fire</b></span> damage.<br>
    <b>Special</b>: You can select this feat twice.
    <h2>Combat Trick</h2>Spend stamina.<h2>Mythic Blazing Aura</h2>Mythic benefit.
    </span>`;
  const feat = parseAonFeat(html, "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Blazing+Aura+(PA)", "Blazing Aura (PA)");
  expect(feat.featTypes).toEqual(["Combat", "Conduit"]);
  expect(feat.publications).toHaveLength(1);
  expect(feat.publications[0]?.href_resolved).toContain("name=PlanarAdventures");
  expect(feat.prerequisites).toBe("Spell Focus, caster level 5th.");
  expect(feat.sections.find((section) => section.heading_raw === "Benefit")?.body_raw).toBe("Gain fire damage.");
  expect(feat.links.filter((link) => link.role_hint === "publication")).toHaveLength(1);
  expect(feat.links.find((link) => link.role_hint === "prerequisite")?.href_resolved).toContain("ItemName=Spell%20Focus");
  expect(feat.supplements.map((item) => item.kind_hint)).toEqual(["combat_trick", "mythic"]);
  expect(feat.definitionRaw).not.toMatch(/stamina|Mythic benefit/);
  const untyped = parseAonFeat('<span id="MainContent_DataListTypes_LabelName_0"><h1>Example</h1><b>Source</b> Book<br>Summary.<br><b>Benefit</b> Text.</span>', "https://www.aonprd.com", "Example");
  expect(untyped.featTypes).toEqual([]);
  expect(untyped.prerequisites).toBeNull();
  expect(() => parseAonFeat(html, "https://www.aonprd.com", "Other")).toThrow("Expected Other");
});

test("pilot ingestion rejects counts outside its reviewed queue", async () => {
  await expect(ingestFeatPilot(true, 0)).rejects.toThrow("Feat count must be an integer from 1 through 10.");
  await expect(ingestFeatPilot(true, 11)).rejects.toThrow("Feat count must be an integer from 1 through 10.");
});

test("AoN feat catalog preserves source order and rejects duplicate source identities", () => {
  const html = `<table id="MainContent_GridView6"><tr><th>Name</th></tr><tr><td><a href="FeatDisplay.aspx?ItemName=First%20Feat">First Feat</a></td></tr><tr><td><a href="FeatDisplay.aspx?ItemName=Second%20Feat">Second Feat*</a></td></tr></table>`;
  expect(parseAonFeatCatalog(html)).toEqual([
    { entityId: "feat.first-feat", name: "First Feat", sourceRecordKey: "First Feat" },
    { entityId: "feat.second-feat", name: "Second Feat", sourceRecordKey: "Second Feat" },
  ]);
  expect(() => parseAonFeatCatalog(html.replace("Second%20Feat", "First%20Feat"))).toThrow("Ambiguous catalog identity");
});

test("catalog link enrichment uses an exact AoN source identity", () => {
  const parsed = parseAonFeat('<span id="MainContent_DataListTypes_LabelName_0"><h1>Example</h1><b>Source</b> Book<br><b>Benefit</b>: <a href="FeatDisplay.aspx?ItemName=Known%20Feat">Known Feat</a>.</span>', "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Example", "Example");
  const catalog = new Map([["Known Feat", { entityId: "feat.known-feat", name: "Known Feat", sourceRecordKey: "Known Feat" }]]);
  expect(resolveCatalogFeatLinks(parsed, catalog).find((link) => link.anchor_text_raw === "Known Feat")?.target_entity_id_hint).toBe("feat.known-feat");
});

test("d20PFSRD feat boundaries retain base prose and exclude editorial and copyright material", () => {
  const html = `<div id="article-content"><h1>Channel Smite (Combat)</h1>
    <p class="description">You can channel divine energy.</p><p><b>Prerequisite</b>: Channel energy class feature.</p>
    <div><p><b>Benefit</b>: Gain <a href="/gamemastering/combat">damage</a>.</p><p>Additional effect.</p></div>
    <div class="ed-note-outer"><p class="ed-note-header">Editor's Note</p><p>FAQ text.</p></div>
    <div class="section15"><div>Section 15: Copyright Notice</div><p>Copyright text.</p></div></div>`;
  const feat = parseD20Feat(html, "https://www.d20pfsrd.com/feats/combat-feats/channel-smite-combat/", "Channel Smite");
  expect(feat.featTypes).toEqual(["Combat"]);
  expect(feat.prerequisites).toBe("Channel energy class feature.");
  expect(feat.sections).toEqual([
    { heading_raw: "Prerequisite", body_raw: "Channel energy class feature." },
    { heading_raw: "Benefit", body_raw: "Gain damage.\nAdditional effect." },
  ]);
  expect(feat.definitionRaw).not.toMatch(/FAQ text|Copyright text/);
  expect(feat.excluded).toEqual(["Editor's Note", "Section 15: Copyright Notice"]);
  expect(feat.copyrightNotice).toContain("Copyright text.");
  expect(feat.links.find((link) => link.role_hint === "cross_reference")?.anchor_text_raw).toBe("damage");
  expect(feat.publications).toEqual([]);
  expect(() => parseD20Feat('<div id="article-content"><h1>Example</h1><p>Unrecognized layout.</p></div>', "https://www.d20pfsrd.com/feats/example", "Example")).toThrow("benefit section was not found");
});
