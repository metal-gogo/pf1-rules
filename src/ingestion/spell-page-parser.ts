import * as cheerio from "cheerio";


export type SiteId = "aon" | "legacy_aon" | "d20pfsrd";

export interface ParsedLink {
  anchorTextRaw: string;
  hrefRaw: string;
  hrefResolved: string;
  sourceField: string;
  contextRaw: string;
  roleHint: "classification" | "spell_list" | "definition" | "publication" | "cross_reference" | "unknown";
  targetEntityTypeHint: "spell" | "rule" | "condition" | "magic_school" | "subschool" | "descriptor" | "spell_list" | "action" | "publication" | "unknown";
  targetEntityIdHint: string;
}

export interface ParsedReference {
  anchorTextRaw: string;
  hrefRaw: string | null;
  evidenceKind: "hyperlink" | "plain_text";
  sourceField: string;
  contextRaw: string;
  targetEntityType: "spell";
  targetNameHint: string;
  relationshipHint: "references" | "functions_like";
}

export interface ParsedSpellPage {
  titleRaw: string;
  sourceNoticeRaw: string | null;
  nameRaw: string;
  schoolRaw: string | null;
  subschoolRaw: string | null;
  descriptorsRaw: string[];
  levelsRaw: string | null;
  domainsRaw: string | null;
  castingTimeRaw: string | null;
  componentsRaw: string | null;
  rangeRaw: string | null;
  deliveryFieldsRaw: Array<{
    label_raw: string;
    value_raw: string | null;
    kinds: Array<"target" | "effect" | "area" | "unknown">;
  }>;
  durationRaw: string | null;
  savingThrowRaw: string | null;
  spellResistanceRaw: string | null;
  descriptionRaw: string;
  descriptionHtml: string;
  sourceBookRaw: string | null;
  sourcePageRaw: string | null;
  pfsStatusRaw: string | null;
  links: ParsedLink[];
  references: ParsedReference[];
  warnings: Array<{ code: string; severity: "info" | "warning" | "error"; field: string | null; message: string }>;
}

export interface LegacyIndexEntry {
  name: string;
  href: string;
  sourceBook: string | null;
}


export function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}


function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  return cleanText(cheerio.load(`<div>${withBreaks}</div>`)("div").first().text());
}


function fieldValue(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `<b(?:\\s[^>]*)?>(?:<a[^>]*>)?\\s*${escaped}\\s*(?:<\\/a>)?<\\/b>\\s*` +
      `([\\s\\S]*?)(?=<br\\s*\\/?>|<h[1-6]|<p\\s+class=["']divider|;\\s*<b|<\\/p>|$)`,
    "i",
  );
  const match = expression.exec(html);
  return match?.[1] === undefined ? null : htmlToText(match[1]).replace(/^;+\s*/, "");
}


function sectionAfterHeading(html: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `<(?:h3[^>]*|p\\s+class=["']divider["'])>\\s*${escaped}\\s*<\\/(?:h3|p)>`,
    "i",
  );
  const match = expression.exec(html);
  if (!match || match.index === undefined) return "";
  const rest = html.slice(match.index + match[0].length);
  const next = /<(?:h3[^>]*|p\s+class=["']divider["'])>/i.exec(rest);
  return rest.slice(0, next?.index ?? rest.length);
}


function parseClassification(raw: string | null): {
  school: string | null;
  subschool: string | null;
  descriptors: string[];
} {
  if (!raw) return { school: null, subschool: null, descriptors: [] };
  const descriptors = [...raw.matchAll(/\[([^\]]+)\]/g)]
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((value) => cleanText(value).toLocaleLowerCase("en-US"))
    .filter(Boolean);
  const withoutDescriptors = raw.replace(/\[[^\]]+\]/g, "").trim();
  const subschoolMatch = /\(([^)]+)\)/.exec(withoutDescriptors);
  const school = withoutDescriptors.replace(/\([^)]+\)/g, "").trim().toLocaleLowerCase("en-US");
  return {
    school: school || null,
    subschool: subschoolMatch?.[1]?.trim().toLocaleLowerCase("en-US") ?? null,
    descriptors,
  };
}


