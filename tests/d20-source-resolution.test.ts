import { describe, expect, test } from "vitest";

import {
  d20CandidateUrls,
  d20SearchResultUrls,
} from "../src/ingestion/d20-source-resolver.js";
import { parseD20pfsrdSpell } from "../src/ingestion/spell-page-parser.js";


const groupedPage = `
  <main id="article-content">
    <h1>Air Walk</h1>
    <p><b>School</b> transmutation [air]; <b>Level</b> cleric 4</p>
    <p class="divider">CASTING</p>
    <p><b>Casting Time</b> 1 standard action<br><b>Components</b> V, S, DF</p>
    <p class="divider">EFFECT</p>
    <p><b>Range</b> touch<br><b>Duration</b> 10 min./level</p>
    <p class="divider">DESCRIPTION</p>
    <p>The subject can tread on air.</p>
    <h4>Air Walk, Communal</h4>
    <p><b>School</b> transmutation [air]; <b>Level</b> cleric 5</p>
    <p class="divider">CASTING</p>
    <p><b>Casting Time</b> 1 standard action<br><b>Components</b> V, S, DF</p>
    <p class="divider">EFFECT</p>
    <p><b>Range</b> touch<br><b>Duration</b> 10 min./level</p>
    <p class="divider">DESCRIPTION</p>
    <p>This spell functions like <i>air walk</i> for multiple creatures.</p>
    <h4>Unrelated Variant</h4>
    <p>This content must not be included.</p>
    <div class="section15"><p>Pathfinder RPG Ultimate Combat. © 2011, Paizo Publishing.</p></div>
  </main>`;


describe("d20PFSRD source resolution", () => {
  test("generates conservative grouped and numbered URL aliases", () => {
    expect(d20CandidateUrls("Age Resistance, Greater")).toEqual([
      "https://www.d20pfsrd.com/magic/all-spells/a/age-resistance-greater/",
      "https://www.d20pfsrd.com/magic/all-spells/a/age-resistance/",
    ]);
    expect(d20CandidateUrls("Absorb Rune III")).toEqual([
      "https://www.d20pfsrd.com/magic/all-spells/a/absorb-rune-iii/",
      "https://www.d20pfsrd.com/magic/all-spells/a/absorb-rune/",
    ]);
  });

  test("keeps only spell-article links from search results", () => {
    const html = `
      <a href="https://www.d20pfsrd.com/magic/all-spells/a/air-walk/">Air Walk</a>
      <a href="/magic/all-spells/a/air-walk">duplicate</a>
      <a href="https://example.com/magic/all-spells/a/air-walk/">other host</a>
      <a href="https://www.d20pfsrd.com/classes/core-classes/cleric/">Cleric</a>`;
    expect(d20SearchResultUrls(html, "https://www.d20pfsrd.com/?s=air%20walk")).toEqual([
      "https://www.d20pfsrd.com/magic/all-spells/a/air-walk/",
    ]);
  });

  test("parses an exact grouped spell subsection without the following variant", () => {
    const parsed = parseD20pfsrdSpell(
      groupedPage,
      "https://www.d20pfsrd.com/magic/all-spells/a/air-walk/",
      "Air Walk, Communal",
    );
    expect(parsed.nameRaw).toBe("Air Walk, Communal");
    expect(parsed.levelsRaw).toBe("cleric 5");
    expect(parsed.descriptionRaw).toContain("multiple creatures");
    expect(parsed.descriptionRaw).not.toContain("must not be included");
  });

  test("rejects a grouped page without the requested exact heading", () => {
    expect(() => parseD20pfsrdSpell(
      groupedPage,
      "https://www.d20pfsrd.com/magic/all-spells/a/air-walk/",
      "Wind Walk",
    )).toThrow("bounded spell entry Wind Walk was not found");
  });
});
