import { expect, test } from "vitest";

import { parseAonFeat } from "../src/ingestion/ingest-feat-pilot.js";

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
