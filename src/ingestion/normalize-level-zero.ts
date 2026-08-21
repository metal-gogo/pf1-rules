import crypto from "node:crypto";

import type { ValidatedJson } from "../domain/json.js";
import type { SpellListQualification } from "../domain/spell-lists.js";
import { readJsonPointer } from "../domain/spell-inheritance.js";
import type { ParsedLink, ParsedSpellPage, SiteId } from "./spell-page-parser.js";
import { slug } from "./spell-page-parser.js";


export interface ParsedObservationInput {
  siteId: SiteId;
  observationId: string;
  parsed: ParsedSpellPage;
}

export interface GeneratedEntity {
  entity_id: string;
  entity_type: string;
  name: string;
  status: "stub" | "resolved";
  aliases: string[];
  evidence: Array<{
    observation_id: string;
    source_field: string;
    anchor_text_raw: string | null;
    source_href: string | null;
  }>;
  notes: string[];
}

export class NormalizationIssue extends Error {
  constructor(
    readonly kind: "schema" | "source",
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}


function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}


function classification(raw: string | null) {
  if (!raw) throw new NormalizationIssue("source", "missing-school", "AoN did not expose a school classification.");
  const descriptors = [...raw.matchAll(/\[([^\]]+)\]/g)]
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((value) => value.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);
  const withoutDescriptors = raw.replace(/\[[^\]]+\]/g, "").trim();
  const subschool = /\(([^)]+)\)/.exec(withoutDescriptors)?.[1]?.trim().toLocaleLowerCase("en-US") ?? null;
  const school = withoutDescriptors.replace(/\([^)]+\)/g, "").trim().toLocaleLowerCase("en-US");
  if (!school) throw new NormalizationIssue("source", "missing-school", "AoN school classification normalized to an empty value.");
  return { school, subschool, descriptors, raw };
}


const knownDeityNames = new Set([
  "abadar", "angradd", "asmodeus", "besmara", "bolka", "calistria",
  "cayden cailean", "desna", "dranngvit", "erastil", "folgrit", "geryon",
  "gorum", "gozreh", "groetus", "grundinnar", "hadregash", "hastur",
  "iomedae", "irori", "kols", "magrim", "mephistopheles", "milani",
  "nethys", "norgorber", "pharasma", "ragathiel", "rovagug", "sarenrae",
  "shelyn", "torag", "trudd", "xhamen-dor", "ydersius", "zon-kuthon",
  "zursvaater", "zyphus",
]);


function splitTopLevel(raw: string, separator: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of raw) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === separator && depth === 0) {
      if (current.trim()) values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) values.push(current.trim());
  return values;
}


function publicationQualification(raw: string): SpellListQualification {
  return {
    kind: "publication",
    publication_scope: { entity_id: null, name: null, product_code: raw },
    raw,
  };
}


function parentheticalQualifications(raw: string): SpellListQualification[] {
  const normalized = raw.trim();
  if (/^(?:PAP|PZO)[A-Z0-9/-]*$/i.test(normalized)) {
    return [publicationQualification(normalized)];
  }
  const archetype = /^(.*?)(?:\s+archetype)$/i.exec(normalized)?.[1]?.trim();
  if (archetype) {
    return [{
      kind: "archetype",
      archetype: { entity_id: `archetype.${slug(archetype)}`, name: archetype },
      raw: normalized,
    }];
  }
  const explicitDeity = /^(?:deity:\s*|worship(?:per|er)s?\s+of\s+)(.+)$/i.exec(normalized)?.[1]?.trim();
  const deityName = explicitDeity ?? (knownDeityNames.has(normalized.toLocaleLowerCase("en-US")) ? normalized : null);
  if (deityName) {
    return [{
      kind: "deity",
      deity: { entity_id: `deity.${slug(deityName)}`, name: deityName },
      raw: normalized,
    }];
  }
  return [{
    kind: "conditional",
    condition: {
      raw: normalized,
      search_text: normalized.toLocaleLowerCase("en-US").replace(/\s+/g, " "),
    },
    raw: normalized,
  }];
}


function mysteryEntry(raw: string) {
  const match = /^(.*?)\s+([0-9])$/.exec(raw.trim());
  if (!match?.[1] || match[2] === undefined) {
    throw new NormalizationIssue("schema", "unparsed-spell-level", `Cannot normalize mystery entry: ${raw}`);
  }
  const scopedName = match[1].trim();
  const publicationMatch = /^(.*?)\(([^()]*(?:PAP|PZO)[^()]*)\)$/.exec(scopedName);
  const mysteryName = (publicationMatch?.[1] ?? scopedName).trim();
  const qualifications: SpellListQualification[] = [{
    kind: "mystery",
    mystery: { entity_id: `mystery.${slug(mysteryName)}`, name: mysteryName },
    raw: `Mystery ${mysteryName}`,
  }];
  if (publicationMatch?.[2]) {
    qualifications.push(publicationQualification(publicationMatch[2].trim()));
  }
  return {
    spell_list_id: "spell-list.oracle",
    list_kind: "class",
    list_name: "oracle",
    level: Number(match[2]),
    scope: "later_first_party",
    raw: `Mystery ${raw.trim()}`,
    qualifications,
  };
}


