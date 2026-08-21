import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { createLocalPrisma } from "../db/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { findSpell, searchRules, spellsForList } from "../query/spells.js";


const stylesheet = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
body { margin: 0; }
header, main, footer { margin-inline: auto; max-width: 72rem; padding: 1rem; }
nav ul { display: flex; flex-wrap: wrap; gap: 1rem; list-style: none; padding: 0; }
main { min-height: 70vh; }
form { display: flex; flex-wrap: wrap; gap: .5rem; margin-block: 1rem; }
input, select, button { font: inherit; padding: .4rem; }
label { font-weight: 600; }
table { border-collapse: collapse; width: 100%; }
th, td { border-block-end: 1px solid; padding: .4rem; text-align: left; vertical-align: top; }
dt { font-weight: 700; }
dd { margin-block-end: .65rem; }
.skip-link { position: absolute; left: -10000px; }
.skip-link:focus { left: 1rem; top: 1rem; background: Canvas; padding: .5rem; z-index: 1; }
.muted { color: GrayText; }
.notice { border: 1px solid; padding: .75rem; }
.class-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; list-style: none; padding: 0; }
.class-grid li { border: 1px solid; padding: 1rem; }
.class-grid a { display: block; font-size: 1.15rem; font-weight: 700; }
.class-grid p { margin-block: .25rem 0; }
.sticky-spell-controls { background: Canvas; max-height: calc(100vh - 1rem); overflow-y: auto; padding-block: .5rem; position: sticky; top: 0; z-index: 2; }
.sticky-spell-controls h1 { margin-block: 0 .5rem; }
.spell-filters { border: 1px solid; margin-block: 0 1rem; }
.spell-filters h2 { font-size: 1.1rem; margin: 0; }
.filter-accordion-toggle { align-items: center; background: transparent; border: 0; cursor: pointer; display: flex; font-weight: 700; justify-content: space-between; padding: .75rem 1rem; text-align: left; width: 100%; }
.accordion-icon { display: inline-block; font-size: 1.2rem; transform: rotate(-90deg); transition: transform 120ms ease-out; }
.filter-accordion-toggle[aria-expanded="true"] .accordion-icon { transform: rotate(0); }
.filter-panel { border-block-start: 1px solid; padding: 1rem; }
.filter-grid { display: flex; flex-direction: column; gap: .75rem; }
.filter-search { align-content: start; display: grid; gap: .25rem; }
.filter-search input { box-sizing: border-box; height: 2.3rem; width: 100%; }
.filter-group { border: 0; margin: 0; min-width: 0; padding: 0; }
.filter-group legend { float: left; font-weight: 700; margin-inline-end: .5rem; padding: .2rem 0; }
.filter-tags { clear: both; display: flex; flex-wrap: wrap; gap: .3rem; padding-block-start: .35rem; }
.filter-checkbox { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
.filter-tag { border: 1px solid; border-radius: 999px; cursor: pointer; padding: .2rem .55rem; }
.filter-checkbox:checked + .filter-tag { background: Highlight; color: HighlightText; }
.tag-check { display: none; }
.filter-checkbox:checked + .filter-tag .tag-check { display: inline; }
.filter-checkbox:focus-visible + .filter-tag { outline: 3px solid Highlight; outline-offset: 2px; }
.filter-mode { display: inline-flex; margin-block-end: .15rem; }
.mode-option { background: transparent; border: 1px solid; cursor: pointer; font-size: .85rem; margin-inline-start: -1px; padding: .25rem .55rem; }
.mode-option:first-child { border-radius: .35rem 0 0 .35rem; margin-inline-start: 0; }
.mode-option:last-child { border-radius: 0 .35rem .35rem 0; }
.mode-option[aria-pressed="true"] { background: Highlight; color: HighlightText; font-weight: 700; position: relative; }
.mode-check { display: none; }
.mode-option[aria-pressed="true"] .mode-check { display: inline; }
.mode-option:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; z-index: 1; }
.filter-show-all[aria-pressed="true"] { background: Highlight; color: HighlightText; }
.filter-show-all[aria-pressed="true"] .tag-check { display: inline; }
.spell-level { margin-block: 2.5rem; }
.spell-level h2 { align-items: baseline; display: flex; flex-wrap: wrap; gap: .35rem; }
.heading-count { font-size: .85em; font-weight: 400; }
.table-scroll { overflow-x: auto; }
.spell-table { min-width: 48rem; }
.spell-table th:nth-child(2) { width: 18%; }
.spell-table th:nth-child(3) { width: 14%; }
.row-number { font-variant-numeric: tabular-nums; text-align: right; width: 2.5rem; }
.component-list { white-space: nowrap; }
.component-list a { font-weight: 700; }
.component-reference section { scroll-margin-top: 1rem; }
mark { background: Mark; color: MarkText; }
[hidden] { display: none !important; }
@media (max-width: 38rem) {
  .sticky-spell-controls { max-height: calc(100vh - .5rem); }
}
code { overflow-wrap: anywhere; }
`;

const classSpellsScript = `
(() => {
  const browser = document.querySelector("[data-spell-browser]");
  if (!browser) return;

  const rows = [...browser.querySelectorAll("tbody tr[data-school]")];
  const search = browser.querySelector("#spell-filter-search");
  const status = browser.querySelector("#spell-filter-status");
  const accordion = browser.querySelector("[data-filter-accordion]");
  const filterPanel = browser.querySelector("#spell-filter-panel");
  const filters = ["school", "level", "components"];
  const parameters = {
    school: { values: "school", mode: "schoolMode" },
    level: { values: "level", mode: "levelMode" },
    components: { values: "component", mode: "componentMode" },
  };

  function selectedValues(filter) {
    return [...browser.querySelectorAll('.filter-checkbox[data-filter="' + filter + '"]:checked')]
      .map((checkbox) => checkbox.dataset.value);
  }

  function modeControl(filter) {
    return browser.querySelector('[data-filter-mode="' + filter + '"]');
  }

  function setMode(filter, mode) {
    const control = modeControl(filter);
    control.dataset.mode = mode;
    for (const option of control.querySelectorAll("[data-mode-choice]")) {
      option.setAttribute("aria-pressed", String(option.dataset.modeChoice === mode));
    }
  }

  function setAccordion(expanded) {
    accordion.setAttribute("aria-expanded", String(expanded));
    filterPanel.hidden = !expanded;
  }

  function updateShowAll(filter) {
    const showAll = browser.querySelector('[data-show-all="' + filter + '"]');
    showAll.setAttribute("aria-pressed", String(selectedValues(filter).length === 0));
  }

  function matchesFilter(row, filter, state) {
    const selected = state.selected;
    if (selected.length === 0) return true;
    const rowValues = filter === "components"
      ? (row.dataset.components || "").split(" ").filter(Boolean)
      : [row.dataset[filter]];
    const matchesAny = selected.some((value) => rowValues.includes(value));
    return state.mode === "exclude" ? !matchesAny : matchesAny;
  }

  function highlightMatches(element, query) {
    const originalText = element.dataset.originalText || element.textContent;
    element.dataset.originalText = originalText;
    element.replaceChildren();
    if (!query) {
      element.textContent = originalText;
      return;
    }

    const searchableText = originalText.toLocaleLowerCase();
    let position = 0;
    let match = searchableText.indexOf(query);
    while (match !== -1) {
      element.append(document.createTextNode(originalText.slice(position, match)));
      const mark = document.createElement("mark");
      mark.textContent = originalText.slice(match, match + query.length);
      element.append(mark);
      position = match + query.length;
      match = searchableText.indexOf(query, position);
    }
    element.append(document.createTextNode(originalText.slice(position)));
  }

  function updateUrl(filterStates, query) {
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    if (query) url.searchParams.set("q", search.value.trim());

    for (const filter of filters) {
      const parameter = parameters[filter];
      url.searchParams.delete(parameter.values);
      url.searchParams.delete(parameter.mode);
      for (const value of filterStates[filter].selected) url.searchParams.append(parameter.values, value);
      const defaultMode = modeControl(filter).dataset.defaultMode;
      if (filterStates[filter].mode !== defaultMode) {
        url.searchParams.set(parameter.mode, filterStates[filter].mode);
      }
    }

    window.history.replaceState(null, "", url);
  }

  function applyFilters({ syncUrl = true } = {}) {
    const query = search.value.trim().toLocaleLowerCase();
    const filterStates = Object.fromEntries(filters.map((filter) => [filter, {
      selected: selectedValues(filter),
      mode: modeControl(filter).dataset.mode,
    }]));
    let totalShown = 0;

    for (const section of browser.querySelectorAll(".spell-level")) {
      let levelShown = 0;
      for (const row of section.querySelectorAll("tbody tr[data-school]")) {
        const matchesTags = filters.every((filter) => matchesFilter(row, filter, filterStates[filter]));
        const matchesSearch = !query || row.dataset.search.includes(query);
        const shown = matchesTags && matchesSearch;
        row.hidden = !shown;
        if (shown) {
          levelShown += 1;
          row.querySelector(".row-number").textContent = String(levelShown);
        }
        highlightMatches(row.querySelector(".spell-name"), query);
        highlightMatches(row.querySelector(".spell-summary"), query);
      }
      section.hidden = levelShown === 0;
      const count = section.querySelector(".level-count");
      count.textContent = "(" + levelShown + " of " + count.dataset.total + " spells shown)";
      totalShown += levelShown;
    }

    status.textContent = "(" + totalShown + " of " + rows.length + " spells shown)";
    for (const filter of filters) updateShowAll(filter);
    if (syncUrl) updateUrl(filterStates, query);
  }

  function hydrateFromUrl() {
    const searchParameters = new URL(window.location.href).searchParams;
    search.value = searchParameters.get("q") || "";
    let hasActiveFilters = Boolean(search.value);

    for (const filter of filters) {
      const parameter = parameters[filter];
      const requestedValues = new Set(searchParameters.getAll(parameter.values));
      for (const checkbox of browser.querySelectorAll('.filter-checkbox[data-filter="' + filter + '"]')) {
        checkbox.checked = requestedValues.has(checkbox.dataset.value);
        if (checkbox.checked) hasActiveFilters = true;
      }

      const control = modeControl(filter);
      const requestedMode = searchParameters.get(parameter.mode);
      const mode = requestedMode === "include" || requestedMode === "exclude"
        ? requestedMode
        : control.dataset.defaultMode;
      setMode(filter, mode);
      if (mode !== control.dataset.defaultMode) hasActiveFilters = true;
    }

    setAccordion(hasActiveFilters);
  }

  for (const checkbox of browser.querySelectorAll(".filter-checkbox")) {
    checkbox.addEventListener("change", () => applyFilters());
  }

  for (const option of browser.querySelectorAll("[data-mode-choice]")) {
    option.addEventListener("click", () => {
      setMode(option.closest("[data-filter-mode]").dataset.filterMode, option.dataset.modeChoice);
      applyFilters();
    });
  }

  for (const showAll of browser.querySelectorAll("[data-show-all]")) {
    showAll.addEventListener("click", () => {
      for (const checkbox of browser.querySelectorAll('.filter-checkbox[data-filter="' + showAll.dataset.showAll + '"]')) {
        checkbox.checked = false;
      }
      applyFilters();
    });
  }

  accordion.addEventListener("click", () => setAccordion(accordion.getAttribute("aria-expanded") !== "true"));
  search.addEventListener("input", () => applyFilters());

  hydrateFromUrl();
  applyFilters({ syncUrl: false });
})();
`;

const spellComponentMetadata = {
  verbal: { abbreviation: "V", name: "Verbal", anchor: "verbal" },
  somatic: { abbreviation: "S", name: "Somatic", anchor: "somatic" },
  material: { abbreviation: "M", name: "Material", anchor: "material" },
  focus: { abbreviation: "F", name: "Focus", anchor: "focus" },
  divine_focus: { abbreviation: "DF", name: "Divine focus", anchor: "divine-focus" },
  other: { abbreviation: "Other", name: "Other or special", anchor: "other" },
} as const;

type SpellComponentType = keyof typeof spellComponentMetadata;

function spellComponentTypes(components: Array<{ componentType: string; raw: string | null }>): SpellComponentType[] {
  const types = new Set<SpellComponentType>();
  for (const component of components) {
    if (component.componentType in spellComponentMetadata && component.componentType !== "other") {
      types.add(component.componentType as SpellComponentType);
      continue;
    }
    const raw = component.raw?.toUpperCase() ?? "";
    const parsedTypes: SpellComponentType[] = [];
    if (/\bDF\b/.test(raw)) parsedTypes.push("divine_focus");
    if (/\bV\b/.test(raw)) parsedTypes.push("verbal");
    if (/\bS\b/.test(raw)) parsedTypes.push("somatic");
    if (/\bM\b/.test(raw)) parsedTypes.push("material");
    if (/\bF\b/.test(raw)) parsedTypes.push("focus");
    if (parsedTypes.length === 0) parsedTypes.push("other");
    for (const type of parsedTypes) types.add(type);
  }
  return (Object.keys(spellComponentMetadata) as SpellComponentType[]).filter((type) => types.has(type));
}

function componentLinks(types: SpellComponentType[]): string {
  const links = types.map((type) => {
    const metadata = spellComponentMetadata[type];
    return `<a href="/spell-components#${metadata.anchor}" title="${escapeHtml(metadata.name)} component">${metadata.abbreviation}</a>`;
  });
  return `<span class="component-list" aria-label="Components">[${links.join(", ")}]</span>`;
}

function summarizeDescription(value: string, maximumLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximumLength) return normalized;
  const sentences = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [normalized];
  let summary = "";
  for (const sentence of sentences) {
    const candidate = `${summary}${summary ? " " : ""}${sentence.trim()}`;
    if (candidate.length > maximumLength) break;
    summary = candidate;
  }
  if (summary.length >= 80) return summary;
  const clipped = normalized.slice(0, maximumLength - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : clipped.length).trimEnd()}…`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function href(path: string): string {
  return escapeHtml(path);
}

