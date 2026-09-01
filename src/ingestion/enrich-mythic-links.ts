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

const d20SupportedRelationship = (
  ownerId: string,
  targetType: string,
  targetId: string,
  targetName: string,
  aonObservationId: string,
  phrase: string,
  d20ObservationId: string,
  d20SourceField: string,
  d20SourceHref: string,
  d20AnchorTextRaw = phrase,
) => relationship(ownerId, targetType, targetId, targetName, [
  evidence(aonObservationId, "raw_aon_mythic_section", "plain_text", phrase, null),
  evidence(d20ObservationId, d20SourceField, "hyperlink", d20AnchorTextRaw, d20SourceHref),
]);

const capturedD20Relationship = (
  ownerId: string,
  targetType: string,
  targetId: string,
  targetName: string,
  phrase: string,
  d20AnchorTextRaw = phrase,
) => {
  const slug = ownerId.replace(/^mythic-spell-variant\./, "");
  const record = JSON.parse(fs.readFileSync(path.join(projectRoot, "data", "variants", `mythic-${slug}.json`), "utf8"));
  const candidates = d20Candidates(record).filter((candidate) => candidate.phrase === d20AnchorTextRaw);
  if (candidates.length !== 1) throw new Error(`${ownerId} has ${candidates.length} captured D20PFSRD links for ${d20AnchorTextRaw}`);
  const candidate = candidates[0]!;
  const aonProvenance = record.provenance.find((item: any) => item.field_path === "/rules_text/raw");
  if (!String(aonProvenance?.observation_id).startsWith("aon:")) throw new Error(`${ownerId} has no AoN rules-text provenance`);
  return d20SupportedRelationship(
    ownerId,
    targetType,
    targetId,
    targetName,
    aonProvenance.observation_id,
    phrase,
    candidate.observation_id,
    candidate.source_field,
    String(candidate.source_href),
    d20AnchorTextRaw,
  );
};

const batch01VariantIds = new Set([
  "mythic-spell-variant.ablative-barrier",
  "mythic-spell-variant.animal-aspect",
  "mythic-spell-variant.animate-dead",
  "mythic-spell-variant.animate-objects",
  "mythic-spell-variant.animate-plants",
  "mythic-spell-variant.antimagic-field",
  "mythic-spell-variant.arboreal-hammer",
  "mythic-spell-variant.arcane-cannon",
  "mythic-spell-variant.baleful-polymorph",
  "mythic-spell-variant.bane",
]);

const batch02VariantIds = new Set([
  "mythic-spell-variant.barkskin",
  "mythic-spell-variant.battle-trance",
  "mythic-spell-variant.black-mark",
  "mythic-spell-variant.black-tentacles",
  "mythic-spell-variant.blade-barrier",
  "mythic-spell-variant.blasphemy",
  "mythic-spell-variant.bless",
  "mythic-spell-variant.blinding-ray",
  "mythic-spell-variant.blindness-deafness",
  "mythic-spell-variant.blink",
  "mythic-spell-variant.blood-crow-strike",
  "mythic-spell-variant.boiling-blood",
  "mythic-spell-variant.break",
  "mythic-spell-variant.breath-of-life",
  "mythic-spell-variant.burning-gaze",
  "mythic-spell-variant.burning-hands",
  "mythic-spell-variant.call-animal",
  "mythic-spell-variant.call-lightning",
  "mythic-spell-variant.cape-of-wasps",
  "mythic-spell-variant.chain-lightning",
  "mythic-spell-variant.chaos-hammer",
  "mythic-spell-variant.chill-metal",
  "mythic-spell-variant.chord-of-shards",
  "mythic-spell-variant.circle-of-death",
  "mythic-spell-variant.cloudkill",
]);

