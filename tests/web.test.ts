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
    expect(html).toContain('<a href="/spells">Spell lists</a>');
    expect(html).toContain('<main id="content">');
    expect(html).toContain("Database summary");
  });

  it("uses normal same-tab navigation for links and forms", async () => {
    const response = await fetch(baseUrl);
    const html = await response.text();
    expect(html).not.toContain("<base ");
    expect(html).not.toContain("target=");
    expect(html).toContain('<a class="skip-link" href="#content">');
    expect(html).toContain('form action="/search" method="get" role="search"');
  });

  it("lists every ingested spell-list source kind", async () => {
    const response = await fetch(`${baseUrl}/spells`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Spell lists by source</h1>");
    expect(html).toContain('<nav class="spell-list-kinds" aria-label="Spell list kinds">');
    for (const heading of [
      "Classes",
      "Domains",
      "Subdomains",
      "Bloodrager bloodlines",
      "Sorcerer bloodlines",
      "Mysteries",
      "Patrons",
      "Spirits",
      "Elemental schools",
      "Feats",
      "Formulae",
    ]) {
      expect(html).toContain(`<h2>${heading} `);
    }
    expect(html.match(/href="\/classes\/cleric"/g)).toHaveLength(1);
    expect(html).toContain('/classes/wizard');
    expect(html).not.toContain('/classes/sahir-afiyun');
    expect(html).not.toContain('/classes/alchemist');
    expect(html).not.toContain('/classes/investigator');
    expect(html).toContain('/lists/spell-list.air-domain');
    expect(html).toContain('/lists/spell-list.cloud-subdomain');
    expect(html).toContain('/lists/spell-list.sorcerer-arcane-bloodline');
    expect(html).toContain('/lists/spell-list.flame-mystery');
    expect(html).toContain('/lists/spell-list.water-patron');
    expect(html).toContain('/lists/spell-list.flame-spirit');
    for (const school of ["aether", "air", "earth", "fire", "metal", "void", "water", "wood"]) {
      expect(html).toContain(`/lists/spell-list.${school}-elemental-school`);
    }
    expect(html).not.toContain("<h2>Bloodlines ");
    expect(html).toContain('/lists/spell-list.sahir-afiyun');
    expect(html).toContain('/lists/spell-list.alchemist');
    expect(html).toMatch(/Alchemist<\/a>\s*<p>408 spells <span class="muted">· levels 1–6<\/span>/);
    expect(html).toMatch(/Investigator<\/a>\s*<p>409 spells <span class="muted">· levels 1–6<\/span>/);
    expect(html).toContain('/spells/alphabetical');
  });

  it("links the Sahir-Afiyun feat to its selectable spell set", async () => {
    const featResponse = await fetch(`${baseUrl}/entities/feat.sahir-afiyun`);
    const featHtml = await featResponse.text();
    expect(featResponse.status).toBe(200);
    expect(featHtml).toContain("<h1>Sahir-Afiyun</h1>");
    expect(featHtml).toContain('/lists/spell-list.sahir-afiyun');
    expect(featHtml).toContain("Grants Spell Access");

    const listResponse = await fetch(`${baseUrl}/lists/spell-list.sahir-afiyun`);
    const listHtml = await listResponse.text();
    expect(listResponse.status).toBe(200);
    expect(listHtml).toContain("<h2>Access owners</h2>");
    expect(listHtml).toContain('/entities/feat.sahir-afiyun');
    expect(listHtml).toContain("Absorbing Inhalation");
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
    expect(html).toContain('<dialog id="spell-filter-panel" class="filter-panel"');
    expect(html).toContain('<span>More filters</span>');
    expect(html).toContain('<strong>Search spells</strong>');
    expect(html).toContain('spells shown. No filters active.</p>');
    expect(html).toContain('data-filter-mode="components" data-mode="exclude"');
    expect(html).toContain('<details class="filter-mode-disclosure"><summary>Match mode</summary>');
    expect(html).toContain('role="group" class="filter-mode"');
    expect(html).toContain('data-mode-choice="include" aria-pressed="true"');
    expect(html).toContain('data-mode-choice="exclude" aria-pressed="true"');
    expect(html).toContain('data-show-all="school" aria-pressed="true"');
    expect(html).toContain('data-show-all="level" aria-pressed="true"');
    expect(html).toContain('data-show-all="components" aria-pressed="true"');
    expect(html).toContain('type="checkbox" data-filter="school"');
    expect(html).toContain('type="checkbox" data-filter="level"');
    expect(html).toContain('type="checkbox" data-filter="components"');
    expect(html).toContain('data-filter-reset data-filter-reset-compact hidden');
    expect(html).toContain('data-filter-reset>Clear all filters</button>');
    expect(html).toContain('data-filter-close>Done</button>');
    expect(html).toContain('<caption class="visually-hidden">Level 0 Cleric spells</caption>');
    expect(html).not.toContain('ingested spells across');
    expect(html).toContain('<abbr title="Verbal component">V</abbr>');
    expect(html).not.toContain('/spell-components#verbal');
    expect(html).toContain('class="table-scroll spell-table-region"');
    expect(html).toContain('Scroll horizontally to see every column.');
    expect(html).toContain("Object shines like a torch.");
    expect(html).not.toContain("This spell causes a touched object to glow like a torch");
    expect(html).toContain('<script src="/class-spells.js" defer></script>');
    expect(html).toContain('/spells/spell.light');
    expect(html).toContain('/spells/spell.miracle');
  });

  it("serves the normalized Red Mantis Assassin class catalog", async () => {
    const response = await fetch(`${baseUrl}/classes/red-mantis-assassin`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Red Mantis Assassin spells</h1>");
    expect(html).toContain('<h2 id="level-1">Level 1 Red Mantis Assassin Spells');
    expect(html).toContain('<h2 id="level-4">Level 4 Red Mantis Assassin Spells');
    expect(html).toContain("Alter Winds");
    expect(html).toContain("Wandering Star Motes");
  });

  it("labels Omdura and other inherited memberships as derived access", async () => {
    const classResponse = await fetch(`${baseUrl}/classes/omdura`);
    const classHtml = await classResponse.text();
    expect(classResponse.status).toBe(200);
    expect(classHtml).toContain("<h1>Omdura spells</h1>");
    expect(classHtml).toContain("(derived access)");

    const spellResponse = await fetch(`${baseUrl}/spells/spell.mages-lucubration`);
    const spellHtml = await spellResponse.text();
    expect(spellResponse.status).toBe(200);
    expect(spellHtml).toContain("Arcanist</a> 6");
    expect(spellHtml).toContain("(derived access)");
  });

  it("labels reviewed spell-list overrides separately from printed access", async () => {
    const classResponse = await fetch(`${baseUrl}/classes/sorcerer`);
    const classHtml = await classResponse.text();
    expect(classResponse.status).toBe(200);
    expect(classHtml).toContain("Temporal Regression");
    expect(classHtml).toContain("(reviewed override)");

    const spellResponse = await fetch(`${baseUrl}/spells/spell.borrow-fortune`);
    const spellHtml = await spellResponse.text();
    expect(spellResponse.status).toBe(200);
    expect(spellHtml).toContain("Cleric</a> 3");
    expect(spellHtml).toContain("(reviewed override)");
  });

  it("routes mystery access through the mystery owner and spell list", async () => {
    const classResponse = await fetch(`${baseUrl}/classes/oracle`);
    const classHtml = await classResponse.text();
    expect(classResponse.status).toBe(200);
    expect(classHtml).not.toContain("Fireball");

    const spellResponse = await fetch(`${baseUrl}/spells/spell.fireball`);
    const spellHtml = await spellResponse.text();
    expect(spellResponse.status).toBe(200);
    expect(spellHtml).toContain("Flame Mystery</a> 3");
    expect(spellHtml).not.toContain("Oracle</a> 3");

    const ownerResponse = await fetch(`${baseUrl}/entities/mystery.flame`);
    const ownerHtml = await ownerResponse.text();
    expect(ownerResponse.status).toBe(200);
    expect(ownerHtml).toContain("<h1>Flame Mystery</h1>");
    expect(ownerHtml).toContain("/lists/spell-list.flame-mystery");
    expect(ownerHtml).toContain("<h2>Definition</h2>");

    const listResponse = await fetch(`${baseUrl}/lists/spell-list.flame-mystery`);
    const listHtml = await listResponse.text();
    expect(listResponse.status).toBe(200);
    expect(listHtml).toContain("<h2>Access owners</h2>");
    expect(listHtml).toContain("Fireball");
  });

  it("routes patron access through the patron owner and spell list", async () => {
    const spellResponse = await fetch(`${baseUrl}/spells/spell.bless-water`);
    const spellHtml = await spellResponse.text();
    expect(spellResponse.status).toBe(200);
    expect(spellHtml).toContain("Water Patron</a> 1");

    const ownerResponse = await fetch(`${baseUrl}/entities/patron.water`);
    const ownerHtml = await ownerResponse.text();
    expect(ownerResponse.status).toBe(200);
    expect(ownerHtml).toContain("<h1>Water Patron</h1>");
    expect(ownerHtml).toContain("/lists/spell-list.water-patron");
  });

  it("routes spirit access through the spirit owner and spell list", async () => {
    const spellResponse = await fetch(`${baseUrl}/spells/spell.fireball`);
    const spellHtml = await spellResponse.text();
    expect(spellResponse.status).toBe(200);
    expect(spellHtml).toContain("Flame Spirit</a> 3");

    const ownerResponse = await fetch(`${baseUrl}/entities/spirit.flame`);
    const ownerHtml = await ownerResponse.text();
    expect(ownerResponse.status).toBe(200);
    expect(ownerHtml).toContain("<h1>Flame Spirit</h1>");
    expect(ownerHtml).toContain("/lists/spell-list.flame-spirit");
  });

  it("routes same-named bloodlines through class-specific owners", async () => {
    const sorcererResponse = await fetch(`${baseUrl}/entities/bloodline.sorcerer.arcane`);
    const sorcererHtml = await sorcererResponse.text();
    expect(sorcererResponse.status).toBe(200);
    expect(sorcererHtml).toContain("<h1>Sorcerer Arcane Bloodline</h1>");
    expect(sorcererHtml).toContain("/lists/spell-list.sorcerer-arcane-bloodline");

    const bloodragerResponse = await fetch(`${baseUrl}/entities/bloodline.bloodrager.arcane`);
    const bloodragerHtml = await bloodragerResponse.text();
    expect(bloodragerResponse.status).toBe(200);
    expect(bloodragerHtml).toContain("<h1>Bloodrager Arcane Bloodline</h1>");
    expect(bloodragerHtml).toContain("/lists/spell-list.bloodrager-arcane-bloodline");
  });

  it("routes domain and subdomain access through owner pages", async () => {
    const spellResponse = await fetch(`${baseUrl}/spells/spell.wind-wall`);
    const spellHtml = await spellResponse.text();
    expect(spellResponse.status).toBe(200);
    expect(spellHtml).toContain("Air Domain</a> 2");
    expect(spellHtml).toContain("Cloud Subdomain</a> 2");
    expect(spellHtml).toContain("(derived access)");

    const ownerResponse = await fetch(`${baseUrl}/entities/subdomain.cloud`);
    const ownerHtml = await ownerResponse.text();
    expect(ownerResponse.status).toBe(200);
    expect(ownerHtml).toContain("<h1>Cloud Subdomain</h1>");
    expect(ownerHtml).toContain("/lists/spell-list.cloud-subdomain");
    expect(ownerHtml).toContain("Air Domain Spells");
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
    expect(script).toContain('filterPanel.showModal()');
    expect(script).toContain('filterPanel.addEventListener("close"');
    expect(script).toContain('function resetFilters()');
    expect(script).toContain('requestAnimationFrame(() => applyFilters())');
    expect(script).toContain('compactReset.hidden = activeFilters.length === 0');
    expect(script).not.toContain('setAccordion(hasActiveFilters)');
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

  it("groups relationship targets on stable rule-reference anchors", async () => {
    const [schoolsResponse, actionsResponse, savesResponse, descriptorsResponse, illuminationResponse] = await Promise.all([
      fetch(`${baseUrl}/rules/magic-schools`),
      fetch(`${baseUrl}/rules/actions`),
      fetch(`${baseUrl}/rules/saving-throws`),
      fetch(`${baseUrl}/rules/descriptors`),
      fetch(`${baseUrl}/rules/illumination`),
    ]);
    const [schools, actions, saves, descriptors, illumination] = await Promise.all([
      schoolsResponse.text(),
      actionsResponse.text(),
      savesResponse.text(),
      descriptorsResponse.text(),
      illuminationResponse.text(),
    ]);
    expect(schoolsResponse.status).toBe(200);
    expect(schools).toContain('<article id="conjuration">');
    expect(schools).toContain('<article id="healing">');
    expect(schools).toContain("Certain divine conjurations heal creatures");
    expect(actionsResponse.status).toBe(200);
    expect(actions).toContain('<article id="standard-action">');
    expect(actions).toContain("most commonly to make an attack or cast a spell");
    expect(savesResponse.status).toBe(200);
    expect(saves).toContain('<article id="will-saving-throw">');
    expect(saves).toContain("Definition not yet imported.");
    expect(descriptorsResponse.status).toBe(200);
    expect(descriptors).toContain('<article id="darkness">');
    expect(descriptors).toContain("Spells that create darkness or reduce the amount of light");
    expect(illuminationResponse.status).toBe(200);
    for (const anchor of ["bright-light", "normal-light", "dim-light", "darkness"]) {
      expect(illumination).toContain(`<article id="${anchor}">`);
    }
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
    expect(html).toContain("/spells/spell.permanency");
    expect(html).toContain("/sources/");
  });

  it("links Cure Light Wounds metadata through its accepted relationships", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.cure-light-wounds`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<a href="/rules/magic-schools#conjuration">Conjuration</a>');
    expect(html).toContain('<a href="/rules/magic-schools#healing">Healing</a>');
    expect(html).toContain('<a href="/rules/actions#standard-action">standard action</a>');
    expect(html).toContain('<a href="/rules/saving-throws#will-saving-throw">Will</a> half');
    expect(html).toContain('<a href="/entities/rule.spell-resistance">Spell resistance</a>');
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(description).toContain('<a href="/entities/rule.spell-resistance">spell resistance</a>');
  });

  it.each([
    ["break-enchantment", "/entities/rule.caster-level"],
    ["restoration", "/spells/spell.restoration-lesser"],
    ["restoration-greater", "/spells/spell.restoration-lesser"],
    ["restoration-lesser", "/entities/rule.ability-damage"],
    ["bestow-curse", "/spells/spell.break-enchantment"],
    ["curse-major", "/spells/spell.bestow-curse"],
    ["conditional-curse", "/spells/spell.bestow-curse"],
    ["cure-light-wounds", "/entities/rule.spell-resistance"],
    ["cure-moderate-wounds", "/spells/spell.cure-light-wounds"],
    ["darkness", "/rules/descriptors#darkness"],
  ])("renders persisted inline links for pilot spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('class="rich-description"');
    expect(html).toContain(`href="${target}"`);
  });

  it.each([
    ["abeyance", "/spells/spell.remove-curse"],
    ["abjuring-step", "/entities/rule.attacks-of-opportunity"],
    ["absolution", "/spells/spell.heroism"],
    ["absorb-rune-ii", "/spells/spell.absorb-rune-i"],
    ["acidic-spray", "/rules/saving-throws#reflex-saving-throw"],
  ])("renders reviewed rollout links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain('class="rich-description"');
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["age-resistance", "/spells/spell.age-resistance-lesser"],
    ["aggravate-affliction", "/entities/rule.afflictions"],
    ["aggressive-thundercloud", "/entities/item.candle"],
    ["agonize", "/rules/saving-throws#fortitude-saving-throw"],
    ["akashic-communion", "/entities/rule.knowledge"],
    ["align-weapon", "/entities/rule.damage-reduction"],
  ])("renders second-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["advanced-scurvy", "/entities/rule.natural"],
    ["age-resistance-lesser", "/entities/condition.dying"],
    ["air-bubble", "/entities/rule.air"],
    ["air-step", "/entities/condition.stable"],
    ["akashic-communion", "/entities/rule.extraplanar"],
  ])("omits reviewed false-positive link from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it.each([
    ["align-weapon-communal", "/spells/spell.align-weapon"],
    ["allied-cloak", "/classes/bard"],
    ["alluring-light", "/rules/illumination#dim-light"],
    ["alluring-spores", "/rules/magic-schools#enchantment"],
    ["analyze-aura", "/spells/spell.magic-aura"],
    ["ancestral-memory", "/entities/monster.clay-golem"],
    ["anchored-step", "/entities/rule.combat-maneuver-defense"],
    ["angelic-aspect-greater", "/entities/rule.damage-reduction"],
  ])("renders third-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["ally-across-time", "/entities/rule.summon"],
    ["alter-summoned-monster", "/entities/rule.summon"],
    ["alter-winds", "/entities/rule.wind"],
  ])("omits third-batch false-positive link from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it.each([
    ["animal-growth", "/entities/rule.armor-class"],
    ["animate-dead-lesser", "/entities/rule.skeleton"],
    ["anti-summoning-shield", "/rules/magic-schools#summoning"],
    ["antitech-field", "/entities/item.sling"],
    ["antithetical-constraint", "/spells/spell.magic-missile"],
    ["ape-walk", "/entities/monster.monkey"],
  ])("renders fourth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it("links only the rules-specific Summon occurrence in Anti-Summoning Shield", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.anti-summoning-shield`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/entities\/rule\.summon"/g)).toHaveLength(1);
  });

  it("does not link Apport Object's transport verb to the monster Summon ability", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.apport-object`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain('href="/entities/rule.summon"');
  });

  it.each([
    ["aquatic-cavalry", "/entities/monster.hippocampus"],
    ["arcana-theft", "/rules/saving-throws"],
    ["arcane-concordance", "/entities/feat.enlarge-spell"],
    ["arcane-disruption", "/classes/arcanist"],
    ["arcane-mark", "/entities/item.gem-of-seeing"],
    ["arcane-pocket", "/entities/item.bag-of-holding"],
    ["archons-trumpet", "/entities/monster.trumpet-archon"],
    ["aspect-of-the-bear", "/entities/rule.combat-maneuver-bonus"],
    ["aspect-of-the-falcon", "/entities/feat.improved-critical"],
  ])("renders fifth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["aquatic-cavalry", "/entities/rule.summon"],
    ["army-across-time", "/entities/rule.summon"],
    ["arcane-eye", "/entities/rule.arcane"],
    ["arcane-pocket", "/entities/rule.touch-attack"],
    ["arid-refuge", "/entities/rule.impervious"],
    ["ashen-path", "/entities/rule.touch-attack"],
  ])("omits fifth-batch false-positive link from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it.each([
    ["aspect-of-the-nightingale", "/rules/magic-schools#charm"],
    ["assumed-likeness", "/rules/magic-schools#illusion"],
    ["atavism", "/entities/rule.hit-dice"],
    ["atonement", "/classes/paladin"],
    ["aura-alteration", "/spells/spell.magic-aura"],
    ["aura-of-greater-courage", "/entities/rule.fear"],
    ["aura-sight", "/entities/spell-family.detect-alignment"],
    ["awaken", "/entities/class-feature.animal-companion"],
    ["awaken-construct", "/entities/monster.shield-guardian"],
    ["awaken-the-devoured", "/entities/rule.daemon"],
  ])("renders sixth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["atonement", "/entities/rule.redemption"],
    ["aura-of-distraction", "/entities/rule.distraction"],
  ])("omits sixth-batch false-positive link from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it.each([
    ["badgers-ferocity", "/spells/spell.keen-edge"],
    ["balance-of-suffering", "/entities/rule.hit-points"],
    ["banishment", "/spells/spell.dismissal"],
    ["banshee-blast", "/entities/monster.ghost"],
    ["barbed-chains", "/entities/item.chain"],
    ["barghest-feast", "/entities/rule.hit-dice"],
    ["barrow-haze", "/entities/class-feature.hexes"],
    ["beanstalk", "/entities/item.rope"],
    ["beastspeak", "/entities/class-feature.wild-shape"],
    ["bed-of-iron", "/entities/condition.fatigued"],
  ])("renders seventh-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["barbed-chains", "/entities/rule.summon"],
    ["beacon-of-guilt", "/entities/rule.touch-attack"],
  ])("omits seventh-batch false-positive link from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("distinguishes the Polymorph spell from generic polymorph effects", async () => {
    const [balefulResponse, beastspeakResponse] = await Promise.all([
      fetch(`${baseUrl}/spells/spell.baleful-shadow-transmutation`),
      fetch(`${baseUrl}/spells/spell.beastspeak`),
    ]);
    const [balefulHtml, beastspeakHtml] = await Promise.all([
      balefulResponse.text(),
      beastspeakResponse.text(),
    ]);
    const baleful = balefulHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    const beastspeak = beastspeakHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(baleful.match(/href="\/spells\/spell\.polymorph"/g)).toHaveLength(1);
    expect(baleful.match(/href="\/rules\/magic-schools#polymorph"/g)).toHaveLength(2);
    expect(beastspeak).toContain('href="/rules/magic-schools#polymorph"');
    expect(beastspeak).not.toContain('href="/spells/spell.polymorph"');
  });

  it.each([
    ["bereave", "/spells/spell.cure-light-wounds"],
    ["bestow-auras", "/entities/class-feature.aura-of-resolve"],
    ["billowing-skirt", "/entities/item.kilt"],
    ["bind-sage", "/entities/monster.caulborn"],
    ["bite-the-hand", "/entities/class-feature.eidolon"],
    ["black-spot", "/entities/monster.ghost"],
    ["blade-tutors-spirit", "/entities/feat.power-attack"],
    ["bladed-dash-greater", "/spells/spell.bladed-dash"],
  ])("renders eighth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["bereave", "/entities/item.chain"],
    ["binding-earth", "/spells/spell.binding"],
    ["binding", "/entities/rule.law"],
  ])("omits eighth-batch source artifacts from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("adds reviewed illumination, vision, descriptor, and spell links to Blacklight", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.blacklight`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    for (const target of [
      "/rules/illumination#darkness",
      "/entities/rule.darkvision",
      "/rules/descriptors#light",
      "/spells/spell.daylight",
    ]) expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["blast-of-wind", "/spells/spell.gust-of-wind"],
    ["blazing-rainbow", "/entities/item.longbow"],
    ["bless-water", "/entities/item.holy-water"],
    ["blessed-fist", "/entities/feat.improved-unarmed-strike"],
    ["blessing-of-the-mole", "/entities/rule.darkvision"],
    ["blight", "/entities/rule.plant"],
    ["blood-in-the-water", "/entities/monster.shark"],
    ["blood-money", "/spells/spell.stoneskin"],
  ])("renders ninth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["bleed-for-your-master", "/entities/rule.touch-attack"],
    ["blight", "/entities/rule.daemon"],
    ["bloatbomb", "/entities/rule.touch-attack"],
    ["blood-money", "/entities/rule.pathfinder-adventure-path-rise-of-the-runelords-anniversary-edition"],
  ])("omits ninth-batch source artifacts from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("promotes whole-spell functions-like wording and defers an unreviewed parent", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.blast-of-wind`);
    const html = await response.text();
    const related = html.match(/<section aria-labelledby="related-rules">([\s\S]*?)<\/section>/)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(html).not.toContain('data-embedded-spell="spell.gust-of-wind"');
    expect(html).toContain("that parent is not fully resolved in the local rules data");
    expect(html.match(/href="\/spells\/spell.gust-of-wind"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(related).toContain("Functions Like:");
    expect(related.match(/href="\/spells\/spell.gust-of-wind"/g)).toHaveLength(1);
    expect(related).not.toContain("References:");
  });

  it.each([
    ["binding-earth-mass", "/spells/spell.binding-earth"],
    ["blood-sentinel", "/entities/feat.alertness"],
    ["blood-song", "/rules/magic-schools#healing"],
    ["bloodbath", "/entities/item.dagger"],
    ["bloodstone-mirror", "/entities/deity.arazni"],
    ["blur", "/entities/rule.concealment"],
    ["bolts-of-bedevilment", "/entities/condition.dazed"],
    ["bone-fists", "/entities/item.armor-spikes"],
    ["bone-flense", "/classes/red-mantis-assassin"],
    ["bone-flense", "/entities/monster.giant-mantis"],
  ])("renders tenth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["bone-flense", "/entities/rule.crimson-assassins"],
    ["bone-flense", "/entities/rule.humanoid"],
  ])("omits tenth-batch source artifacts from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it.each([
    ["bouncy-body", "/entities/rule.falling-damage"],
    ["bow-spirit", "/entities/item.sphere-of-annihilation"],
    ["bowstaff", "/entities/item.quarterstaff"],
    ["brand-greater", "/entities/item.torch"],
    ["brand-of-conformity", "/entities/rule.dwarf"],
    ["brightest-light", "/rules/descriptors#darkness"],
    ["brightest-night", "/rules/illumination#dim-light"],
    ["brilliant-inspiration", "/entities/rule.ability-check"],
    ["brow-gasher", "/entities/condition.bleed"],
    ["bullet-ward", "/entities/rule.armor-class"],
    ["bulls-strength", "/entities/rule.enhancement-bonus"],
  ])("renders eleventh-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["boneshatter", "/entities/rule.skeleton"],
    ["borrow-corruption", "/entities/rule.touch-attack"],
    ["bountiful-banquet", "/entities/rule.animal"],
  ])("omits eleventh-batch semantic false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("links only Brand, Greater's real parent reference", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.brand-greater`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/spells\/spell.brand"/g)).toHaveLength(1);
  });

  it("treats Brightest Light as Daylight inheritance and generic darkness as a descriptor", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.brightest-light`);
    const html = await response.text();
    const related = html.match(/<section aria-labelledby="related-rules">([\s\S]*?)<\/section>/)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(related).toContain("Functions Like:");
    expect(related).toContain('href="/spells/spell.daylight"');
    expect(html).not.toContain('href="/spells/spell.darkness"');
  });

  it.each([
    ["burdened-thoughts", "/entities/rule.carrying-capacity"],
    ["burst-bonds", "/entities/rule.swallow-whole"],
    ["burst-of-glory", "/entities/rule.temporary-hit-points"],
    ["burst-with-light", "/rules/illumination#normal-light"],
    ["calcific-touch", "/spells/spell.slow"],
    ["calcific-touch", "/entities/condition.petrified"],
  ])("renders twelfth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it("canonicalizes Grapple wording and rejects Call Construct's ordinary summon verb", async () => {
    const [bondsResponse, constructResponse] = await Promise.all([
      fetch(`${baseUrl}/spells/spell.burst-bonds`),
      fetch(`${baseUrl}/spells/spell.call-construct`),
    ]);
    const [bondsHtml, constructHtml] = await Promise.all([
      bondsResponse.text(),
      constructResponse.text(),
    ]);
    const bonds = bondsHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    const construct = constructHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(bondsResponse.status).toBe(200);
    expect(constructResponse.status).toBe(200);
    expect(bonds).toContain('href="/entities/rule.grapple"');
    expect(bonds).not.toContain('href="/entities/rule.grappling"');
    expect(construct).not.toContain('href="/entities/rule.summon"');
  });

  it.each([
    ["calm-air", "/entities/rule.wind-effects"],
    ["campfire-wall", "/entities/rule.total-concealment"],
    ["canopic-conversion", "/spells/spell.geas-quest"],
    ["cast-out", "/rules/magic-schools#compulsion"],
    ["castigate", "/entities/condition.cowering"],
    ["cauterizing-weapon", "/rules/descriptors#acid"],
    ["cave-fangs", "/entities/class-feature.spirit-animal"],
    ["chain-of-perdition", "/rules/illumination#darkness"],
    ["chain-of-perdition", "/entities/condition.invisibility"],
  ])("renders thirteenth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["carry-companion", "/entities/rule.touch-attack"],
    ["catatonia", "/entities/rule.touch-attack"],
    ["caustic-safeguard", "/entities/rule.touch-attack"],
    ["cauterizing-weapon", "/rules/magic-schools#healing"],
    ["cauterizing-weapon", "/entities/rule.negating"],
    ["cave-fangs", "/entities/rule.animal"],
    ["cave-fangs", "/entities/condition.disabled"],
    ["chain-of-perdition", "/spells/spell.darkness"],
    ["chain-of-perdition", "/spells/spell.invisibility"],
  ])("omits thirteenth-batch semantic false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("promotes Carve Passage's whole-spell similar-to relationship", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.carve-passage`);
    const html = await response.text();
    const related = html.match(/<section aria-labelledby="related-rules">([\s\S]*?)<\/section>/)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(related).toContain("Functions Like:");
    expect(related).toContain('href="/spells/spell.expeditious-excavation"');
  });

  it.each([
    ["charons-dispensation", "/spells/spell.mindwipe"],
    ["cheetahs-sprint", "/entities/rule.fly"],
    ["circle-of-clarity", "/rules/magic-schools#figment"],
    ["claim-identity", "/rules/magic-schools#polymorph"],
    ["cleanse", "/entities/rule.ability-damage"],
    ["cleanse", "/entities/rule.poison"],
    ["cleansing-fire", "/rules/descriptors#evil"],
  ])("renders fourteenth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["chameleon-stride-greater", "/entities/rule.advanced-players-guide"],
    ["charnel-house", "/entities/rule.meat"],
  ])("omits fourteenth-batch source artifacts from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("links only Mass Charm Person's real parent reference", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.charm-person-mass`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/spells\/spell.charm-person"/g)).toHaveLength(1);
  });

  it.each([
    ["cloak-of-shadows", "/rules/illumination#dim-light"],
    ["cloak-of-shadows", "/entities/rule.sunlight-vulnerability"],
    ["cloak-of-winds", "/entities/rule.wind-effects"],
    ["cloud-shape", "/entities/rule.fly"],
    ["coin-shot", "/entities/rule.touch-attack"],
    ["cold-ice-strike", "/rules/descriptors#cold"],
    ["collaborative-thaumaturgy", "/entities/feat.empower-spell"],
    ["command-undead", "/entities/rule.undead"],
    ["compel-hostility", "/entities/class-feature.eidolon"],
  ])("renders fifteenth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["climbing-beanstalk", "/entities/rule.plant"],
    ["cloak-of-secrets", "/spells/spell.identify"],
    ["cloak-of-winds", "/entities/rule.wind"],
  ])("omits fifteenth-batch semantic false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("links only Greater Command's real parent reference", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.command-greater`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/spells\/spell.command"/g)).toHaveLength(1);
  });

  it.each([
    ["compel-tongue-mass", "/spells/spell.compel-tongue"],
    ["compelling-rant", "/spells/spell.borrow-corruption"],
    ["concealed-breath", "/entities/rule.drowning"],
    ["condensed-ether", "/entities/feat.blind-fight"],
    ["conditional-favor", "/entities/rule.poison"],
    ["confess", "/entities/condition.sickened"],
    ["confusion-lesser", "/entities/condition.confused"],
    ["conjure-carriage", "/entities/monster.horse"],
    ["constricting-coils", "/entities/monster.snake"],
    ["contact-nalfeshnee", "/entities/monster.nalfeshnee"],
    ["contact-other-plane", "/entities/rule.intelligence"],
    ["contagion-greater", "/entities/rule.disease"],
    ["contagious-flame", "/rules/descriptors#fire"],
    ["contest-of-skill", "/classes/fighter"],
    ["contest-of-skill", "/entities/class-feature.weapon-mastery"],
  ])("renders sixteenth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it("links Contact High's touch attack but not its ordinary touch verb", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.contact-high`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/entities\/rule.touch-attack"/g)).toHaveLength(1);
  });

  it("links only Contagious Suggestion's real parent reference", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.contagious-suggestion`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/spells\/spell.suggestion"/g)).toHaveLength(1);
  });

  it.each([
    ["calm-emotions", "/entities/class-feature.inspire-courage"],
    ["calm-emotions", "/entities/class-feature.rage"],
    ["cloak-of-chaos", "/entities/rule.deflection-bonus"],
    ["contingent-action", "/entities/rule.ready"],
    ["contingent-scroll", "/entities/rule.scroll"],
    ["contingent-venom", "/spells/spell.magic-mouth"],
    ["continual-flame", "/entities/item.torch"],
    ["continual-flame", "/rules/descriptors#darkness"],
    ["control-construct", "/entities/rule.concentration"],
    ["control-summoned-creature", "/rules/magic-schools#summoning"],
    ["control-water", "/entities/monster.water-elemental"],
    ["control-winds", "/entities/rule.wind-effects"],
    ["controlled-fireball", "/classes/magus"],
    ["controlled-fireball", "/rules/descriptors#ruse"],
    ["coordinated-effort", "/entities/feat.outflank"],
    ["corpse-lanterns", "/rules/illumination#dim-light"],
    ["corpse-lanterns", "/rules/magic-schools#pattern"],
    ["counterbalancing-aura", "/entities/condition.nauseated"],
    ["countless-eyes", "/entities/rule.flanking"],
    ["cowards-cowl", "/entities/rule.fear"],
    ["cowards-lament", "/entities/rule.attack-rolls"],
  ])("renders seventeenth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["cloak-of-chaos", "/entities/rule.chaos"],
    ["corrosive-consumption", "/entities/rule.touch-attack"],
    ["counterbalancing-aura", "/entities/rule.components"],
  ])("omits seventeenth-batch contextual false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("distinguishes Calm Emotions' Rage spell from the barbarian class feature", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.calm-emotions`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/spells\/spell.rage"/g)).toHaveLength(1);
    expect(description.match(/href="\/entities\/class-feature.rage"/g)).toHaveLength(1);
  });

  it("links Controlled Fireball's parent and explicit identification, but not its own title", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.controlled-fireball`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/spells\/spell.fireball"/g)).toHaveLength(2);
  });

  it.each([
    ["crafters-curse", "/entities/rule.craft"],
    ["crafters-fortune", "/entities/rule.luck-bonus"],
    ["create-armaments", "/entities/condition.broken"],
    ["create-demiplane-greater", "/spells/spell.create-demiplane"],
    ["create-greater-undead", "/entities/monster.shadow"],
    ["create-mindscape", "/entities/rule.mindscape"],
    ["create-mindscape-greater", "/spells/spell.create-mindscape"],
    ["create-pit", "/entities/rule.falling-damage"],
    ["create-soul-gem", "/spells/spell.resurrection"],
    ["create-treasure-map", "/entities/condition.dead"],
    ["create-variant-mummy", "/entities/monster.bog-mummy"],
    ["creeping-doom", "/entities/monster.centipede-swarm"],
    ["creeping-ice", "/entities/rule.difficult-terrain"],
    ["crime-of-opportunity", "/spells/spell.crime-wave"],
    ["crime-wave", "/entities/rule.teamwork-feats"],
    ["crimson-breath", "/entities/rule.poison"],
    ["crimson-confession", "/spells/spell.detect-magic"],
    ["crown-of-glory", "/entities/rule.hit-dice"],
    ["cruel-jaunt", "/spells/spell.sense-fear"],
    ["crushing-despair", "/spells/spell.good-hope"],
    ["crushing-hand", "/spells/spell.interposing-hand"],
    ["cultural-adaptation", "/spells/spell.tongues"],
    ["curative-distillation", "/entities/rule.hit-points"],
    ["cure-critical-wounds-mass", "/spells/spell.cure-light-wounds-mass"],
    ["cure-light-wounds-mass", "/entities/rule.positive-energy"],
  ])("renders eighteenth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["create-demiplane-greater", "/entities/rule.solitude"],
    ["create-soul-gem", "/spells/spell.expend"],
    ["create-soul-gem", "/entities/rule.judgment"],
    ["create-soul-gem", "/entities/rule.unholy"],
    ["creeping-ice", "/spells/spell.slow"],
    ["cruel-jaunt", "/spells/spell.teleport"],
    ["crushing-despair", "/entities/rule.crushing-despair-modified"],
  ])("omits eighteenth-batch semantic false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("does not link Greater Create Mindscape or Mass Cure Light Wounds back through their own titles", async () => {
    const [mindscapeResponse, cureResponse] = await Promise.all([
      fetch(`${baseUrl}/spells/spell.create-mindscape-greater`),
      fetch(`${baseUrl}/spells/spell.cure-light-wounds-mass`),
    ]);
    const [mindscapeHtml, cureHtml] = await Promise.all([
      mindscapeResponse.text(),
      cureResponse.text(),
    ]);
    const mindscapeDescription = mindscapeHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    const cureDescription = cureHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(mindscapeDescription.match(/href="\/spells\/spell.create-mindscape"/g)).toHaveLength(1);
    expect(cureDescription).not.toContain('href="/spells/spell.cure-light-wounds"');
  });

  it("expands Crime of Opportunity's reviewed Crime Wave inheritance once", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.crime-of-opportunity`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html.match(/data-embedded-spell="spell.crime-wave"/g)).toHaveLength(1);
  });

  it("renders Reincarnate's incarnation tables and supplemental headings", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.reincarnate`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";

    expect(response.status).toBe(200);
    expect(description.match(/class="data-table rich-text-table"/g)).toHaveLength(3);
    expect(description).toContain("<h3>Reincarnation on Golarion</h3>");
    expect(description).toContain("<h3>Core Incarnations</h3>");
    expect(description).toContain("<h3>Other Incarnations</h3>");
    expect(description).toContain('<th scope="row">01</th><td>');
    expect(description).not.toContain("d%IncarnationStrDex");
  });

  it.each([
    ["cure-moderate-wounds-mass", "/spells/spell.cure-light-wounds-mass"],
    ["cure-serious-wounds-mass", "/spells/spell.cure-light-wounds-mass"],
    ["curse-of-befouled-fortune", "/entities/class-feature.charmed-life"],
    ["curse-of-disgust", "/entities/condition.sickened"],
    ["curse-of-dragonflies", "/spells/spell.gaseous-form"],
    ["curse-of-keeping", "/spells/spell.dispel-magic"],
    ["curse-of-magic-negation", "/entities/rule.spellblight"],
    ["curse-of-the-outcast", "/entities/rule.attitude"],
    ["curse-of-unexpected-death", "/entities/rule.touch-attack"],
    ["curse-water", "/entities/item.unholy-water"],
    ["cursed-earth", "/entities/rule.shakes"],
    ["cursed-treasure", "/spells/spell.bestow-curse"],
    ["cushioning-bands", "/entities/rule.falling-damage"],
    ["cyclic-reincarnation", "/spells/spell.reincarnate"],
    ["daemon-ward", "/spells/spell.death-ward"],
    ["damnation", "/rules/descriptors#evil"],
    ["damnation-of-memory", "/entities/rule.magic-aura-detection"],
    ["damp-powder", "/rules/actions#full-round-action"],
    ["dance-of-a-hundred-cuts", "/entities/rule.caster-level"],
    ["dance-of-a-thousand-cuts", "/spells/spell.haste"],
    ["dancing-darkness", "/rules/illumination#darkness"],
    ["dancing-lantern", "/entities/item.lantern"],
    ["dancing-lights", "/entities/monster.will-o-wisp"],
    ["dark-light", "/rules/descriptors#light"],
    ["dark-whispers", "/entities/rule.line-of-effect"],
  ])("renders nineteenth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["darkvault", "/rules/illumination#levels"],
    ["darkvision-communal", "/spells/spell.darkvision"],
    ["darkvision-greater", "/entities/rule.darkvision"],
    ["darting-duplicate", "/entities/rule.attack-of-opportunity"],
    ["daywalker", "/entities/rule.energy-drain"],
    ["daze", "/entities/rule.hit-dice"],
    ["daze-mass", "/spells/spell.daze"],
    ["daze-monster", "/spells/spell.daze"],
    ["dazzling-blade", "/entities/rule.silver"],
    ["dazzling-blade-mass", "/spells/spell.dazzling-blade"],
    ["deadeyes-lore", "/entities/rule.survival"],
    ["deadly-finale", "/entities/condition.bleed"],
    ["deadly-juggernaut", "/entities/rule.damage-reduction"],
    ["deadmans-contingency", "/spells/spell.magic-mouth"],
    ["deafening-song-bolt", "/entities/condition.deaf"],
    ["death-candle", "/entities/monster.fire-elemental"],
    ["death-clutch", "/spells/spell.regenerate"],
    ["death-knell-aura-greater", "/spells/spell.magic-jar"],
    ["death-pact", "/spells/spell.dominate-person"],
    ["deathwine", "/entities/rule.negative-energy"],
    ["debilitating-pain", "/entities/condition.stunned"],
    ["debilitating-pain-mass", "/spells/spell.debilitating-pain"],
    ["debilitating-portent", "/classes/witch"],
    ["debilitating-speech", "/rules/actions#full-round-action"],
    ["decapitate", "/entities/rule.critical-hit"],
  ])("renders twentieth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["daywalker", "/entities/rule.touch-attack"],
    ["daywalker", "/spells/spell.energy-drain"],
    ["daywalker", "/entities/condition.dead"],
    ["death-candle", "/entities/rule.summon"],
    ["death-clutch", "/entities/rule.regeneration"],
  ])("omits twentieth-batch semantic false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("links Greater Darkvision's parent spell and its granted sense separately", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.darkvision-greater`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(description.match(/href="\/spells\/spell.darkvision"/g)).toHaveLength(1);
    expect(description.match(/href="\/entities\/rule.darkvision"/g)).toHaveLength(1);
  });

  it.each([
    ["blood-salvation", "/entities/class-feature.blood-casting"],
    ["companion-life-link", "/rules/actions#free-action"],
    ["deceitful-veneer", "/spells/spell.discern-lies"],
    ["deceptive-redundancy", "/spells/spell.dispel-magic"],
    ["decollate", "/entities/rule.damage-reduction"],
    ["decompose-corpse", "/entities/rule.undead"],
    ["decrepit-disguise", "/spells/spell.quintessence"],
    ["deeper-darkness", "/rules/descriptors#darkness"],
    ["defending-bone", "/entities/rule.damage-reduction"],
    ["defensive-grace", "/entities/class-feature.inspiration"],
    ["defensive-shock", "/rules/descriptors#electricity"],
    ["deflect-blame", "/entities/rule.bluff"],
    ["deflection", "/rules/descriptors#force"],
    ["defoliate", "/entities/rule.negative-energy"],
    ["deft-digits", "/entities/rule.line-of-sight"],
    ["deja-vu", "/rules/actions#full-round-action"],
    ["delay-disease", "/entities/rule.disease"],
    ["delay-pain", "/rules/descriptors#pain"],
    ["delay-poison-communal", "/spells/spell.delay-poison"],
    ["delayed-blast-fireball", "/rules/descriptors#fire"],
    ["delectable-flesh", "/entities/rule.ability-check"],
    ["delusional-pride", "/rules/saving-throws"],
    ["demand", "/spells/spell.sending"],
    ["demand-offering", "/rules/actions#immediate-action"],
    ["demanding-message", "/spells/spell.message"],
  ])("renders twenty-first-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["blood-salvation", "/entities/rule.pathfinder-player-companion-advanced-class-origins"],
    ["decollate", "/entities/condition.dead"],
  ])("omits twenty-first-batch semantic false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("does not link parent names inside the child spell titles in Batch 21", async () => {
    const [darknessResponse, fireballResponse] = await Promise.all([
      fetch(`${baseUrl}/spells/spell.deeper-darkness`),
      fetch(`${baseUrl}/spells/spell.delayed-blast-fireball`),
    ]);
    const [darknessHtml, fireballHtml] = await Promise.all([
      darknessResponse.text(),
      fireballResponse.text(),
    ]);
    const darknessDescription = darknessHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    const fireballDescription = fireballHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(darknessDescription.match(/href="\/spells\/spell.darkness"/g)).toHaveLength(2);
    expect(fireballDescription.match(/href="\/spells\/spell.fireball"/g)).toHaveLength(1);
  });

  it.each([
    ["demanding-message-mass", "/spells/spell.demanding-message"],
    ["denounce", "/entities/rule.line-of-sight"],
    ["depilate", "/spells/spell.break-enchantment"],
    ["destabilize-powder", "/entities/rule.firearm"],
    ["destroy-robot", "/rules/saving-throws"],
    ["destruction", "/spells/spell.true-resurrection"],
    ["detect-aberration", "/spells/spell.detect-animals-or-plants"],
    ["detect-animals-or-plants", "/entities/rule.hit-points"],
    ["detect-anxieties", "/spells/spell.detect-thoughts"],
    ["detect-chaos", "/spells/spell.detect-evil"],
    ["detect-charm", "/spells/spell.detect-magic"],
    ["detect-demon", "/entities/rule.hit-dice"],
    ["detect-desires", "/entities/rule.circumstance-bonus"],
    ["detect-evil", "/entities/rule.line-of-sight"],
    ["detect-fiendish-presence", "/entities/deity.asmodeus"],
    ["detect-good", "/spells/spell.detect-evil"],
    ["detect-law", "/spells/spell.detect-evil"],
    ["detect-magic-greater", "/spells/spell.detect-magic"],
    ["detect-metal", "/entities/rule.silver"],
    ["detect-mindscape", "/spells/spell.detect-thoughts"],
    ["detect-poison", "/entities/rule.poison"],
    ["detect-psychic-significance", "/spells/spell.charge-object"],
    ["detect-radiation", "/entities/rule.radiation"],
    ["detect-relations", "/rules/saving-throws#will-saving-throw"],
    ["detect-snares-and-pits", "/spells/spell.snare"],
  ])("renders twenty-second-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it.each([
    ["detect-psychic-significance", "/spells/spell.detect-magic"],
    ["detect-radiation", "/entities/rule.see-in-darkness"],
    ["detect-snares-and-pits", "/spells/spell.detect-magic"],
  ])("omits twenty-second-batch semantic false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("links only explicit parent-spell references in Batch 22", async () => {
    const [magicResponse, snaresResponse] = await Promise.all([
      fetch(`${baseUrl}/spells/spell.detect-magic-greater`),
      fetch(`${baseUrl}/spells/spell.detect-snares-and-pits`),
    ]);
    const [magicHtml, snaresHtml] = await Promise.all([
      magicResponse.text(),
      snaresResponse.text(),
    ]);
    const magicDescription = magicHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    const snaresDescription = snaresHtml.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(magicDescription.match(/href="\/spells\/spell.detect-magic"/g)).toHaveLength(1);
    expect(snaresDescription.match(/href="\/spells\/spell.snare"/g)).toHaveLength(1);
  });

  it.each([
    ["detect-the-faithful", "/entities/rule.line-of-sight"],
    ["detect-thoughts", "/entities/rule.intelligence"],
    ["determine-depth", "/spells/spell.passwall"],
    ["detonate", "/rules/descriptors#acid"],
    ["detoxify", "/entities/rule.poison"],
    ["devil-snare", "/spells/spell.dimensional-anchor"],
    ["diagnose-disease", "/entities/condition.sickened"],
    ["die-for-your-master", "/spells/spell.bleed-for-your-master"],
    ["dimensional-anchor", "/spells/spell.astral-projection"],
    ["dimensional-blade", "/spells/spell.mage-armor"],
    ["dimensional-bounce", "/entities/rule.line-of-effect"],
    ["diminish-plants", "/spells/spell.entangle"],
    ["diminish-resistance", "/rules/descriptors#sonic"],
    ["diminished-detection", "/spells/spell.detect-magic"],
    ["disable-construct", "/entities/rule.immunity-to-magic"],
    ["discern-location", "/rules/magic-schools#scrying"],
    ["discharge", "/entities/rule.robot"],
    ["discharge-greater", "/spells/spell.discharge"],
    ["discovery-torch", "/rules/illumination#bright-light"],
    ["disguise-other", "/spells/spell.disguise-self"],
    ["disguise-self", "/entities/rule.creature-type"],
    ["disguise-weapon", "/entities/item.greatsword"],
    ["dismissal", "/entities/rule.extraplanar"],
    ["dispel-balance", "/spells/spell.dispel-magic"],
    ["dispel-chaos", "/spells/spell.dispel-evil"],
  ])("renders twenty-third-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it("links only semantic Batch 23 spell and touch references", async () => {
    const [greaterResponse, resistanceResponse, depthResponse, snareResponse, balanceResponse] =
      await Promise.all([
        fetch(`${baseUrl}/spells/spell.discharge-greater`),
        fetch(`${baseUrl}/spells/spell.diminish-resistance`),
        fetch(`${baseUrl}/spells/spell.determine-depth`),
        fetch(`${baseUrl}/spells/spell.devil-snare`),
        fetch(`${baseUrl}/spells/spell.dispel-balance`),
      ]);
    const descriptions = await Promise.all(
      [greaterResponse, resistanceResponse, depthResponse, snareResponse, balanceResponse].map(
        async (response) => (await response.text()).match(
          /<section><h2>Description<\/h2>(.*?)<\/section>/s,
        )?.[1] ?? "",
      ),
    );
    expect(descriptions[0]!.match(/href="\/spells\/spell.discharge"/g)).toHaveLength(3);
    expect(descriptions[1]!).not.toContain('href="/spells/spell.resistance"');
    for (const description of descriptions.slice(2)) {
      expect(description).not.toContain('>touch</a>');
    }
  });

  it.each([
    ["dispel-evil", "/entities/rule.touch-attack"],
    ["dispel-good", "/spells/spell.dispel-evil"],
    ["dispel-law", "/spells/spell.dispel-evil"],
    ["dispel-magic-greater", "/spells/spell.dispel-magic"],
    ["displacement", "/entities/rule.total-concealment"],
    ["display-aversion", "/spells/spell.minor-image"],
    ["disrupt-link", "/entities/class-feature.animal-companion"],
    ["disrupt-silence", "/spells/spell.silence"],
    ["disrupting-weapon", "/entities/rule.undead"],
    ["dissolution", "/spells/spell.miracle"],
    ["distracting-cacophony", "/entities/rule.concentration"],
    ["distressing-tone", "/entities/rule.critical-hit"],
    ["divide-mind", "/rules/actions#swift-action"],
    ["divination", "/spells/spell.augury"],
    ["divine-arrow", "/entities/rule.lay-on-hands"],
    ["divine-power", "/entities/rule.speed-weapon"],
    ["divine-transfer", "/entities/rule.hit-points"],
    ["divine-vessel", "/rules/descriptors#acid"],
    ["dominate-animal", "/entities/rule.animal"],
    ["dominate-monster", "/spells/spell.dominate-person"],
    ["domination-link", "/spells/spell.detect-thoughts"],
    ["dousing-rain", "/rules/descriptors#electricity"],
    ["draconic-ally", "/classes/inquisitor"],
    ["draconic-malice", "/classes/antipaladin"],
    ["draconic-suppression", "/rules/saving-throws"],
  ])("renders twenty-fourth-batch links for spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain(`href="${target}"`);
  });

  it("links only semantic Batch 24 contextual references", async () => {
    const [silenceResponse, displacementResponse, vesselResponse, linkResponse, dissolutionResponse] =
      await Promise.all([
        fetch(`${baseUrl}/spells/spell.disrupt-silence`),
        fetch(`${baseUrl}/spells/spell.displacement`),
        fetch(`${baseUrl}/spells/spell.divine-vessel`),
        fetch(`${baseUrl}/spells/spell.disrupt-link`),
        fetch(`${baseUrl}/spells/spell.dissolution`),
      ]);
    const descriptions = await Promise.all(
      [silenceResponse, displacementResponse, vesselResponse, linkResponse, dissolutionResponse]
        .map(async (response) => (await response.text()).match(
          /<section><h2>Description<\/h2>(.*?)<\/section>/s,
        )?.[1] ?? ""),
    );
    expect(descriptions[0]!.match(/href="\/spells\/spell.silence"/g)).toHaveLength(1);
    expect(descriptions[1]!.match(/href="\/entities\/rule.total-concealment"/g)).toHaveLength(2);
    expect(descriptions[2]!.match(/href="\/rules\/descriptors#cold"/g)).toHaveLength(3);
    expect(descriptions[2]!.match(/href="\/entities\/rule.good"/g)).toHaveLength(3);
    for (const description of descriptions.slice(3)) {
      expect(description).not.toContain('>touch</a>');
    }
  });

  it("renders Batch 25 tables and only reviewed contextual references", async () => {
    const [ceremonyResponse, terrainResponse, undeadResponse, travelResponse] =
      await Promise.all([
        fetch(`${baseUrl}/spells/spell.ceremony`),
        fetch(`${baseUrl}/spells/spell.curse-terrain-lesser`),
        fetch(`${baseUrl}/spells/spell.detect-undead`),
        fetch(`${baseUrl}/spells/spell.dream-travel`),
      ]);
    const descriptions = await Promise.all(
      [ceremonyResponse, terrainResponse, undeadResponse, travelResponse]
        .map(async (response) => (await response.text()).match(
          /<section><h2>Description<\/h2>(.*?)<\/section>/s,
        )?.[1] ?? ""),
    );

    expect(descriptions[0]!.match(/href="\/entities\/rule.touch-attack"/g))
      .toHaveLength(3);
    expect(descriptions[0]).toContain('href="/rules/descriptors#air"');
    expect(descriptions[1]).toContain('<table class="data-table rich-text-table">');
    expect(descriptions[1]).toContain('href="/spells/spell.curse-terrain-supreme"');
    expect(descriptions[1]).not.toContain('href="/spells/spell.curse-terrain-lesser"');
    expect(descriptions[2]).toContain('<table class="data-table rich-text-table">');
    expect(descriptions[2]).toContain('href="/entities/rule.undead"');
    expect(descriptions[3]!.match(/href="\/spells\/spell.dream"/g)).toHaveLength(1);
    expect(descriptions[3]).toContain('aria-label="Spell description table 1 of 2"');
    expect(descriptions[3]).toContain('aria-label="Spell description table 2 of 2"');
  });

  it("links Curse of Unexpected Death's touch attacks but not its ordinary touch verbs", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.curse-of-unexpected-death`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description.match(/href="\/entities\/rule.touch-attack"/g)).toHaveLength(2);
  });

  it.each([
    ["curse-of-dragonflies", "/classes/medium"],
    ["cursed-treasure", "/entities/rule.touch-attack"],
    ["damnation-of-memory", "/spells/spell.magic-aura"],
  ])("omits nineteenth-batch semantic false positives from spell %s", async (slug, target) => {
    const response = await fetch(`${baseUrl}/spells/spell.${slug}`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain(`href="${target}"`);
  });

  it("keeps Magic Aura's unmatched spell relationships outside its description", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.magic-aura`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain('class="rich-description"');
    expect(description).not.toContain('href="/spells/spell.arcane-sight"');
    expect(html).toContain('href="/spells/spell.arcane-sight"');
  });

  it("omits self-navigation and does not link rejected source placeholders", async () => {
    const [toxicityResponse, sprayResponse] = await Promise.all([
      fetch(`${baseUrl}/spells/spell.absorb-toxicity`),
      fetch(`${baseUrl}/spells/spell.acidic-spray`),
    ]);
    const [toxicity, spray] = await Promise.all([toxicityResponse.text(), sprayResponse.text()]);
    expect(toxicity).not.toContain('href="/spells/spell.absorb-toxicity"');
    expect(spray).not.toContain('href="/spells/spell.reflex"');
    expect(spray).toContain('<span class="muted">(rejected)</span>');
  });

  it("renders Greater Bestow Curse's persisted list without inventing missing links", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.bestow-curse-greater`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).toContain('<div class="rich-description">');
    expect(description).toContain("<ul><li>–12 penalty");
    expect(description).not.toContain("<a ");
  });

  it("shows exact lesser and greater title variants without asserting inheritance", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.bestow-curse-greater`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<h2 id="spell-family">Spell family</h2>');
    expect(html).toContain("does not by itself assert rules inheritance");
    expect(html.match(/data-embedded-spell="spell.bestow-curse"/g)).toHaveLength(1);
    expect(html).toContain('<h3 id="embedded-bestow-curse">Bestow Curse</h3>');
  });

  it("renders Darkness rules links, its separate mythic section, and Deeper Darkness", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.darkness`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain("Mythic Darkness");
    expect(description).not.toContain('href="/spells/spell.darkness"');
    for (const target of [
      "/rules/descriptors#darkness",
      "/rules/illumination#bright-light",
      "/rules/illumination#normal-light",
      "/rules/illumination#dim-light",
      "/rules/illumination#darkness",
      "/entities/rule.light-vulnerability",
      "/entities/rule.light-sensitivity",
      "/entities/rule.concealment",
      "/entities/rule.total-concealment",
      "/entities/item.torch",
      "/entities/item.lantern",
    ]) expect(description).toContain(`href="${target}"`);
    expect(html).toContain('<h2>Mythic Darkness</h2>');
    expect(html).toContain('<strong>Source</strong>: Mythic Adventures, page 90');
    expect(html.match(/data-embedded-spell="spell.deeper-darkness"/g)).toHaveLength(1);
  });

  it("falls back to escaped plain-text descriptions outside the pilot", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.light`);
    const html = await response.text();
    const description = html.match(/<section><h2>Description<\/h2>(.*?)<\/section>/s)?.[1] ?? "";
    expect(response.status).toBe(200);
    expect(description).not.toContain('class="rich-description"');
    expect(description).toContain("<p>");
  });

  it("expands each resolved functions-like parent once without recursion", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.conditional-curse`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html.match(/data-embedded-spell="spell.bestow-curse"/g)).toHaveLength(1);
    expect(html).toContain('<h2 id="embedded-bestow-curse">Bestow Curse</h2>');
    const embedded = html.match(/<section class="embedded-spell"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(embedded).not.toContain("Related rules");
    expect(embedded).not.toContain("Source observations");
  });

  it("visibly distinguishes legacy 3.5 spells from Pathfinder-native spells", async () => {
    const response = await fetch(`${baseUrl}/spells/spell.admonishing-ray`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<strong>Legacy 3.5 material.</strong>");
    expect(html).toContain("it is not a Pathfinder-native spell");
    expect(html).toContain("Legacy 3 5");

    const classResponse = await fetch(`${baseUrl}/classes/cleric`);
    const classHtml = await classResponse.text();
    expect(classResponse.status).toBe(200);
    expect(classHtml).toContain("Admonishing Ray");
    expect(classHtml).toContain('<span class="legacy-badge">Legacy 3.5</span>');
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