function sourceFieldForLink(
  anchor: string,
  href: string,
  classification: ReturnType<typeof parseClassification>,
  levelsRaw: string | null,
  castingTimeRaw: string | null,
  descriptionHtml: string,
  sourceNoticeRaw: string | null,
): string {
  const lowerAnchor = anchor.toLocaleLowerCase("en-US");
  if (sourceNoticeRaw?.includes(anchor)) return "spell_raw.source_book_raw";
  if (classification.school === lowerAnchor || classification.subschool === lowerAnchor || classification.descriptors.includes(lowerAnchor)) {
    return "spell_raw.school_raw";
  }
  if (levelsRaw?.toLocaleLowerCase("en-US").includes(lowerAnchor) && /spell-list|classes|spells\.aspx\?class/i.test(href)) {
    return "spell_raw.levels_raw";
  }
  if (castingTimeRaw?.toLocaleLowerCase("en-US").includes(lowerAnchor)) {
    return "spell_raw.casting_time_raw";
  }
  if (descriptionHtml.includes(href) || descriptionHtml.includes(`>${anchor}<`)) {
    return "spell_raw.description_raw";
  }
  if (/^https?:\/\/(?:www\.)?paizo\.com\//i.test(href)) return "spell_raw.source_book_raw";
  return "spell_raw.description_raw";
}


function classifyLink(
  anchor: string,
  href: string,
  sourceField: string,
  classification: ReturnType<typeof parseClassification>,
): Omit<ParsedLink, "anchorTextRaw" | "hrefRaw" | "hrefResolved" | "sourceField" | "contextRaw"> {
  const lowerAnchor = anchor.toLocaleLowerCase("en-US");
  if (sourceField === "spell_raw.school_raw") {
    if (classification.school === lowerAnchor) {
      return { roleHint: "classification", targetEntityTypeHint: "magic_school", targetEntityIdHint: `magic-school.${slug(anchor)}` };
    }
    if (classification.subschool === lowerAnchor) {
      return { roleHint: "classification", targetEntityTypeHint: "subschool", targetEntityIdHint: `subschool.${slug(anchor)}` };
    }
    return { roleHint: "classification", targetEntityTypeHint: "descriptor", targetEntityIdHint: `descriptor.${slug(anchor)}` };
  }
  if (sourceField === "spell_raw.levels_raw") {
    return { roleHint: "spell_list", targetEntityTypeHint: "spell_list", targetEntityIdHint: `spell-list.${slug(anchor)}` };
  }
  if (sourceField === "spell_raw.source_book_raw") {
    const book = anchor
      .replace(/\s+pg\.?\s+\d+.*$/i, "")
      .replace(/^PRPG\s+/i, "Pathfinder RPG ")
      .replace(/^Pathfinder Roleplaying Game:?\s*/i, "Pathfinder RPG ");
    return { roleHint: "publication", targetEntityTypeHint: "publication", targetEntityIdHint: `publication.${slug(book)}` };
  }
  if (/SpellDisplay\.aspx|\/magic\/all-spells\/|\/spells\/[^/]+\.html/i.test(href)) {
    return { roleHint: "cross_reference", targetEntityTypeHint: "spell", targetEntityIdHint: `spell.${slug(anchor)}` };
  }
  if (/condition|glossary\.html#(?:dying|disabled|blinded|dazed|dazzled|fatigued|stunned)/i.test(href)) {
    return { roleHint: "definition", targetEntityTypeHint: "condition", targetEntityIdHint: `condition.${slug(anchor)}` };
  }
  if (
    /\b(?:standard|move|full-round|free|swift|immediate) actions?\b/i.test(anchor) ||
    /#(?:TOC-)?(?:Standard|Move|Full-Round|Free|Swift|Immediate)-Actions?$/i.test(href)
  ) {
    return { roleHint: "definition", targetEntityTypeHint: "action", targetEntityIdHint: `action.${slug(anchor)}` };
  }
  return { roleHint: "definition", targetEntityTypeHint: "rule", targetEntityIdHint: `rule.${slug(anchor)}` };
}


function parseLinks(
  boundedHtml: string,
  baseUrl: string,
  parsed: Pick<ParsedSpellPage, "schoolRaw" | "levelsRaw" | "castingTimeRaw" | "descriptionHtml" | "sourceNoticeRaw">,
): { links: ParsedLink[]; references: ParsedReference[] } {
  const $ = cheerio.load(`<div id="bounded">${boundedHtml}</div>`);
  const classification = parseClassification(parsed.schoolRaw);
  const links: ParsedLink[] = [];
  const references: ParsedReference[] = [];
  $("#bounded a[href]").each((_index, element) => {
    const anchor = cleanText($(element).text());
    const hrefRaw = $(element).attr("href");
    if (!anchor || !hrefRaw || hrefRaw.startsWith("javascript:")) return;
    const hrefResolved = new URL(hrefRaw, baseUrl).toString();
    const sourceField = sourceFieldForLink(
      anchor,
      hrefRaw,
      classification,
      parsed.levelsRaw,
      parsed.castingTimeRaw,
      parsed.descriptionHtml,
      parsed.sourceNoticeRaw,
    );
    const classified = classifyLink(anchor, hrefResolved, sourceField, classification);
    links.push({
      anchorTextRaw: anchor,
      hrefRaw,
      hrefResolved,
      sourceField,
      contextRaw: sourceField === "spell_raw.description_raw" ? anchor : sourceField,
      ...classified,
    });
    if (classified.targetEntityTypeHint === "spell" && sourceField === "spell_raw.description_raw") {
      references.push({
        anchorTextRaw: anchor,
        hrefRaw,
        evidenceKind: "hyperlink",
        sourceField,
        contextRaw: anchor,
        targetEntityType: "spell",
        targetNameHint: anchor,
        relationshipHint: /\b(?:as|like)\b/i.test(parsed.descriptionHtml) ? "functions_like" : "references",
      });
    }
  });
  return { links, references };
}


function deliveryFields(html: string): ParsedSpellPage["deliveryFieldsRaw"] {
  const labels: Array<[string, "target" | "effect" | "area"]> = [
    ["Target", "target"], ["Targets", "target"], ["Effect", "effect"], ["Area", "area"],
  ];
  return labels.flatMap(([label, kind]) => {
    const value = fieldValue(html, label);
    return value === null ? [] : [{ label_raw: label, value_raw: value, kinds: [kind] }];
  });
}


function finalizeParsed(
  baseUrl: string,
  partial: Omit<ParsedSpellPage, "links" | "references" | "warnings" | "subschoolRaw" | "descriptorsRaw">,
): ParsedSpellPage {
  const classification = parseClassification(partial.schoolRaw);
  const { links, references } = parseLinks(partial.descriptionHtml === partial.sourceNoticeRaw ? "" : partial.descriptionHtml, baseUrl, partial);
  const warnings: ParsedSpellPage["warnings"] = [];
  for (const [field, value] of [
    ["school_raw", partial.schoolRaw],
    ["levels_raw", partial.levelsRaw],
    ["casting_time_raw", partial.castingTimeRaw],
    ["components_raw", partial.componentsRaw],
    ["range_raw", partial.rangeRaw],
    ["duration_raw", partial.durationRaw],
  ] as const) {
    if (value === null) warnings.push({ code: "MISSING_EXPECTED_FIELD", severity: "error", field, message: `Parser did not find ${field}.` });
  }
  return {
    ...partial,
    subschoolRaw: classification.subschool,
    descriptorsRaw: classification.descriptors,
    links,
    references,
    warnings,
  };
}


export function parseAonSpell(html: string, sourceUrl: string): ParsedSpellPage {
  const $ = cheerio.load(html);
  const requestedName = new URL(sourceUrl).searchParams.get("ItemName")?.trim() ?? "";
  const title = $("#MainContent_DataListTypes h1.title").filter((_index, element) =>
    cleanText($(element).text()).toLocaleLowerCase("en-US") === requestedName.toLocaleLowerCase("en-US"),
  ).first();
  if (title.length !== 1) throw new Error(`AoN bounded spell entry ${requestedName} was not found`);
  const siblingNodes = title.parent().contents().toArray();
  const startIndex = siblingNodes.indexOf(title.get(0)!);
  const endIndex = siblingNodes.findIndex((node, index) => index > startIndex && $(node).is("h1.title"));
  const boundedHtml = siblingNodes
    .slice(startIndex, endIndex < 0 ? undefined : endIndex)
    .map((node) => $.html(node))
    .join("");
  const nameRaw = cleanText(title.text());
  const sourceNoticeRaw = fieldValue(boundedHtml, "Source");
  const schoolRaw = fieldValue(boundedHtml, "School");
  const descriptionHtml = sectionAfterHeading(boundedHtml, "Description");
  const sourceMatch = /^(.*?)(?:\s+pg\.?\s+(\d+))$/i.exec(sourceNoticeRaw ?? "");
  const partial = {
    titleRaw: nameRaw,
    sourceNoticeRaw,
    nameRaw,
    schoolRaw,
    levelsRaw: fieldValue(boundedHtml, "Level"),
    domainsRaw: fieldValue(boundedHtml, "Domain"),
    castingTimeRaw: fieldValue(boundedHtml, "Casting Time"),
    componentsRaw: fieldValue(boundedHtml, "Components"),
    rangeRaw: fieldValue(boundedHtml, "Range"),
    deliveryFieldsRaw: deliveryFields(boundedHtml),
    durationRaw: fieldValue(boundedHtml, "Duration"),
    savingThrowRaw: fieldValue(boundedHtml, "Saving Throw"),
    spellResistanceRaw: fieldValue(boundedHtml, "Spell Resistance"),
    descriptionRaw: htmlToText(descriptionHtml),
    descriptionHtml,
    sourceBookRaw: sourceMatch?.[1]?.trim() ?? sourceNoticeRaw,
    sourcePageRaw: sourceMatch?.[2] ?? null,
    pfsStatusRaw: /PathfinderSocietySymbol/i.test(boundedHtml) ? "legal" : "not_legal",
  };
  const result = finalizeParsed(sourceUrl, partial);
  const allLinks = parseLinks(boundedHtml, sourceUrl, result);
  result.links = allLinks.links;
  result.references = allLinks.references;
  return result;
}


export function parseLegacySpell(
  html: string,
  sourceUrl: string,
  indexEntry: LegacyIndexEntry,
): ParsedSpellPage {
  const $ = cheerio.load(html);
  const fragment = new URL(sourceUrl).hash.slice(1);
  const title = fragment
    ? $(".stat-block-title").filter((_index, element) => $(element).attr("id") === fragment).first()
    : $(".stat-block-title").filter((_index, element) => cleanText($(element).text()) === indexEntry.name).first();
  if (title.length !== 1) {
    throw new Error(`Legacy bounded spell entry ${fragment ? `#${fragment}` : indexEntry.name} was not found`);
  }
  const nodes = [$.html(title)];
  let sibling = title.next();
  while (sibling.length && !sibling.hasClass("stat-block-title") && !sibling.hasClass("footer")) {
    nodes.push($.html(sibling));
    sibling = sibling.next();
  }
  const boundedHtml = nodes.join("\n");
  const fragment$ = cheerio.load(`<div id="bounded">${boundedHtml}</div>`);
  const descriptionElements = fragment$("#bounded > p").filter((_index, element) => {
    const item = fragment$(element);
    return !item.hasClass("stat-block-title") && !item.hasClass("stat-block-1");
  });
  const descriptionHtml = descriptionElements.toArray().map((element) => fragment$.html(element)).join("\n");
  const nameRaw = cleanText(title.text());
  const partial = {
    titleRaw: nameRaw,
    sourceNoticeRaw: indexEntry.sourceBook,
    nameRaw,
    schoolRaw: fieldValue(boundedHtml, "School"),
    levelsRaw: fieldValue(boundedHtml, "Level"),
    domainsRaw: fieldValue(boundedHtml, "Domain"),
    castingTimeRaw: fieldValue(boundedHtml, "Casting Time"),
    componentsRaw: fieldValue(boundedHtml, "Components"),
    rangeRaw: fieldValue(boundedHtml, "Range"),
    deliveryFieldsRaw: deliveryFields(boundedHtml),
    durationRaw: fieldValue(boundedHtml, "Duration"),
    savingThrowRaw: fieldValue(boundedHtml, "Saving Throw"),
    spellResistanceRaw: fieldValue(boundedHtml, "Spell Resistance"),
    descriptionRaw: htmlToText(descriptionHtml),
    descriptionHtml,
    sourceBookRaw: indexEntry.sourceBook,
    sourcePageRaw: null,
    pfsStatusRaw: null,
  };
  const result = finalizeParsed(sourceUrl, partial);
  const allLinks = parseLinks(boundedHtml, sourceUrl, result);
  result.links = allLinks.links;
  result.references = allLinks.references;
  return result;
}


export function parseD20pfsrdSpell(html: string, sourceUrl: string): ParsedSpellPage {
  const $ = cheerio.load(html);
  const article = $("#article-content").first();
  if (article.length !== 1) throw new Error("d20PFSRD bounded article entry was not found");
  article.find("script, .breadcrumbs, .section15, .ez-toc-container").remove();
  const nameRaw = cleanText(article.find("h1").first().text());
  const nodes: string[] = [];
  let sibling = article.find("h1").first().next();
  while (sibling.length) {
    nodes.push($.html(sibling));
    sibling = sibling.next();
  }
  const boundedHtml = nodes.join("\n");
  const original$ = cheerio.load(html);
  const sectionNotice = cleanText(original$("#article-content .section15 p").first().text());
  const sourceBookRaw = sectionNotice.split(/\.\s*©|\.\s*\(c\)/i)[0]?.trim() || null;
  const descriptionHtml = sectionAfterHeading(boundedHtml, "DESCRIPTION");
  const partial = {
    titleRaw: nameRaw,
    sourceNoticeRaw: sourceBookRaw,
    nameRaw,
    schoolRaw: fieldValue(boundedHtml, "School"),
    levelsRaw: fieldValue(boundedHtml, "Level"),
    domainsRaw: fieldValue(boundedHtml, "Domain"),
    castingTimeRaw: fieldValue(boundedHtml, "Casting Time"),
    componentsRaw: fieldValue(boundedHtml, "Components"),
    rangeRaw: fieldValue(boundedHtml, "Range"),
    deliveryFieldsRaw: deliveryFields(boundedHtml),
    durationRaw: fieldValue(boundedHtml, "Duration"),
    savingThrowRaw: fieldValue(boundedHtml, "Saving Throw"),
    spellResistanceRaw: fieldValue(boundedHtml, "Spell Resistance"),
    descriptionRaw: htmlToText(descriptionHtml),
    descriptionHtml,
    sourceBookRaw,
    sourcePageRaw: null,
    pfsStatusRaw: null,
  };
  const result = finalizeParsed(sourceUrl, partial);
  const allLinks = parseLinks(`${boundedHtml}\n${original$("#article-content .section15").html() ?? ""}`, sourceUrl, result);
  result.links = allLinks.links;
  result.references = allLinks.references;
  return result;
}


export function parseLegacyIndex(html: string, sourceUrl: string): Map<string, LegacyIndexEntry> {
  const $ = cheerio.load(html);
  const entries = new Map<string, LegacyIndexEntry>();
  $("table tr").each((_index, row) => {
    const anchor = $(row).find("td").eq(1).find("a").first();
    const name = cleanText(anchor.text());
    const href = anchor.attr("href");
    if (!name || !href) return;
    entries.set(name.toLocaleLowerCase("en-US"), {
      name,
      href: new URL(href, sourceUrl).toString(),
      sourceBook: anchor.attr("title")?.trim() ?? null,
    });
  });
  return entries;
}
