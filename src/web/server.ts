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
code { overflow-wrap: anywhere; }
`;

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
        <li><a href="/spells">Spells</a></li>
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
  });
  response.end(body);
}

function sendText(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
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
      <p><a href="/spells">View all spells</a></p>
    </section>`);
}

async function spellsPage(prisma: PrismaClient): Promise<string> {
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
  return page("Spells", `<h1>Spells</h1>
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
    <a href="${href(listHref(level.spellListId))}">${escapeHtml(level.listName)}</a> ${level.spellLevel}
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

  return page(spell.name, `<nav aria-label="Breadcrumb"><ol><li><a href="/spells">Spells</a></li><li aria-current="page">${escapeHtml(spell.name)}</li></ol></nav>
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
      if (url.pathname === "/") result = await homePage(prisma);
      else if (url.pathname === "/spells") result = await spellsPage(prisma);
      else if (url.pathname === "/entities") result = await entitiesPage(prisma, url);
      else if (url.pathname === "/search") result = await searchPage(prisma, url);
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