const specs: Record<string, EnrichmentSpec> = {
  "mythic-spell-variant.ablative-barrier": {
    links: [
      { phrase: "armor bonus", relationshipId: "mythic-spell-variant.ablative-barrier:uses_definition:bonus.armor", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "caster level", relationshipId: "mythic-spell-variant.ablative-barrier:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      d20SupportedRelationship("mythic-spell-variant.ablative-barrier", "bonus", "bonus.armor", "Armor Bonus", "aon:spell.ablative-barrier:49553729e088fe15", "armor bonus", "d20pfsrd:spell.ablative-barrier:48eff45573d48baf", "spell_raw.links_raw[17]", "https://www.d20pfsrd.com/basics-ability-scores/glossary#TOC-Armor-Bonus"),
      d20SupportedRelationship("mythic-spell-variant.ablative-barrier", "spellcasting", "spellcasting.caster-level", "Caster Level", "aon:spell.ablative-barrier:49553729e088fe15", "caster level", "d20pfsrd:spell.ablative-barrier:48eff45573d48baf", "spell_raw.links_raw[19]", "https://www.d20pfsrd.com/magic#TOC-Caster-Level"),
    ],
  },
  "mythic-spell-variant.animal-aspect": {
    links: [
      { phrase: "low-light vision", relationshipId: "mythic-spell-variant.animal-aspect:uses_definition:special-ability.low-light-vision", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "size bonus", relationshipId: "mythic-spell-variant.animal-aspect:uses_definition:bonus.size", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "enhancement bonus", relationshipId: "mythic-spell-variant.animal-aspect:uses_definition:bonus.enhancement", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "natural armor", relationshipId: "mythic-spell-variant.animal-aspect:uses_definition:bonus.natural-armor", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      d20SupportedRelationship("mythic-spell-variant.animal-aspect", "special_ability", "special-ability.low-light-vision", "Low-Light Vision", "aon:spell.animal-aspect-greater:42a00606e8fb3696", "low-light vision", "d20pfsrd:spell.animal-aspect:23360a4b8b346e7e", "spell_raw.links_raw[55]", "https://www.d20pfsrd.com/gamemastering/special-abilities#TOC-Low-Light-Vision"),
      d20SupportedRelationship("mythic-spell-variant.animal-aspect", "bonus", "bonus.size", "Size Bonus", "aon:spell.animal-aspect-greater:42a00606e8fb3696", "size bonus", "d20pfsrd:spell.animal-aspect:23360a4b8b346e7e", "spell_raw.links_raw[56]", "https://www.d20pfsrd.com/basics-ability-scores/glossary#TOC-Size-Bonus"),
      d20SupportedRelationship("mythic-spell-variant.animal-aspect", "bonus", "bonus.enhancement", "Enhancement Bonus", "aon:spell.animal-aspect-greater:42a00606e8fb3696", "enhancement bonus", "d20pfsrd:spell.animal-aspect:23360a4b8b346e7e", "spell_raw.links_raw[57]", "https://www.d20pfsrd.com/basics-ability-scores/glossary#TOC-Enhancement-Bonus"),
      d20SupportedRelationship("mythic-spell-variant.animal-aspect", "bonus", "bonus.natural-armor", "Natural Armor Bonus", "aon:spell.animal-aspect-greater:42a00606e8fb3696", "natural armor", "d20pfsrd:spell.animal-aspect:23360a4b8b346e7e", "spell_raw.links_raw[58]", "https://www.d20pfsrd.com/basics-ability-scores/glossary#TOC-Natural-Armor-Bonus"),
    ],
  },
  "mythic-spell-variant.animate-dead": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.animate-dead:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      d20SupportedRelationship("mythic-spell-variant.animate-dead", "spellcasting", "spellcasting.caster-level", "Caster Level", "aon:spell.animate-dead-lesser:4d17c446924f927d", "caster level", "d20pfsrd:spell.animate-dead:25c760e6e16a3a84", "spell_raw.links_raw[37]", "https://www.d20pfsrd.com/magic#TOC-Caster-Level"),
    ],
  },
  "mythic-spell-variant.animate-objects": {
    links: [
      { phrase: "hit points", relationshipId: "mythic-spell-variant.animate-objects:uses_definition:damage.hit-points", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      d20SupportedRelationship("mythic-spell-variant.animate-objects", "damage", "damage.hit-points", "Hit Points", "aon:spell.animate-objects:d5e50ef82863a8d6", "hit points", "d20pfsrd:spell.animate-objects:22a7d6f733b52f67", "spell_raw.links_raw[10]", "https://www.d20pfsrd.com/gamemastering/combat#TOC-Hit-Points"),
    ],
  },
  "mythic-spell-variant.animate-plants": {
    links: [
      { phrase: "hit points", relationshipId: "mythic-spell-variant.animate-plants:uses_definition:damage.hit-points", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      d20SupportedRelationship("mythic-spell-variant.animate-plants", "damage", "damage.hit-points", "Hit Points", "aon:spell.animate-plants:6a7e59c8ee333e05", "hit points", "d20pfsrd:spell.animate-plants:a928201e3e97507d", "spell_raw.links_raw[8]", "https://www.d20pfsrd.com/gamemastering/combat#TOC-Hit-Points"),
    ],
  },
  "mythic-spell-variant.antimagic-field": {
    links: [
      { phrase: "antimagic field", relationshipId: "mythic-spell-variant.antimagic-field:mythic_version_of:spell.antimagic-field", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
  },
  "mythic-spell-variant.arboreal-hammer": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.arboreal-hammer:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "Fortitude save", relationshipId: "mythic-spell-variant.arboreal-hammer:uses_definition:saving-throw.fortitude", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "staggered", relationshipId: "mythic-spell-variant.arboreal-hammer:uses_definition:condition.staggered", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      d20SupportedRelationship("mythic-spell-variant.arboreal-hammer", "spellcasting", "spellcasting.caster-level", "Caster Level", "aon:spell.arboreal-hammer:6549752d3791766e", "caster level", "d20pfsrd:spell.arboreal-hammer:5a3e3f039972b7c2", "spell_raw.links_raw[15]", "https://www.d20pfsrd.com/magic#TOC-Caster-Level"),
      relationship("mythic-spell-variant.arboreal-hammer", "saving_throw", "saving-throw.fortitude", "Fortitude Saving Throw", [
        evidence("aon:spell.arboreal-hammer:6549752d3791766e", "raw_aon_mythic_section", "plain_text", "Fortitude save", null),
        evidence("d20pfsrd:spell.arboreal-hammer:5a3e3f039972b7c2", "spell_raw.links_raw[23]", "hyperlink", "Fortitude", "https://www.d20pfsrd.com/gamemastering/combat#TOC-Fortitude"),
      ]),
      d20SupportedRelationship("mythic-spell-variant.arboreal-hammer", "condition", "condition.staggered", "Staggered", "aon:spell.arboreal-hammer:6549752d3791766e", "staggered", "d20pfsrd:spell.arboreal-hammer:5a3e3f039972b7c2", "spell_raw.links_raw[25]", "https://www.d20pfsrd.com/gamemastering/conditions#TOC-Staggered"),
    ],
  },
  "mythic-spell-variant.arcane-cannon": {
    links: [
      { phrase: "hit points", relationshipId: "mythic-spell-variant.arcane-cannon:uses_definition:damage.hit-points", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "conductive", relationshipId: "mythic-spell-variant.arcane-cannon:uses_definition:weapon-special-ability.conductive", expectedCount: 1, evidenceSource: "aon_anchor" },
    ],
    relationships: [
      d20SupportedRelationship("mythic-spell-variant.arcane-cannon", "damage", "damage.hit-points", "Hit Points", "aon:spell.arcane-cannon:e785391d95e9f561", "hit points", "d20pfsrd:spell.arcane-cannon:7c2aaeb191459122", "spell_raw.links_raw[16]", "https://www.d20pfsrd.com/gamemastering/combat#TOC-Hit-Points"),
      relationship("mythic-spell-variant.arcane-cannon", "weapon_special_ability", "weapon-special-ability.conductive", "Conductive", [
        evidence("aon:spell.arcane-cannon:e785391d95e9f561", "raw_aon_mythic_section", "plain_text", "conductive", null),
        evidence("legacy_aon:spell.arcane-cannon:2caf407e81c3d169", "spell_raw.links_raw[2]", "hyperlink", "conductive", "https://legacy.aonprd.com/advancedPlayersGuide/magicItems/weapons.html#conductive"),
      ]),
    ],
  },
  "mythic-spell-variant.baleful-polymorph": {
    links: [
      { phrase: "Fortitude save", relationshipId: "mythic-spell-variant.baleful-polymorph:uses_definition:saving-throw.fortitude", expectedCount: 2, evidenceSource: "aon_plain_text" },
      { phrase: "Will save", relationshipId: "mythic-spell-variant.baleful-polymorph:uses_definition:saving-throw.will", expectedCount: 1, evidenceSource: "aon_plain_text" },
      { phrase: "shapechanger", relationshipId: "mythic-spell-variant.baleful-polymorph:uses_definition:creature-subtype.shapechanger", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      relationship("mythic-spell-variant.baleful-polymorph", "saving_throw", "saving-throw.fortitude", "Fortitude Saving Throw", [
        evidence("aon:spell.baleful-polymorph:d12281d3fcf67679", "raw_aon_mythic_section", "plain_text", "Fortitude save", null),
      ]),
      relationship("mythic-spell-variant.baleful-polymorph", "saving_throw", "saving-throw.will", "Will Saving Throw", [
        evidence("aon:spell.baleful-polymorph:d12281d3fcf67679", "raw_aon_mythic_section", "plain_text", "Will save", null),
      ]),
      d20SupportedRelationship("mythic-spell-variant.baleful-polymorph", "creature_subtype", "creature-subtype.shapechanger", "Shapechanger", "aon:spell.baleful-polymorph:d12281d3fcf67679", "shapechanger", "d20pfsrd:spell.baleful-polymorph:701e5262dc97a11c", "spell_raw.links_raw[23]", "https://www.d20pfsrd.com/bestiary/rules-for-monsters/creature-types#TOC-Shapechanger"),
    ],
  },
  "mythic-spell-variant.bane": {
    links: [
      { phrase: "attack rolls", relationshipId: "mythic-spell-variant.bane:uses_definition:attack.roll", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      d20SupportedRelationship("mythic-spell-variant.bane", "attack", "attack.roll", "Attack Roll", "aon:spell.bane:fb268f47413d9507", "attack rolls", "d20pfsrd:spell.bane:bd05c29c957b29a4", "spell_raw.links_raw[10]", "https://www.d20pfsrd.com/gamemastering/combat#TOC-Attack-Roll"),
    ],
  },
  "mythic-spell-variant.barkskin": {
    links: [
      { phrase: "enhancement bonus", relationshipId: "mythic-spell-variant.barkskin:uses_definition:bonus.enhancement", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "natural armor bonus", relationshipId: "mythic-spell-variant.barkskin:uses_definition:bonus.natural-armor", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.barkskin", "bonus", "bonus.enhancement", "Enhancement Bonus", "enhancement bonus"),
      capturedD20Relationship("mythic-spell-variant.barkskin", "bonus", "bonus.natural-armor", "Natural Armor Bonus", "natural armor bonus"),
    ],
  },
  "mythic-spell-variant.battle-trance": {
    links: [
      { phrase: "temporary hit points", relationshipId: "mythic-spell-variant.battle-trance:uses_definition:damage.hit-points.temporary", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "caster level", relationshipId: "mythic-spell-variant.battle-trance:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "morale bonus", relationshipId: "mythic-spell-variant.battle-trance:uses_definition:bonus.morale", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.battle-trance", "damage", "damage.hit-points.temporary", "Temporary Hit Points", "temporary hit points"),
      capturedD20Relationship("mythic-spell-variant.battle-trance", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level"),
      capturedD20Relationship("mythic-spell-variant.battle-trance", "bonus", "bonus.morale", "Morale Bonus", "morale bonus"),
    ],
  },
  "mythic-spell-variant.black-mark": {
    links: [
      { phrase: "summon nature’s ally VII", relationshipId: "mythic-spell-variant.black-mark:uses_definition:spell.summon-natures-ally-vii", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.black-mark", "spell", "spell.summon-natures-ally-vii", "Summon Nature’s Ally VII", "summon nature’s ally VII")],
  },
  "mythic-spell-variant.black-tentacles": {
    links: [
      { phrase: "base attack bonus", relationshipId: "mythic-spell-variant.black-tentacles:uses_definition:attack.bonus.base", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.black-tentacles", "attack", "attack.bonus.base", "Base Attack Bonus", "base attack bonus")],
  },
  "mythic-spell-variant.blade-barrier": {
    links: [
      { phrase: "immediate action", relationshipId: "mythic-spell-variant.blade-barrier:uses_definition:action.immediate-action", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "caster level", relationshipId: "mythic-spell-variant.blade-barrier:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.blade-barrier", "action", "action.immediate-action", "Immediate Action", "immediate action"),
      capturedD20Relationship("mythic-spell-variant.blade-barrier", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level"),
    ],
  },
  "mythic-spell-variant.blasphemy": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.blasphemy:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "attack rolls", relationshipId: "mythic-spell-variant.blasphemy:uses_definition:attack.roll", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "spell resistance", relationshipId: "mythic-spell-variant.blasphemy:uses_definition:defense.spell-resistance", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.blasphemy", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level"),
      capturedD20Relationship("mythic-spell-variant.blasphemy", "attack", "attack.roll", "Attack Roll", "attack rolls"),
      capturedD20Relationship("mythic-spell-variant.blasphemy", "defense", "defense.spell-resistance", "Spell Resistance", "spell resistance"),
    ],
  },
  "mythic-spell-variant.bless": {
    links: [
      { phrase: "morale bonus", relationshipId: "mythic-spell-variant.bless:uses_definition:bonus.morale", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "attack rolls", relationshipId: "mythic-spell-variant.bless:uses_definition:attack.roll", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.bless", "bonus", "bonus.morale", "Morale Bonus", "morale bonus"),
      capturedD20Relationship("mythic-spell-variant.bless", "attack", "attack.roll", "Attack Roll", "attack rolls"),
    ],
  },
  "mythic-spell-variant.blinding-ray": {
    links: [
      { phrase: "light blindness", relationshipId: "mythic-spell-variant.blinding-ray:uses_definition:universal-monster-rule.light-blindness", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "light sensitivity", relationshipId: "mythic-spell-variant.blinding-ray:uses_definition:universal-monster-rule.light-sensitivity", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.blinding-ray", "universal_monster_rule", "universal-monster-rule.light-blindness", "Light Blindness", "light blindness"),
      capturedD20Relationship("mythic-spell-variant.blinding-ray", "universal_monster_rule", "universal-monster-rule.light-sensitivity", "Light Sensitivity", "light sensitivity"),
    ],
  },
  "mythic-spell-variant.blindness-deafness": {
    links: [
      { phrase: "deafened", relationshipId: "mythic-spell-variant.blindness-deafness:uses_definition:condition.deafened", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.blindness-deafness", "condition", "condition.deafened", "Deafened", "deafened")],
  },
  "mythic-spell-variant.blink": {
    links: [
      { phrase: "move action", relationshipId: "mythic-spell-variant.blink:uses_definition:action.move-action", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.blink", "action", "action.move-action", "Move Action", "move action")],
  },
  "mythic-spell-variant.blood-crow-strike": {
    links: [
      { phrase: "Improved Critical", relationshipId: "mythic-spell-variant.blood-crow-strike:uses_definition:feat.improved-critical", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "fire resistance", relationshipId: "mythic-spell-variant.blood-crow-strike:uses_definition:special-ability.fire-resistance", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.blood-crow-strike", "feat", "feat.improved-critical", "Improved Critical", "Improved Critical"),
      capturedD20Relationship("mythic-spell-variant.blood-crow-strike", "special_ability", "special-ability.fire-resistance", "Fire Resistance", "fire resistance", "resistance"),
    ],
  },
  "mythic-spell-variant.boiling-blood": {
    links: [
      { phrase: "fire resistance", relationshipId: "mythic-spell-variant.boiling-blood:uses_definition:special-ability.fire-resistance", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.boiling-blood", "special_ability", "special-ability.fire-resistance", "Fire Resistance", "fire resistance", "resistance")],
  },
  "mythic-spell-variant.break": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.break:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.break", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level")],
  },
  "mythic-spell-variant.breath-of-life": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.breath-of-life:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.breath-of-life", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level")],
  },
  "mythic-spell-variant.burning-gaze": {
    links: [
      { phrase: "move action", relationshipId: "mythic-spell-variant.burning-gaze:uses_definition:action.move-action", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "full-round action", relationshipId: "mythic-spell-variant.burning-gaze:uses_definition:action.full-round-action", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "caster level", relationshipId: "mythic-spell-variant.burning-gaze:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.burning-gaze", "action", "action.move-action", "Move Action", "move action"),
      capturedD20Relationship("mythic-spell-variant.burning-gaze", "action", "action.full-round-action", "Full-Round Action", "full-round action"),
      capturedD20Relationship("mythic-spell-variant.burning-gaze", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level"),
    ],
  },
  "mythic-spell-variant.burning-hands": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.burning-hands:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.burning-hands", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level")],
  },
  "mythic-spell-variant.call-animal": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.call-animal:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "Handle Animal", relationshipId: "mythic-spell-variant.call-animal:uses_definition:skill.handle-animal", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "magical beasts", relationshipId: "mythic-spell-variant.call-animal:uses_definition:monster-type.magical-beast", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "Intelligence", relationshipId: "mythic-spell-variant.call-animal:uses_definition:ability-score.intelligence", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.call-animal", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level"),
      capturedD20Relationship("mythic-spell-variant.call-animal", "skill", "skill.handle-animal", "Handle Animal", "Handle Animal"),
      capturedD20Relationship("mythic-spell-variant.call-animal", "monster_type", "monster-type.magical-beast", "Magical Beast", "magical beasts"),
      capturedD20Relationship("mythic-spell-variant.call-animal", "ability_score", "ability-score.intelligence", "Intelligence", "Intelligence"),
    ],
  },
  "mythic-spell-variant.cape-of-wasps": {
    links: [
      { phrase: "wasp swarm", relationshipId: "mythic-spell-variant.cape-of-wasps:uses_definition:monster.wasp-swarm", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "concealment", relationshipId: "mythic-spell-variant.cape-of-wasps:uses_definition:concealment", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.cape-of-wasps", "monster", "monster.wasp-swarm", "Wasp Swarm", "wasp swarm"),
      capturedD20Relationship("mythic-spell-variant.cape-of-wasps", "concealment", "concealment", "Concealment", "concealment"),
    ],
  },
  "mythic-spell-variant.chain-lightning": {
    links: [
      { phrase: "caster level", relationshipId: "mythic-spell-variant.chain-lightning:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.chain-lightning", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level")],
  },
  "mythic-spell-variant.chaos-hammer": {
    links: [
      { phrase: "outsiders", relationshipId: "mythic-spell-variant.chaos-hammer:uses_definition:monster-type.outsider", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.chaos-hammer", "monster_type", "monster-type.outsider", "Outsider", "outsiders")],
  },
  "mythic-spell-variant.chill-metal": {
    links: [
      { phrase: "Dexterity damage", relationshipId: "mythic-spell-variant.chill-metal:uses_definition:damage.ability-score", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.chill-metal", "damage", "damage.ability-score", "Ability Score Damage", "Dexterity damage")],
  },
  "mythic-spell-variant.chord-of-shards": {
    links: [
      { phrase: "damage reduction", relationshipId: "mythic-spell-variant.chord-of-shards:uses_definition:special-ability.damage-reduction", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [capturedD20Relationship("mythic-spell-variant.chord-of-shards", "special_ability", "special-ability.damage-reduction", "Damage Reduction", "damage reduction")],
  },
  "mythic-spell-variant.circle-of-death": {
    links: [
      { phrase: "Hit Dice", relationshipId: "mythic-spell-variant.circle-of-death:uses_definition:hit-die", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "caster level", relationshipId: "mythic-spell-variant.circle-of-death:uses_definition:spellcasting.caster-level", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.circle-of-death", "hit_die", "hit-die", "Hit Dice", "Hit Dice"),
      capturedD20Relationship("mythic-spell-variant.circle-of-death", "spellcasting", "spellcasting.caster-level", "Caster Level", "caster level"),
    ],
  },
  "mythic-spell-variant.cloudkill": {
    links: [
      { phrase: "move action", relationshipId: "mythic-spell-variant.cloudkill:uses_definition:action.move-action", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
      { phrase: "Hit Dice", relationshipId: "mythic-spell-variant.cloudkill:uses_definition:hit-die", expectedCount: 1, evidenceSource: "d20pfsrd_anchor" },
    ],
    relationships: [
      capturedD20Relationship("mythic-spell-variant.cloudkill", "action", "action.move-action", "Move Action", "move action"),
      capturedD20Relationship("mythic-spell-variant.cloudkill", "hit_die", "hit-die", "Hit Dice", "Hit Dice"),
    ],
  },
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
  { variant_id: "mythic-spell-variant.animate-objects", phrases: ["Strength"], reason: "The captured target hint migrates to Strength Domain instead of the Strength ability score." },
  { variant_id: "mythic-spell-variant.animate-plants", phrases: ["Strength"], reason: "The captured target hint migrates to Strength Domain instead of the Strength ability score." },
  { variant_id: "mythic-spell-variant.arboreal-hammer", phrases: ["Strength"], reason: "The captured target hint migrates to Strength Domain instead of the Strength ability score." },
  { variant_id: "mythic-spell-variant.arcane-cannon", phrases: ["hardness"], reason: "The captured target hint migrates to an item entity rather than a general hardness rule." },
  { variant_id: "mythic-spell-variant.baleful-polymorph", phrases: ["animal’s"], reason: "The possessive displayed phrase does not unambiguously name the migrated Animals creature-subtype target." },
  { variant_id: "mythic-spell-variant.blinding-ray", phrases: ["vulnerability"], reason: "The captured target can mean a general vulnerability rule or a specific light vulnerability." },
  { variant_id: "mythic-spell-variant.blink", phrases: ["incorporeal"], reason: "D20PFSRD links the same displayed phrase to both a condition and a creature subtype." },
  { variant_id: "mythic-spell-variant.call-lightning", phrases: ["lightning bolt’s"], reason: "The phrase describes a bolt created by this spell; the captured link to the Lightning Bolt spell is misleading." },
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
  for (const item of additions as any[]) {
    const index = target.findIndex((existing: any) => existing.relationship_id === item.relationship_id);
    if (index >= 0) target[index] = item;
    else target.push(item);
  }
}

export function auditMythicLinks() {
  const records = variants();
  const candidates = records.flatMap(d20Candidates);
  const sourceAnchorVariantIds = Object.entries(specs)
    .filter(([, spec]) => spec.links.some((link) => link.evidenceSource === "aon_anchor"))
    .map(([variantId]) => variantId)
    .sort();
  const candidateVariantIds = [...new Set(candidates.map((candidate) => candidate.variant_id))]
    .filter((variantId) => !sourceAnchorVariantIds.includes(variantId))
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
    variants_with_source_anchors: sourceAnchorVariantIds,
    variants_with_only_d20pfsrd_candidates: candidateVariantIds,
    d20pfsrd_candidate_links: candidates,
    enriched_variants: Object.keys(specs),
    links_added_by_evidence_source: counts,
    links_added: Object.values(counts).reduce((sum, count) => sum + count, 0),
    remaining_review_items: unresolved,
  };
}

export function enrichMythicLinks(onlyVariantIds?: ReadonlySet<string>): ReturnType<typeof auditMythicLinks> {
  const writes: Array<{ fullPath: string; content: string }> = [];
  for (const filename of fs.readdirSync(path.join(projectRoot, "data", "variants")).filter((name) => name.endsWith(".json"))) {
    const fullPath = path.join(projectRoot, "data", "variants", filename);
    const record = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const spec = specs[record.mythic_spell_variant_id];
    if (!spec || (onlyVariantIds && !onlyVariantIds.has(record.mythic_spell_variant_id))) continue;
    addRelationships(record.relationships, spec.relationships);
    if (spec.augmentationRelationships) addRelationships(record.augmentations[0].relationships, spec.augmentationRelationships);
    record.rules_text.document = document(record.rules_text.raw, spec.links);
    writes.push({ fullPath, content: `${JSON.stringify(record, null, 2)}\n` });
  }
  for (const write of writes) fs.writeFileSync(write.fullPath, write.content);
  const result = auditMythicLinks();
  fs.writeFileSync(
    path.join(projectRoot, "data", "reports", "mythic-link-audit.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

if (process.argv.includes("--write")) {
  const batch = process.argv.find((argument) => argument.startsWith("--batch="))?.slice(8);
  if (batch && batch !== "01" && batch !== "02") throw new Error(`Unknown Mythic link batch: ${batch}`);
  const onlyVariantIds = batch === "01" ? batch01VariantIds : batch === "02" ? batch02VariantIds : undefined;
  console.log(JSON.stringify(enrichMythicLinks(onlyVariantIds), null, 2));
} else console.log(JSON.stringify(auditMythicLinks(), null, 2));
