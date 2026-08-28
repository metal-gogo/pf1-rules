import { describe, expect, it } from "vitest";

import { parseMagicRulesPage, type Source } from "../src/ingestion/ingest-magic-general-rules.js";


const aon: Source = {
  siteId: "aon",
  url: "https://aonprd.com/Rules.aspx?ID=68",
  rawPath: "unused",
  declaredPublisher: "Paizo",
  firstPartyStatus: "confirmed",
  sourceNotice: "PRPG Core Rulebook",
};

describe("Magic general-rules parser", () => {
  it("preserves concentration prose, labels, and the DC table", () => {
    const page = parseMagicRulesPage(`
      <span id="MainContent_DetailedOutput">
        <h1 class="title"><a href="Rules.aspx?ID=68">Magic</a></h1>
        <h2 class="title">Concentration</h2>
        To cast a spell, you must concentrate.<br><br><b>Injury</b>: Make a check.
        <table><tr><td><b>Situation</b></td><td><b>Concentration Check DC</b></td></tr><tr><td>Cast defensively</td><td>15 + double spell level</td></tr></table>
      </span><div class="footer"></div>`, aon);
    const blocks = page.document!.content;
    expect(blocks.filter((block) => block.node_type === "heading").map((block) => block.level)).toEqual([2, 3]);
    expect(blocks.find((block) => block.node_type === "paragraph")).toMatchObject({
      content: [{ node_type: "text", value: "To cast a spell, you must concentrate." }],
    });
    expect(JSON.stringify(blocks)).toContain('"marks":["bold"]');
    const table = blocks.find((block) => block.node_type === "table");
    expect(table?.content[0]?.content.map((cell) => cell.header)).toEqual([true, true]);
  });

  it("records unresolved source links without guessing a local target", () => {
    const page = parseMagicRulesPage(`
      <span id="MainContent_DetailedOutput"><h1><a href="Rules.aspx?ID=68">Magic</a></h1><p><a href="Rules.aspx?ID=999">Unknown rule</a></p></span><div class="footer"></div>`, aon);
    expect(page.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ anchor_text_raw: "Magic", target_entity_id_hint: "rule.magic" }),
      expect.objectContaining({ anchor_text_raw: "Unknown rule", target_entity_id_hint: null }),
    ]));
  });
});
