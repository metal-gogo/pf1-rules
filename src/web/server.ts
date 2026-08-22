import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { createLocalPrisma } from "../db/client.js";
import {
  spellListQualificationsLabel,
  type SpellListQualification,
} from "../domain/spell-lists.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { findSpell, searchRules, spellsForList } from "../query/spells.js";


const stylesheet = `
:root { --table-divider: color-mix(in srgb, CanvasText 24%, Canvas); --table-highlight: color-mix(in srgb, Highlight 10%, Canvas); color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
body { margin: 0; }
header, main, footer { margin-inline: auto; max-width: 72rem; padding: 1rem; }
nav ul { display: flex; flex-wrap: wrap; gap: 1rem; list-style: none; padding: 0; }
main { min-height: 70vh; }
form { display: flex; flex-wrap: wrap; gap: .5rem; margin-block: 1rem; }
input, select, button { font: inherit; padding: .4rem; }
label { font-weight: 600; }
table { border-collapse: collapse; width: 100%; }
th, td { border-block-end: 1px solid var(--table-divider); padding: .55rem; text-align: left; vertical-align: top; }
.data-table tbody tr:hover > *, .data-table tbody tr:focus-within > * { background: var(--table-highlight); }
.data-table thead th { background: Canvas; position: sticky; top: 0; z-index: 1; }
.data-table .key-column { background: Canvas; left: 0; position: sticky; z-index: 1; }
.data-table thead .key-column { z-index: 2; }
.legacy-badge { border: 1px solid; border-radius: .25rem; display: inline-block; font-size: .78em; font-weight: 700; margin-inline-start: .35rem; padding: .05rem .3rem; }
.legacy-notice { border-inline-start: .3rem solid; padding: .65rem .85rem; }
.catalog-filters { align-items: end; border: 1px solid; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); padding: 1rem; }
.catalog-filter { display: grid; gap: .25rem; min-width: 0; }
.catalog-filter input, .catalog-filter select { box-sizing: border-box; max-width: 100%; min-height: 2.5rem; width: 100%; }
.letter-filter { margin-block: 1rem; }
.letter-filter ul { display: flex; flex-wrap: wrap; gap: .25rem; list-style: none; padding: 0; }
.letter-filter a { align-items: center; border: 1px solid; display: inline-flex; justify-content: center; min-block-size: 2.5rem; min-inline-size: 2.5rem; padding-inline: .25rem; }
.letter-filter a[aria-current="true"] { background: Highlight; color: HighlightText; font-weight: 700; text-decoration: none; }
.catalog-actions { align-items: center; display: flex; gap: .75rem; }
.catalog-results { align-items: baseline; display: flex; flex-wrap: wrap; gap: .5rem; justify-content: space-between; }
.catalog-results h2 { margin-block-end: 0; }
.pagination { align-items: center; display: flex; gap: 1rem; justify-content: center; margin-block: 1rem; }
.table-scroll:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
.alphabetical-table { min-width: 42rem; }
dt { font-weight: 700; }
dd { margin-block-end: .65rem; }
.skip-link { position: absolute; left: -10000px; }
.skip-link:focus { left: 1rem; top: 1rem; background: Canvas; padding: .5rem; z-index: 1; }
.visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
.muted { color: GrayText; }
.notice { border: 1px solid; padding: .75rem; }
.spell-list-kinds ul { display: flex; flex-wrap: wrap; gap: .35rem 1rem; }
.spell-list-section { margin-block: 2.5rem; }
.spell-list-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; list-style: none; padding: 0; }
.spell-list-grid li { border: 1px solid; padding: 1rem; }
.spell-list-grid a { display: block; font-size: 1.15rem; font-weight: 700; }
.spell-list-grid p { margin-block: .25rem 0; }
.sticky-spell-controls { background: Canvas; padding-block: .5rem; position: sticky; top: 0; z-index: 2; }
.spell-filters { border: 1px solid; margin-block: 0 1rem; padding: .75rem; }
.spell-filter-bar { align-items: end; display: grid; gap: .5rem; grid-template-columns: minmax(12rem, 1fr) auto auto; }
.filter-accordion-toggle { align-items: center; background: transparent; border: 1px solid; cursor: pointer; display: flex; font-weight: 700; gap: .5rem; justify-content: space-between; min-height: 2.5rem; padding: .4rem .75rem; text-align: left; }
.accordion-icon { display: inline-block; font-size: 1.2rem; transform: rotate(-90deg); transition: transform 120ms ease-out; }
.filter-accordion-toggle[aria-expanded="true"] .accordion-icon { transform: rotate(0); }
.filter-panel { background: Canvas; border: 1px solid; color: CanvasText; max-height: calc(100vh - 2rem); max-width: min(42rem, calc(100vw - 2rem)); padding: 0; width: 100%; }
.filter-panel::backdrop { background: color-mix(in srgb, CanvasText 40%, transparent); }
.filter-dialog-header { align-items: center; border-block-end: 1px solid var(--table-divider); display: flex; justify-content: space-between; padding: .75rem 1rem; }
.filter-dialog-header h2 { font-size: 1.2rem; margin: 0; }
.filter-dialog-body { max-height: calc(100vh - 11rem); overflow-y: auto; padding: 1rem; }
.filter-grid { display: flex; flex-direction: column; gap: .75rem; }
.filter-search { align-content: start; display: grid; gap: .25rem; }
.filter-search input { box-sizing: border-box; min-height: 2.5rem; width: 100%; }
.filter-status { margin-block: .65rem 0; }
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
.filter-mode-disclosure { clear: both; font-size: .9rem; margin-block: .25rem; }
.filter-mode-disclosure summary { cursor: pointer; }
.mode-option { background: transparent; border: 1px solid; cursor: pointer; font-size: .85rem; margin-inline-start: -1px; padding: .25rem .55rem; }
.mode-option:first-child { border-radius: .35rem 0 0 .35rem; margin-inline-start: 0; }
.mode-option:last-child { border-radius: 0 .35rem .35rem 0; }
.mode-option[aria-pressed="true"] { background: Highlight; color: HighlightText; font-weight: 700; position: relative; }
.mode-check { display: none; }
.mode-option[aria-pressed="true"] .mode-check { display: inline; }
.mode-option:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; z-index: 1; }
.filter-show-all[aria-pressed="true"] { background: Highlight; color: HighlightText; }
.filter-show-all[aria-pressed="true"] .tag-check { display: inline; }
.filter-dialog-actions { align-items: center; border-block-start: 1px solid var(--table-divider); display: flex; gap: .75rem; justify-content: flex-end; padding: .75rem 1rem; }
.spell-level { margin-block: 2.5rem; }
.spell-level h2 { align-items: baseline; display: flex; flex-wrap: wrap; gap: .35rem; }
.heading-count { font-size: .85em; font-weight: 400; }
.table-scroll { overflow: auto; position: relative; }
.spell-table-region { max-block-size: 70vh; }
.spell-table { min-width: 46rem; }
.spell-table .key-column { width: 22%; }
.spell-table .school-column { width: 16%; }
.spell-table .components-column { width: 7rem; }
.table-scroll-hint { display: none; }
.component-list { white-space: nowrap; }
.component-list abbr { text-decoration-thickness: 1px; text-underline-offset: .12em; }
.component-reference section { scroll-margin-top: 1rem; }
mark { background: Mark; color: MarkText; }
[hidden] { display: none !important; }
@media (max-width: 38rem) {
  .spell-filter-bar { grid-template-columns: 1fr auto; }
  .filter-search { grid-column: 1 / -1; }
  .filter-panel { height: calc(100vh - 1rem); max-height: calc(100vh - 1rem); max-width: calc(100vw - 1rem); }
  .filter-dialog-body { max-height: calc(100vh - 10rem); }
  .table-scroll-hint { display: block; font-size: .9rem; margin-block: 0 .4rem; }
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
  const compactReset = browser.querySelector("[data-filter-reset-compact]");
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

  function setAccordion(expanded, { focusPanel = false } = {}) {
    accordion.setAttribute("aria-expanded", String(expanded));
    if (expanded && !filterPanel.open) {
      filterPanel.showModal();
      if (focusPanel) filterPanel.querySelector("[data-filter-close]").focus();
    } else if (!expanded && filterPanel.open) {
      filterPanel.close();
    }
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
    if (element.dataset.highlightQuery === query) return;
    element.dataset.highlightQuery = query;
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
        if (shown) levelShown += 1;
        highlightMatches(row.querySelector(".spell-name"), query);
        highlightMatches(row.querySelector(".spell-summary"), query);
      }
      section.hidden = levelShown === 0;
      const count = section.querySelector(".level-count");
      count.textContent = "(" + levelShown + " of " + count.dataset.total + " spells shown)";
      totalShown += levelShown;
    }

    const activeFilters = [];
    if (query) activeFilters.push('Search “' + search.value.trim() + '”');
    for (const filter of filters) {
      const state = filterStates[filter];
      if (state.selected.length === 0) continue;
      const labels = state.selected.map((value) => {
        const checkbox = browser.querySelector('.filter-checkbox[data-filter="' + filter + '"][data-value="' + CSS.escape(value) + '"]');
        return checkbox?.dataset.label || value;
      });
      const groupName = filter === "school" ? "schools" : filter === "level" ? "levels" : "components";
      activeFilters.push((state.mode === "exclude" ? "Exclude " : "Include ") + groupName + ": " + labels.join(", "));
    }
    status.textContent = totalShown + " of " + rows.length + " spells shown. "
      + (activeFilters.length ? "Active filters: " + activeFilters.join("; ") + "." : "No filters active.");
    compactReset.hidden = activeFilters.length === 0;
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
      if (mode !== control.dataset.defaultMode) {
        hasActiveFilters = true;
        control.closest("details").open = true;
      }
    }

    compactReset.hidden = !hasActiveFilters;
    setAccordion(false);
  }

  function resetFilters() {
    search.value = "";
    for (const checkbox of browser.querySelectorAll(".filter-checkbox")) checkbox.checked = false;
    for (const filter of filters) {
      const control = modeControl(filter);
      setMode(filter, control.dataset.defaultMode);
      control.closest("details").open = false;
    }
    applyFilters();
    if (filterPanel.open) filterPanel.querySelector("[data-filter-close]").focus();
    else search.focus();
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

  accordion.addEventListener("click", () => setAccordion(true, { focusPanel: true }));
  for (const close of filterPanel.querySelectorAll("[data-filter-close]")) {
    close.addEventListener("click", () => setAccordion(false));
  }
  filterPanel.addEventListener("close", () => {
    accordion.setAttribute("aria-expanded", "false");
    accordion.focus();
  });
  for (const reset of browser.querySelectorAll("[data-filter-reset]")) reset.addEventListener("click", resetFilters);
  let searchFrame;
  search.addEventListener("input", () => {
    cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(() => applyFilters());
  });

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

function componentAbbreviations(types: SpellComponentType[]): string {
  const abbreviations = types.map((type) => {
    const metadata = spellComponentMetadata[type];
    return `<abbr title="${escapeHtml(metadata.name)} component">${metadata.abbreviation}</abbr>`;
  });
  return `<span class="component-list" aria-label="Components">${abbreviations.join(", ") || "None"}</span>`;
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

function relatedEntityHref(type: string, id: string): string {
  if (type === "spell") return spellHref(id);
  if (type === "spell_list") return listHref(id);
  return entityHref(id);
}

function classHref(id: string): string {
  const prefix = "spell-list.";
  const slug = id.startsWith(prefix) ? id.slice(prefix.length) : id;
  return `/classes/${encodeURIComponent(slug)}`;
}

function alphabeticalHref(url: URL, changes: Record<string, string | null>): string {
  const parameters = new URLSearchParams(url.searchParams);
  for (const [name, value] of Object.entries(changes)) {
    parameters.delete(name);
    if (value) parameters.set(name, value);
  }
  if (!("page" in changes)) parameters.delete("page");
  const query = parameters.toString();
  return `/spells/alphabetical${query ? `?${query}` : ""}`;
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
        <li><a href="/spells">Spell lists</a></li>
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
      <p><a href="/spells">Browse spells by spell list</a> or <a href="/spells/alphabetical">view all spells alphabetically</a>.</p>
    </section>`);
}