function entityHref(id: string): string {
  return `/entities/${encodeURIComponent(id)}`;
}

function spellHref(id: string): string {
  return `/spells/${encodeURIComponent(id)}`;
}

function sourceHref(id: string): string {
  return `/sources/${encodeURIComponent(id)}`;
}

function listHref(id: string): string {
  return `/lists/${encodeURIComponent(id)}`;
}

function classHref(id: string): string {
  const prefix = "spell-list.";
  const slug = id.startsWith(prefix) ? id.slice(prefix.length) : id;
  return `/classes/${encodeURIComponent(slug)}`;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paragraphs(value: string): string {
  return value
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function page(title: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · PF1 Rules</title>
  <meta name="description" content="Browse the local Pathfinder First Edition rules database.">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <a class="skip-link" href="#content">Skip to main content</a>
  <header>
    <a href="/">PF1 Rules</a>
    <nav aria-label="Primary navigation">
      <ul>
        <li><a href="/spells">Classes</a></li>
        <li><a href="/spells/alphabetical">Alphabetical</a></li>
        <li><a href="/entities">Entities</a></li>
        <li><a href="/search">Search</a></li>
      </ul>
    </nav>
  </header>
  <main id="content">
    ${content}
  </main>
  <footer><p>Local, provenance-aware Pathfinder First Edition rules database.</p></footer>
</body>
</html>`;
}

function searchForm(query = ""): string {
  return `<form action="/search" method="get" role="search">
    <label for="q">Search the rules</label>
    <input id="q" name="q" type="search" value="${escapeHtml(query)}" autocomplete="off">
    <button type="submit">Search</button>
  </form>`;
}

function sendHtml(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendText(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function homePage(prisma: PrismaClient): Promise<string> {
  const [spellCount, entityCount, observationCount, relationshipCount, spells] = await Promise.all([
    prisma.canonicalSpell.count(),
    prisma.entity.count(),
    prisma.sourceObservation.count(),
    prisma.ruleRelationship.count(),
    prisma.canonicalSpell.findMany({
      select: { spellId: true, name: true, school: true },
      orderBy: { name: "asc" },
      take: 8,
    }),
  ]);

  return page("Home", `<h1>Pathfinder First Edition rules</h1>
    <p>Browse normalized spell records and follow their local relationships back to source observations.</p>
    ${searchForm()}
    <section aria-labelledby="database-summary">
      <h2 id="database-summary">Database summary</h2>
      <dl>
        <dt>Spells</dt><dd>${spellCount}</dd>
        <dt>Entities</dt><dd>${entityCount}</dd>
        <dt>Source observations</dt><dd>${observationCount}</dd>
        <dt>Relationships</dt><dd>${relationshipCount}</dd>
      </dl>
    </section>
    <section aria-labelledby="start-browsing">
      <h2 id="start-browsing">Start browsing</h2>
      <ul>${spells.map((spell) => `<li><a href="${href(spellHref(spell.spellId))}">${escapeHtml(spell.name)}</a> <span class="muted">(${escapeHtml(spell.school)})</span></li>`).join("")}</ul>
      <p><a href="/spells">Browse spells by class</a> or <a href="/spells/alphabetical">view all spells alphabetically</a>.</p>
    </section>`);
}

async function classesPage(prisma: PrismaClient): Promise<string> {
  const classNameGroups = await prisma.spellLevel.groupBy({
    by: ["spellListId", "listName"],
    where: { listKind: "class" },
    _count: { _all: true },
    _min: { spellLevel: true },
    _max: { spellLevel: true },
    orderBy: { listName: "asc" },
  });
  const classesById = new Map<string, {
    spellListId: string;
    listName: string;
    nameCount: number;
    spellCount: number;
    minimumLevel: number;
    maximumLevel: number;
  }>();
  for (const group of classNameGroups) {
    const existing = classesById.get(group.spellListId);
    const groupCount = group._count._all;
    const minimumLevel = group._min.spellLevel ?? 0;
    const maximumLevel = group._max.spellLevel ?? minimumLevel;
    if (!existing) {
      classesById.set(group.spellListId, {
        spellListId: group.spellListId,
        listName: group.listName,
        nameCount: groupCount,
        spellCount: groupCount,
        minimumLevel,
        maximumLevel,
      });
      continue;
    }
    existing.spellCount += groupCount;
    existing.minimumLevel = Math.min(existing.minimumLevel, minimumLevel);
    existing.maximumLevel = Math.max(existing.maximumLevel, maximumLevel);
    if (groupCount > existing.nameCount) {
      existing.listName = group.listName;
      existing.nameCount = groupCount;
    }
  }
  const classes = [...classesById.values()].sort((left, right) => left.listName.localeCompare(right.listName));

  return page("Spells by class", `<h1>Spells by class</h1>
    <p>Choose a class to browse its ${classes.reduce((total, item) => total + item.spellCount, 0)} ingested spell-list entries, organized by spell level.</p>
    ${classes.length ? `<ul class="class-grid">${classes.map((item) => {
      const minimum = item.minimumLevel;
      const maximum = item.maximumLevel;
      const levelRange = minimum === maximum ? `level ${minimum}` : `levels ${minimum}–${maximum}`;
      return `<li>
        <a href="${href(classHref(item.spellListId))}">${escapeHtml(humanize(item.listName))}</a>
        <p>${item.spellCount} ${item.spellCount === 1 ? "spell" : "spells"} <span class="muted">· ${levelRange}</span></p>
      </li>`;
    }).join("")}</ul>` : "<p>No class spell lists have been ingested yet.</p>"}
    <p><a href="/spells/alphabetical">View the alphabetical spell catalog</a></p>`);
}

async function alphabeticalSpellsPage(prisma: PrismaClient): Promise<string> {
  const spells = await prisma.canonicalSpell.findMany({
    select: {
      spellId: true,
      name: true,
      school: true,
      publicationBook: true,
      publicationPage: true,
    },
    orderBy: { name: "asc" },
  });
  return page("Alphabetical spells", `<nav aria-label="Breadcrumb"><ol><li><a href="/spells">Classes</a></li><li aria-current="page">Alphabetical spells</li></ol></nav>
    <h1>Alphabetical spells</h1>
    <p>${spells.length} canonical spell records.</p>
    <table>
      <caption>Canonical spells in alphabetical order</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">School</th><th scope="col">Publication</th></tr></thead>
      <tbody>${spells.map((spell) => `<tr>
        <th scope="row"><a href="${href(spellHref(spell.spellId))}">${escapeHtml(spell.name)}</a></th>
        <td>${escapeHtml(humanize(spell.school))}</td>
        <td>${escapeHtml(spell.publicationBook)}${spell.publicationPage === null ? "" : `, page ${spell.publicationPage}`}</td>
      </tr>`).join("")}</tbody>
    </table>`);
}

function spellComponentsPage(): string {
  return page("Spell components", `<nav aria-label="Breadcrumb"><ol><li><a href="/spells">Classes</a></li><li aria-current="page">Spell components</li></ol></nav>
    <article class="component-reference">
      <h1>Spell components</h1>
      <p>Component abbreviations describe what a caster must provide while casting a spell. The component links in class spell tables lead to the matching section below.</p>
      <nav aria-label="Component types"><ul>
        <li><a href="#verbal">V — Verbal</a></li>
        <li><a href="#somatic">S — Somatic</a></li>
        <li><a href="#material">M — Material</a></li>
        <li><a href="#focus">F — Focus</a></li>
        <li><a href="#divine-focus">DF — Divine focus</a></li>
        <li><a href="#other">Other or special</a></li>
      </ul></nav>
      <section id="verbal"><h2>V — Verbal</h2><p>The caster must speak the spell's words in a strong voice. A caster who cannot speak clearly, such as one affected by magical silence, cannot supply this component.</p></section>
      <section id="somatic"><h2>S — Somatic</h2><p>The caster must make measured, precise gestures and needs the free use of at least one hand to supply this component.</p></section>
      <section id="material"><h2>M — Material</h2><p>A physical substance or object used up during casting. Most material components have negligible cost, but the spell record identifies components with a specific price.</p></section>
      <section id="focus"><h2>F — Focus</h2><p>A prop required to cast the spell. Unlike a material component, a focus is not consumed during casting and can normally be used again.</p></section>
      <section id="divine-focus"><h2>DF — Divine focus</h2><p>An object of religious significance, such as a holy symbol, used as a focus for a divine spell. It is not consumed during casting.</p></section>
      <section id="other"><h2>Other or special</h2><p>Some records contain alternatives, unusual focus types, or source-specific component notation that does not fit one standard category. Check the spell's detail page for its exact recorded wording.</p></section>
    </article>`);
}

async function classSpellsPage(prisma: PrismaClient, classSlug: string): Promise<string | null> {
  const listId = `spell-list.${classSlug}`;
  const [entity, entries] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: listId },
      select: { id: true, name: true, type: true },
    }),
    prisma.spellLevel.findMany({
      where: { spellListId: listId, listKind: "class" },
      select: {
        spellLevel: true,
        listName: true,
        scope: true,
        spell: {
          select: {
            spellId: true,
            name: true,
            school: true,
            subschool: true,
            descriptionRaw: true,
            components: { select: { componentType: true, raw: true } },
          },
        },
      },
      orderBy: [{ spellLevel: "asc" }, { spell: { name: "asc" } }],
    }),
  ]);
  if (!entity || entity.type !== "spell_list" || entries.length === 0) return null;

  const className = humanize(entries[0]?.listName ?? entity.name.replace(/ spell list$/i, ""));
  const entriesByLevel = new Map<number, typeof entries>();
  for (const entry of entries) {
    const levelEntries = entriesByLevel.get(entry.spellLevel) ?? [];
    levelEntries.push(entry);
    entriesByLevel.set(entry.spellLevel, levelEntries);
  }
  const levels = [...entriesByLevel.keys()];
  const schools = [...new Set(entries.map((entry) => entry.spell.school))].sort((left, right) => left.localeCompare(right));
  const spellDisplay = new Map(entries.map((entry) => {
    const components = spellComponentTypes(entry.spell.components);
    return [entry.spell.spellId, {
      components,
      summary: summarizeDescription(entry.spell.descriptionRaw),
    }] as const;
  }));
  const availableComponents = (Object.keys(spellComponentMetadata) as SpellComponentType[])
    .filter((type) => [...spellDisplay.values()].some((spell) => spell.components.includes(type)));
  const filterModeControl = (filter: string, label: string, defaultMode: "include" | "exclude") => `<div role="group" class="filter-mode" data-filter-mode="${filter}" data-mode="${defaultMode}" data-default-mode="${defaultMode}" aria-label="${escapeHtml(label)} filter mode">
    <button type="button" class="mode-option" data-mode-choice="include" aria-pressed="${defaultMode === "include"}"><span class="mode-check" aria-hidden="true">✓ </span>Include selected</button>
    <button type="button" class="mode-option" data-mode-choice="exclude" aria-pressed="${defaultMode === "exclude"}"><span class="mode-check" aria-hidden="true">✓ </span>Exclude selected</button>
  </div>`;
  const filterShowAll = (filter: string) => `<button type="button" class="filter-tag filter-show-all" data-show-all="${filter}" aria-pressed="true"><span class="tag-check" aria-hidden="true">✓ </span>Show all</button>`;
  const filterCheckbox = (filter: string, value: string, label: string, title?: string) => {
    const id = `filter-${filter}-${value.replace(/[^a-z0-9]+/gi, "-").toLocaleLowerCase()}`;
    return `<input class="filter-checkbox" id="${escapeHtml(id)}" type="checkbox" data-filter="${filter}" data-value="${escapeHtml(value)}"><label class="filter-tag" for="${escapeHtml(id)}"${title ? ` title="${escapeHtml(title)}"` : ""}><span class="tag-check" aria-hidden="true">✓ </span>${escapeHtml(label)}</label>`;
  };
  const schoolTags = schools.map((school) => filterCheckbox("school", school, humanize(school))).join("");
  const levelTags = levels.map((level) => filterCheckbox("level", String(level), String(level))).join("");
  const componentTags = availableComponents.map((type) => {
    const metadata = spellComponentMetadata[type];
    return filterCheckbox("components", type, metadata.abbreviation, `${metadata.name} component`);
  }).join("");
  const levelTables = levels.map((level) => {
    const levelEntries = entriesByLevel.get(level) ?? [];
    return `<section class="spell-level" aria-labelledby="level-${level}">
      <h2 id="level-${level}">Level ${level} ${escapeHtml(className)} Spells <span class="heading-count level-count" data-total="${levelEntries.length}">(${levelEntries.length} of ${levelEntries.length} spells shown)</span></h2>
      <div class="table-scroll" role="region" aria-label="${escapeHtml(className)} level ${level} spells" tabindex="0">
        <table class="spell-table" aria-label="${escapeHtml(className)} level ${level} spells">
          <thead><tr><th class="row-number" scope="col" aria-label="Row number">#</th><th scope="col">Name</th><th scope="col">School</th><th scope="col">Description</th></tr></thead>
          <tbody>${levelEntries.map((entry, index) => {
            const spell = entry.spell;
            const school = `${humanize(spell.school)}${spell.subschool ? ` (${humanize(spell.subschool)})` : ""}`;
            const display = spellDisplay.get(spell.spellId) ?? { components: [], summary: "" };
            const searchText = `${spell.name} ${display.summary}`.toLocaleLowerCase();
            return `<tr data-school="${escapeHtml(spell.school)}" data-level="${level}" data-components="${escapeHtml(display.components.join(" "))}" data-search="${escapeHtml(searchText)}">
              <td class="row-number">${index + 1}</td>
              <th scope="row"><a class="spell-name" href="${href(spellHref(spell.spellId))}">${escapeHtml(spell.name)}</a></th>
              <td>${escapeHtml(school)}</td>
              <td>${componentLinks(display.components)} <span class="spell-summary">${escapeHtml(display.summary)}</span></td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    </section>`;
  }).join("");

  return page(`${className} spells`, `<nav aria-label="Breadcrumb"><ol><li><a href="/spells">Classes</a></li><li aria-current="page">${escapeHtml(className)}</li></ol></nav>
    <div data-spell-browser>
      <div class="sticky-spell-controls">
        <h1>${escapeHtml(className)} spells</h1>
        <section class="spell-filters" aria-labelledby="spell-filters-heading">
          <h2 id="spell-filters-heading"><button type="button" class="filter-accordion-toggle" data-filter-accordion aria-expanded="false" aria-controls="spell-filter-panel"><span>Filter Spells <span id="spell-filter-status" class="heading-count" aria-live="polite">(${entries.length} of ${entries.length} spells shown)</span></span><span class="accordion-icon" aria-hidden="true">▾</span></button></h2>
          <div id="spell-filter-panel" class="filter-panel" hidden>
            <div class="filter-grid">
              <label class="filter-search" for="spell-filter-search"><strong>Search spell</strong><input id="spell-filter-search" type="search" placeholder="Name or description" autocomplete="off"></label>
              <fieldset class="filter-group"><legend>Schools</legend>${filterModeControl("school", "Schools", "include")}<div class="filter-tags">${filterShowAll("school")}${schoolTags}</div></fieldset>
              <fieldset class="filter-group"><legend>Levels</legend>${filterModeControl("level", "Levels", "include")}<div class="filter-tags">${filterShowAll("level")}${levelTags}</div></fieldset>
              <fieldset class="filter-group"><legend>Components</legend>${filterModeControl("components", "Components", "exclude")}<div class="filter-tags">${filterShowAll("components")}${componentTags}</div></fieldset>
            </div>
          </div>
        </section>
      </div>
      <div id="spell-level-tables">${levelTables}</div>
    </div>
    <script src="/class-spells.js" defer></script>`);
}

async function spellPage(prisma: PrismaClient, spellId: string): Promise<string | null> {
  const [spell, outgoing, incoming] = await Promise.all([
    findSpell(prisma, spellId),
    prisma.ruleRelationship.findMany({
      where: { ownerEntityId: spellId },
      include: { target: true },
      orderBy: [{ relationshipType: "asc" }, { targetName: "asc" }],
    }),
    prisma.ruleRelationship.findMany({
      where: { targetEntityId: spellId },
      orderBy: [{ relationshipType: "asc" }, { ownerEntityId: "asc" }],
    }),
  ]);
  if (!spell) return null;

  const [observations, owners] = await Promise.all([
    prisma.sourceObservation.findMany({
      where: { entityId: spell.spellId },
      select: { id: true, siteId: true, pageTitleRaw: true, retrievedAt: true },
      orderBy: { siteId: "asc" },
    }),
    prisma.entity.findMany({
      where: { id: { in: [...new Set(incoming.map((relationship) => relationship.ownerEntityId))] } },
      select: { id: true, name: true, type: true },
    }),
  ]);
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

  const componentRows = spell.components.map((component) => `<li>
    ${escapeHtml(component.raw ?? humanize(component.componentType))}
    ${component.conditionRaw ? `<span>— ${escapeHtml(component.conditionRaw)}</span>` : ""}
  </li>`).join("");
  const levelRows = spell.levels.map((level) => `<li>
    <a href="${href(level.listKind === "class" ? classHref(level.spellListId) : listHref(level.spellListId))}">${escapeHtml(humanize(level.listName))}</a> ${level.spellLevel}
    <span class="muted">(${escapeHtml(humanize(level.scope))})</span>
  </li>`).join("");
  const deliveryRows = spell.deliveryFields.map((field) => `<dt>${escapeHtml(field.labelRaw)}</dt><dd>${escapeHtml(field.valueRaw ?? "Not recorded")}</dd>`).join("");
  const description = spell.descriptionSections.length > 0
    ? spell.descriptionSections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs(section.body)}</section>`).join("")
    : `<section><h2>Description</h2>${paragraphs(spell.descriptionRaw)}</section>`;
  const related = outgoing.map((relationship) => `<li>
    ${escapeHtml(humanize(relationship.relationshipType))}:
    ${relationship.targetEntityId ? `<a href="${href(entityHref(relationship.targetEntityId))}">${escapeHtml(relationship.targetName)}</a>` : escapeHtml(relationship.targetName)}
    <span class="muted">(${escapeHtml(relationship.status)})</span>
  </li>`).join("");
  const backlinks = incoming.map((relationship) => {
    const owner = ownerById.get(relationship.ownerEntityId);
    const ownerUrl = owner?.type === "spell" ? spellHref(relationship.ownerEntityId) : entityHref(relationship.ownerEntityId);
    return `<li><a href="${href(ownerUrl)}">${escapeHtml(owner?.name ?? relationship.ownerEntityId)}</a> — ${escapeHtml(humanize(relationship.relationshipType))}</li>`;
  }).join("");

  return page(spell.name, `<nav aria-label="Breadcrumb"><ol><li><a href="/spells/alphabetical">Alphabetical spells</a></li><li aria-current="page">${escapeHtml(spell.name)}</li></ol></nav>
    <article>
      <h1>${escapeHtml(spell.name)}</h1>
      <p><code>${escapeHtml(spell.spellId)}</code></p>
      <dl>
        <dt>School</dt><dd>${escapeHtml(humanize(spell.school))}${spell.subschool ? ` (${escapeHtml(spell.subschool)})` : ""}</dd>
        <dt>Casting time</dt><dd>${escapeHtml(spell.castingTimeRaw ?? `${spell.castingTimeAmount ?? ""} ${humanize(spell.castingTimeUnit)}`)}</dd>
        <dt>Components</dt><dd>${escapeHtml(spell.componentsRaw ?? "Not recorded")}</dd>
        <dt>Range</dt><dd>${escapeHtml(spell.rangeRaw ?? humanize(spell.rangeCategory))}</dd>
        ${deliveryRows}
        <dt>Duration</dt><dd>${escapeHtml(spell.durationRaw ?? humanize(spell.durationKind))}</dd>
        <dt>Publication</dt><dd>${escapeHtml(spell.publicationBook)}${spell.publicationPage === null ? "" : `, page ${spell.publicationPage}`}</dd>
      </dl>
      <section aria-labelledby="spell-lists"><h2 id="spell-lists">Spell lists</h2><ul>${levelRows}</ul></section>
      <section aria-labelledby="components"><h2 id="components">Components</h2><ul>${componentRows || "<li>None recorded</li>"}</ul></section>
      ${description}
      ${spell.mythicVariant ? `<section id="mythic"><h2>Mythic ${escapeHtml(spell.name)}</h2>${paragraphs(spell.mythicVariant.rulesRaw)}${spell.mythicVariant.augmentations.length ? `<h3>Augmentations</h3><ul>${spell.mythicVariant.augmentations.map((augmentation) => `<li><strong>${escapeHtml(augmentation.name)}</strong>: ${escapeHtml(augmentation.raw)}</li>`).join("")}</ul>` : ""}</section>` : ""}
      <section aria-labelledby="related-rules"><h2 id="related-rules">Related rules</h2>${related ? `<ul>${related}</ul>` : "<p>No outgoing relationships.</p>"}</section>
      <section aria-labelledby="referenced-by"><h2 id="referenced-by">Referenced by</h2>${backlinks ? `<ul>${backlinks}</ul>` : "<p>No incoming relationships.</p>"}</section>
      <section aria-labelledby="sources"><h2 id="sources">Source observations</h2>${observations.length ? `<ul>${observations.map((observation) => `<li><a href="${href(sourceHref(observation.id))}">${escapeHtml(observation.siteId)}: ${escapeHtml(observation.pageTitleRaw ?? spell.name)}</a> <span class="muted">(${escapeHtml(observation.retrievedAt.toISOString().slice(0, 10))})</span></li>`).join("")}</ul>` : "<p>No observations recorded.</p>"}</section>
    </article>`);
}

async function entitiesPage(prisma: PrismaClient, url: URL): Promise<string> {
  const selectedType = url.searchParams.get("type")?.trim() ?? "";
  const query = url.searchParams.get("q")?.trim() ?? "";
  const [entities, typeRows] = await Promise.all([
    prisma.entity.findMany({
      where: {
        ...(selectedType ? { type: selectedType } : {}),
        ...(query ? { OR: [{ name: { contains: query } }, { id: { contains: query } }] } : {}),
      },
      select: { id: true, name: true, type: true, status: true, canonicalSpell: { select: { spellId: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.entity.groupBy({ by: ["type"], _count: { _all: true }, orderBy: { type: "asc" } }),
  ]);

  return page("Entities", `<h1>Entities</h1>
    <form action="/entities" method="get">
      <label for="entity-q">Name or ID</label>
      <input id="entity-q" name="q" type="search" value="${escapeHtml(query)}">
      <label for="type">Type</label>
      <select id="type" name="type"><option value="">All types</option>${typeRows.map((row) => `<option value="${escapeHtml(row.type)}"${row.type === selectedType ? " selected" : ""}>${escapeHtml(humanize(row.type))} (${row._count._all})</option>`).join("")}</select>
      <button type="submit">Filter</button>
    </form>
    <p aria-live="polite">${entities.length} entities found.</p>
    <ul>${entities.map((entity) => `<li><a href="${href(entity.canonicalSpell ? spellHref(entity.id) : entityHref(entity.id))}">${escapeHtml(entity.name)}</a> <span class="muted">${escapeHtml(humanize(entity.type))}; ${escapeHtml(entity.status)}</span></li>`).join("")}</ul>`);
}

async function entityPage(prisma: PrismaClient, entityId: string): Promise<string | null> {
  const [entity, outgoing, incoming, observations] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, name: true, type: true, status: true, aliases: true, notes: true, canonicalSpell: { select: { spellId: true } } },
    }),
    prisma.ruleRelationship.findMany({ where: { ownerEntityId: entityId }, include: { target: true }, orderBy: { targetName: "asc" } }),
    prisma.ruleRelationship.findMany({ where: { targetEntityId: entityId }, orderBy: { ownerEntityId: "asc" } }),
    prisma.sourceObservation.findMany({
      where: { entityId },
      select: { id: true, siteId: true, pageTitleRaw: true, descriptionRaw: true, sourceUrl: true, retrievedAt: true },
      orderBy: [{ siteId: "asc" }, { retrievedAt: "desc" }],
    }),
  ]);
  if (!entity) return null;
  if (entity.canonicalSpell) return spellPage(prisma, entity.canonicalSpell.spellId);

  const ownerIds = [...new Set(incoming.map((relationship) => relationship.ownerEntityId))];
  const owners = await prisma.entity.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, type: true } });
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const aliases = Array.isArray(entity.aliases) ? entity.aliases : [];
  const primaryDefinition = observations.find((observation) => observation.siteId === "aon") ?? observations[0];

  return page(entity.name, `<nav aria-label="Breadcrumb"><ol><li><a href="/entities">Entities</a></li><li aria-current="page">${escapeHtml(entity.name)}</li></ol></nav>
    <article>
      <h1>${escapeHtml(entity.name)}</h1>
      <dl>
        <dt>ID</dt><dd><code>${escapeHtml(entity.id)}</code></dd>
        <dt>Type</dt><dd>${escapeHtml(humanize(entity.type))}</dd>
        <dt>Status</dt><dd>${escapeHtml(entity.status)}</dd>
        <dt>Aliases</dt><dd>${aliases.length ? aliases.map(escapeHtml).join(", ") : "None recorded"}</dd>
      </dl>
      ${primaryDefinition ? `<section><h2>Definition</h2>${paragraphs(primaryDefinition.descriptionRaw)}<p class="muted">Source wording from <a href="${href(sourceHref(primaryDefinition.id))}">${escapeHtml(primaryDefinition.siteId)}</a>, retrieved ${escapeHtml(primaryDefinition.retrievedAt.toISOString().slice(0, 10))}.</p></section>` : ""}
      <section><h2>Related entities</h2>${outgoing.length ? `<ul>${outgoing.map((relationship) => `<li>${escapeHtml(humanize(relationship.relationshipType))}: ${relationship.targetEntityId ? `<a href="${href(entityHref(relationship.targetEntityId))}">${escapeHtml(relationship.targetName)}</a>` : escapeHtml(relationship.targetName)}</li>`).join("")}</ul>` : "<p>No outgoing relationships.</p>"}</section>
      <section><h2>Referenced by</h2>${incoming.length ? `<ul>${incoming.map((relationship) => { const owner = ownerById.get(relationship.ownerEntityId); return `<li><a href="${href(owner?.type === "spell" ? spellHref(relationship.ownerEntityId) : entityHref(relationship.ownerEntityId))}">${escapeHtml(owner?.name ?? relationship.ownerEntityId)}</a> — ${escapeHtml(humanize(relationship.relationshipType))}</li>`; }).join("")}</ul>` : "<p>No incoming relationships.</p>"}</section>
      <section><h2>Source observations</h2>${observations.length ? `<ul>${observations.map((observation) => `<li><a href="${href(sourceHref(observation.id))}">${escapeHtml(observation.siteId)}: ${escapeHtml(observation.pageTitleRaw ?? entity.name)}</a></li>`).join("")}</ul>` : "<p>No observations recorded.</p>"}</section>
    </article>`);
}

async function spellListPage(prisma: PrismaClient, listId: string): Promise<string | null> {
  const [entity, entries] = await Promise.all([
    prisma.entity.findUnique({ where: { id: listId }, select: { id: true, name: true, type: true, status: true } }),
    spellsForList(prisma, listId),
  ]);
  if (!entity) return null;
  return page(entity.name, `<nav aria-label="Breadcrumb"><ol><li><a href="/entities?type=spell_list">Spell lists</a></li><li aria-current="page">${escapeHtml(entity.name)}</li></ol></nav>
    <h1>${escapeHtml(entity.name)}</h1>
    <p><code>${escapeHtml(entity.id)}</code></p>
    ${entries.length ? `<table><caption>Ingested spells on this list</caption><thead><tr><th scope="col">Level</th><th scope="col">Spell</th><th scope="col">Scope</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${entry.spellLevel}</td><th scope="row"><a href="${href(spellHref(entry.spellId))}">${escapeHtml(entry.spell.name)}</a></th><td>${escapeHtml(humanize(entry.scope))}</td></tr>`).join("")}</tbody></table>` : "<p>No ingested spells are attached to this list.</p>"}
    <p><a href="${href(entityHref(entity.id))}">View the underlying entity record</a></p>`);
}

