import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RichTextDocument, RichTextInlineNode } from "../domain/rich-text.js";


const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type EvidenceSource = "aon_anchor" | "aon_plain_text" | "d20pfsrd_anchor";

interface LinkSpec {
  phrase: string;
  relationshipId: string;
  expectedCount: number;
  evidenceSource: EvidenceSource;
}

interface EnrichmentSpec {
  links: LinkSpec[];
  relationships?: unknown[];
  augmentationRelationships?: unknown[];
}

interface D20Candidate {
  variant_id: string;
  phrase: string;
  target_hint: string | null;
  source_href: string | null;
  observation_id: string;
  source_field: string;
  context: string;
}

const evidence = (
  observationId: string,
  sourceField: string,
  evidenceKind: "hyperlink" | "plain_text",
  anchorTextRaw: string,
  sourceHref: string | null,
) => ({
  observation_id: observationId,
  source_field: sourceField,
  evidence_kind: evidenceKind,
  anchor_text_raw: anchorTextRaw,
  source_href: sourceHref,
});

const relationship = (
  ownerId: string,
  targetType: string,
  targetId: string,
  targetName: string,
  items: unknown[],
) => ({
  relationship_id: `${ownerId}:uses_definition:${targetId}`,
  type: "uses_definition",
  target: { entity_type: targetType, entity_id: targetId, name: targetName },
  status: "accepted",
  evidence: items,
  note: "The displayed Mythic phrase and local rules target are unambiguous.",
});

