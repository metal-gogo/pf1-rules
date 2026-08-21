import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLocalPrisma } from "../src/db/client.js";
import { createRequestHandler } from "../src/web/server.js";


const prisma = createLocalPrisma();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(createRequestHandler(prisma));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

describe("local rules browser", () => {
  it("renders semantic navigation and database counts", async () => {
    const response = await fetch(baseUrl);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<nav aria-label="Primary navigation">');
    expect(html).toContain('<main id="content">');
    expect(html).toContain("Database summary");
  });

  it("uses class spell lists as the primary spell directory", async () => {
    const response = await fetch(`${baseUrl}/spells`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Spells by class</h1>");
    expect(html.match(/href="\/classes\/cleric"/g)).toHaveLength(1);
    expect(html).toContain('/classes/wizard');
    expect(html).toContain('/spells/alphabetical');
  });

  it("groups a class's spells into detailed tables by level", async () => {
    const response = await fetch(`${baseUrl}/classes/cleric`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Cleric spells</h1>");
    expect(html).toContain('<h2 id="level-0">Level 0 Cleric Spells');
    expect(html).toContain('<h2 id="level-9">Level 9 Cleric Spells');
    expect(html).toContain('class="heading-count level-count"');
    expect(html).toContain('spells shown)</span></h2>');
    expect(html).toContain('<th class="key-column" scope="col">Name</th><th class="school-column" scope="col">School</th><th class="components-column" scope="col"><a href="/spell-components">Components</a></th><th scope="col">Summary</th>');
    expect(html).not.toContain('class="row-number"');
    expect(html).toContain('class="sticky-spell-controls"');
    expect(html).toContain('class="spell-filters"');
    expect(html).toContain('data-filter-accordion aria-expanded="false"');
    expect(html).toContain('id="spell-filter-panel" class="filter-panel" hidden');
    expect(html).toContain('Filter Spells <span id="spell-filter-status"');
    expect(html).toContain('<strong>Search spell</strong>');
    expect(html).toContain('data-filter-mode="components" data-mode="exclude"');
    expect(html).toContain('role="group" class="filter-mode"');
    expect(html).toContain('data-mode-choice="include" aria-pressed="true"');
    expect(html).toContain('data-mode-choice="exclude" aria-pressed="true"');
    expect(html).toContain('data-show-all="school" aria-pressed="true"');
    expect(html).toContain('data-show-all="level" aria-pressed="true"');
    expect(html).toContain('data-show-all="components" aria-pressed="true"');
    expect(html).toContain('type="checkbox" data-filter="school"');
    expect(html).toContain('type="checkbox" data-filter="level"');
    expect(html).toContain('type="checkbox" data-filter="components"');
    expect(html).not.toContain("Reset filters");
    expect(html).not.toContain("data-filter-reset");
    expect(html).toContain('<caption class="visually-hidden">Level 0 Cleric spells</caption>');
    expect(html).not.toContain('ingested spells across');
    expect(html).toContain('<abbr title="Verbal component">V</abbr>');
    expect(html).not.toContain('/spell-components#verbal');
    expect(html).toContain('class="table-scroll spell-table-region"');
    expect(html).toContain('Scroll horizontally to see every column.');
    expect(html).toContain('<script src="/class-spells.js" defer></script>');
    expect(html).toContain('/spells/spell.light');
    expect(html).toContain('/spells/spell.miracle');
  });

  it("serves the interactive class filters", async () => {
    const response = await fetch(`${baseUrl}/class-spells.js`);
    const script = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(script).toContain('const filters = ["school", "level", "components"]');
    expect(script).toContain('state.mode === "exclude" ? !matchesAny : matchesAny');
    expect(script).toContain("const filterStates = Object.fromEntries");
    expect(script).toContain('.filter-checkbox[data-filter="');
    expect(script).toContain('option.setAttribute("aria-pressed"');
    expect(script).toContain('document.createElement("mark")');
    expect(script).toContain('window.history.replaceState');
    expect(script).toContain('searchParameters.getAll(parameter.values)');
    expect(script).toContain('setAccordion(hasActiveFilters)');
    expect(script).not.toContain("data-filter-reset");
  });

  it("explains each linked spell component on one reference page", async () => {
    const response = await fetch(`${baseUrl}/spell-components`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Spell components</h1>");
    expect(html).toContain('<section id="verbal">');
    expect(html).toContain('<section id="somatic">');
    expect(html).toContain('<section id="material">');
    expect(html).toContain('<section id="focus">');
    expect(html).toContain('<section id="divine-focus">');
  });

  it("renders a bounded alphabetical spell catalog with filters", async () => {
    const response = await fetch(`${baseUrl}/spells/alphabetical`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Alphabetical spells</h1>");
    expect(html).toContain('form class="catalog-filters" action="/spells/alphabetical" method="get"');
    expect(html).toContain('name="q" type="search"');
    expect(html).toContain('name="school"');
    expect(html).toContain('name="publication"');
    expect(html).toContain('name="sort"');
    expect(html).toContain('aria-label="Filter spells by initial letter"');
    expect(html).toContain('letter=A');
    expect(html).toContain('class="data-table alphabetical-table"');
    expect(html).toContain('class="key-column"');
    const tableBody = html.match(/<tbody>(.*?)<\/tbody>/s)?.[1] ?? "";
    expect(tableBody.match(/<tr>/g)).toHaveLength(50);
    expect(html).toContain("Page 1 of");
  });

  it("filters the alphabetical catalog by name, letter, and school", async () => {
    const response = await fetch(`${baseUrl}/spells/alphabetical?q=light&letter=L&school=evocation&sort=school`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('/spells/spell.light');
    expect(html).not.toContain('/spells/spell.abeyance');
    expect(html).toContain('value="L"');
    expect(html).toContain('value="evocation" selected');
    expect(html).toContain('value="school" selected');
    expect(html).toContain('href="/spells/alphabetical">Clear filters</a>');
  });

  it("does not retain the previous all-spells route", async () => {
    const response = await fetch(`${baseUrl}/spells/all`);
    expect(response.status).toBe(404);
  });

  it("renders a spell with local relationship and source links", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.light`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Light</h1>");
    expect(html).toContain("/classes/cleric");
    expect(html).toContain("/entities/spell.permanency");
    expect(html).toContain("/sources/");
  });

  it("supports search without client-side JavaScript", async () => {
    const response = await fetch(`${baseUrl}/search?q=afflictions`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('form action="/search" method="get"');
    expect(html).toContain("Wish");
    expect(html).toContain("#mythic");
  });

  it("renders sourced definitions for resolved non-spell entities", async () => {
    const response = await fetch(`${baseUrl}/entities/action.immediate-action`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<dt>Status</dt><dd>resolved</dd>");
    expect(html).toContain("<h2>Definition</h2>");
    expect(html).toContain("can be performed at any time");
    expect(html).toContain("legacy_aon");
  });

  it("returns an accessible not-found page", async () => {
    const response = await fetch(`${baseUrl}/spells/does-not-exist`);
    const html = await response.text();
    expect(response.status).toBe(404);
    expect(html).toContain("<h1>Page not found</h1>");
  });
});