async function sourcePage(prisma: PrismaClient, observationId: string): Promise<string | null> {
  const observation = await prisma.sourceObservation.findUnique({
    where: { id: observationId },
    include: {
      links: { orderBy: { occurrenceIndex: "asc" } },
      references: { orderBy: { occurrenceIndex: "asc" } },
      sections: { orderBy: { sectionIndex: "asc" } },
      deliveryFields: { orderBy: { fieldIndex: "asc" } },
    },
  });
  if (!observation) return null;
  const localOwnerHref = observation.entityType === "spell" ? spellHref(observation.entityId) : entityHref(observation.entityId);
  return page(observation.pageTitleRaw ?? observation.nameRaw, `<nav aria-label="Breadcrumb"><ol><li><a href="${href(localOwnerHref)}">${escapeHtml(observation.nameRaw)}</a></li><li aria-current="page">Source observation</li></ol></nav>
    <article>
      <h1>${escapeHtml(observation.pageTitleRaw ?? observation.nameRaw)}</h1>
      <p class="notice">This page preserves one source's wording. Return to the <a href="${href(localOwnerHref)}">canonical local record</a> for normalized rules.</p>
      <dl>
        <dt>Source</dt><dd>${escapeHtml(observation.siteId)}</dd>
        <dt>Retrieved</dt><dd><time datetime="${escapeHtml(observation.retrievedAt.toISOString())}">${escapeHtml(observation.retrievedAt.toISOString())}</time></dd>
        <dt>HTTP status</dt><dd>${observation.httpStatus}</dd>
        <dt>Parser</dt><dd>${escapeHtml(observation.parserName)} ${escapeHtml(observation.parserVersion)}</dd>
        <dt>Original page</dt><dd><a href="${escapeHtml(observation.sourceUrl)}" rel="external noreferrer">${escapeHtml(observation.sourceUrl)}</a></dd>
      </dl>
      <section><h2>Recorded fields</h2><dl>
        ${observation.schoolRaw ? `<dt>School</dt><dd>${escapeHtml(observation.schoolRaw)}</dd>` : ""}
        ${observation.levelsRaw ? `<dt>Levels</dt><dd>${escapeHtml(observation.levelsRaw)}</dd>` : ""}
        ${observation.castingTimeRaw ? `<dt>Casting time</dt><dd>${escapeHtml(observation.castingTimeRaw)}</dd>` : ""}
        ${observation.componentsRaw ? `<dt>Components</dt><dd>${escapeHtml(observation.componentsRaw)}</dd>` : ""}
        ${observation.rangeRaw ? `<dt>Range</dt><dd>${escapeHtml(observation.rangeRaw)}</dd>` : ""}
        ${observation.deliveryFields.map((field) => `<dt>${escapeHtml(field.labelRaw)}</dt><dd>${escapeHtml(field.valueRaw ?? "Not recorded")}</dd>`).join("")}
        ${observation.durationRaw ? `<dt>Duration</dt><dd>${escapeHtml(observation.durationRaw)}</dd>` : ""}
      </dl></section>
      <section><h2>Description</h2>${paragraphs(observation.descriptionRaw)}</section>
      ${observation.sections.map((section) => section.headingRaw
        ? `<section><h2>${escapeHtml(section.headingRaw)}</h2>${paragraphs(section.bodyRaw)}</section>`
        : `<section aria-label="Additional source text">${paragraphs(section.bodyRaw)}</section>`).join("")}
      <section><h2>Links captured from the source</h2>${observation.links.length ? `<ul>${observation.links.map((link) => `<li>${link.targetEntityIdHint ? `<a href="${href(entityHref(link.targetEntityIdHint))}">${escapeHtml(link.anchorTextRaw)}</a>` : link.hrefResolved ? `<a href="${escapeHtml(link.hrefResolved)}" rel="external noreferrer">${escapeHtml(link.anchorTextRaw)}</a>` : escapeHtml(link.anchorTextRaw)} <span class="muted">(${escapeHtml(link.sourceField)})</span></li>`).join("")}</ul>` : "<p>No links recorded.</p>"}</section>
    </article>`);
}