function archetypeEntry(raw: string) {
  const match = /^(.*?)\s+\(([^()]+)\)\s+([0-9])$/.exec(raw.trim());
  if (!match?.[1] || !match[2] || match[3] === undefined) {
    throw new NormalizationIssue("schema", "unparsed-spell-level", `Cannot normalize archetype entry: ${raw}`);
  }
  const archetypeName = match[1].trim();
  const listName = match[2].trim().toLocaleLowerCase("en-US");
  return {
    spell_list_id: `spell-list.${slug(listName)}`,
    list_kind: "class",
    list_name: listName,
    level: Number(match[3]),
    scope: "later_first_party",
    raw: `Archetype ${raw.trim()}`,
    qualifications: [{
      kind: "archetype",
      archetype: { entity_id: `archetype.${slug(archetypeName)}`, name: archetypeName },
      raw: `Archetype ${archetypeName}`,
    }] satisfies SpellListQualification[],
  };
}


export function parseLevels(raw: string | null, publicationBook: string | null) {
  if (!raw) throw new NormalizationIssue("source", "missing-levels", "AoN did not expose spell levels.");
  const coreBook = /core rulebook/i.test(publicationBook ?? "");
  const coreLists = new Set(["bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "wizard"]);
  const normalizedSections = raw.replace(/,\s+Mystery\s+/gi, "; Mystery ");
  return splitTopLevel(normalizedSections, ";").flatMap((section) => {
    if (/^Mystery\s+/i.test(section)) {
      return splitTopLevel(section.replace(/^Mystery\s+/i, ""), ",")
        .map(mysteryEntry);
    }
    if (/^Archetype\s+/i.test(section)) {
      return [archetypeEntry(section.replace(/^Archetype\s+/i, ""))];
    }

    const groupQualification = /\s+\(([^()]*)\)$/.exec(section);
    const unqualifiedSection = groupQualification
      ? section.slice(0, groupQualification.index).trim()
      : section;
    const qualifications = groupQualification
      ? parentheticalQualifications(groupQualification[1] ?? "")
      : [];
    return splitTopLevel(unqualifiedSection, ",").flatMap((entry) => {
      const trimmed = entry.trim();
      const match = /^(.*?)\s+([0-9])$/.exec(trimmed);
      if (!match?.[1] || match[2] === undefined) {
        throw new NormalizationIssue("schema", "unparsed-spell-level", `Cannot normalize spell-list entry: ${trimmed}`);
      }
      return match[1].split("/").map((combinedListName) => {
        const listName = combinedListName.trim().toLocaleLowerCase("en-US");
        const entryRaw = groupQualification
          ? `${trimmed} (${groupQualification[1]})`
          : trimmed;
        return {
          spell_list_id: `spell-list.${slug(listName)}`,
          list_kind: "class",
          list_name: listName,
          level: Number(match[2]),
          scope: coreBook && coreLists.has(listName) ? "core" : "later_first_party",
          raw: entryRaw,
          qualifications,
        };
      });
    });
  });
}


function splitComponents(raw: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of raw) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) values.push(current.trim());
  return values;
}


function parseComponents(raw: string | null) {
  if (!raw) throw new NormalizationIssue("source", "missing-components", "AoN did not expose spell components.");
  const typeMap: Record<string, string> = {
    V: "verbal",
    S: "somatic",
    M: "material",
    F: "focus",
    DF: "divine_focus",
  };
  const components: Array<{ type: string; details: string | null; cost_gp: number | null; raw: string }> = [];
  for (const token of splitComponents(raw)) {
    const match = /^([A-Z/]+)(?:\s*\((.*)\))?$/.exec(token);
    if (!match?.[1]) {
      components.push({ type: "other", details: token, cost_gp: null, raw: token });
      continue;
    }
    const abbreviations = match[1].split("/");
    const details = match[2]?.trim() ?? null;
    const costMatch = details?.match(/([\d,]+)\s*gp/i);
    const cost = costMatch?.[1] ? Number(costMatch[1].replaceAll(",", "")) : null;
    for (const abbreviation of abbreviations) {
      components.push({
        type: typeMap[abbreviation] ?? "other",
        details: abbreviation === abbreviations[0] ? details : null,
        cost_gp: abbreviation === abbreviations[0] ? cost : null,
        raw: abbreviations.length > 1 ? abbreviation : token,
      });
    }
  }
  return components;
}


function parseCastingTime(raw: string | null) {
  if (!raw) throw new NormalizationIssue("source", "missing-casting-time", "AoN did not expose casting time.");
  const lower = raw.toLocaleLowerCase("en-US");
  const amount = Number.parseFloat(/^([\d.]+)/.exec(lower)?.[1] ?? "1");
  if (/standard action/.test(lower)) return { kind: "action", amount, unit: "standard_action", raw };
  if (/swift action/.test(lower)) return { kind: "action", amount, unit: "swift_action", raw };
  if (/immediate action/.test(lower)) return { kind: "action", amount, unit: "immediate_action", raw };
  if (/free action/.test(lower)) return { kind: "action", amount, unit: "free_action", raw };
  if (/full-round action/.test(lower)) return { kind: "action", amount, unit: "full_round_action", raw };
  if (/round/.test(lower)) return { kind: "timed", amount, unit: "round", raw };
  if (/minute/.test(lower)) return { kind: "timed", amount, unit: "minute", raw };
  if (/hour/.test(lower)) return { kind: "timed", amount, unit: "hour", raw };
  return { kind: "unknown", amount: null, unit: "unknown", raw };
}