const specs: Record<string, EnrichmentSpec> = {
  "mythic-spell-variant.break-enchantment": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.break-enchantment:uses_definition:spellcasting.caster-level", expectedCount: 2, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "enchantment", relationshipId: "mythic-spell-variant.break-enchantment.augmentation-7th:uses_definition:magic-school.enchantment", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "transmutation", relationshipId: "mythic-spell-variant.break-enchantment.augmentation-7th:uses_definition:magic-school.transmutation", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      relationship(
        "mythic-spell-variant.break-enchantment",
        "spellcasting",
        "spellcasting.caster-level",
        "Caster Level",
        [
          evidence("aon:spell.break-enchantment:726fae5f", "spell_raw.mythic_text_raw", "plain_text", "caster level", null),
          evidence("d20pfsrd:spell.break-enchantment:93f3721d", "spell_raw.links_raw[17]", "hyperlink", "caster level", "https://www.d20pfsrd.com/magic#TOC-Caster-Level"),
          evidence("d20pfsrd:spell.break-enchantment:93f3721d", "spell_raw.links_raw[18]", "hyperlink", "caster level", "https://www.d20pfsrd.com/magic#TOC-Caster-Level"),
        ],
      ),
    ],
    augmentationRelationships: [
      relationship(
        "mythic-spell-variant.break-enchantment.augmentation-7th",
        "magic_school",
        "magic-school.enchantment",
        "Enchantment",
        [
          evidence("aon:spell.break-enchantment:726fae5f", "spell_raw.mythic_text_raw", "plain_text", "enchantment", null),
          evidence("d20pfsrd:spell.break-enchantment:93f3721d", "spell_raw.links_raw[19]", "hyperlink", "enchantment", "https://www.d20pfsrd.com/magic#TOC-Enchantment"),
        ],
      ),
      relationship(
        "mythic-spell-variant.break-enchantment.augmentation-7th",
        "magic_school",
        "magic-school.transmutation",
        "Transmutation",
        [
          evidence("aon:spell.break-enchantment:726fae5f", "spell_raw.mythic_text_raw", "plain_text", "transmutation", null),
          evidence("d20pfsrd:spell.break-enchantment:93f3721d", "spell_raw.links_raw[20]", "hyperlink", "transmutation", "https://www.d20pfsrd.com/magic#TOC-Transmutation"),
        ],
      ),
    ],
  },
  "mythic-spell-variant.cure-light-wounds": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.cure-light-wounds:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "ability damage", relationshipId: "mythic-spell-variant.cure-light-wounds:uses_definition:damage.ability-score", expectedCount: 2, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      relationship(
        "mythic-spell-variant.cure-light-wounds",
        "spellcasting",
        "spellcasting.caster-level",
        "Caster Level",
        [
          evidence("aon:spell.cure-light-wounds:704ba163", "spell_raw.mythic_text_raw", "plain_text", "caster level", null),
          evidence("d20pfsrd:spell.cure-light-wounds:d23904b8", "spell_raw.links_raw[14]", "hyperlink", "caster level", "https://www.d20pfsrd.com/magic#TOC-Caster-Level"),
        ],
      ),
    ],
  },
  "mythic-spell-variant.cure-moderate-wounds": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.cure-moderate-wounds:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "ability damage", relationshipId: "mythic-spell-variant.cure-moderate-wounds:uses_definition:damage.ability-score", expectedCount: 2, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      relationship(
        "mythic-spell-variant.cure-moderate-wounds",
        "spellcasting",
        "spellcasting.caster-level",
        "Caster Level",
        [
          evidence("aon:spell.cure-moderate-wounds:4e2b087b", "spell_raw.mythic_text_raw", "plain_text", "caster level", null),
          evidence("d20pfsrd:spell.cure-moderate-wounds:18b9086f", "spell_raw.links_raw[12]", "hyperlink", "caster level", "https://www.d20pfsrd.com/magic#TOC-Caster-Level"),
        ],
      ),
    ],
  },
  "mythic-spell-variant.fireball": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.fireball:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "Reflex saving throw", relationshipId: "mythic-spell-variant.fireball:uses_definition:saving-throw.reflex", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      relationship(
        "mythic-spell-variant.fireball",
        "spellcasting",
        "spellcasting.caster-level",
        "Caster Level",
        [
          evidence("aon:spell.fireball:9cc0a874", "spell_raw.mythic_text_raw", "plain_text", "caster level", null),
          evidence("d20pfsrd:spell.fireball:d1e3b4fe", "spell_raw.links_raw[10]", "hyperlink", "caster level", "https://www.d20pfsrd.com/magic/#Caster-Level"),
        ],
      ),
      relationship(
        "mythic-spell-variant.fireball",
        "saving_throw",
        "saving-throw.reflex",
        "Reflex Saving Throw",
        [
          evidence("aon:spell.fireball:9cc0a874", "spell_raw.mythic_text_raw", "plain_text", "Reflex saving throw", null),
          evidence("d20pfsrd:spell.fireball:d1e3b4fe", "spell_raw.links_raw[11]", "hyperlink", "Reflex", "https://www.d20pfsrd.com/gamemastering/combat/#Reflex"),
        ],
      ),
    ],
  },
  "mythic-spell-variant.inflict-light-wounds": {
    links: [
      { phrase: "sickened", relationshipId: "mythic-spell-variant.inflict-light-wounds:uses_definition:condition.sickened", expectedCount: 1, evidenceSource: "aon_plain_text" },
    ],
  },
  "mythic-spell-variant.inflict-moderate-wounds": {
    links: [
      { phrase: "sickened", relationshipId: "mythic-spell-variant.inflict-moderate-wounds:uses_definition:condition.sickened", expectedCount: 1, evidenceSource: "aon_plain_text" },
    ],
  },
  "mythic-spell-variant.wish": {
    links: [
      { phrase: "non-mythic wish", relationshipId: "mythic-spell-variant.wish:mythic_version_of:spell.wish", expectedCount: 1, evidenceSource: "aon_anchor" },
      { phrase: "resurrection", relationshipId: "mythic-spell-variant.wish:references:spell.resurrection", expectedCount: 1, evidenceSource: "aon_anchor" },
      { phrase: "afflictions", relationshipId: "mythic-spell-variant.wish:uses_definition:affliction", expectedCount: 2, evidenceSource: "aon_plain_text" },
      { phrase: "permanent negative level", relationshipId: "mythic-spell-variant.wish:uses_definition:negative-level.permanent", expectedCount: 1, evidenceSource: "aon_plain_text" },
      { phrase: "immediate action", relationshipId: "mythic-spell-variant.wish:uses_action:action.immediate-action", expectedCount: 1, evidenceSource: "aon_plain_text" },
      { phrase: "helpless", relationshipId: "mythic-spell-variant.wish:uses_definition:condition.helpless", expectedCount: 1, evidenceSource: "aon_plain_text" },
      { phrase: "unconscious", relationshipId: "mythic-spell-variant.wish:uses_definition:condition.unconscious", expectedCount: 1, evidenceSource: "aon_plain_text" },
    ],
  },
};