async function searchPage(prisma: PrismaClient, url: URL): Promise<string> {
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) return page("Search", `<h1>Search</h1>${searchForm()}<p>Enter a spell name, rule term, or entity name.</p>`);
  const [rules, entities] = await Promise.all([
    searchRules(prisma, query),
    prisma.entity.findMany({
      where: { OR: [{ name: { contains: query } }, { id: { contains: query } }] },
      select: { id: true, name: true, type: true, canonicalSpell: { select: { spellId: true } } },
      orderBy: { name: "asc" },
      take: 25,
    }),
  ]);
  const total = rules.spells.length + rules.mythicVariants.length + entities.length;
  return page(`Search: ${query}`, `<h1>Search</h1>${searchForm(query)}
    <p aria-live="polite">${total} results for <strong>${escapeHtml(query)}</strong>.</p>
    <section><h2>Spells</h2>${rules.spells.length ? `<ul>${rules.spells.map((spell) => `<li><a href="${href(spellHref(spell.spellId))}">${escapeHtml(spell.name)}</a> <span class="muted">(${escapeHtml(spell.school)})</span></li>`).join("")}</ul>` : "<p>No matching spells.</p>"}</section>
    <section><h2>Mythic variants</h2>${rules.mythicVariants.length ? `<ul>${rules.mythicVariants.map((variant) => `<li><a href="${href(`${spellHref(variant.baseSpellId)}#mythic`)}">${escapeHtml(variant.name)}</a></li>`).join("")}</ul>` : "<p>No matching mythic variants.</p>"}</section>
    <section><h2>Entities</h2>${entities.length ? `<ul>${entities.map((entity) => `<li><a href="${href(entity.canonicalSpell ? spellHref(entity.id) : entityHref(entity.id))}">${escapeHtml(entity.name)}</a> <span class="muted">(${escapeHtml(humanize(entity.type))})</span></li>`).join("")}</ul>` : "<p>No matching entities.</p>"}</section>`);
}

function notFoundPage(): string {
  return page("Not found", `<h1>Page not found</h1><p>The requested local database record does not exist.</p><p><a href="/">Return home</a></p>`);
}

export function createRequestHandler(prisma: PrismaClient) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("allow", "GET, HEAD");
        sendHtml(response, 405, page("Method not allowed", "<h1>Method not allowed</h1>"));
        return;
      }
      const url = new URL(request.url ?? "/", "http://localhost");
      let result: string | null = null;
      if (url.pathname === "/styles.css") {
        sendText(response, 200, stylesheet, "text/css; charset=utf-8");
        return;
      }
      if (url.pathname === "/class-spells.js") {
        sendText(response, 200, classSpellsScript, "text/javascript; charset=utf-8");
        return;
      }
      if (url.pathname === "/") result = await homePage(prisma);
      else if (url.pathname === "/spells") result = await classesPage(prisma);
      else if (url.pathname === "/spells/alphabetical") result = await alphabeticalSpellsPage(prisma);
      else if (url.pathname === "/spell-components") result = spellComponentsPage();
      else if (url.pathname === "/entities") result = await entitiesPage(prisma, url);
      else if (url.pathname === "/search") result = await searchPage(prisma, url);
      else if (url.pathname.startsWith("/classes/")) result = await classSpellsPage(prisma, decodeURIComponent(url.pathname.slice(9)));
      else if (url.pathname.startsWith("/spells/")) result = await spellPage(prisma, decodeURIComponent(url.pathname.slice(8)));
      else if (url.pathname.startsWith("/entities/")) result = await entityPage(prisma, decodeURIComponent(url.pathname.slice(10)));
      else if (url.pathname.startsWith("/lists/")) result = await spellListPage(prisma, decodeURIComponent(url.pathname.slice(7)));
      else if (url.pathname.startsWith("/sources/")) result = await sourcePage(prisma, decodeURIComponent(url.pathname.slice(9)));

      sendHtml(response, result ? 200 : 404, result ?? notFoundPage());
    } catch (error) {
      console.error(error);
      sendHtml(response, 500, page("Error", `<h1>Unable to read the database</h1><p>The local server encountered an error while loading this page.</p>`));
    }
  };
}

async function start(): Promise<void> {
  const prisma = createLocalPrisma();
  const server = createServer(createRequestHandler(prisma));
  const host = process.env.PF1_WEB_HOST ?? "127.0.0.1";
  const port = Number(process.env.PF1_WEB_PORT ?? "3000");
  server.listen(port, host, () => {
    console.log(`PF1 Rules is available at http://${host}:${port}`);
  });
  const stop = () => server.close(() => void prisma.$disconnect());
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await start();
}