const spellListKindTitles: Record<string, string> = {
  class: "Classes",
  domain: "Domains",
  subdomain: "Subdomains",
  bloodline: "Bloodlines",
  mystery: "Mysteries",
  patron: "Patrons",
  spirit: "Spirits",
  elemental_school: "Elemental schools",
  feat: "Feats",
  formulae: "Formulae",
};

const spellListKindOrder = Object.keys(spellListKindTitles);

function spellListKindTitle(kind: string): string {
  return spellListKindTitles[kind] ?? humanize(kind);
}

function spellListKindAnchor(kind: string): string {
  return kind.replaceAll("_", "-");
}

function spellListDirectoryHref(listKind: string, listId: string): string {
  return listKind === "class" ? classHref(listId) : listHref(listId);
}

async function spellListsPage(prisma: PrismaClient): Promise<string> {
  const nameGroups = await prisma.spellLevel.groupBy({
    by: ["listKind", "spellListId", "listName"],
    _count: { _all: true },
    _min: { spellLevel: true },
    _max: { spellLevel: true },
    orderBy: [{ listKind: "asc" }, { listName: "asc" }],
  });
  const listsByKindAndId = new Map<string, {
    listKind: string;
    spellListId: string;
    listName: string;
    nameCount: number;
    spellCount: number;
    minimumLevel: number;
    maximumLevel: number;
  }>();
  for (const group of nameGroups) {
    const key = `${group.listKind}:${group.spellListId}`;
    const existing = listsByKindAndId.get(key);
    const groupCount = group._count._all;
    const minimumLevel = group._min.spellLevel ?? 0;
    const maximumLevel = group._max.spellLevel ?? minimumLevel;
    if (!existing) {
      listsByKindAndId.set(key, {
        listKind: group.listKind,
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
  const groups = new Map<string, Array<(typeof listsByKindAndId extends Map<string, infer Value> ? Value : never)>>();
  for (const list of listsByKindAndId.values()) {
    const lists = groups.get(list.listKind) ?? [];
    lists.push(list);
    groups.set(list.listKind, lists);
  }
  const orderedGroups = [...groups].sort(([left], [right]) => {
    const leftIndex = spellListKindOrder.indexOf(left);
    const rightIndex = spellListKindOrder.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
  for (const [, lists] of orderedGroups) {
    lists.sort((left, right) => left.listName.localeCompare(right.listName));
  }
  const totalLists = orderedGroups.reduce((total, [, lists]) => total + lists.length, 0);
  const totalEntries = orderedGroups.reduce(
    (total, [, lists]) => total + lists.reduce((subtotal, list) => subtotal + list.spellCount, 0),
    0,
  );

  return page("Spell lists by source", `<h1>Spell lists by source</h1>
    <p>Choose from ${totalLists} spell lists containing ${totalEntries} ingested entries. Sources include classes, domains, bloodlines, and every other list kind currently recorded in the database.</p>
    ${orderedGroups.length ? `<nav class="spell-list-kinds" aria-label="Spell list kinds"><ul>${orderedGroups.map(([kind, lists]) => `<li><a href="#${href(spellListKindAnchor(kind))}">${escapeHtml(spellListKindTitle(kind))} (${lists.length})</a></li>`).join("")}</ul></nav>
    ${orderedGroups.map(([kind, lists]) => `<section class="spell-list-section" id="${href(spellListKindAnchor(kind))}">
      <h2>${escapeHtml(spellListKindTitle(kind))} <span class="heading-count">(${lists.length} ${lists.length === 1 ? "list" : "lists"})</span></h2>
      <ul class="spell-list-grid">${lists.map((item) => {
        const minimum = item.minimumLevel;
        const maximum = item.maximumLevel;
        const levelRange = minimum === maximum ? `level ${minimum}` : `levels ${minimum}–${maximum}`;
        return `<li>
          <a href="${href(spellListDirectoryHref(item.listKind, item.spellListId))}">${escapeHtml(humanize(item.listName))}</a>
          <p>${item.spellCount} ${item.spellCount === 1 ? "spell" : "spells"} <span class="muted">· ${levelRange}</span></p>
        </li>`;
      }).join("")}</ul>
    </section>`).join("")}` : "<p>No spell lists have been ingested yet.</p>"}
    <p><a href="/spells/alphabetical">View the alphabetical spell catalog</a></p>`);
}

async function alphabeticalSpellsPage(prisma: PrismaClient, url: URL): Promise<string> {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const requestedLetter = url.searchParams.get("letter")?.trim().toLocaleUpperCase() ?? "";
  const letter = /^[A-Z]$/.test(requestedLetter) ? requestedLetter : "";
  const school = url.searchParams.get("school")?.trim() ?? "";
  const publication = url.searchParams.get("publication")?.trim() ?? "";
  const requestedSort = url.searchParams.get("sort") ?? "name";
  const sort = requestedSort === "school" || requestedSort === "publication" ? requestedSort : "name";
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSize = 50;
  const where = {
    ...(query ? { name: { contains: query } } : {}),
    ...(letter ? { name: { startsWith: letter } } : {}),
    ...(school ? { school } : {}),
    ...(publication ? { publicationBook: publication } : {}),
  };
  const orderBy = sort === "school"
    ? [{ school: "asc" as const }, { name: "asc" as const }]
    : sort === "publication"
      ? [{ publicationBook: "asc" as const }, { publicationPage: "asc" as const }, { name: "asc" as const }]
      : [{ name: "asc" as const }];
  const [total, schoolGroups, publicationGroups] = await Promise.all([
    prisma.canonicalSpell.count({ where }),
    prisma.canonicalSpell.groupBy({ by: ["school"], _count: { _all: true }, orderBy: { school: "asc" } }),
    prisma.canonicalSpell.groupBy({ by: ["publicationBook"], _count: { _all: true }, orderBy: { publicationBook: "asc" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), pageCount) : 1;
  const spells = await prisma.canonicalSpell.findMany({
    where,
    select: {
      spellId: true,
      name: true,
      legacy35Material: true,
      school: true,
      publicationBook: true,
      publicationPage: true,
    },
    orderBy,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });
  const firstResult = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastResult = Math.min(currentPage * pageSize, total);
  const hasFilters = Boolean(query || letter || school || publication || sort !== "name");
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const pagination = (position: "before" | "after") => pageCount > 1 ? `<nav class="pagination" aria-label="Catalog pages ${position} results">
    ${currentPage > 1 ? `<a rel="prev" href="${href(alphabeticalHref(url, { page: String(currentPage - 1) }))}">Previous</a>` : "<span>Previous</span>"}
    <span>Page ${currentPage} of ${pageCount}</span>
    ${currentPage < pageCount ? `<a rel="next" href="${href(alphabeticalHref(url, { page: String(currentPage + 1) }))}">Next</a>` : "<span>Next</span>"}
  </nav>` : "";
  return page("Alphabetical spells", `<nav aria-label="Breadcrumb"><ol><li><a href="/spells">Spell lists</a></li><li aria-current="page">Alphabetical spells</li></ol></nav>
    <h1>Alphabetical spells</h1>
    <p>Search and browse ${schoolGroups.reduce((sum, group) => sum + group._count._all, 0)} canonical spell records.</p>
    <form class="catalog-filters" action="/spells/alphabetical" method="get">
      <label class="catalog-filter" for="alphabetical-q"><span>Spell name</span><input id="alphabetical-q" name="q" type="search" value="${escapeHtml(query)}" autocomplete="off"></label>
      <label class="catalog-filter" for="alphabetical-school"><span>School</span><select id="alphabetical-school" name="school"><option value="">All schools</option>${schoolGroups.map((group) => `<option value="${escapeHtml(group.school)}"${group.school === school ? " selected" : ""}>${escapeHtml(humanize(group.school))} (${group._count._all})</option>`).join("")}</select></label>
      <label class="catalog-filter" for="alphabetical-publication"><span>Publication</span><select id="alphabetical-publication" name="publication"><option value="">All publications</option>${publicationGroups.map((group) => `<option value="${escapeHtml(group.publicationBook)}"${group.publicationBook === publication ? " selected" : ""}>${escapeHtml(group.publicationBook)} (${group._count._all})</option>`).join("")}</select></label>
      <label class="catalog-filter" for="alphabetical-sort"><span>Sort by</span><select id="alphabetical-sort" name="sort"><option value="name"${sort === "name" ? " selected" : ""}>Name</option><option value="school"${sort === "school" ? " selected" : ""}>School</option><option value="publication"${sort === "publication" ? " selected" : ""}>Publication</option></select></label>
      ${letter ? `<input type="hidden" name="letter" value="${letter}">` : ""}
      <div class="catalog-actions"><button type="submit">Apply filters</button>${hasFilters ? `<a href="/spells/alphabetical">Clear filters</a>` : ""}</div>
    </form>
    <nav class="letter-filter" aria-label="Filter spells by initial letter"><ul><li><a href="${href(alphabeticalHref(url, { letter: null }))}"${letter ? "" : ' aria-current="true"'}>All</a></li>${letters.map((item) => `<li><a href="${href(alphabeticalHref(url, { letter: item }))}"${letter === item ? ' aria-current="true"' : ""}>${item}</a></li>`).join("")}</ul></nav>
    <div class="catalog-results"><h2 id="alphabetical-results-heading">Results</h2><p>${firstResult}–${lastResult} of ${total} spells</p></div>
    ${pagination("before")}
    <div class="table-scroll" role="region" aria-labelledby="alphabetical-results-heading" tabindex="0">
    <table class="data-table alphabetical-table">
      <caption class="visually-hidden">Filtered canonical spells</caption>
      <thead><tr><th class="key-column" scope="col">Name</th><th scope="col">School</th><th scope="col">Publication</th></tr></thead>
      <tbody>${spells.map((spell) => `<tr>
        <th class="key-column" scope="row"><a href="${href(spellHref(spell.spellId))}">${escapeHtml(spell.name)}</a>${spell.legacy35Material ? ' <span class="legacy-badge">Legacy 3.5</span>' : ""}</th>
        <td>${escapeHtml(humanize(spell.school))}</td>
        <td>${escapeHtml(spell.publicationBook)}${spell.publicationPage === null ? "" : `, page ${spell.publicationPage}`}</td>
      </tr>`).join("")}</tbody>
    </table>
    </div>
    ${pagination("after")}`);
}

function spellComponentsPage(): string {
  return page("Spell components", `<nav aria-label="Breadcrumb"><ol><li><a href="/spells">Spell lists</a></li><li aria-current="page">Spell components</li></ol></nav>
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


function qualificationLabel(
  qualifications: readonly { payload: unknown }[],
): string | null {
  return spellListQualificationsLabel(
    qualifications.map(
      (qualification) => qualification.payload as SpellListQualification,
    ),
  );
}

async function classSpellsPage(prisma: PrismaClient, classSlug: string): Promise<string | null> {
  const listId = `spell-list.${classSlug}`;
  const [entity, entries, qualifications] = await Promise.all([
    prisma.entity.findUnique({
      where: { id: listId },
      select: { id: true, name: true, type: true },
    }),
    prisma.spellLevel.findMany({
      where: { spellListId: listId, listKind: "class" },
      select: {
        levelIndex: true,
        spellLevel: true,
        listName: true,
        scope: true,
        accessBasis: true,
        spell: {
          select: {
            spellId: true,
            name: true,
            legacy35Material: true,
            school: true,
            subschool: true,
            descriptionRaw: true,
            shortDescription: true,
            components: { select: { componentType: true, raw: true } },
          },
        },
      },
      orderBy: [{ spellLevel: "asc" }, { spell: { name: "asc" } }],
    }),
    prisma.spellListQualification.findMany({
      where: { spellLevel: { spellListId: listId, listKind: "class" } },
      select: { spellId: true, levelIndex: true, payload: true },
      orderBy: [
        { spellId: "asc" },
        { levelIndex: "asc" },
        { qualificationIndex: "asc" },
      ],
    }),
  ]);
  if (!entity || entity.type !== "spell_list" || entries.length === 0) return null;

  const className = humanize(entries[0]?.listName ?? entity.name.replace(/ spell list$/i, ""));
  const qualificationsByEntry = new Map<string, { payload: unknown }[]>();
  for (const qualification of qualifications) {
    const key = `${qualification.spellId}:${qualification.levelIndex}`;
    const entryQualifications = qualificationsByEntry.get(key) ?? [];
    entryQualifications.push(qualification);
    qualificationsByEntry.set(key, entryQualifications);
  }
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
      summary: entry.spell.shortDescription ?? summarizeDescription(entry.spell.descriptionRaw, 160),
    }] as const;
  }));
  const availableComponents = (Object.keys(spellComponentMetadata) as SpellComponentType[])
    .filter((type) => [...spellDisplay.values()].some((spell) => spell.components.includes(type)));
  const filterModeControl = (filter: string, label: string, defaultMode: "include" | "exclude") => `<div role="group" class="filter-mode" data-filter-mode="${filter}" data-mode="${defaultMode}" data-default-mode="${defaultMode}" aria-label="${escapeHtml(label)} filter mode">
    <button type="button" class="mode-option" data-mode-choice="include" aria-pressed="${defaultMode === "include"}"><span class="mode-check" aria-hidden="true">✓ </span>Include selected</button>
    <button type="button" class="mode-option" data-mode-choice="exclude" aria-pressed="${defaultMode === "exclude"}"><span class="mode-check" aria-hidden="true">✓ </span>Exclude selected</button>
  </div>`;
  const filterModeDisclosure = (filter: string, label: string, defaultMode: "include" | "exclude") => `<details class="filter-mode-disclosure"><summary>Match mode</summary>${filterModeControl(filter, label, defaultMode)}</details>`;
  const filterShowAll = (filter: string) => `<button type="button" class="filter-tag filter-show-all" data-show-all="${filter}" aria-pressed="true"><span class="tag-check" aria-hidden="true">✓ </span>Show all</button>`;
  const filterCheckbox = (filter: string, value: string, label: string, title?: string) => {
    const id = `filter-${filter}-${value.replace(/[^a-z0-9]+/gi, "-").toLocaleLowerCase()}`;
    return `<input class="filter-checkbox" id="${escapeHtml(id)}" type="checkbox" data-filter="${filter}" data-value="${escapeHtml(value)}" data-label="${escapeHtml(label)}"><label class="filter-tag" for="${escapeHtml(id)}"${title ? ` title="${escapeHtml(title)}"` : ""}><span class="tag-check" aria-hidden="true">✓ </span>${escapeHtml(label)}</label>`;
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
      <p class="table-scroll-hint muted">Scroll horizontally to see every column.</p>
      <div class="table-scroll spell-table-region" role="region" aria-labelledby="level-${level}" tabindex="0">
        <table class="data-table spell-table">
          <caption class="visually-hidden">Level ${level} ${escapeHtml(className)} spells</caption>
          <thead><tr><th class="key-column" scope="col">Name</th><th class="school-column" scope="col">School</th><th class="components-column" scope="col"><a href="/spell-components">Components</a></th><th scope="col">Summary</th></tr></thead>
          <tbody>${levelEntries.map((entry) => {
            const spell = entry.spell;
            const school = `${humanize(spell.school)}${spell.subschool ? ` (${humanize(spell.subschool)})` : ""}`;
            const display = spellDisplay.get(spell.spellId) ?? { components: [], summary: "" };
            const qualifiedAccess = qualificationLabel(
              qualificationsByEntry.get(`${spell.spellId}:${entry.levelIndex}`) ?? [],
            );
            const searchText = `${spell.name} ${display.summary} ${qualifiedAccess ?? ""}`.toLocaleLowerCase();
            return `<tr data-school="${escapeHtml(spell.school)}" data-level="${level}" data-components="${escapeHtml(display.components.join(" "))}" data-search="${escapeHtml(searchText)}">
              <th class="key-column" scope="row"><a class="spell-name" href="${href(spellHref(spell.spellId))}">${escapeHtml(spell.name)}</a>${spell.legacy35Material ? ' <span class="legacy-badge">Legacy 3.5</span>' : ""}${entry.accessBasis === "derived" ? ' <span class="muted">(derived access)</span>' : entry.accessBasis === "reviewed_override" ? ' <span class="muted">(reviewed override)</span>' : ""}${qualifiedAccess ? ` <span class="muted">(${escapeHtml(qualifiedAccess)})</span>` : ""}</th>
              <td class="school-column">${escapeHtml(school)}</td>
              <td class="components-column">${componentAbbreviations(display.components)}</td>
              <td><span class="spell-summary">${escapeHtml(display.summary)}</span></td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    </section>`;
  }).join("");

  return page(`${className} spells`, `<nav aria-label="Breadcrumb"><ol><li><a href="/spells">Spell lists</a></li><li aria-current="page">${escapeHtml(className)}</li></ol></nav>
    <div data-spell-browser>
      <h1>${escapeHtml(className)} spells</h1>
      <div class="sticky-spell-controls">
        <section class="spell-filters" aria-labelledby="spell-filters-heading">
          <h2 id="spell-filters-heading" class="visually-hidden">Find spells</h2>
          <div class="spell-filter-bar">
            <label class="filter-search" for="spell-filter-search"><strong>Search spells</strong><input id="spell-filter-search" type="search" placeholder="Name or description" autocomplete="off"></label>
            <button type="button" class="filter-accordion-toggle" data-filter-accordion aria-expanded="false" aria-controls="spell-filter-panel"><span>More filters</span><span class="accordion-icon" aria-hidden="true">▾</span></button>
            <button type="button" data-filter-reset data-filter-reset-compact hidden>Clear all</button>
          </div>
          <p id="spell-filter-status" class="filter-status heading-count" aria-live="polite">${entries.length} of ${entries.length} spells shown. No filters active.</p>
          <dialog id="spell-filter-panel" class="filter-panel" aria-labelledby="filter-dialog-heading">
            <div class="filter-dialog-header"><h2 id="filter-dialog-heading">Filter spells</h2><button type="button" data-filter-close aria-label="Close filters">Close</button></div>
            <div class="filter-dialog-body"><div class="filter-grid">
              <fieldset class="filter-group"><legend>Schools</legend>${filterModeDisclosure("school", "Schools", "include")}<div class="filter-tags">${filterShowAll("school")}${schoolTags}</div></fieldset>
              <fieldset class="filter-group"><legend>Levels</legend>${filterModeDisclosure("level", "Levels", "include")}<div class="filter-tags">${filterShowAll("level")}${levelTags}</div></fieldset>
              <fieldset class="filter-group"><legend>Components</legend>${filterModeDisclosure("components", "Components", "exclude")}<div class="filter-tags">${filterShowAll("components")}${componentTags}</div></fieldset>
            </div>
            </div>
            <div class="filter-dialog-actions"><button type="button" data-filter-reset>Clear all filters</button><button type="button" data-filter-close>Done</button></div>
          </dialog>
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
  const levelRows = spell.levels.map((level) => {
    const qualifiedAccess = qualificationLabel(level.qualifications);
    return `<li>
      <a href="${href(level.listKind === "class" ? classHref(level.spellListId) : listHref(level.spellListId))}">${escapeHtml(humanize(level.listName))}</a> ${level.spellLevel}${qualifiedAccess ? ` — ${escapeHtml(qualifiedAccess)}` : ""}${level.accessBasis === "derived" ? ' <span class="muted">(derived access)</span>' : level.accessBasis === "reviewed_override" ? ' <span class="muted">(reviewed override)</span>' : ""}
      <span class="muted">(${escapeHtml(humanize(level.scope))})</span>
    </li>`;
  }).join("");
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
      ${spell.legacy35Material ? '<p class="legacy-notice"><strong>Legacy 3.5 material.</strong> AoN catalogs this first-party spell for reference, but it is not a Pathfinder-native spell.</p>' : ""}
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
      <section><h2>Related entities</h2>${outgoing.length ? `<ul>${outgoing.map((relationship) => `<li>${escapeHtml(humanize(relationship.relationshipType))}: ${relationship.targetEntityId ? `<a href="${href(relatedEntityHref(relationship.targetEntityType, relationship.targetEntityId))}">${escapeHtml(relationship.targetName)}</a>` : escapeHtml(relationship.targetName)}</li>`).join("")}</ul>` : "<p>No outgoing relationships.</p>"}</section>
      <section><h2>Referenced by</h2>${incoming.length ? `<ul>${incoming.map((relationship) => { const owner = ownerById.get(relationship.ownerEntityId); return `<li><a href="${href(owner?.type === "spell" ? spellHref(relationship.ownerEntityId) : entityHref(relationship.ownerEntityId))}">${escapeHtml(owner?.name ?? relationship.ownerEntityId)}</a> — ${escapeHtml(humanize(relationship.relationshipType))}</li>`; }).join("")}</ul>` : "<p>No incoming relationships.</p>"}</section>
      <section><h2>Source observations</h2>${observations.length ? `<ul>${observations.map((observation) => `<li><a href="${href(sourceHref(observation.id))}">${escapeHtml(observation.siteId)}: ${escapeHtml(observation.pageTitleRaw ?? entity.name)}</a></li>`).join("")}</ul>` : "<p>No observations recorded.</p>"}</section>
    </article>`);
}

async function spellListPage(prisma: PrismaClient, listId: string): Promise<string | null> {
  const [entity, entries, ownerRelationships] = await Promise.all([
    prisma.entity.findUnique({ where: { id: listId }, select: { id: true, name: true, type: true, status: true } }),
    spellsForList(prisma, listId),
    prisma.ruleRelationship.findMany({
      where: {
        targetEntityId: listId,
        relationshipType: { in: ["owns_spell_list", "grants_spell_access", "inherits_spell_list"] },
      },
      orderBy: { ownerEntityId: "asc" },
    }),
  ]);
  if (!entity) return null;
  const owners = await prisma.entity.findMany({
    where: { id: { in: ownerRelationships.map((relationship) => relationship.ownerEntityId) } },
    select: { id: true, name: true, type: true },
  });
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  return page(entity.name, `<nav aria-label="Breadcrumb"><ol><li><a href="/spells">Spell lists</a></li><li aria-current="page">${escapeHtml(entity.name)}</li></ol></nav>
    <h1>${escapeHtml(entity.name)}</h1>
    <p><code>${escapeHtml(entity.id)}</code></p>
    ${ownerRelationships.length ? `<section><h2>Access owners</h2><ul>${ownerRelationships.map((relationship) => { const owner = ownerById.get(relationship.ownerEntityId); return `<li><a href="${href(relatedEntityHref(owner?.type ?? "unknown", relationship.ownerEntityId))}">${escapeHtml(owner?.name ?? relationship.ownerEntityId)}</a> — ${escapeHtml(humanize(relationship.relationshipType))}</li>`; }).join("")}</ul></section>` : ""}
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
      else if (url.pathname === "/spells") result = await spellListsPage(prisma);
      else if (url.pathname === "/spells/alphabetical") result = await alphabeticalSpellsPage(prisma, url);
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