const reviewItems = [
  { variant_id: "mythic-spell-variant.darkness", phrases: ["darkvision", "see in darkness", "fear"], reason: "The Mythic capture has plain text only and no reviewed relationships identify which local rule pages should be linked." },
  { variant_id: "mythic-spell-variant.break-enchantment", phrases: ["curse"], reason: "Curse can mean a spell, condition, descriptor, or broader effect category." },
  { variant_id: "mythic-spell-variant.fireball", phrases: ["resistance", "immunity"], reason: "The D20PFSRD anchors display generic words; linking them would overstate the source evidence." },
  { variant_id: "mythic-spell-variant.fireball", phrases: ["catches on fire", "Core Rulebook 444"], reason: "The source citation is plain text and no accepted local target represents the rule." },
  { variant_id: "mythic-spell-variant.wish", phrases: ["silent", "stilled"], reason: "The source uses adjectives and does not identify the Silent Spell or Still Spell feats." },
  { variant_id: "multiple", phrases: ["spell", "save", "saving throw"], reason: "Generic rules words do not identify one local target." },
];

function variants(): any[] {
  return fs.readdirSync(path.join(projectRoot, "data", "variants"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(projectRoot, "data", "variants", name), "utf8")));
}

function d20Candidates(record: any): D20Candidate[] {
  const directory = path.join(
    projectRoot,
    "data",
    "observations",
    String(record.base_spell.spell_id).replace(/^spell\./, ""),
  );
  if (!fs.existsSync(directory)) return [];
  const found = new Map<string, D20Candidate>();
  for (const filename of fs.readdirSync(directory).filter((name) => /^d20pfsrd.*\.json$/.test(name))) {
    const observation = JSON.parse(fs.readFileSync(path.join(directory, filename), "utf8"));
    for (const [index, link] of (observation.spell_raw?.links_raw ?? []).entries()) {
      const phrase = String(link.anchor_text_raw ?? "");
      const context = String(link.context_raw ?? "");
      if (
        context.length < 8 ||
        !record.rules_text.raw.includes(context) ||
        record.rules_text.raw.indexOf(context) !== record.rules_text.raw.lastIndexOf(context) ||
        !context.includes(phrase) ||
        context.indexOf(phrase) !== context.lastIndexOf(phrase)
      ) continue;
      const candidate = {
        variant_id: record.mythic_spell_variant_id,
        phrase,
        target_hint: link.target_entity_id_hint ?? null,
        source_href: link.href_resolved ?? null,
        observation_id: observation.observation_id,
        source_field: `spell_raw.links_raw[${index}]`,
        context,
      };
      found.set(`${phrase}\u0000${candidate.target_hint}\u0000${candidate.source_href}`, candidate);
    }
  }
  return [...found.values()].sort((left, right) =>
    left.phrase.localeCompare(right.phrase) ||
    String(left.target_hint).localeCompare(String(right.target_hint))
  );
}

function inline(value: string, links: LinkSpec[]): RichTextInlineNode[] {
  const matches = links.flatMap((link) => {
    const found: Array<{ start: number; end: number; link: LinkSpec }> = [];
    let offset = 0;
    while ((offset = value.indexOf(link.phrase, offset)) >= 0) {
      found.push({ start: offset, end: offset + link.phrase.length, link });
      offset += link.phrase.length;
    }
    return found;
  }).sort((left, right) => left.start - right.start || right.end - left.end);
  const content: RichTextInlineNode[] = [];
  let offset = 0;
  for (const match of matches) {
    if (match.start < offset) throw new Error(`Overlapping Mythic links in ${value}`);
    if (match.start > offset) content.push({ node_type: "text", value: value.slice(offset, match.start) });
    content.push({ node_type: "entity_link", value: value.slice(match.start, match.end), relationship_id: match.link.relationshipId });
    offset = match.end;
  }
  if (offset < value.length) content.push({ node_type: "text", value: value.slice(offset) });
  return content;
}