function parseRange(raw: string | null) {
  if (!raw) throw new NormalizationIssue("source", "missing-range", "AoN did not expose range.");
  const lower = raw.toLocaleLowerCase("en-US");
  for (const category of ["personal", "touch", "close", "medium", "long", "unlimited"] as const) {
    if (lower.startsWith(category)) return { category, formula: lower === category ? null : raw, raw };
  }
  if (/\d+\s*(?:ft\.|feet|foot)/i.test(raw)) return { category: "distance", formula: raw, raw };
  if (/see text|special/.test(lower)) return { category: "special", formula: raw, raw };
  return { category: "unknown", formula: raw, raw };
}


function parseTargeting(raw: string | null) {
  if (!raw) return null;
  const lower = raw.toLocaleLowerCase("en-US");
  const self = /\byou\b|\bself\b/.test(lower);
  const perLevel = /(?:one|1)\s+[^;]+\/level|per level/.test(lower);
  const numberMatch = /^(?:up to\s+)?(\d+)\b/.exec(lower);
  const multiple = perLevel || /creatures|objects|targets|lights/.test(lower) || (numberMatch && Number(numberMatch[1]) > 1);
  const subjectKind = /creature or object/.test(lower)
    ? "creature_or_object"
    : /willing creature/.test(lower)
      ? "willing_creature"
      : /creature/.test(lower)
        ? "creature"
        : /object/.test(lower)
          ? "object"
          : "other";
  return {
    mode: self ? "self" : multiple ? "multiple" : "single",
    subject_kind: subjectKind,
    selection: self ? "self" : "selected",
    count: {
      kind: perLevel ? "per_level" : numberMatch ? "fixed" : multiple ? "other" : "fixed",
      fixed: self ? 1 : numberMatch ? Number(numberMatch[1]) : multiple ? null : 1,
      formula: perLevel ? raw : null,
      raw,
    },
    separation: null,
    raw,
  };
}


function parseArea(raw: string | null) {
  if (!raw) return null;
  const lower = raw.toLocaleLowerCase("en-US");
  const propagation = (["burst", "emanation", "spread"] as const).find((value) => lower.includes(value)) ?? "other";
  const geometry = lower.includes("cone")
    ? "cone"
    : lower.includes("line")
      ? "line"
      : lower.includes("cylinder")
        ? "cylinder"
        : lower.includes("sphere") || lower.includes("radius")
          ? "sphere"
          : "other";
  const radius = /([\d.]+)[- ]foot-radius|([\d.]+)\s*ft\.\s*radius/.exec(lower);
  const length = /([\d.]+)[- ]foot(?:-| )(?:cone|line)/.exec(lower);
  return {
    propagation,
    geometry,
    geometry_basis: geometry === "other" ? "unknown" : "explicit",
    dimensions: {
      radius_ft: Number(radius?.[1] ?? radius?.[2]) || null,
      length_ft: Number(length?.[1]) || null,
      width_ft: null,
      height_ft: null,
    },
    shapeable: /shapeable/.test(lower) ? true : null,
    raw,
  };
}


function parseDuration(raw: string | null) {
  if (!raw) throw new NormalizationIssue("source", "missing-duration", "AoN did not expose duration.");
  const lower = raw.toLocaleLowerCase("en-US");
  const dismissible = /\(d\)/i.test(raw) ? true : null;
  const concentration = /concentration/.test(lower) ? true : null;
  const kind = /instantaneous/.test(lower)
    ? "instantaneous"
    : /permanent/.test(lower)
      ? "permanent"
      : concentration
        ? "concentration"
        : /until discharged|discharge/.test(lower)
          ? "discharge"
          : /see text|special/.test(lower)
            ? "special"
            : /round|minute|hour|day|level/.test(lower)
              ? "timed"
              : "unknown";
  return { kind, formula: kind === "timed" || kind === "special" || kind === "discharge" ? raw : null, dismissible, concentration, raw };
}


function parseSavingThrow(raw: string | null) {
  const value = raw ?? "unknown";
  const lower = value.toLocaleLowerCase("en-US");
  const types = [
    ...(lower.includes("fortitude") || /\bfort\b/.test(lower) ? ["fortitude"] : []),
    ...(lower.includes("reflex") || /\bref\b/.test(lower) ? ["reflex"] : []),
    ...(lower.includes("will") ? ["will"] : []),
  ];
  if (lower === "none") types.push("none");
  if (types.length === 0) types.push("unknown");
  return {
    types: [...new Set(types)],
    outcome: lower === "none" ? null : value,
    harmless: lower.includes("harmless") ? true : null,
    object: lower.includes("object") ? true : null,
    conditional: /see text|if |unless |or/.test(lower) ? true : null,
    raw: value,
  };
}