function document(raw: string, links: LinkSpec[]): RichTextDocument {
  for (const link of links) {
    const count = raw.split(link.phrase).length - 1;
    if (count !== link.expectedCount) throw new Error(`${link.phrase} matched ${count}, expected ${link.expectedCount}`);
  }
  return {
    node_type: "document",
    content: raw.split("\n\n").map((paragraph) => ({
      node_type: "paragraph" as const,
      content: paragraph.split("\n").flatMap((line, index) => [
        ...(index === 0 ? [] : [{ node_type: "hard_break" as const }]),
        ...inline(line, links),
      ]),
    })),
  };
}

function addRelationships(target: unknown[], additions: unknown[] = []): void {
  const ids = new Set(target.map((item: any) => item.relationship_id));
  for (const item of additions as any[]) {
    if (!ids.has(item.relationship_id)) target.push(item);
  }
}

export function auditMythicLinks() {
  const records = variants();
  const candidates = records.flatMap(d20Candidates);
  const candidateVariantIds = [...new Set(candidates.map((candidate) => candidate.variant_id))]
    .filter((variantId) => variantId !== "mythic-spell-variant.wish")
    .sort();
  const counts = { aon_anchor: 0, aon_plain_text: 0, d20pfsrd_anchor: 0 };
  for (const spec of Object.values(specs)) {
    for (const link of spec.links) counts[link.evidenceSource] += link.expectedCount;
  }
  const unresolved = records.flatMap((record) => {
    const specific = reviewItems.filter((item) => item.variant_id === record.mythic_spell_variant_id);
    if (specific.length > 0) return specific.map((item) => ({ ...item }));
    if (specs[record.mythic_spell_variant_id]) return [];
    const phrases = candidates
      .filter((candidate) => candidate.variant_id === record.mythic_spell_variant_id)
      .map((candidate) => candidate.phrase);
    return [{
      variant_id: record.mythic_spell_variant_id,
      phrases: [...new Set(phrases)].sort(),
      reason: phrases.length > 0
        ? "Only D20PFSRD-supported candidates are available; displayed phrases and migrated local targets require review."
        : "No usable inline source anchor was found in the captured Mythic text.",
    }];
  }).concat(reviewItems.filter((item) => item.variant_id === "multiple"));
  return {
    authority_policy: {
      primary: ["aon", "legacy_aon", "paizo"],
      secondary: ["d20pfsrd"],
      excluded_generic_terms: ["spell", "save", "resistance", "immunity", "see text"],
    },
    audited_variants: records.length,
    variants_with_source_anchors: ["mythic-spell-variant.wish"],
    variants_with_only_d20pfsrd_candidates: candidateVariantIds,
    d20pfsrd_candidate_links: candidates,
    enriched_variants: Object.keys(specs),
    links_added_by_evidence_source: counts,
    links_added: Object.values(counts).reduce((sum, count) => sum + count, 0),
    remaining_review_items: unresolved,
  };
}

export function enrichMythicLinks(): ReturnType<typeof auditMythicLinks> {
  for (const filename of fs.readdirSync(path.join(projectRoot, "data", "variants")).filter((name) => name.endsWith(".json"))) {
    const fullPath = path.join(projectRoot, "data", "variants", filename);
    const record = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const spec = specs[record.mythic_spell_variant_id];
    if (!spec) continue;
    addRelationships(record.relationships, spec.relationships);
    if (spec.augmentationRelationships) addRelationships(record.augmentations[0].relationships, spec.augmentationRelationships);
    record.rules_text.document = document(record.rules_text.raw, spec.links);
    fs.writeFileSync(fullPath, `${JSON.stringify(record, null, 2)}\n`);
  }
  const result = auditMythicLinks();
  fs.writeFileSync(
    path.join(projectRoot, "data", "reports", "mythic-link-audit.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

if (process.argv.includes("--write")) console.log(JSON.stringify(enrichMythicLinks(), null, 2));
else console.log(JSON.stringify(auditMythicLinks(), null, 2));