function parseSpellResistance(raw: string | null) {
  const value = raw ?? "unknown";
  const lower = value.toLocaleLowerCase("en-US");
  return {
    applies: lower.startsWith("yes") ? true : lower.startsWith("no") ? false : null,
    harmless: lower.includes("harmless") ? true : null,
    object: lower.includes("object") ? true : null,
    conditional: /see text|if |unless |or/.test(lower) ? true : null,
    raw: value,
  };
}


function publicationId(book: string): string {
  const normalized = book.replaceAll("’", "'");
  if (/core rulebook/i.test(normalized)) return "publication.pathfinder-rpg-core-rulebook";
  if (/advanced player'?s guide/i.test(normalized)) return "publication.pathfinder-rpg-advanced-players-guide";
  return `publication.${slug(normalized.replace(/^PRPG\s+/i, "Pathfinder RPG ").replace(/^Pathfinder Roleplaying Game:?\s*/i, "Pathfinder RPG "))}`;
}


function publicationComparable(book: string): string {
  return slug(book
    .replaceAll("’", "'")
    .replace(/^Pathfinder (?:RPG|Roleplaying Game|Player Companion|Campaign Setting|Chronicles|Companion):?\s*/i, "")
    .replace(/^PRPG\s+/i, "")
    .replace(/\s+pg\.?\s+\d+.*$/i, ""));
}


function actionId(unit: string): string | null {
  return unit.endsWith("_action") ? `action.${unit.replaceAll("_", "-")}` : null;
}


function relationshipTypeForLink(link: ParsedLink): string {
  switch (link.targetEntityTypeHint) {
    case "magic_school": return "has_school";
    case "subschool": return "has_subschool";
    case "descriptor": return "has_descriptor";
    case "spell_list": return "appears_on_spell_list";
    case "publication": return "published_in";
    case "action": return "uses_action";
    case "spell": return "references";
    default: return "uses_definition";
  }
}


function entityType(link: ParsedLink): string {
  return link.targetEntityTypeHint;
}


export type AvailableCanonicalSpells = ReadonlyMap<string, ValidatedJson> | ReadonlySet<string>;

interface InheritanceReference {
  parentId: string;
  parentName: string;
  basisRaw: string;
}

const inheritedCanonicalPaths = [
  ["/casting/time", "spell_raw.casting_time_raw"],
  ["/casting/components", "spell_raw.components_raw"],
  ["/casting/conditional_components", "spell_raw.description_raw"],
  ["/casting/components_raw", "spell_raw.components_raw"],
  ["/effect/range", "spell_raw.range_raw"],
  ["/effect/delivery", "spell_raw.delivery_fields_raw"],
  ["/effect/targeting", "spell_raw.delivery_fields_raw"],
  ["/effect/area", "spell_raw.delivery_fields_raw"],
  ["/effect/duration", "spell_raw.duration_raw"],
  ["/effect/saving_throw", "spell_raw.saving_throw_raw"],
  ["/effect/spell_resistance", "spell_raw.spell_resistance_raw"],
  ["/description/raw", "spell_raw.description_raw"],
] as const;


function canonicalRecord(
  available: AvailableCanonicalSpells,
  spellId: string,
): ValidatedJson | null {
  return available instanceof Map ? available.get(spellId) ?? null : null;
}


function hasCanonicalSpell(available: AvailableCanonicalSpells, spellId: string): boolean {
  return available.has(spellId);
}


function canResolveCanonicalSpell(
  available: AvailableCanonicalSpells,
  spellId: string,
  active = new Set<string>(),
): boolean {
  const record = canonicalRecord(available, spellId);
  if (!record || active.has(spellId)) return false;
  const nextActive = new Set(active).add(spellId);
  return record.rules_inheritance.every((inheritance: ValidatedJson) =>
    canResolveCanonicalSpell(available, inheritance.from_spell_id, nextActive),
  );
}


function normalizedName(value: string): string {
  return value
    .replaceAll("’", "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}


function comparableSpellName(value: string): string {
  return normalizedName(value).replace(/\bthe\b/g, "").replace(/\s+/g, " ").trim();
}


function startsWithSpellName(value: string, name: string): boolean {
  if (!value.startsWith(name)) return false;
  const next = value[name.length];
  return next === undefined || /[,.():;\s]/.test(next);
}


function equivalentSpellNames(name: string): Set<string> {
  const names = new Set([name]);
  const leadingVariant = /^(mass|greater|lesser) (.+)$/.exec(name);
  if (leadingVariant?.[1] && leadingVariant[2]) {
    names.add(`${leadingVariant[2]}, ${leadingVariant[1]}`);
  }
  const trailingVariant = /^(.+), (mass|greater|lesser)$/.exec(name);
  if (trailingVariant?.[1] && trailingVariant[2]) {
    names.add(`${trailingVariant[2]} ${trailingVariant[1]}`);
  }
  return names;
}


export function detectSpellInheritance(
  parsed: ParsedSpellPage,
  available: AvailableCanonicalSpells,
): InheritanceReference | null {
  const marker = /^(?:this spell (?:functions|works) (?:as|like)(?: per)?|as(?: per)?)\s+(?:the\s+)?/i.exec(
    parsed.descriptionRaw,
  );
  if (!marker) return null;
  const remainder = normalizedName(parsed.descriptionRaw.slice(marker[0].length));
  if (/^(?:part of|part of the|a way to|a result of)/.test(remainder)) return null;
  const comparableRemainder = comparableSpellName(remainder.replace(/^(?:a|an)\s+/, ""));

  const linkedCandidates = parsed.links
    .filter((link) =>
      link.targetEntityTypeHint === "spell" &&
      link.sourceField === "spell_raw.description_raw" &&
      startsWithSpellName(comparableRemainder, comparableSpellName(link.anchorTextRaw)),
    )
    .sort((left, right) => right.anchorTextRaw.length - left.anchorTextRaw.length);
  const linked = linkedCandidates[0];
  if (linked) {
    const linkedName = normalizedName(linked.anchorTextRaw);
    const linkedNames = equivalentSpellNames(linkedName);
    const matchingRecord = available instanceof Map
      ? [...available.values()].find((record) => linkedNames.has(normalizedName(record.name)))
      : undefined;
    return {
      parentId: matchingRecord?.spell_id ?? linked.targetEntityIdHint,
      parentName: matchingRecord?.name ?? linked.anchorTextRaw,
      basisRaw: parsed.descriptionRaw,
    };
  }

  if (available instanceof Map) {
    const namedCandidates = [...available.values()]
      .filter((record) => startsWithSpellName(comparableRemainder, comparableSpellName(record.name)))
      .sort((left, right) => String(right.name).length - String(left.name).length);
    const named = namedCandidates[0];
    if (named) {
      return { parentId: named.spell_id, parentName: named.name, basisRaw: parsed.descriptionRaw };
    }
  }

  const fallbackName = remainder
    .split(/,|\.|\bexcept\b|\bbut\b|\bas noted\b|\bsave that\b/i, 1)[0]
    ?.trim();
  if (!fallbackName || fallbackName.split(/\s+/).length > 7) return null;
  return {
    parentId: `spell.${slug(fallbackName)}`,
    parentName: fallbackName.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-US")),
    basisRaw: parsed.descriptionRaw,
  };
}


function rawOverrideEvidence(parsed: ParsedSpellPage, sourceField: string, value: unknown): string {
  const rawByField: Record<string, unknown> = {
    "spell_raw.casting_time_raw": parsed.castingTimeRaw,
    "spell_raw.components_raw": parsed.componentsRaw,
    "spell_raw.range_raw": parsed.rangeRaw,
    "spell_raw.delivery_fields_raw": parsed.deliveryFieldsRaw,
    "spell_raw.duration_raw": parsed.durationRaw,
    "spell_raw.saving_throw_raw": parsed.savingThrowRaw,
    "spell_raw.spell_resistance_raw": parsed.spellResistanceRaw,
    "spell_raw.description_raw": parsed.descriptionRaw,
  };
  const raw = rawByField[sourceField] ?? value;
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}


function inheritanceRule(
  reference: InheritanceReference,
  child: ValidatedJson,
  baseline: ParsedObservationInput,
  available: AvailableCanonicalSpells,
) {
  const parent = canonicalRecord(available, reference.parentId);
  if (!parent) {
    return {
      from_spell_id: reference.parentId,
      relationship: "functions_like",
      basis: {
        observation_id: baseline.observationId,
        source_field: "spell_raw.description_raw",
        raw: reference.basisRaw,
      },
      inherited_paths: [],
      overrides: [],
      resolution_status: "missing_parent",
      note: `The functions-like dependency is explicit, but ${reference.parentId} is not canonical yet. The child's printed stat block remains materialized.`,
    };
  }

  const overrides = inheritedCanonicalPaths.flatMap(([pointer, sourceField]) => {
    const parentValue = readJsonPointer(parent, pointer, reference.parentId);
    const childValue = readJsonPointer(child, pointer, String(child.spell_id));
    if (JSON.stringify(parentValue) === JSON.stringify(childValue)) return [];
    return [{
      path: pointer,
      value: childValue,
      source_field: sourceField,
      raw: rawOverrideEvidence(baseline.parsed, sourceField, childValue),
      note: "The child canonical value differs from the resolved parent and is therefore applied explicitly.",
    }];
  });
  const parentResolvable = canResolveCanonicalSpell(available, reference.parentId);
  return {
    from_spell_id: reference.parentId,
    relationship: "functions_like",
    basis: {
      observation_id: baseline.observationId,
      source_field: "spell_raw.description_raw",
      raw: reference.basisRaw,
    },
    inherited_paths: inheritedCanonicalPaths.map(([pointer]) => pointer),
    overrides,
    resolution_status: parentResolvable ? "resolved" : "pending",
    note: parentResolvable
      ? "The parent supplies the declared operational paths; every differing child value is retained as an explicit, source-backed override."
      : "The direct parent is canonical, but an ancestor remains unresolved; inherited paths and child overrides are preserved pending full-chain resolution.",
  };
}


export function generateCanonicalBundle(
  spellId: string,
  observations: ParsedObservationInput[],
  availableCanonicalSpells: AvailableCanonicalSpells,
) {
  const baseline = observations.find((item) => item.siteId === "aon");
  if (!baseline) throw new NormalizationIssue("source", "missing-aon-observation", "AoN baseline observation is missing.");
  if (baseline.parsed.warnings.some((warning) => warning.severity === "error")) {
    throw new NormalizationIssue("source", "aon-parser-error", baseline.parsed.warnings.map((warning) => warning.message).join(" "));
  }
  const inheritanceReference = detectSpellInheritance(baseline.parsed, availableCanonicalSpells);

  const parsed = baseline.parsed;
  const normalizedClassification = classification(parsed.schoolRaw);
  const levels = parseLevels(parsed.levelsRaw, parsed.sourceBookRaw);
  const castingTime = parseCastingTime(parsed.castingTimeRaw);
  const components = parseComponents(parsed.componentsRaw);
  const delivery = parsed.deliveryFieldsRaw.map((field) => ({
    label_raw: field.label_raw,
    value_raw: field.value_raw,
    kinds: field.kinds,
  }));
  const targetField = delivery.find((field) => field.kinds.includes("target"));
  const areaField = delivery.find((field) => field.kinds.includes("area"));
  const book = parsed.sourceBookRaw;
  if (!book) throw new NormalizationIssue("source", "missing-publication", "AoN did not expose a publication book.");
  const parsedPage = parsed.sourcePageRaw ? Number.parseInt(parsed.sourcePageRaw, 10) : null;
  const page = parsedPage !== null && Number.isInteger(parsedPage) && parsedPage >= 1
    ? parsedPage
    : null;

  const relationshipMap = new Map<string, any>();
  const entityMap = new Map<string, GeneratedEntity>();
  const addEntity = (
    id: string,
    type: string,
    name: string,
    evidence: GeneratedEntity["evidence"][number],
    status: "stub" | "resolved" = "stub",
  ) => {
    const existing = entityMap.get(id);
    if (existing) {
      if (!existing.evidence.some((item) => JSON.stringify(item) === JSON.stringify(evidence))) existing.evidence.push(evidence);
      if (status === "resolved") existing.status = "resolved";
      return;
    }
    entityMap.set(id, { entity_id: id, entity_type: type, name, status, aliases: [], evidence: [evidence], notes: [] });
  };
  const addRelationship = (
    type: string,
    targetType: string,
    targetId: string,
    targetName: string,
    evidence: any,
  ) => {
    const id = `${spellId}:${type}:${targetId}`;
    const existing = relationshipMap.get(id);
    if (existing) {
      if (!existing.evidence.some((item: any) => JSON.stringify(item) === JSON.stringify(evidence))) existing.evidence.push(evidence);
      return;
    }
    relationshipMap.set(id, {
      relationship_id: id,
      type,
      target: { entity_type: targetType, entity_id: targetId, name: targetName },
      status: "accepted",
      evidence: [evidence],
      note: null,
    });
  };

  for (const observation of observations) {
    addEntity(spellId, "spell", parsed.nameRaw, {
      observation_id: observation.observationId,
      source_field: "spell_raw.name_raw",
      anchor_text_raw: observation.parsed.nameRaw,
      source_href: null,
    }, "resolved");
    for (const [index, link] of observation.parsed.links.entries()) {
      const targetType = entityType(link);
      const targetName = targetType === "publication"
        ? link.anchorTextRaw.replace(/\s+pg\.?\s+\d+.*$/i, "")
        : link.anchorTextRaw;
      const entityEvidence = {
        observation_id: observation.observationId,
        source_field: `spell_raw.links_raw[${index}]`,
        anchor_text_raw: link.anchorTextRaw,
        source_href: link.hrefResolved,
      };
      if (targetType === "publication" && /^(?:source|book|product|here)$/i.test(targetName.trim())) {
        addEntity(link.targetEntityIdHint, targetType, targetName, entityEvidence);
        continue;
      }
      const sameAsBaselinePublication = targetType === "publication" &&
        publicationComparable(targetName) === publicationComparable(book);
      const targetId = sameAsBaselinePublication
        ? publicationId(book)
        : targetType === "publication"
          ? publicationId(targetName)
        : link.targetEntityIdHint;
      const canonicalTargetName = sameAsBaselinePublication ? book : targetName;
      const evidence = {
        observation_id: observation.observationId,
        source_field: `spell_raw.links_raw[${index}]`,
        evidence_kind: "hyperlink",
        anchor_text_raw: link.anchorTextRaw,
        source_href: link.hrefResolved,
      };
      if (link.targetEntityIdHint !== targetId) {
        addEntity(link.targetEntityIdHint, targetType, targetName, entityEvidence);
      }
      addEntity(targetId, targetType, canonicalTargetName, entityEvidence);
      addRelationship(
        relationshipTypeForLink(link),
        targetType,
        targetId,
        canonicalTargetName,
        evidence,
      );
    }
  }

  const baselineEvidence = (sourceField: string, anchor: string | null = null) => ({
    observation_id: baseline.observationId,
    source_field: sourceField,
    evidence_kind: "plain_text",
    anchor_text_raw: anchor,
    source_href: null,
  });
  if (inheritanceReference) {
    const inheritanceEvidence = baselineEvidence(
      "spell_raw.description_raw",
      inheritanceReference.basisRaw,
    );
    addEntity(
      inheritanceReference.parentId,
      "spell",
      inheritanceReference.parentName,
      {
        observation_id: baseline.observationId,
        source_field: "spell_raw.description_raw",
        anchor_text_raw: inheritanceReference.parentName,
        source_href: null,
      },
      hasCanonicalSpell(availableCanonicalSpells, inheritanceReference.parentId) ? "resolved" : "stub",
    );
    addRelationship(
      "functions_like",
      "spell",
      inheritanceReference.parentId,
      inheritanceReference.parentName,
      inheritanceEvidence,
    );
  }
  const schoolId = `magic-school.${slug(normalizedClassification.school)}`;
  addEntity(schoolId, "magic_school", normalizedClassification.school, {
    observation_id: baseline.observationId,
    source_field: "spell_raw.school_raw",
    anchor_text_raw: normalizedClassification.school,
    source_href: null,
  });
  addRelationship("has_school", "magic_school", schoolId, normalizedClassification.school, baselineEvidence("spell_raw.school_raw", normalizedClassification.school));
  for (const descriptor of normalizedClassification.descriptors) {
    const id = `descriptor.${slug(descriptor)}`;
    addEntity(id, "descriptor", descriptor, { observation_id: baseline.observationId, source_field: "spell_raw.descriptors_raw", anchor_text_raw: descriptor, source_href: null });
    addRelationship("has_descriptor", "descriptor", id, descriptor, baselineEvidence("spell_raw.descriptors_raw", descriptor));
  }
  for (const level of levels) {
    addEntity(level.spell_list_id, "spell_list", `${level.list_name} Spell List`, { observation_id: baseline.observationId, source_field: "spell_raw.levels_raw", anchor_text_raw: level.raw, source_href: null });
    addRelationship("appears_on_spell_list", "spell_list", level.spell_list_id, `${level.list_name} Spell List`, baselineEvidence("spell_raw.levels_raw", level.raw));
    for (const qualification of level.qualifications) {
      const qualifiedEntity = qualification.kind === "deity"
        ? qualification.deity
        : qualification.kind === "mystery"
          ? qualification.mystery
          : qualification.kind === "archetype"
            ? qualification.archetype
            : qualification.kind === "publication"
              ? qualification.publication_scope
              : null;
      if (!qualifiedEntity?.entity_id || !qualifiedEntity.name) continue;
      addEntity(qualifiedEntity.entity_id, qualification.kind, qualifiedEntity.name, {
        observation_id: baseline.observationId,
        source_field: "spell_raw.levels_raw",
        anchor_text_raw: qualification.raw,
        source_href: null,
      });
    }
  }
  const pubId = publicationId(book);
  addEntity(pubId, "publication", book, { observation_id: baseline.observationId, source_field: "spell_raw.source_book_raw", anchor_text_raw: parsed.sourceNoticeRaw, source_href: null });
  addRelationship("published_in", "publication", pubId, book, baselineEvidence("spell_raw.source_book_raw", parsed.sourceNoticeRaw));
  const castActionId = actionId(castingTime.unit);
  if (castActionId) {
    addEntity(castActionId, "action", castingTime.raw, { observation_id: baseline.observationId, source_field: "spell_raw.casting_time_raw", anchor_text_raw: castingTime.raw, source_href: null });
    addRelationship("uses_action", "action", castActionId, castingTime.raw, baselineEvidence("spell_raw.casting_time_raw", castingTime.raw));
  }
  addEntity("rule.spell-resistance", "rule", "Spell Resistance", { observation_id: baseline.observationId, source_field: "spell_raw.spell_resistance_raw", anchor_text_raw: parsed.spellResistanceRaw, source_href: null });
  addRelationship("uses_definition", "rule", "rule.spell-resistance", "Spell Resistance", baselineEvidence("spell_raw.spell_resistance_raw", parsed.spellResistanceRaw));

  const warnings: Array<{ code: string; field_path: string | null; message: string }> = [];
  if (parsed.sourcePageRaw && page === null) {
    warnings.push({
      code: "INVALID_PUBLICATION_PAGE",
      field_path: "/publication/page",
      message: `AoN publication page ${JSON.stringify(parsed.sourcePageRaw)} is not a positive integer; the raw value remains in the observation and the canonical page is unknown.`,
    });
  }
  if (inheritanceReference && !canResolveCanonicalSpell(availableCanonicalSpells, inheritanceReference.parentId)) {
    warnings.push({
      code: "UNRESOLVED_INHERITANCE",
      field_path: "/rules_inheritance/0",
      message: `The explicit parent chain through ${inheritanceReference.parentId} is not fully canonical yet; the printed child record is preserved but the inheritance chain cannot be materialized.`,
    });
  }
  const comparisonFields: Array<[keyof ParsedSpellPage, string]> = [
    ["schoolRaw", "/classification"], ["levelsRaw", "/levels"], ["castingTimeRaw", "/casting/time"],
    ["componentsRaw", "/casting/components_raw"], ["rangeRaw", "/effect/range"],
    ["durationRaw", "/effect/duration"], ["savingThrowRaw", "/effect/saving_throw"],
    ["spellResistanceRaw", "/effect/spell_resistance"], ["descriptionRaw", "/description/raw"],
  ];
  for (const [field, path] of comparisonFields) {
    const baselineValue = cleanComparable(parsed[field]);
    for (const observation of observations.filter((item) => item !== baseline)) {
      if (cleanComparable(observation.parsed[field]) !== baselineValue) {
        warnings.push({ code: "SOURCE_VARIATION", field_path: path, message: `${observation.siteId} differs from the AoN baseline; both raw observations remain preserved.` });
      }
    }
  }

  const relationships = [...relationshipMap.values()].sort((left, right) => left.relationship_id.localeCompare(right.relationship_id));
  const canonical: ValidatedJson = {
    $schema: "../../schemas/canonical-spell.schema.json",
    schema_version: "0.1.0",
    spell_id: spellId,
    ruleset: "Pathfinder First Edition",
    name: parsed.nameRaw,
    aliases: [],
    classification: normalizedClassification,
    levels,
    casting: { time: castingTime, components, components_raw: parsed.componentsRaw, conditional_components: [] },
    effect: {
      range: parseRange(parsed.rangeRaw),
      delivery: { resolution: delivery.length ? "fixed" : "none", entries: delivery },
      targeting: parseTargeting(targetField?.value_raw ?? null),
      area: parseArea(areaField?.value_raw ?? null),
      duration: parseDuration(parsed.durationRaw),
      saving_throw: parseSavingThrow(parsed.savingThrowRaw),
      spell_resistance: parseSpellResistance(parsed.spellResistanceRaw),
    },
    description: { raw: parsed.descriptionRaw, search_text: cleanComparable(parsed.descriptionRaw), sections: [] },
    publication: {
      publisher: "Paizo",
      book,
      page: Number.isFinite(page) ? page : null,
      first_party_status: "confirmed",
      pfs_status: parsed.pfsStatusRaw === "legal" ? "legal" : parsed.pfsStatusRaw === "not_legal" ? "not_legal" : "unknown",
      supplemental: [],
    },
    rules_inheritance: [],
    relationships,
    provenance: [
      ["/classification", "spell_raw.school_raw", parsed.schoolRaw],
      ["/levels", "spell_raw.levels_raw", parsed.levelsRaw],
      ["/casting", "spell_raw.components_raw", parsed.componentsRaw],
      ["/effect", "spell_raw.delivery_fields_raw", parsed.deliveryFieldsRaw],
      ["/description", "spell_raw.description_raw", parsed.descriptionRaw],
      ["/publication", "spell_raw.source_book_raw", parsed.sourceNoticeRaw],
    ].map(([fieldPath, sourceField, rawValue]) => ({
      field_path: fieldPath,
      observation_id: baseline.observationId,
      source_field: sourceField,
      raw_value_sha256: hash(rawValue),
      decision: "normalized",
      note: "AoN baseline selected under provenance-first-v0; comparison observations remain attached.",
    })),
    normalization: {
      status: inheritanceReference && !canResolveCanonicalSpell(availableCanonicalSpells, inheritanceReference.parentId)
        ? "needs_review"
        : "validated",
      normalizer_version: "0.1.3-qualified-spell-lists",
      warnings,
    },
  };
  if (inheritanceReference) {
    canonical.rules_inheritance = [inheritanceRule(
      inheritanceReference,
      canonical,
      baseline,
      availableCanonicalSpells,
    )];
  }

  const observationIds = observations.map((item) => item.observationId);
  const fieldDecisions = [
    ["/classification", "spell_raw.school_raw"], ["/levels", "spell_raw.levels_raw"],
    ["/casting", "spell_raw.components_raw"], ["/effect", "spell_raw.delivery_fields_raw"],
    ["/description", "spell_raw.description_raw"], ["/publication", "spell_raw.source_book_raw"],
  ].map(([canonicalPath, sourceField]) => ({
    canonical_path: canonicalPath,
    decision: "select_source",
    selected_evidence: [{ observation_id: baseline.observationId, source_field: sourceField }],
    considered_observation_ids: observationIds,
    rationale: "AoN is the highest-provenance first-party catalog baseline. Other source wording is preserved and any variation is recorded as a normalization warning.",
  }));
  const decision = {
    $schema: "../../schemas/canonical-decision.schema.json",
    schema_version: "0.1.0",
    decision_id: `canonical-decision:${spellId}:v0.1`,
    entity_id: spellId,
    canonical_record_path: `../canonical/${spellId.replace(/^spell\./, "")}.json`,
    observation_ids: observationIds,
    policy_id: "provenance-first-v0",
    baseline_observation_id: baseline.observationId,
    status: "accepted",
    field_decisions: fieldDecisions,
    relationship_decisions: relationships.map((relationship) => ({
      relationship_id: relationship.relationship_id,
      decision: "accept",
      evidence: relationship.evidence.map((evidence: any) => ({ observation_id: evidence.observation_id, source_field: evidence.source_field })),
      considered_observation_ids: observationIds,
      rationale: "The relationship is explicit in a bounded source field or hyperlink and retains its source evidence.",
    })),
    unresolved_questions: warnings.map((warning) => warning.message),
  };
  return { canonical, decision, entities: [...entityMap.values()] };
}


function cleanComparable(value: unknown): string {
  return JSON.stringify(value ?? null).replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
