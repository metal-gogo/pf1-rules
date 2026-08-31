import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import {
  comparableRichText,
  linkRichTextDocument,
  mapRichTextBlockInlines,
  parseRichTextHtml,
  richTextBlockInlines,
  richTextLeafText,
  type RichTextDocument,
  type RichTextInlineNode,
} from "../domain/rich-text.js";
import {
  materializeSpellInheritanceRule,
  resolveCanonicalSpellReference,
} from "./normalize-level-zero.js";
import { resolveArtifactPath } from "./artifact-store.js";
import { parseAonSpell } from "./spell-page-parser.js";


export const richTextPilotSpellIds = [
  "spell.break-enchantment",
  "spell.restoration",
  "spell.restoration-greater",
  "spell.restoration-lesser",
  "spell.bestow-curse",
  "spell.bestow-curse-greater",
  "spell.curse-major",
  "spell.conditional-curse",
  "spell.cure-light-wounds",
  "spell.cure-moderate-wounds",
  "spell.darkness",
] as const;


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function jsonFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory()
      ? jsonFiles(filename)
      : entry.isFile() && entry.name.endsWith(".json")
        ? [filename]
        : [];
  });
}


function canonicalFilename(spellId: string): string {
  return path.join(
    projectRoot,
    "data",
    "canonical",
    `${spellId.replace(/^spell\./, "")}.json`,
  );
}


function observationIndex(): Map<string, { filename: string; record: ValidatedJson }> {
  const observations = new Map<string, { filename: string; record: ValidatedJson }>();
  for (const filename of jsonFiles(path.join(projectRoot, "data", "observations"))) {
    const record = loadJson(filename);
    if (record.observation_id) observations.set(record.observation_id, { filename, record });
  }
  return observations;
}


const darknessMythicOnlyTargets = new Set([
  "publication.pathfinder-rpg-mythic-adventures",
  "rule.human",
  "rule.mythic-adventures-pg-90",
  "rule.see-in-darkness",
  "rule.source",
]);

const darknessContextualTargets = new Set([
  "descriptor.darkness",
  "illumination.bright-light",
  "illumination.normal-light",
  "illumination.dim-light",
  "illumination.darkness",
  "rule.light-vulnerability",
  "rule.light-sensitivity",
  "rule.concealment",
  "rule.total-concealment",
  "item.torch",
  "item.lantern",
  "mythic-spell-variant.darkness",
]);

const alluringLightContextualTargets = new Set([
  "illumination.normal-light",
  "illumination.dim-light",
  "illumination.darkness",
]);

const antiSummoningContextualTargets = new Set(["rule.summon"]);

const dancingDarknessContextualTargets = new Set(["illumination.darkness"]);

const deeperDarknessContextualTargets = new Set([
  "descriptor.darkness",
  "illumination.darkness",
]);

const curseWaterContextualTargets = new Set([
  "rule.good",
  "rule.evil",
  "rule.outsider",
]);

const detectSnaresContextualTargets = new Set(["spell.snare"]);

const diminishResistanceRejectedTargets = new Set(["spell.resistance"]);

const discoveryTorchContextualTargets = new Set([
  "descriptor.light",
  "descriptor.darkness",
  "illumination.bright-light",
]);

const displacementContextualTargets = new Set([
  "rule.concealment",
  "rule.total-concealment",
]);

const divinePowerRejectedTargets = new Set(["rule.speed"]);

const divineVesselRejectedTargets = new Set(["rule.resist"]);

const elementalSpeechContextualTargets = new Set([
  "descriptor.air",
  "descriptor.earth",
  "descriptor.fire",
  "descriptor.water",
  "rule.air",
  "rule.earth",
  "rule.fire",
  "rule.water",
]);

const elementalSwarmContextualTargets = new Set([
  "descriptor.fire",
  "rule.air",
  "rule.earth",
  "rule.fire",
  "rule.size",
  "rule.water",
]);

const enthrallContextualTargets = new Set(["rule.attitude"]);

const etherealFistsContextualTargets = new Set([
  "rule.ethereal",
  "rule.ethereal-plane",
  "rule.material-plane",
]);

const euphoricTranquilityContextualTargets = new Set(["rule.attitude"]);

const canonicalTargets = new Map<string, {
  id: string;
  name: string;
  type?: string;
  relationshipType?: string;
}>([
  ["rule.fortitude", { id: "rule.fortitude-saving-throw", name: "Fortitude" }],
  ["rule.fort", { id: "rule.fortitude-saving-throw", name: "Fortitude" }],
  ["rule.supernatural-abilities", { id: "rule.supernatural", name: "Supernatural abilities" }],
  ["rule.reflex", { id: "rule.reflex-saving-throw", name: "Reflex" }],
  ["rule.will", { id: "rule.will-saving-throw", name: "Will" }],
  ["rule.affliction", { id: "rule.afflictions", name: "Afflictions" }],
  ["rule.attack-roll", { id: "rule.attack-rolls", name: "Attack rolls" }],
  ["rule.ac", { id: "rule.armor-class", name: "Armor Class" }],
  ["rule.saving-throw", { id: "rule.saving-throws", name: "Saving throws" }],
  ["rule.touch", { id: "rule.touch-attack", name: "Touch attack" }],
  ["rule.acid", { id: "descriptor.acid", name: "Acid", type: "descriptor" }],
  ["rule.cold", { id: "descriptor.cold", name: "Cold", type: "descriptor" }],
  ["rule.electricity", { id: "descriptor.electricity", name: "Electricity", type: "descriptor" }],
  ["rule.fire", { id: "descriptor.fire", name: "Fire", type: "descriptor" }],
  ["rule.sonic", { id: "descriptor.sonic", name: "Sonic", type: "descriptor" }],
  ["rule.air-descriptor", { id: "descriptor.air", name: "Air", type: "descriptor" }],
  ["rule.earth-descriptor", { id: "descriptor.earth", name: "Earth", type: "descriptor" }],
  ["rule.fire-descriptor", { id: "descriptor.fire", name: "Fire", type: "descriptor" }],
  ["rule.light-descriptor", { id: "descriptor.light", name: "Light", type: "descriptor" }],
  ["rule.enchantment", { id: "magic-school.enchantment", name: "Enchantment", type: "magic_school" }],
  ["rule.illusion", { id: "magic-school.illusion", name: "Illusion", type: "magic_school" }],
  ["rule.charm", { id: "subschool.charm", name: "Charm", type: "subschool" }],
  ["rule.animals", { id: "rule.animal", name: "Animal" }],
  ["rule.cmd", { id: "rule.combat-maneuver-defense", name: "Combat Maneuver Defense" }],
  ["rule.dr", { id: "rule.damage-reduction", name: "Damage reduction" }],
  ["rule.elven", { id: "rule.elf", name: "Elf" }],
  ["rule.magic-auras", { id: "spell.magic-aura", name: "Magic Aura", type: "spell", relationshipType: "references" }],
  ["rule.bards", { id: "class.bard", name: "Bard", type: "class" }],
  ["rule.wizards", { id: "class.wizard", name: "Wizard", type: "class" }],
  ["rule.antipaladin", { id: "class.antipaladin", name: "Antipaladin", type: "class" }],
  ["rule.inquisitors", { id: "class.inquisitor", name: "Inquisitor", type: "class" }],
  ["rule.warpriests", { id: "class.warpriest", name: "Warpriest", type: "class" }],
  ["rule.caltrops", { id: "item.caltrops", name: "Caltrops", type: "item" }],
  ["rule.greatsword", { id: "item.greatsword", name: "Greatsword", type: "item" }],
  ["rule.quarterstaff", { id: "item.quarterstaff", name: "Quarterstaff", type: "item" }],
  ["rule.club", { id: "item.club", name: "Club", type: "item" }],
  ["rule.light-level", { id: "illumination.levels", name: "Light level" }],
  ["rule.clay-golem", { id: "monster.clay-golem", name: "Clay golem", type: "monster" }],
  ["rule.skeletons", { id: "rule.skeleton", name: "Skeleton" }],
  ["rule.zombies", { id: "rule.zombie", name: "Zombie" }],
  ["rule.natural-attack", { id: "rule.natural-attacks", name: "Natural attacks" }],
  ["rule.improved-natural-attack", { id: "feat.improved-natural-attack", name: "Improved Natural Attack", type: "feat" }],
  ["rule.spell-like-ability", { id: "rule.spell-like-abilities", name: "Spell-like abilities" }],
  ["rule.summoners", { id: "class.summoner", name: "Summoner", type: "class" }],
  ["rule.summoning", { id: "subschool.summoning", name: "Summoning", type: "subschool" }],
  ["rule.sling", { id: "item.sling", name: "Sling", type: "item" }],
  ["rule.magic-missile", { id: "spell.magic-missile", name: "Magic Missile", type: "spell", relationshipType: "references" }],
  ["rule.monkey", { id: "monster.monkey", name: "Monkey", type: "monster" }],
  ["rule.humanoids", { id: "rule.humanoid", name: "Humanoid" }],
  ["rule.aberrations", { id: "rule.aberration", name: "Aberration" }],
  ["rule.dragons", { id: "rule.dragon", name: "Dragon" }],
  ["rule.giants", { id: "rule.giant", name: "Giant" }],
  ["rule.magical-beasts", { id: "rule.magical-beast", name: "Magical beast" }],
  ["rule.monstrous-humanoids", { id: "rule.monstrous-humanoid", name: "Monstrous humanoid" }],
  ["rule.oozes", { id: "rule.ooze", name: "Ooze" }],
  ["rule.plants", { id: "rule.plant", name: "Plant" }],
  ["rule.constructs", { id: "rule.construct", name: "Construct" }],
  ["rule.elementals", { id: "rule.elemental", name: "Elemental" }],
  ["rule.outsiders", { id: "rule.outsider", name: "Outsider" }],
  ["rule.hippocampi", { id: "monster.hippocampus", name: "Hippocampus", type: "monster" }],
  ["rule.hippocampus", { id: "monster.hippocampus", name: "Hippocampus", type: "monster" }],
  ["rule.archon", { id: "rule.archons", name: "Archons" }],
  ["rule.hd", { id: "rule.hit-dice", name: "Hit Dice" }],
  ["rule.hit-die", { id: "rule.hit-dice", name: "Hit Dice" }],
  ["rule.combat-maneuver", { id: "rule.combat-maneuvers", name: "Combat maneuvers" }],
  ["rule.paladin", { id: "class.paladin", name: "Paladin", type: "class" }],
  ["rule.clerics", { id: "class.cleric", name: "Cleric", type: "class" }],
  ["rule.oracles", { id: "class.oracle", name: "Oracle", type: "class" }],
  ["rule.witches", { id: "class.witch", name: "Witch", type: "class" }],
  ["rule.magic-aura", { id: "spell.magic-aura", name: "Magic Aura", type: "spell", relationshipType: "references" }],
  ["rule.animal-companion", { id: "class-feature.animal-companion", name: "Animal companion", type: "class_feature" }],
  ["rule.animal-companions", { id: "class-feature.animal-companion", name: "Animal companion", type: "class_feature" }],
  ["rule.shield-guardians", { id: "monster.shield-guardian", name: "Shield guardian", type: "monster" }],
  ["rule.daemons", { id: "rule.daemon", name: "Daemon" }],
  ["rule.undeads", { id: "rule.undead", name: "Undead" }],
  ["rule.potions", { id: "rule.potion", name: "Potion" }],
  ["condition.deafening", { id: "condition.deaf", name: "Deafened", type: "condition" }],
  ["condition.deafened", { id: "condition.deaf", name: "Deafened", type: "condition" }],
  ["rule.fire-elemental", { id: "monster.fire-elemental", name: "Fire elemental", type: "monster" }],
  ["rule.magic-jar", { id: "spell.magic-jar", name: "Magic Jar", type: "spell", relationshipType: "references" }],
  ["rule.trumpet-archons", { id: "monster.trumpet-archon", name: "Trumpet archon", type: "monster" }],
  ["rule.arcanist", { id: "class.arcanist", name: "Arcanist", type: "class" }],
  ["rule.magus-arcana", { id: "class-feature.magus-arcana", name: "Magus arcana", type: "class_feature" }],
  ["rule.hexes", { id: "class-feature.hexes", name: "Hexes", type: "class_feature" }],
  ["rule.enlarge-spell", { id: "feat.enlarge-spell", name: "Enlarge Spell", type: "feat" }],
  ["rule.extend-spell", { id: "feat.extend-spell", name: "Extend Spell", type: "feat" }],
  ["rule.silent-spell", { id: "feat.silent-spell", name: "Silent Spell", type: "feat" }],
  ["rule.still-spell", { id: "feat.still-spell", name: "Still Spell", type: "feat" }],
  ["rule.improved-critical", { id: "feat.improved-critical", name: "Improved Critical", type: "feat" }],
  ["rule.gem-of-seeing", { id: "item.gem-of-seeing", name: "Gem of seeing", type: "item" }],
  ["rule.robe-of-eyes", { id: "item.robe-of-eyes", name: "Robe of eyes", type: "item" }],
  ["rule.bag-of-holding", { id: "item.bag-of-holding", name: "Bag of holding", type: "item" }],
  ["rule.cmb", { id: "rule.combat-maneuver-bonus", name: "Combat Maneuver Bonus" }],
  ["condition.daze", { id: "condition.dazed", name: "Dazed", type: "condition" }],
  ["spell.dispelled", { id: "spell.dispel-magic", name: "Dispel Magic", type: "spell", relationshipType: "references" }],
  ["condition.fatigue", { id: "condition.fatigued", name: "Fatigued", type: "condition" }],
  ["rule.candle", { id: "item.candle", name: "Candle", type: "item" }],
  ["rule.chain", { id: "item.chain", name: "Chain", type: "item" }],
  ["rule.rope", { id: "item.rope", name: "Rope", type: "item" }],
  ["rule.wild-shape", { id: "class-feature.wild-shape", name: "Wild shape", type: "class_feature" }],
  ["rule.ghosts", { id: "monster.ghost", name: "Ghost", type: "monster" }],
  ["rule.kilt", { id: "item.kilt", name: "Kilt", type: "item" }],
  ["rule.caulborn", { id: "monster.caulborn", name: "Caulborn", type: "monster" }],
  ["rule.paladins", { id: "class.paladin", name: "Paladin", type: "class" }],
  ["rule.eidolon", { id: "class-feature.eidolon", name: "Eidolon", type: "class_feature" }],
  ["rule.aura-of-resolve", { id: "class-feature.aura-of-resolve", name: "Aura of resolve", type: "class_feature" }],
  ["rule.power-attack", { id: "feat.power-attack", name: "Power Attack", type: "feat" }],
  ["rule.rod-of-cancellation", { id: "item.rod-of-cancellation", name: "Rod of cancellation", type: "item" }],
  ["rule.sphere-of-annihilation", { id: "item.sphere-of-annihilation", name: "Sphere of annihilation", type: "item" }],
  ["condition.bleed-damage", { id: "condition.bleed", name: "Bleed", type: "condition" }],
  ["rule.longbow", { id: "item.longbow", name: "Longbow", type: "item" }],
  ["rule.shortbow", { id: "item.shortbow", name: "Shortbow", type: "item" }],
  ["rule.holy-water", { id: "item.holy-water", name: "Holy water", type: "item" }],
  ["rule.improved-unarmed-strike", { id: "feat.improved-unarmed-strike", name: "Improved Unarmed Strike", type: "feat" }],
  ["rule.monk", { id: "class.monk", name: "Monk", type: "class" }],
  ["rule.sharks", { id: "monster.shark", name: "Shark", type: "monster" }],
  ["rule.bleed", { id: "condition.bleed", name: "Bleed", type: "condition" }],
  ["condition.dazes", { id: "condition.dazed", name: "Dazed", type: "condition" }],
  ["rule.orcs", { id: "rule.orc", name: "Orc" }],
  ["rule.alertness", { id: "feat.alertness", name: "Alertness", type: "feat" }],
  ["rule.dagger", { id: "item.dagger", name: "Dagger", type: "item" }],
  ["rule.araznis", { id: "deity.arazni", name: "Arazni", type: "deity" }],
  ["rule.armor-spikes", { id: "item.armor-spikes", name: "Armor spikes", type: "item" }],
  ["rule.giant-mantis", { id: "monster.giant-mantis", name: "Giant mantis", type: "monster" }],
  ["rule.sawtooth-sabre", { id: "item.sawtooth-sabre", name: "Sawtooth sabre", type: "item" }],
  ["rule.natural-weapons", { id: "rule.natural-attacks", name: "Natural attacks" }],
  ["rule.conjuration", { id: "magic-school.conjuration", name: "Conjuration", type: "magic_school" }],
  ["rule.transmutation", { id: "magic-school.transmutation", name: "Transmutation", type: "magic_school" }],
  ["rule.healing", { id: "subschool.healing", name: "Healing", type: "subschool" }],
  ["rule.mind-affecting", { id: "descriptor.mind-affecting", name: "Mind-affecting", type: "descriptor" }],
  ["rule.dwarves", { id: "rule.dwarf", name: "Dwarf" }],
  ["rule.gnomes", { id: "rule.gnome", name: "Gnome" }],
  ["rule.torch", { id: "item.torch", name: "Torch", type: "item" }],
  ["rule.grappling", { id: "rule.grapple", name: "Grapple" }],
  ["rule.temporary-hit-point", { id: "rule.temporary-hit-points", name: "Temporary hit points" }],
  ["rule.cleric", { id: "class.cleric", name: "Cleric", type: "class" }],
  ["rule.divination", { id: "magic-school.divination", name: "Divination", type: "magic_school" }],
  ["rule.enchantments", { id: "magic-school.enchantment", name: "Enchantment", type: "magic_school" }],
  ["rule.glaives", { id: "rule.glaive", name: "Glaive" }],
  ["rule.greater-magic-weapon", { id: "spell.greater-magic-weapon", name: "Greater Magic Weapon", type: "spell", relationshipType: "references" }],
  ["rule.ifrits", { id: "rule.ifrit", name: "Ifrit" }],
  ["rule.oreads", { id: "rule.oread", name: "Oread" }],
  ["rule.sylphs", { id: "rule.sylph", name: "Sylph" }],
  ["rule.undines", { id: "rule.undine", name: "Undine" }],
  ["rule.siege-engines", { id: "rule.siege-engine", name: "Siege engine" }],
  ["rule.unholy-water", { id: "item.unholy-water", name: "Unholy water", type: "item" }],
  ["rule.haunts", { id: "rule.haunt", name: "Haunt" }],
  ["rule.water-elementals", { id: "rule.water-elemental", name: "Water elemental" }],
  ["rule.bardic-performances", { id: "rule.bardic-performance", name: "Bardic performance" }],
  ["rule.ghost", { id: "monster.ghost", name: "Ghost", type: "monster" }],
  ["rule.iron-golems", { id: "monster.iron-golem", name: "Iron golem", type: "monster" }],
  ["rule.profane", { id: "rule.profane-bonus", name: "Profane bonus" }],
  ["rule.swarms", { id: "rule.swarm", name: "Swarm" }],
  ["rule.compulsion", { id: "subschool.compulsion", name: "Compulsion", type: "subschool" }],
  ["condition.blind", { id: "condition.blinded", name: "Blinded", type: "condition" }],
  ["condition.entangle", { id: "condition.entangled", name: "Entangled", type: "condition" }],
  ["rule.figments", { id: "subschool.figment", name: "Figment", type: "subschool" }],
  ["rule.figment", { id: "subschool.figment", name: "Figment", type: "subschool" }],
  ["rule.glamers", { id: "subschool.glamer", name: "Glamer", type: "subschool" }],
  ["rule.evil-descriptor", { id: "descriptor.evil", name: "Evil", type: "descriptor" }],
  ["rule.con", { id: "rule.constitution", name: "Constitution" }],
  ["rule.thought-components", { id: "rule.thought-component", name: "Thought component" }],
  ["rule.spell-like", { id: "rule.spell-like-abilities", name: "Spell-like abilities" }],
  ["rule.metamagic-feat", { id: "rule.metamagic-feats", name: "Metamagic feats" }],
  ["rule.empower-spell", { id: "feat.empower-spell", name: "Empower Spell", type: "feat" }],
  ["rule.maximize-spell", { id: "feat.maximize-spell", name: "Maximize Spell", type: "feat" }],
  ["rule.widen-spell", { id: "feat.widen-spell", name: "Widen Spell", type: "feat" }],
  ["condition.sickening", { id: "condition.sickened", name: "Sickened", type: "condition" }],
  ["rule.confused", { id: "condition.confused", name: "Confused", type: "condition" }],
  ["rule.int", { id: "rule.intelligence", name: "Intelligence" }],
  ["rule.cha", { id: "rule.charisma", name: "Charisma" }],
  ["rule.blind-fight", { id: "feat.blind-fight", name: "Blind-Fight", type: "feat" }],
  ["rule.light-horse", { id: "monster.horse", name: "Light horse", type: "monster" }],
  ["rule.light-horses", { id: "monster.horse", name: "Light horse", type: "monster" }],
  ["rule.snake", { id: "monster.snake", name: "Snake", type: "monster" }],
  ["rule.nalfeshnee", { id: "monster.nalfeshnee", name: "Nalfeshnee", type: "monster" }],
  ["rule.fighters", { id: "class.fighter", name: "Fighter", type: "class" }],
  ["rule.weapon-mastery", { id: "class-feature.weapon-mastery", name: "Weapon mastery", type: "class_feature" }],
  ["rule.scrolls", { id: "rule.scroll", name: "Scroll" }],
  ["rule.poisons", { id: "rule.poison", name: "Poison" }],
  ["rule.magic-mouth", { id: "spell.magic-mouth", name: "Magic Mouth", type: "spell", relationshipType: "references" }],
  ["rule.concentrate", { id: "rule.concentration", name: "Concentration" }],
  ["rule.readied", { id: "rule.ready", name: "Ready" }],
  ["rule.pattern", { id: "subschool.pattern", name: "Pattern", type: "subschool" }],
  ["condition.nauseating", { id: "condition.nauseated", name: "Nauseated", type: "condition" }],
  ["rule.flanked", { id: "rule.flanking", name: "Flanking" }],
  ["rule.occultists", { id: "class.occultist", name: "Occultist", type: "class" }],
  ["rule.bloodragers", { id: "class.bloodrager", name: "Bloodrager", type: "class" }],
  ["rule.sorcerers", { id: "class.sorcerer", name: "Sorcerer", type: "class" }],
  ["rule.bog-mummy", { id: "monster.bog-mummy", name: "Bog mummy", type: "monster" }],
  ["rule.centipede-swarm", { id: "monster.centipede-swarm", name: "Centipede swarm", type: "monster" }],
  ["rule.centipede-swarms", { id: "monster.centipede-swarm", name: "Centipede swarm", type: "monster" }],
  ["rule.ice-mummy", { id: "monster.ice-mummy", name: "Ice mummy", type: "monster" }],
  ["rule.tomb-guardian-mummy", { id: "monster.tomb-guardian-mummy", name: "Tomb guardian mummy", type: "monster" }],
  ["rule.extra-dimensional", { id: "rule.extradimensional", name: "Extradimensional" }],
  ["rule.potion-of", { id: "rule.potion", name: "Potion" }],
  ["rule.caster-levels", { id: "rule.caster-level", name: "Caster level" }],
  ["rule.diseases", { id: "rule.disease", name: "Disease" }],
  ["rule.hakes", { id: "rule.shakes", name: "Shakes" }],
  ["rule.lore-master", { id: "class-feature.lore-master", name: "Lore master", type: "class_feature" }],
  ["rule.swashbucklers", { id: "class.swashbuckler", name: "Swashbuckler", type: "class" }],
  ["rule.will-o-wisps", { id: "monster.will-o-wisp", name: "Will-o'-wisp", type: "monster" }],
  ["spell.create-soul-gems", { id: "spell.create-soul-gem", name: "Create Soul Gem", type: "spell", relationshipType: "references" }],
]);

const canonicalRelationshipTargets = new Map<string, {
  id: string;
  name: string;
  type: string;
  relationshipType: string;
}>([
  [
    "spell.aura-of-greater-courage:references:spell.fear",
    { id: "rule.fear", name: "Fear", type: "rule", relationshipType: "uses_definition" },
  ],
  [
    "spell.aura-sight:references:spell.detect-chaos-evil-good-law",
    { id: "spell-family.detect-alignment", name: "Detect alignment spells", type: "spell_family", relationshipType: "references" },
  ],
  [
    "spell.beastspeak:references:spell.polymorph",
    { id: "subschool.polymorph", name: "Polymorph", type: "subschool", relationshipType: "uses_definition" },
  ],
  [
    "spell.brightest-light:references:spell.darkness",
    { id: "descriptor.darkness", name: "Darkness", type: "descriptor", relationshipType: "uses_definition" },
  ],
  [
    "spell.chain-of-perdition:references:spell.darkness",
    { id: "illumination.darkness", name: "Darkness", type: "rule", relationshipType: "uses_definition" },
  ],
  [
    "spell.chain-of-perdition:references:spell.invisibility",
    { id: "condition.invisibility", name: "Invisibility", type: "condition", relationshipType: "uses_definition" },
  ],
  [
    "spell.canopic-conversion:references:spell.geas-quest",
    { id: "spell.geas-quest", name: "Geas", type: "spell", relationshipType: "references" },
  ],
  [
    "spell.cloak-of-shadows:uses_definition:rule.vulnerability",
    { id: "rule.sunlight-vulnerability", name: "Sunlight vulnerability", type: "rule", relationshipType: "uses_definition" },
  ],
  [
    "spell.continual-flame:references:spell.darkness",
    { id: "descriptor.darkness", name: "Darkness", type: "descriptor", relationshipType: "uses_definition" },
  ],
  [
    "spell.control-winds:uses_definition:rule.wind",
    { id: "rule.wind-effects", name: "Wind effects", type: "rule", relationshipType: "uses_definition" },
  ],
  [
    "spell.crime-of-opportunity:references:spell.crime-wave",
    { id: "spell.crime-wave", name: "Crime Wave", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.crafters-fortune:uses_definition:rule.artifice",
    { id: "spell-list.artifice-domain", name: "Artifice Domain Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.crafters-fortune:uses_definition:rule.industry",
    { id: "spell-list.industry-subdomain", name: "Industry Subdomain Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.create-mindscape:uses_definition:rule.medium",
    { id: "spell-list.medium", name: "medium Spell List", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.detect-mindscape:uses_definition:rule.medium",
    { id: "spell-list.medium", name: "medium Spell List", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.detect-psychic-significance:uses_definition:rule.medium",
    { id: "spell-list.medium", name: "medium Spell List", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.create-pit:uses_definition:rule.caves",
    { id: "spell-list.caves-subdomain", name: "Caves Subdomain Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.create-pit:uses_definition:rule.earth",
    { id: "spell-list.earth-elemental-school", name: "Earth Elemental School Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.creeping-doom:uses_definition:rule.juju-pap39-pzo9039",
    { id: "spell-list.juju-mystery", name: "Juju Mystery Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.creeping-doom:uses_definition:rule.jungle",
    { id: "spell-list.jungle-domain", name: "Jungle Domain Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.creeping-doom:uses_definition:rule.nature",
    { id: "spell-list.nature-mystery", name: "Nature Mystery Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.creeping-doom:uses_definition:rule.scalykind",
    { id: "spell-list.scalykind-domain", name: "Scalykind Domain Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.crushing-despair:uses_definition:rule.isolation",
    { id: "spell-list.isolation-subdomain", name: "Isolation Subdomain Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.cure-critical-wounds-mass:references:spell.cure-light-wounds-mass",
    { id: "spell.cure-light-wounds-mass", name: "Cure Light Wounds, Mass", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.cure-critical-wounds-mass:uses_definition:rule.community",
    { id: "spell-list.community-domain", name: "Community Domain Spells", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.cure-moderate-wounds-mass:references:spell.cure-light-wounds-mass",
    { id: "spell.cure-light-wounds-mass", name: "Cure Light Wounds, Mass", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.cure-serious-wounds-mass:references:spell.cure-light-wounds-mass",
    { id: "spell.cure-light-wounds-mass", name: "Cure Light Wounds, Mass", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.cyclic-reincarnation:references:spell.reincarnate",
    { id: "spell.reincarnate", name: "Reincarnate", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.daywalker:references:spell.energy-drain",
    { id: "rule.energy-drain", name: "Energy drain", type: "rule", relationshipType: "uses_definition" },
  ],
  [
    "spell.deeper-darkness:uses_definition:rule.div",
    { id: "spell-list.sorcerer-div-bloodline", name: "Sorcerer Div Bloodline", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.deeper-darkness:uses_definition:rule.shadow",
    { id: "spell-list.shadow-mystery", name: "Shadow Mystery", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.defensive-shock:uses_definition:rule.metal",
    { id: "spell-list.metal-elemental-school", name: "Metal Elemental School", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.deflection:uses_definition:rule.defense",
    { id: "spell-list.defense-subdomain", name: "Defense Subdomain", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.defoliate:uses_definition:rule.radiation",
    { id: "spell-list.radiation-subdomain", name: "Radiation Subdomain", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.delay-pain:uses_definition:rule.evil",
    { id: "spell-list.kyton-subdomain-from-evil", name: "Kyton Subdomain (Evil Domain)", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.delay-pain:uses_definition:rule.kyton",
    { id: "spell-list.kyton-subdomain-from-evil", name: "Kyton Subdomain (Evil Domain)", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.delay-pain:uses_definition:rule.law",
    { id: "spell-list.kyton-subdomain-from-law", name: "Kyton Subdomain (Law Domain)", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.delayed-blast-fireball:uses_definition:rule.arson",
    { id: "spell-list.arson-subdomain", name: "Arson Subdomain", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.demand:uses_definition:rule.nobility",
    { id: "spell-list.nobility-domain", name: "Nobility Domain", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.demand:uses_definition:rule.torture",
    { id: "spell-list.torture-subdomain", name: "Torture Subdomain", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.demand:uses_definition:subschool.charm",
    { id: "spell-list.charm-domain", name: "Charm Domain", type: "spell_list", relationshipType: "appears_on_spell_list" },
  ],
  [
    "spell.damnation-of-memory:references:spell.magic-aura",
    { id: "rule.magic-aura-detection", name: "Magic aura", type: "rule", relationshipType: "uses_definition" },
  ],
  [
    "spell.eaglesoul:uses_definition:rule.resistance",
    { id: "rule.energy-resistance", name: "Energy Resistance", type: "rule", relationshipType: "uses_definition" },
  ],
  [
    "spell.enemys-heart:references:spell.death-knell",
    { id: "spell.death-knell", name: "Death Knell", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.enlightened-step:references:spell.air-walk",
    { id: "spell.air-walk", name: "Air Walk", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.fairy-ring-retreat:references:spell.unseen-servant",
    { id: "spell.unseen-servant", name: "Unseen Servant", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.false-belief:references:spell.modify-memory",
    { id: "spell.modify-memory", name: "Modify Memory", type: "spell", relationshipType: "functions_like" },
  ],
  [
    "spell.false-vision:references:spell.scrying",
    { id: "subschool.scrying", name: "Scrying", type: "subschool", relationshipType: "uses_definition" },
  ],
  [
    "spell.false-vision-greater:references:spell.scrying",
    { id: "subschool.scrying", name: "Scrying", type: "subschool", relationshipType: "uses_definition" },
  ],
]);

const rejectedRelationshipTargets = new Map([
  [
    "published_in:publication.will",
    "The source href points to the Will saving-throw rules, not a publication.",
  ],
]);

const rejectedDescriptionRelationships = new Map([
  [
    "spell.familiar-melding:uses_definition:condition.dead",
    "The body only appears dead while the caster possesses the familiar; this does not apply the Dead condition.",
  ],
  [
    "spell.fey-form-ii:references:spell.blood-rage",
    "Blood rage is an ability in the form's list, not a reference to the Blood Rage spell.",
  ],
  [
    "spell.fey-form-iii:references:spell.blood-rage",
    "Blood rage is an ability in the form's list, not a reference to the Blood Rage spell.",
  ],
  [
    "spell.fey-form-iii:references:spell.resistance",
    "Energy resistance granted by an assumed form does not refer to the Resistance spell.",
  ],
  [
    "spell.fey-form-iv:references:spell.blood-rage",
    "Blood rage is an ability in the form's list, not a reference to the Blood Rage spell.",
  ],
  [
    "spell.fey-form-iv:references:spell.resistance",
    "Energy resistance granted by an assumed form does not refer to the Resistance spell.",
  ],
  [
    "spell.fiery-body:references:spell.poison",
    "The immunity lists poison as an affliction, not the Poison spell.",
  ],
  [
    "spell.advanced-scurvy:uses_definition:rule.natural",
    "The source link points to natural armor, but the description uses “natural” only in “natural healing.”",
  ],
  [
    "spell.advanced-scurvy:uses_definition:rule.healing",
    "The source href points to the conjuration (healing) subschool, but the description discusses ordinary natural healing.",
  ],
  [
    "spell.advanced-scurvy:uses_definition:subschool.healing",
    "The source href points to the conjuration (healing) subschool, but the description discusses ordinary natural healing.",
  ],
  [
    "spell.adroit-retrieval:uses_definition:rule.supernatural",
    "The description uses “supernatural” as an adjective for speed, not as the supernatural-ability rules term.",
  ],
  [
    "spell.age-resistance-lesser:uses_definition:condition.dying",
    "Dying of old age does not refer to the Dying condition.",
  ],
  [
    "spell.air-bubble:uses_definition:rule.air",
    "The source link identifies the air subtype in metadata; ordinary air in the description is not that rules entity.",
  ],
  [
    "spell.air-step:uses_definition:condition.stable",
    "The description uses “stable” as an ordinary adjective, not the Stable condition.",
  ],
  [
    "spell.air-breathing:uses_definition:rule.touch-attack",
    "The description uses “touch” as an ordinary verb; the source href points to touch attacks.",
  ],
  [
    "spell.align-weapon:published_in:publication.will",
    "The source href points to the Will saving throw rules, not a publication; the canonical Will relationship already records that rule.",
  ],
  [
    "spell.akashic-communion:uses_definition:rule.extraplanar",
    "The description calls a repository extraplanar; it does not apply the extraplanar creature subtype.",
  ],
  [
    "spell.ally-across-time:uses_definition:rule.summon",
    "The description uses “summon” as a verb; the source href points to the monster Summon ability.",
  ],
  [
    "spell.alter-summoned-monster:uses_definition:rule.summon",
    "The description uses “summon” for spellcasting; the source href points to the monster Summon ability.",
  ],
  [
    "spell.alter-winds:uses_definition:rule.wind",
    "The source href points to the Wind oracle mystery; ordinary wind in the description is covered by the separate wind-effects relationship.",
  ],
  [
    "spell.apport-object:uses_definition:rule.summon",
    "The description uses “summon” as an ordinary transport verb; the source href points to the monster Summon ability.",
  ],
  [
    "spell.aquatic-cavalry:uses_definition:rule.summon",
    "The description uses “summon” as a spellcasting verb; the source href points to the monster Summon ability.",
  ],
  [
    "spell.army-across-time:uses_definition:rule.summon",
    "The description uses “summon” as a spellcasting verb; the source href points to the monster Summon ability.",
  ],
  [
    "spell.arcane-eye:uses_definition:rule.arcane",
    "The source href points to the Arcane subdomain, but “arcane” appears only as part of this spell’s name.",
  ],
  [
    "spell.arid-refuge:uses_definition:rule.impervious",
    "The shelter is described with an ordinary adjective; the source href points to the Impervious weapon ability.",
  ],
  [
    "spell.arcane-pocket:uses_definition:rule.touch-attack",
    "The description uses “touch” as ordinary casting prose, not a touch attack.",
  ],
  [
    "spell.ashen-path:uses_definition:rule.touch-attack",
    "The description uses “touch” as an ordinary verb, not a touch attack.",
  ],
  [
    "spell.atonement:uses_definition:rule.redemption",
    "The heading describes moral redemption; the source href points to the unrelated Redemption subdomain.",
  ],
  [
    "spell.aura-of-distraction:uses_definition:rule.distraction",
    "The phrase is part of this spell’s name; the source href points to the unrelated monster Distraction ability.",
  ],
  [
    "spell.barbed-chains:uses_definition:rule.summon",
    "The description uses “summon” as a spellcasting verb; the source href points to the monster Summon ability.",
  ],
  [
    "spell.beacon-of-guilt:uses_definition:rule.touch-attack",
    "The description uses “touch” as an ordinary verb, not a touch attack.",
  ],
  [
    "spell.bereave:uses_definition:item.chain",
    "The source relationship has no matching description text and is unrelated to Bereave’s rules.",
  ],
  [
    "spell.binding-earth:references:spell.binding",
    "The source link matches “binding” only as part of this spell’s own name; Binding Earth does not reference the Binding spell.",
  ],
  [
    "spell.binding-earth-mass:references:spell.binding",
    "The source link matches “binding” only as part of Binding Earth’s name; the mass spell does not reference the Binding spell.",
  ],
  [
    "spell.binding:uses_definition:rule.law",
    "The link is source-page navigation to the Law domain and has no matching text in the spell description.",
  ],
  [
    "spell.binding:uses_definition:rule.magic",
    "The link is source-page navigation to the Magic domain and has no matching text in the spell description.",
  ],
  [
    "spell.binding:uses_definition:rule.rites",
    "The link is source-page navigation to the Rites subdomain and has no matching text in the spell description.",
  ],
  [
    "spell.binding:uses_definition:rule.slavery",
    "The link is source-page navigation to the Slavery subdomain and has no matching text in the spell description.",
  ],
  [
    "spell.black-spot:uses_definition:rule.pathfinder-player-companion-pirates-of-the-inner-sea",
    "The source-navigation link names a publication; the description does not use it as a rules definition.",
  ],
  [
    "spell.blade-tutors-spirit:uses_definition:rule.pathfinder-player-companion-melee-tactics-toolbox",
    "The source-navigation link names a publication; the description does not use it as a rules definition.",
  ],
  [
    "spell.bladed-dash:uses_definition:rule.pathfinder-campaign-setting-inner-sea-magic",
    "The source-navigation link names a publication; the description does not use it as a rules definition.",
  ],
  [
    "spell.bladed-dash-greater:uses_definition:rule.pathfinder-campaign-setting-inner-sea-magic",
    "The source-navigation link names a publication; the description does not use it as a rules definition.",
  ],
  [
    "spell.blast-barrier:uses_definition:rule.pathfinder-campaign-setting-inner-sea-magic",
    "The source-navigation link names a publication; the description does not use it as a rules definition.",
  ],
  [
    "spell.bleed-for-your-master:uses_definition:rule.touch-attack",
    "The spell targets a touched allied creature; it does not require a touch attack.",
  ],
  [
    "spell.blessing-of-luck-and-resolve-mass:uses_definition:rule.pathfinder-roleplaying-game-advanced-race-guide",
    "The source-navigation link names a publication; the description does not use it as a rules definition.",
  ],
  [
    "spell.blight:uses_definition:rule.daemon",
    "The source-navigation link has no matching description text and is unrelated to the spell’s plant effect.",
  ],
  [
    "spell.blight:uses_definition:rule.radiation",
    "The source-navigation link has no matching description text and is unrelated to the spell’s plant effect.",
  ],
  [
    "spell.blight:uses_definition:rule.seasons",
    "The source-navigation link has no matching description text and is unrelated to the spell’s plant effect.",
  ],
  [
    "spell.bloatbomb:uses_definition:rule.touch-attack",
    "The description uses “touch” as an ordinary trigger verb; no touch attack is attempted.",
  ],
  [
    "spell.blood-money:uses_definition:rule.pathfinder-adventure-path-rise-of-the-runelords-anniversary-edition",
    "The source-navigation link names a publication; the description does not use it as a rules definition.",
  ],
  [
    "spell.bone-flense:uses_definition:rule.crimson-assassins",
    "The secondary source substitutes an IP-safe organization name absent from the selected AoN wording; a reviewed Red Mantis class link replaces it.",
  ],
  [
    "spell.bone-flense:uses_definition:rule.humanoid",
    "The source relationship has no matching description text; Bone Flense applies based on anatomy, not the humanoid creature type.",
  ],
  [
    "spell.boneshatter:uses_definition:rule.skeleton",
    "The description refers to a creature's anatomy, not the Skeleton undead template linked by the secondary source.",
  ],
  [
    "spell.borrow-corruption:uses_definition:rule.touch-attack",
    "The description uses “touch” as ordinary casting prose; it does not describe a touch attack.",
  ],
  [
    "spell.bountiful-banquet:uses_definition:rule.animal",
    "The description mentions roasted animals as food, not creatures governed by the Animal type rules.",
  ],
  [
    "spell.call-construct:uses_definition:rule.summon",
    "The description uses “summon” as a spellcasting verb; the source href points to the monster Summon ability.",
  ],
  [
    "spell.carry-companion:uses_definition:rule.touch-attack",
    "The description uses “touch” as ordinary casting prose; it does not describe a touch attack.",
  ],
  [
    "spell.catatonia:uses_definition:rule.touch-attack",
    "The description uses “touch” as ordinary casting prose; it does not describe a touch attack.",
  ],
  [
    "spell.caustic-safeguard:uses_definition:rule.touch-attack",
    "Touching the warded object is a trigger, not a touch attack.",
  ],
  [
    "spell.cauterizing-weapon:uses_definition:subschool.healing",
    "The description discusses accelerated physical healing, not the conjuration (healing) subschool.",
  ],
  [
    "spell.cauterizing-weapon:uses_definition:rule.negating",
    "The description uses “negating” as an ordinary verb; it does not invoke the Negating weapon ability.",
  ],
  [
    "spell.cave-fangs:uses_definition:rule.animal",
    "The matched word is part of the spirit animal class feature, not the Animal creature type.",
  ],
  [
    "spell.cave-fangs:uses_definition:condition.disabled",
    "The description disables linked traps; it does not apply the Disabled creature condition.",
  ],
  [
    "spell.chameleon-stride-greater:uses_definition:rule.advanced-players-guide",
    "The parenthetical book citation is provenance, not a rules definition in the spell description.",
  ],
  [
    "spell.charnel-house:uses_definition:rule.meat",
    "The description's grisly illusion contains ordinary meat; it does not refer to the equipment entry for rations.",
  ],
  [
    "spell.climbing-beanstalk:uses_definition:rule.plant",
    "The description discusses ordinary botanical plant life, not creatures governed by the Plant type rules.",
  ],
  [
    "spell.cloak-of-secrets:references:spell.identify",
    "The description uses “identify” as an ordinary verb for recognizing spells; it does not reference the Identify spell.",
  ],
  [
    "spell.cloak-of-winds:uses_definition:rule.wind",
    "The source href points to the Wind oracle mystery; the description instead uses the general wind-effects rules.",
  ],
  [
    "spell.cloak-of-chaos:uses_definition:rule.chaos",
    "The source link is title navigation to the Chaos domain; the description does not use the domain as a rules term.",
  ],
  [
    "spell.corrosive-consumption:uses_definition:rule.touch-attack",
    "The description uses “touch” as ordinary delivery prose and does not state that the caster makes a touch attack.",
  ],
  [
    "spell.counterbalancing-aura:uses_definition:rule.components",
    "The description discusses alignment components, not spell components.",
  ],
  [
    "spell.create-demiplane-greater:uses_definition:rule.solitude",
    "The source link is spell-list navigation to the Solitude subdomain and is unrelated to the selected description.",
  ],
  [
    "spell.create-soul-gem:references:spell.expend",
    "The description uses “expend” as a verb for spending soul points; it does not reference the Expend spell.",
  ],
  [
    "spell.create-soul-gem:uses_definition:rule.judgment",
    "The soul's judgment in the Great Beyond is unrelated to the inquisitor Judgment class feature linked by the secondary source.",
  ],
  [
    "spell.create-soul-gem:uses_definition:rule.unholy",
    "The location is described as unholy; the secondary href points to the unrelated Unholy weapon special ability.",
  ],
  [
    "spell.creeping-ice:references:spell.slow",
    "The description uses “slow” as an ordinary adjective for the ice's growth, not as a reference to the Slow spell.",
  ],
  [
    "spell.cruel-jaunt:references:spell.teleport",
    "The description uses “teleport” for Cruel Jaunt's own movement effect; it does not invoke the Teleport spell.",
  ],
  [
    "spell.crushing-despair:uses_definition:rule.crushing-despair-modified",
    "The secondary link points to an unrelated third-party modified spell and is not part of the selected first-party description.",
  ],
  [
    "spell.curse-of-dragonflies:uses_definition:rule.medium",
    "The secondary source links the medium range category to the unrelated Medium class page.",
  ],
  [
    "spell.daemon-ward:uses_definition:rule.pathfinder-campaign-setting-horsemen-of-the-apocalypse-book-of-the-damned-vol-3",
    "The secondary source's publication navigation duplicates the canonical Published In relationship and is not a rules definition.",
  ],
  [
    "spell.daywalker:uses_definition:condition.dead",
    "The description uses “dead” to describe flesh, not the Dead condition.",
  ],
  [
    "spell.daywalker:uses_definition:rule.touch-attack",
    "The description discusses an undead creature whose touch deals damage; it does not describe a touch attack.",
  ],
  [
    "spell.daywalker:uses_definition:rule.unholy-water",
    "The secondary source link is unrelated navigation; unholy water does not appear in the selected description.",
  ],
  [
    "spell.daze:uses_definition:rule.pathfinder-roleplaying-game-ultimate-magic",
    "The secondary source link names a publication and is not a rules definition in the selected description.",
  ],
  [
    "spell.death-candle:uses_definition:rule.summon",
    "The description uses “summon” as a spellcasting verb; the source href points to the monster Summon ability.",
  ],
  [
    "spell.death-clutch:uses_definition:rule.regeneration",
    "The phrase describes the Regenerate spell restoring a heart, not the monster Regeneration ability.",
  ],
  [
    "spell.death-knell-aura-greater:uses_definition:rule.pathfinder-campaign-setting-horsemen-of-the-apocalypse-book-of-the-damned-vol-3",
    "The secondary source's publication navigation duplicates the canonical Published In relationship and is not a rules definition.",
  ],
  [
    "spell.blood-salvation:uses_definition:rule.pathfinder-player-companion-advanced-class-origins",
    "The secondary source's publication navigation duplicates the canonical Published In relationship and is not a rules definition.",
  ],
  [
    "spell.decollate:uses_definition:condition.dead",
    "The detached head only appears dead; the target is not subject to the Dead condition.",
  ],
  [
    "spell.detect-magic-greater:uses_definition:rule.pathfinder-roleplaying-game-ultimate-intrigue",
    "The secondary source's publication navigation duplicates the canonical Published In relationship and is not a rules definition.",
  ],
  [
    "spell.detect-magic-greater:uses_definition:rule.pzo1134",
    "The secondary source's product-code navigation duplicates the canonical Published In relationship and is not a rules definition.",
  ],
  [
    "spell.detect-psychic-significance:references:spell.detect-magic",
    "The description uses “detect magic items” as a verb and object; it does not reference the Detect Magic spell.",
  ],
  [
    "spell.detect-radiation:uses_definition:rule.see-in-darkness",
    "The description says this spell does not let the caster see in darkness; it does not grant or invoke the See in Darkness ability.",
  ],
  [
    "spell.detect-snares-and-pits:references:spell.detect-magic",
    "The description uses “does not detect magic traps” as a verb phrase; it does not reference the Detect Magic spell.",
  ],
  [
    "spell.drain-poison:uses_definition:rule.touch-attack",
    "The description uses “touch” for handling the poisoned weapon, not for a touch attack.",
  ],
  [
    "spell.dream-voyage:uses_definition:rule.touch-attack",
    "The description uses “touch” to select the spell's companions, not for a touch attack.",
  ],
  [
    "spell.ectoplasmic-snare:references:spell.snare",
    "The description uses “snare” as an ordinary noun for its own ectoplasmic tether, not as a reference to the Snare spell.",
  ],
  [
    "spell.elemental-aura:uses_definition:rule.elemental",
    "The description uses “elemental” only as part of this spell's own name, not as a creature-type reference.",
  ],
  [
    "spell.elemental-swarm:uses_definition:descriptor.fire",
    "The description names the Elemental Plane of Fire and creatures with the fire subtype; neither occurrence denotes the Fire spell descriptor directly.",
  ],
  [
    "spell.ether-step:uses_definition:rule.dodge",
    "The description uses “dodge” as an ordinary verb for avoiding a blow, not as a named rules definition.",
  ],
  [
    "spell.ethereal-envelope:uses_definition:condition.broken",
    "The envelope can be broken open, but it does not gain the Broken condition.",
  ],
  [
    "spell.ethereal-fists:references:spell.etherealness",
    "The description uses “etherealness” for a state and gives Blink as an example; it does not explicitly reference the Etherealness spell.",
  ],
  [
    "spell.etheric-shards:uses_definition:condition.disabled",
    "The text says the magical trap cannot be disabled; it does not apply the Disabled creature condition.",
  ],
  [
    "spell.etheric-shards:uses_definition:condition.broken",
    "The material component names ordinary broken glass; it does not use the Broken condition.",
  ],
  [
    "spell.expel-blood:references:spell.vortex",
    "The text names the water elemental's Vortex ability, not the Vortex spell linked by the secondary source.",
  ],
  [
    "spell.exquisite-accompaniment:references:spell.teleport",
    "The description uses “teleport” as an ordinary movement verb, not as a reference to the Teleport spell.",
  ],
  [
    "spell.fairy-ring-retreat:uses_definition:rule.animal",
    "The text describes animal-like servants created by the spell, not creatures governed by the Animal type rules.",
  ],
]);


function relationship(
  spellId: string,
  type: string,
  targetType: string,
  targetId: string,
  targetName: string,
  anchorText: string,
  observationId: string,
  sourceUrl: string,
): ValidatedJson {
  return {
    relationship_id: `${spellId}:${type}:${targetId}`,
    type,
    target: { entity_type: targetType, entity_id: targetId, name: targetName },
    status: "accepted",
    evidence: [{
      observation_id: observationId,
      source_field: "spell_raw.description_raw",
      evidence_kind: "manual_verification",
      anchor_text_raw: anchorText,
      source_href: sourceUrl,
    }],
    note: "The selected source wording explicitly uses this rules term.",
  };
}


type ReviewedDescriptionReference = {
  type?: string;
  targetType: string;
  targetId: string;
  targetName: string;
  anchorText: string;
};

const reviewedDescriptionReferences = new Map<string, ReviewedDescriptionReference[]>([
  ["spell.bouncy-body", [
    { targetType: "rule", targetId: "rule.falling-damage", targetName: "Falling damage", anchorText: "falling damage" },
  ]],
  ["spell.bow-spirit", [
    { targetType: "item", targetId: "item.sphere-of-annihilation", targetName: "Sphere of annihilation", anchorText: "sphere of annihilation" },
  ]],
  ["spell.bowstaff", [
    { targetType: "item", targetId: "item.shortbow", targetName: "Shortbow", anchorText: "shortbow" },
    { targetType: "item", targetId: "item.club", targetName: "Club", anchorText: "club" },
    { targetType: "item", targetId: "item.longbow", targetName: "Longbow", anchorText: "longbow" },
    { targetType: "item", targetId: "item.quarterstaff", targetName: "Quarterstaff", anchorText: "quarterstaff" },
  ]],
  ["spell.brand-greater", [
    { targetType: "item", targetId: "item.torch", targetName: "Torch", anchorText: "torch" },
  ]],
  ["spell.brightest-night", [
    { targetType: "rule", targetId: "illumination.dim-light", targetName: "Dim light", anchorText: "dim light" },
  ]],
  ["spell.brilliant-inspiration", [
    { targetType: "rule", targetId: "rule.ability-check", targetName: "Ability checks", anchorText: "ability check" },
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill check" },
  ]],
  ["spell.brow-gasher", [
    { targetType: "condition", targetId: "condition.bleed", targetName: "Bleed", anchorText: "bleed damage" },
  ]],
  ["spell.bullet-shield", [
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
  ]],
  ["spell.bullet-ward", [
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
  ]],
  ["spell.bulls-strength", [
    { targetType: "rule", targetId: "rule.enhancement-bonus", targetName: "Enhancement bonus", anchorText: "enhancement bonus" },
    { targetType: "rule", targetId: "rule.attack-rolls", targetName: "Attack rolls", anchorText: "attack rolls" },
  ]],
  ["spell.burdened-thoughts", [
    { targetType: "rule", targetId: "rule.carrying-capacity", targetName: "Carrying capacity", anchorText: "heavy encumbrance" },
  ]],
  ["spell.burst-bonds", [
    { targetType: "rule", targetId: "rule.swallow-whole", targetName: "Swallow whole", anchorText: "swallow whole" },
  ]],
  ["spell.burst-with-light", [
    { targetType: "rule", targetId: "illumination.bright-light", targetName: "Bright light", anchorText: "bright light" },
    { targetType: "rule", targetId: "illumination.normal-light", targetName: "Normal light", anchorText: "normal light" },
    { targetType: "rule", targetId: "illumination.dim-light", targetName: "Dim light", anchorText: "dim light" },
    { targetType: "rule", targetId: "illumination.darkness", targetName: "Darkness", anchorText: "darkness" },
  ]],
  ["spell.calcific-touch", [
    { type: "references", targetType: "spell", targetId: "spell.slow", targetName: "Slow", anchorText: "slows" },
    { targetType: "condition", targetId: "condition.petrified", targetName: "Petrified", anchorText: "petrified" },
  ]],
  ["spell.calm-air", [
    { targetType: "rule", targetId: "rule.wind-effects", targetName: "Wind effects", anchorText: "wind force" },
  ]],
  ["spell.campfire-wall", [
    { targetType: "item", targetId: "item.torch", targetName: "Torch", anchorText: "torch" },
    { targetType: "rule", targetId: "rule.total-concealment", targetName: "Total concealment", anchorText: "total concealment" },
    { targetType: "rule", targetId: "rule.undead", targetName: "Undead", anchorText: "undead" },
  ]],
  ["spell.canopic-conversion", [
    { targetType: "rule", targetId: "rule.mummy", targetName: "Mummy", anchorText: "mummy" },
    { type: "references", targetType: "spell", targetId: "spell.protection-from-evil", targetName: "Protection from Evil", anchorText: "protection from evil" },
    { type: "references", targetType: "spell", targetId: "spell.sanctuary", targetName: "Sanctuary", anchorText: "sanctuary" },
    { type: "references", targetType: "spell", targetId: "spell.suggestion", targetName: "Suggestion", anchorText: "suggestion" },
    { type: "references", targetType: "spell", targetId: "spell.geas-quest", targetName: "Geas", anchorText: "geas" },
  ]],
  ["spell.cast-out", [
    { targetType: "subschool", targetId: "subschool.compulsion", targetName: "Compulsion", anchorText: "compulsion" },
  ]],
  ["spell.castigate", [
    { targetType: "condition", targetId: "condition.cowering", targetName: "Cowering", anchorText: "cowers" },
  ]],
  ["spell.cauterizing-weapon", [
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "rule", targetId: "rule.silver", targetName: "Silver", anchorText: "silver" },
    { targetType: "rule", targetId: "rule.evil", targetName: "Evil", anchorText: "evil" },
    { targetType: "rule", targetId: "rule.good", targetName: "Good", anchorText: "good" },
  ]],
  ["spell.cave-fangs", [
    { targetType: "class_feature", targetId: "class-feature.spirit-animal", targetName: "Spirit animal", anchorText: "spirit animal" },
  ]],
  ["spell.charons-dispensation", [
    { type: "references", targetType: "spell", targetId: "spell.mindwipe", targetName: "Mindwipe", anchorText: "mindwipe" },
  ]],
  ["spell.cheetahs-sprint", [
    { targetType: "rule", targetId: "rule.climb", targetName: "Climb", anchorText: "climb" },
    { targetType: "rule", targetId: "rule.fly", targetName: "Fly", anchorText: "fly" },
    { targetType: "rule", targetId: "rule.swim", targetName: "Swim", anchorText: "swim" },
  ]],
  ["spell.claim-identity", [
    { targetType: "subschool", targetId: "subschool.polymorph", targetName: "Polymorph", anchorText: "polymorph" },
  ]],
  ["spell.cleanse", [
    { targetType: "rule", targetId: "rule.ability-damage", targetName: "Ability damage", anchorText: "ability damage" },
    { targetType: "rule", targetId: "rule.disease", targetName: "Disease", anchorText: "diseased" },
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "poisoned" },
  ]],
  ["spell.cloak-of-shadows", [
    { targetType: "rule", targetId: "rule.good", targetName: "Good", anchorText: "good" },
    { targetType: "rule", targetId: "illumination.dim-light", targetName: "Dim light", anchorText: "dim light" },
    { targetType: "rule", targetId: "illumination.darkness", targetName: "Darkness", anchorText: "darkness" },
    { targetType: "rule", targetId: "rule.total-concealment", targetName: "Total concealment", anchorText: "total concealment" },
  ]],
  ["spell.cloak-of-winds", [
    { targetType: "rule", targetId: "rule.wind-effects", targetName: "Wind effects", anchorText: "strong winds" },
    { targetType: "rule", targetId: "rule.wind-effects", targetName: "Wind effects", anchorText: "windstorm" },
  ]],
  ["spell.cloud-shape", [
    { targetType: "rule", targetId: "rule.fly", targetName: "Fly", anchorText: "fly" },
  ]],
  ["spell.coin-shot", [
    { targetType: "rule", targetId: "rule.touch-attack", targetName: "Touch attack", anchorText: "touch attacks" },
    { targetType: "rule", targetId: "rule.silver", targetName: "Silver", anchorText: "silver" },
  ]],
  ["spell.cold-ice-strike", [
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold damage" },
  ]],
  ["spell.command-undead", [
    { targetType: "rule", targetId: "rule.undead", targetName: "Undead", anchorText: "undead" },
  ]],
  ["spell.compel-hostility", [
    { targetType: "subschool", targetId: "subschool.compulsion", targetName: "Compulsion", anchorText: "compulsion" },
    { targetType: "class", targetId: "class.summoner", targetName: "Summoner", anchorText: "summoner" },
    { targetType: "class_feature", targetId: "class-feature.eidolon", targetName: "Eidolon", anchorText: "eidolon" },
  ]],
  ["spell.compelling-rant", [
    { targetType: "rule", targetId: "rule.ability-damage", targetName: "Ability damage", anchorText: "Wisdom damage" },
    { targetType: "rule", targetId: "rule.the-sanity-rules", targetName: "Sanity rules", anchorText: "sanity system" },
    { type: "references", targetType: "spell", targetId: "spell.restoration-greater", targetName: "Greater Restoration", anchorText: "greater restoration" },
    { type: "references", targetType: "spell", targetId: "spell.miracle", targetName: "Miracle", anchorText: "miracle" },
    { type: "references", targetType: "spell", targetId: "spell.wish", targetName: "Wish", anchorText: "wish" },
    { type: "references", targetType: "spell", targetId: "spell.borrow-corruption", targetName: "Borrow Corruption", anchorText: "borrow corruption" },
  ]],
  ["spell.concealed-breath", [
    { targetType: "rule", targetId: "rule.drowning", targetName: "Drowning", anchorText: "drowning" },
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "poisons" },
  ]],
  ["spell.conditional-favor", [
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "Poisons" },
    { targetType: "rule", targetId: "rule.disease", targetName: "Disease", anchorText: "diseases" },
    { targetType: "descriptor", targetId: "descriptor.curse", targetName: "Curse", anchorText: "curses" },
  ]],
  ["spell.contagion-greater", [
    { targetType: "rule", targetId: "rule.disease", targetName: "Disease", anchorText: "disease" },
  ]],
  ["spell.contagious-flame", [
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
  ]],
  ["spell.contest-of-skill", [
    { targetType: "class", targetId: "class.fighter", targetName: "Fighter", anchorText: "fighter’s" },
  ]],
  ["spell.calm-emotions", [
    { targetType: "rule", targetId: "rule.morale-bonus", targetName: "Morale bonus", anchorText: "morale bonuses" },
    { targetType: "class_feature", targetId: "class-feature.inspire-courage", targetName: "Inspire courage", anchorText: "inspire courage" },
    { targetType: "class_feature", targetId: "class-feature.rage", targetName: "Rage", anchorText: "rage ability" },
    { targetType: "rule", targetId: "rule.fear", targetName: "Fear", anchorText: "fear effects" },
  ]],
  ["spell.cloak-of-chaos", [
    { targetType: "rule", targetId: "rule.deflection-bonus", targetName: "Deflection bonus", anchorText: "deflection bonus" },
    { targetType: "rule", targetId: "rule.resistance-bonus", targetName: "Resistance bonus", anchorText: "resistance bonus" },
    { targetType: "rule", targetId: "rule.possession", targetName: "Possession", anchorText: "possession" },
  ]],
  ["spell.continual-flame", [
    { targetType: "descriptor", targetId: "descriptor.light", targetName: "Light", anchorText: "Light spells" },
    { targetType: "item", targetId: "item.torch", targetName: "Torch", anchorText: "torch" },
  ]],
  ["spell.control-summoned-creature", [
    { targetType: "subschool", targetId: "subschool.summoning", targetName: "Summoning", anchorText: "summoned creature" },
    { targetType: "subschool", targetId: "subschool.summoning", targetName: "Summoning", anchorText: "summoning spell" },
  ]],
  ["spell.control-water", [
    { targetType: "monster", targetId: "monster.water-elemental", targetName: "Water elemental", anchorText: "water elementals" },
  ]],
  ["spell.controlled-fireball", [
    { targetType: "class", targetId: "class.magus", targetName: "Magus", anchorText: "magi" },
    { targetType: "descriptor", targetId: "descriptor.ruse", targetName: "Ruse", anchorText: "ruse descriptor" },
  ]],
  ["spell.coordinated-effort", [
    { targetType: "rule", targetId: "rule.teamwork-feats", targetName: "Teamwork feats", anchorText: "teamwork feat" },
    { targetType: "feat", targetId: "feat.outflank", targetName: "Outflank", anchorText: "Outflank" },
  ]],
  ["spell.corpse-lanterns", [
    { targetType: "rule", targetId: "illumination.dim-light", targetName: "Dim light", anchorText: "dim light" },
    { targetType: "rule", targetId: "illumination.normal-light", targetName: "Normal light", anchorText: "normal light" },
    { targetType: "rule", targetId: "illumination.bright-light", targetName: "Bright light", anchorText: "bright light" },
  ]],
  ["spell.cowards-cowl", [
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
    { targetType: "rule", targetId: "rule.fear", targetName: "Fear", anchorText: "fear effects" },
  ]],
  ["spell.cowards-lament", [
    { targetType: "rule", targetId: "rule.attack-rolls", targetName: "Attack rolls", anchorText: "attack rolls" },
  ]],
  ["spell.create-greater-undead", [
    { targetType: "rule", targetId: "rule.undead", targetName: "Undead", anchorText: "undead" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster level" },
    { targetType: "monster", targetId: "monster.shadow", targetName: "Shadow", anchorText: "shadows" },
    { targetType: "monster", targetId: "monster.wraith", targetName: "Wraith", anchorText: "wraiths" },
    { targetType: "monster", targetId: "monster.spectre", targetName: "Spectre", anchorText: "spectres" },
    { targetType: "monster", targetId: "monster.devourer", targetName: "Devourer", anchorText: "devourers" },
  ]],
  ["spell.create-variant-mummy", [
    { targetType: "monster", targetId: "monster.tomb-guardian-mummy", targetName: "Tomb guardian mummy", anchorText: "Osirian tomb guardian" },
  ]],
  ["spell.creeping-ice", [
    { targetType: "rule", targetId: "rule.difficult-terrain", targetName: "Difficult terrain", anchorText: "difficult terrain" },
    { targetType: "rule", targetId: "rule.bull-rush", targetName: "Bull rush", anchorText: "bull rushed" },
  ]],
  ["spell.creeping-doom", [
    { targetType: "rule", targetId: "rule.swarm", targetName: "Swarms", anchorText: "swarm attack" },
    { targetType: "rule", targetId: "rule.hit-points", targetName: "Hit points", anchorText: "hit points" },
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "poison" },
    { targetType: "rule", targetId: "rule.distraction", targetName: "Distraction", anchorText: "distraction" },
    { type: "uses_definition", targetType: "action", targetId: "action.standard-action", targetName: "Standard action", anchorText: "standard action" },
  ]],
  ["spell.crime-wave", [
    { targetType: "rule", targetId: "rule.teamwork-feats", targetName: "Teamwork feats", anchorText: "teamwork feats" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.crown-of-glory", [
    { targetType: "rule", targetId: "rule.enhancement-bonus", targetName: "Enhancement bonus", anchorText: "enhancement bonus" },
    { targetType: "rule", targetId: "rule.hit-dice", targetName: "Hit Dice", anchorText: "HD" },
  ]],
  ["spell.cruel-jaunt", [
    { type: "references", targetType: "spell", targetId: "spell.sense-fear", targetName: "Sense Fear", anchorText: "sense fear" },
    { targetType: "rule", targetId: "rule.fear", targetName: "Fear", anchorText: "fear effect" },
    { targetType: "rule", targetId: "rule.fear", targetName: "Fear", anchorText: "fear condition" },
    { targetType: "rule", targetId: "rule.carrying-capacity", targetName: "Carrying capacity", anchorText: "maximum load" },
  ]],
  ["spell.crushing-despair", [
    { targetType: "rule", targetId: "rule.attack-rolls", targetName: "Attack rolls", anchorText: "attack rolls" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throws" },
    { targetType: "rule", targetId: "rule.ability-check", targetName: "Ability checks", anchorText: "ability checks" },
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill checks" },
  ]],
  ["spell.cure-light-wounds-mass", [
    { targetType: "rule", targetId: "rule.positive-energy", targetName: "Positive energy", anchorText: "positive energy" },
    { targetType: "rule", targetId: "rule.undead", targetName: "Undead", anchorText: "undead" },
  ]],
  ["spell.curse-of-befouled-fortune", [
    { targetType: "rule", targetId: "rule.luck-bonus", targetName: "Luck bonus", anchorText: "luck bonuses" },
    { targetType: "class_feature", targetId: "class-feature.charmed-life", targetName: "Charmed life", anchorText: "charmed life" },
    { targetType: "rule", targetId: "rule.attack-rolls", targetName: "Attack rolls", anchorText: "attack" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill check" },
  ]],
  ["spell.curse-of-unexpected-death", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.curse-of-the-outcast", [
    { targetType: "rule", targetId: "rule.attitude", targetName: "Attitude", anchorText: "initial attitude" },
  ]],
  ["spell.curse-water", [
    { targetType: "rule", targetId: "rule.negative-energy", targetName: "Negative energy", anchorText: "negative energy" },
    { targetType: "item", targetId: "item.unholy-water", targetName: "Unholy water", anchorText: "unholy water" },
    { targetType: "rule", targetId: "rule.good", targetName: "Good", anchorText: "good" },
    { targetType: "rule", targetId: "rule.outsider", targetName: "Outsider", anchorText: "outsiders" },
    { targetType: "rule", targetId: "rule.undead", targetName: "Undead", anchorText: "undead" },
    { targetType: "rule", targetId: "rule.evil", targetName: "Evil", anchorText: "evil" },
  ]],
  ["spell.cursed-earth", [
    { targetType: "rule", targetId: "rule.shakes", targetName: "Shakes", anchorText: "shakes" },
  ]],
  ["spell.cushioning-bands", [
    { targetType: "rule", targetId: "rule.constrict", targetName: "Constrict", anchorText: "constriction" },
    { targetType: "rule", targetId: "rule.falling-damage", targetName: "Falling damage", anchorText: "falling" },
    { targetType: "rule", targetId: "rule.swallow-whole", targetName: "Swallow whole", anchorText: "swallowing whole" },
  ]],
  ["spell.damp-powder", [
    { type: "uses_definition", targetType: "action", targetId: "action.full-round-action", targetName: "Full-round action", anchorText: "full-round action" },
    { type: "uses_definition", targetType: "action", targetId: "action.standard-action", targetName: "Standard action", anchorText: "standard action" },
    { targetType: "rule", targetId: "rule.firearm", targetName: "Firearm", anchorText: "firearm" },
  ]],
  ["spell.dancing-darkness", [
    { targetType: "rule", targetId: "illumination.darkness", targetName: "Darkness", anchorText: "darkness" },
    { targetType: "rule", targetId: "illumination.levels", targetName: "Illumination levels", anchorText: "illumination level" },
    { targetType: "rule", targetId: "illumination.dim-light", targetName: "Dim light", anchorText: "dimly lit" },
  ]],
  ["spell.dancing-lantern", [
    { targetType: "item", targetId: "item.lantern", targetName: "Lantern", anchorText: "lantern" },
    { targetType: "item", targetId: "item.oil", targetName: "Oil", anchorText: "oil" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "CL" },
  ]],
  ["spell.dancing-lights", [
    { targetType: "item", targetId: "item.lantern", targetName: "Lantern", anchorText: "lanterns" },
    { targetType: "item", targetId: "item.torch", targetName: "Torch", anchorText: "torches" },
    { targetType: "monster", targetId: "monster.will-o-wisp", targetName: "Will-o'-wisp", anchorText: "will-o'-wisps" },
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentration" },
  ]],
  ["spell.dark-light", [
    { targetType: "descriptor", targetId: "descriptor.light", targetName: "Light", anchorText: "light" },
  ]],
  ["spell.dark-whispers", [
    { targetType: "rule", targetId: "rule.line-of-effect", targetName: "Line of effect", anchorText: "line of effect" },
  ]],
  ["spell.darkvault", [
    { targetType: "rule", targetId: "illumination.levels", targetName: "Illumination levels", anchorText: "illumination level" },
    { targetType: "rule", targetId: "illumination.levels", targetName: "Illumination levels", anchorText: "light level" },
  ]],
  ["spell.darkvision-greater", [
    { targetType: "rule", targetId: "rule.darkvision", targetName: "Darkvision", anchorText: "darkvision" },
  ]],
  ["spell.daze", [
    { targetType: "rule", targetId: "rule.hit-dice", targetName: "Hit Dice", anchorText: "Hit Dice" },
    { targetType: "rule", targetId: "rule.hit-dice", targetName: "Hit Dice", anchorText: "HD" },
    { targetType: "rule", targetId: "rule.humanoid", targetName: "Humanoid", anchorText: "Humanoids" },
  ]],
  ["spell.dazzling-blade", [
    { targetType: "rule", targetId: "rule.silver", targetName: "Silver", anchorText: "silver" },
  ]],
  ["spell.deadly-juggernaut", [
    { targetType: "rule", targetId: "rule.damage-reduction", targetName: "Damage reduction", anchorText: "DR" },
    { targetType: "rule", targetId: "rule.ability-check", targetName: "Ability checks", anchorText: "Strength checks" },
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill checks" },
  ]],
  ["spell.death-knell-aura-greater", [
    { targetType: "condition", targetId: "condition.dying", targetName: "Dying", anchorText: "dying" },
    { targetType: "condition", targetId: "condition.stable", targetName: "Stable", anchorText: "stabilize" },
  ]],
  ["spell.deathwine", [
    { targetType: "rule", targetId: "rule.negative-energy", targetName: "Negative energy", anchorText: "negative energy" },
  ]],
  ["spell.debilitating-portent", [
    { targetType: "class", targetId: "class.witch", targetName: "Witch", anchorText: "witches" },
  ]],
  ["spell.blood-salvation", [
    { targetType: "class_feature", targetId: "class-feature.blood-casting", targetName: "Blood casting", anchorText: "blood casting" },
    { targetType: "class_feature", targetId: "class-feature.bloodrage", targetName: "Bloodrage", anchorText: "bloodrage" },
  ]],
  ["spell.deeper-darkness", [
    { targetType: "descriptor", targetId: "descriptor.darkness", targetName: "Darkness", anchorText: "darkness" },
    { targetType: "rule", targetId: "illumination.levels", targetName: "Illumination levels", anchorText: "light level" },
    { targetType: "rule", targetId: "illumination.bright-light", targetName: "Bright light", anchorText: "Bright light" },
    { targetType: "rule", targetId: "illumination.normal-light", targetName: "Normal light", anchorText: "normal light" },
    { targetType: "rule", targetId: "illumination.dim-light", targetName: "Dim light", anchorText: "dim light" },
    { targetType: "rule", targetId: "illumination.darkness", targetName: "Darkness", anchorText: "darkness" },
    { targetType: "descriptor", targetId: "descriptor.light", targetName: "Light", anchorText: "light spell" },
  ]],
  ["spell.defensive-grace", [
    { targetType: "class_feature", targetId: "class-feature.inspiration", targetName: "Inspiration", anchorText: "inspiration" },
    { targetType: "rule", targetId: "rule.precision-damage", targetName: "Precision damage", anchorText: "precision damage" },
    { targetType: "class_feature", targetId: "class-feature.precise-strike", targetName: "Precise strike", anchorText: "precise strike" },
    { targetType: "class_feature", targetId: "class-feature.studied-combat", targetName: "Studied combat", anchorText: "studied combat" },
    { targetType: "class_feature", targetId: "class-feature.studied-strike", targetName: "Studied strike", anchorText: "studied strike" },
  ]],
  ["spell.defensive-shock", [
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity damage" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster levels" },
  ]],
  ["spell.deflection", [
    { targetType: "descriptor", targetId: "descriptor.force", targetName: "Force", anchorText: "force" },
  ]],
  ["spell.defoliate", [
    { targetType: "rule", targetId: "rule.negative-energy", targetName: "Negative energy", anchorText: "negative energy" },
    { targetType: "rule", targetId: "rule.plant", targetName: "Plant", anchorText: "plant creature" },
    { targetType: "rule", targetId: "rule.touch-attack", targetName: "Touch attack", anchorText: "touch attack" },
  ]],
  ["spell.deft-digits", [
    { targetType: "rule", targetId: "rule.fly", targetName: "Fly", anchorText: "fly speed" },
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill check" },
    { targetType: "rule", targetId: "rule.line-of-sight", targetName: "Line of sight", anchorText: "line of sight" },
  ]],
  ["spell.deja-vu", [
    { type: "uses_action", targetType: "action", targetId: "action.full-round-action", targetName: "Full-round action", anchorText: "full-round" },
    { type: "uses_action", targetType: "action", targetId: "action.standard-action", targetName: "Standard action", anchorText: "standard" },
    { type: "uses_action", targetType: "action", targetId: "action.move-action", targetName: "Move action", anchorText: "move actions" },
  ]],
  ["spell.delay-pain", [
    { targetType: "descriptor", targetId: "descriptor.pain", targetName: "Pain", anchorText: "Pain effects" },
  ]],
  ["spell.delayed-blast-fireball", [
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire damage" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster level" },
  ]],
  ["spell.delectable-flesh", [
    { targetType: "rule", targetId: "rule.ability-check", targetName: "Ability checks", anchorText: "ability checks" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throws" },
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill checks" },
  ]],
  ["spell.delusional-pride", [
    { targetType: "rule", targetId: "rule.attack-rolls", targetName: "Attack rolls", anchorText: "attacks" },
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill checks" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saves" },
  ]],
  ["spell.denounce", [
    { targetType: "rule", targetId: "rule.line-of-sight", targetName: "Line of sight", anchorText: "line of sight" },
  ]],
  ["spell.destabilize-powder", [
    { targetType: "rule", targetId: "rule.firearm", targetName: "Firearm", anchorText: "firearm" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster levels" },
    { type: "uses_action", targetType: "action", targetId: "action.standard-action", targetName: "Standard action", anchorText: "standard action" },
  ]],
  ["spell.destroy-robot", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.android", targetName: "Android", anchorText: "android" },
  ]],
  ["spell.destruction", [
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster level" },
  ]],
  ["spell.detect-animals-or-plants", [
    { targetType: "rule", targetId: "rule.hit-points", targetName: "Hit points", anchorText: "hit points" },
    { targetType: "rule", targetId: "rule.ability-score", targetName: "Ability score", anchorText: "ability score" },
    { targetType: "rule", targetId: "rule.line-of-sight", targetName: "Line of sight", anchorText: "line of sight" },
  ]],
  ["spell.detect-demon", [
    { targetType: "rule", targetId: "rule.hit-dice", targetName: "Hit Dice", anchorText: "HD" },
    { targetType: "rule", targetId: "rule.line-of-sight", targetName: "Line of sight", anchorText: "line of sight" },
  ]],
  ["spell.detect-evil", [
    { targetType: "rule", targetId: "rule.hit-dice", targetName: "Hit Dice", anchorText: "HD" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster level" },
    { targetType: "rule", targetId: "rule.line-of-sight", targetName: "Line of sight", anchorText: "line of sight" },
    { targetType: "class", targetId: "class.cleric", targetName: "Cleric", anchorText: "cleric" },
    { targetType: "class", targetId: "class.cleric", targetName: "Cleric", anchorText: "clerics" },
    { targetType: "rule", targetId: "rule.outsider", targetName: "Outsider", anchorText: "outsider" },
    { targetType: "rule", targetId: "rule.animal", targetName: "Animal", anchorText: "Animals" },
    { targetType: "rule", targetId: "rule.trap", targetName: "Traps", anchorText: "traps" },
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "poisons" },
  ]],
  ["spell.detect-fiendish-presence", [
    { targetType: "deity", targetId: "deity.asmodeus", targetName: "Asmodeus", anchorText: "Asmodeus" },
  ]],
  ["spell.detect-magic-greater", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.detect-metal", [
    { targetType: "rule", targetId: "rule.silver", targetName: "Silver", anchorText: "silver" },
  ]],
  ["spell.detect-poison", [
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "poison" },
  ]],
  ["spell.detect-snares-and-pits", [
    { targetType: "rule", targetId: "rule.trap", targetName: "Traps", anchorText: "traps" },
    { targetType: "rule", targetId: "rule.line-of-sight", targetName: "Line of sight", anchorText: "line of sight" },
  ]],
  ["spell.detect-the-faithful", [
    { targetType: "rule", targetId: "rule.line-of-sight", targetName: "Line of sight", anchorText: "line of sight" },
  ]],
  ["spell.detonate", [
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.dimensional-anchor", [
    { targetType: "rule", targetId: "rule.touch-attack", targetName: "Touch attack", anchorText: "ranged touch attack" },
    { targetType: "rule", targetId: "rule.extradimensional", targetName: "Extradimensional", anchorText: "extradimensional" },
    { targetType: "rule", targetId: "rule.spell-like-abilities", targetName: "Spell-like abilities", anchorText: "spell-like abilities" },
    { targetType: "subschool", targetId: "subschool.summoning", targetName: "Summoning", anchorText: "summoned creatures" },
    { targetType: "subschool", targetId: "subschool.summoning", targetName: "Summoning", anchorText: "summoning spell" },
  ]],
  ["spell.dimensional-blade", [
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
    { targetType: "rule", targetId: "rule.attack-rolls", targetName: "Attack rolls", anchorText: "Attacks" },
    { targetType: "descriptor", targetId: "descriptor.force", targetName: "Force", anchorText: "Force effects" },
  ]],
  ["spell.dimensional-bounce", [
    { targetType: "rule", targetId: "rule.line-of-effect", targetName: "Line of effect", anchorText: "line of effect" },
  ]],
  ["spell.diminish-plants", [
    { targetType: "rule", targetId: "rule.plant", targetName: "Plant", anchorText: "plant creatures" },
  ]],
  ["spell.diminish-resistance", [
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "descriptor", targetId: "descriptor.sonic", targetName: "Sonic", anchorText: "sonic" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster levels" },
  ]],
  ["spell.disable-construct", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.immunity-to-magic", targetName: "Immunity to magic", anchorText: "immune to magic" },
  ]],
  ["spell.discern-location", [
    { targetType: "subschool", targetId: "subschool.scrying", targetName: "Scrying", anchorText: "scrying" },
    { targetType: "rule", targetId: "rule.plane", targetName: "Planes", anchorText: "plane of existence" },
  ]],
  ["spell.discharge", [
    { targetType: "rule", targetId: "rule.robot", targetName: "Robot", anchorText: "robot" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.disguise-self", [
    { targetType: "rule", targetId: "rule.creature-type", targetName: "Creature type", anchorText: "creature type" },
    { targetType: "rule", targetId: "rule.creature-subtype", targetName: "Creature subtype", anchorText: "subtype" },
    { targetType: "subschool", targetId: "subschool.glamer", targetName: "Glamer", anchorText: "glamer" },
  ]],
  ["spell.disguise-weapon", [
    { targetType: "subschool", targetId: "subschool.glamer", targetName: "Glamer", anchorText: "glamer" },
  ]],
  ["spell.dismissal", [
    { targetType: "rule", targetId: "rule.extraplanar", targetName: "Extraplanar", anchorText: "extraplanar" },
  ]],
  ["spell.dispel-balance", [
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
    { targetType: "rule", targetId: "rule.attack-rolls", targetName: "Attack rolls", anchorText: "attacks" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "Saving throws" },
  ]],
  ["spell.dispel-evil", [
    { targetType: "rule", targetId: "rule.touch-attack", targetName: "Touch attack", anchorText: "melee touch attack" },
  ]],
  ["spell.dispel-good", [
    { targetType: "rule", targetId: "rule.good", targetName: "Good", anchorText: "good" },
    { targetType: "rule", targetId: "rule.evil", targetName: "Evil", anchorText: "evil" },
  ]],
  ["spell.dispel-law", [
    { targetType: "rule", targetId: "rule.lawful", targetName: "Lawful", anchorText: "lawful" },
    { targetType: "rule", targetId: "rule.evil", targetName: "Evil", anchorText: "evil" },
  ]],
  ["spell.displacement", [
    { targetType: "rule", targetId: "rule.total-concealment", targetName: "Total concealment", anchorText: "total concealment" },
  ]],
  ["spell.disrupting-weapon", [
    { targetType: "rule", targetId: "rule.undead", targetName: "Undead", anchorText: "undead" },
  ]],
  ["spell.distressing-tone", [
    { targetType: "rule", targetId: "rule.critical-hit", targetName: "Critical hits", anchorText: "critical hits" },
  ]],
  ["spell.divide-mind", [
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrating" },
  ]],
  ["spell.divine-arrow", [
    { targetType: "rule", targetId: "rule.lay-on-hands", targetName: "Lay on hands", anchorText: "lay on hands" },
  ]],
  ["spell.divine-power", [
    { targetType: "rule", targetId: "rule.speed-weapon", targetName: "Speed weapon special ability", anchorText: "speed" },
  ]],
  ["spell.divine-vessel", [
    { targetType: "rule", targetId: "rule.spell-resistance", targetName: "Spell resistance", anchorText: "SR" },
    { targetType: "rule", targetId: "rule.damage-reduction", targetName: "Damage reduction", anchorText: "DR" },
    { targetType: "rule", targetId: "rule.damage-reduction", targetName: "Damage reduction", anchorText: "damage resistance" },
    { targetType: "rule", targetId: "rule.attack-rolls", targetName: "Attack rolls", anchorText: "attacks" },
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "descriptor", targetId: "descriptor.sonic", targetName: "Sonic", anchorText: "sonic" },
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "poison" },
    { targetType: "rule", targetId: "rule.chaotic", targetName: "Chaotic", anchorText: "chaotic" },
    { targetType: "rule", targetId: "rule.good", targetName: "Good", anchorText: "good" },
    { targetType: "rule", targetId: "rule.evil", targetName: "Evil", anchorText: "evil" },
  ]],
  ["spell.dousing-rain", [
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fires" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
  ]],
  ["spell.draconic-ally", [
    { targetType: "deity", targetId: "deity.apsu", targetName: "Apsu", anchorText: "Apsu" },
    { targetType: "deity", targetId: "deity.dahak", targetName: "Dahak", anchorText: "Dahak" },
  ]],
  ["spell.draconic-malice", [
    { targetType: "class", targetId: "class.antipaladin", targetName: "Antipaladin", anchorText: "antipaladin" },
    { targetType: "class_feature", targetId: "class-feature.aura-of-cowardice", targetName: "Aura of cowardice", anchorText: "aura of cowardice" },
  ]],
  ["spell.draconic-suppression", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throws" },
  ]],
  ["spell.ceremony", [
    { targetType: "descriptor", targetId: "descriptor.water", targetName: "Water", anchorText: "water descriptor" },
  ]],
  ["spell.curse-terrain-lesser", [
    { type: "references", targetType: "spell", targetId: "spell.curse-terrain", targetName: "Curse Terrain", anchorText: "Curse Terrain" },
    { type: "references", targetType: "spell", targetId: "spell.curse-terrain-greater", targetName: "Curse Terrain, Greater", anchorText: "Greater Curse Terrain" },
    { type: "references", targetType: "spell", targetId: "spell.curse-terrain-supreme", targetName: "Curse Terrain, Supreme", anchorText: "Supreme Curse Terrain" },
  ]],
  ["spell.detect-undead", [
    { targetType: "rule", targetId: "rule.undead", targetName: "Undead", anchorText: "undead" },
  ]],
  ["spell.drain-poison", [
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "poison" },
  ]],
  ["spell.dread-bolt", [
    { targetType: "rule", targetId: "rule.good", targetName: "Good", anchorText: "good" },
    { targetType: "rule", targetId: "rule.evil", targetName: "Evil", anchorText: "evil" },
  ]],
  ["spell.dreadscape", [
    { targetType: "rule", targetId: "rule.attitude", targetName: "Attitude", anchorText: "hostile attitude" },
    { targetType: "rule", targetId: "rule.the-sanity-rules", targetName: "Sanity rules", anchorText: "sanity system" },
  ]],
  ["spell.dream-shield", [
    { targetType: "magic_school", targetId: "magic-school.divination", targetName: "Divination", anchorText: "divinations" },
    { targetType: "rule", targetId: "rule.possession", targetName: "Possession", anchorText: "possession" },
  ]],
  ["spell.dream-travel", [
    { targetType: "descriptor", targetId: "descriptor.emotion", targetName: "Emotion", anchorText: "emotion effects" },
  ]],
  ["spell.dream-voyage", [
    { targetType: "descriptor", targetId: "descriptor.emotion", targetName: "Emotion", anchorText: "emotion" },
    { targetType: "rule", targetId: "rule.fear", targetName: "Fear", anchorText: "fear effects" },
  ]],
  ["spell.drunkards-breath", [
    { targetType: "descriptor", targetId: "descriptor.poison", targetName: "Poison", anchorText: "poison effect" },
    { targetType: "deity", targetId: "deity.cayden-cailean", targetName: "Cayden Cailean", anchorText: "Cayden Cailean" },
  ]],
  ["spell.dwarven-veil", [
    { targetType: "rule", targetId: "rule.dwarf", targetName: "Dwarf", anchorText: "dwarves" },
  ]],
  ["spell.dweomer-retaliation", [
    { targetType: "rule", targetId: "rule.counterspell", targetName: "Counterspell", anchorText: "counterspelling" },
    { targetType: "rule", targetId: "rule.temporary-hit-points", targetName: "Temporary hit points", anchorText: "temporary hit points" },
  ]],
  ["spell.eaglesoul", [
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
    { targetType: "rule", targetId: "rule.critical-hit", targetName: "Critical hits", anchorText: "critical threat roll" },
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "rule", targetId: "rule.good", targetName: "Good", anchorText: "good" },
    { targetType: "rule", targetId: "rule.evil", targetName: "Evil", anchorText: "evil" },
  ]],
  ["spell.early-judgment", [
    { targetType: "deity", targetId: "deity.pharasma", targetName: "Pharasma", anchorText: "Pharasma" },
    { targetType: "rule", targetId: "rule.good", targetName: "Good", anchorText: "good" },
    { targetType: "rule", targetId: "rule.neutral", targetName: "Neutral", anchorText: "neutral" },
    { targetType: "rule", targetId: "rule.evil", targetName: "Evil", anchorText: "evil" },
    { targetType: "rule", targetId: "rule.plane", targetName: "Planes", anchorText: "plane" },
  ]],
  ["spell.ears-of-the-city", [
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrates" },
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrating" },
  ]],
  ["spell.earth-glide", [
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentration" },
    { targetType: "condition", targetId: "condition.stunned", targetName: "Stunned", anchorText: "stunning" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
  ]],
  ["spell.echeans-excellent-enclosure", [
    { type: "references", targetType: "spell", targetId: "spell.antimagic-field", targetName: "Antimagic Field", anchorText: "antimagic field" },
    { type: "references", targetType: "spell", targetId: "spell.antimagic-field", targetName: "Antimagic Field", anchorText: "field of antimagic" },
    { type: "references", targetType: "spell", targetId: "spell.wall-of-force", targetName: "Wall of Force", anchorText: "wall of force" },
    { type: "references", targetType: "spell", targetId: "spell.dispel-magic", targetName: "Dispel Magic", anchorText: "dispel magic" },
    { targetType: "item", targetId: "item.sphere-of-annihilation", targetName: "Sphere of annihilation", anchorText: "sphere of annihilation" },
    { targetType: "item", targetId: "item.rod-of-cancellation", targetName: "Rod of cancellation", anchorText: "rod of cancellation" },
    { targetType: "rule", targetId: "rule.hardness", targetName: "Hardness", anchorText: "hardness" },
    { targetType: "rule", targetId: "rule.hit-points", targetName: "Hit points", anchorText: "hit points" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster level" },
    { targetType: "rule", targetId: "rule.teleportation", targetName: "Teleportation", anchorText: "teleportation" },
    { type: "references", targetType: "spell", targetId: "spell.dimension-door", targetName: "Dimension Door", anchorText: "dimension door" },
    { type: "references", targetType: "spell", targetId: "spell.teleport", targetName: "Teleport", anchorText: "teleport" },
    { targetType: "subschool", targetId: "subschool.summoning", targetName: "Summoning", anchorText: "summoned creatures" },
    { targetType: "rule", targetId: "rule.incorporeal", targetName: "Incorporeal", anchorText: "incorporeal" },
    { targetType: "rule", targetId: "rule.undead", targetName: "Undead", anchorText: "undead" },
  ]],
  ["spell.echo", [
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrate" },
  ]],
  ["spell.ectoplasmic-eruption", [
    { targetType: "rule", targetId: "rule.ethereal", targetName: "Ethereal", anchorText: "ethereal" },
    { targetType: "rule", targetId: "rule.magic-weapons", targetName: "Magic Weapons", anchorText: "magic weapons" },
  ]],
  ["spell.ectoplasmic-hand", [
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
    { targetType: "rule", targetId: "rule.ability-score", targetName: "Ability score", anchorText: "ability score" },
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrate" },
    { targetType: "rule", targetId: "rule.drag", targetName: "Drag", anchorText: "drag" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "size" },
    { targetType: "rule", targetId: "rule.steal", targetName: "Steal", anchorText: "steal" },
  ]],
  ["spell.ectoplasmic-snare", [
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrate" },
    { targetType: "rule", targetId: "rule.ethereal", targetName: "Ethereal", anchorText: "ethereal" },
  ]],
  ["spell.effortless-armor", [
    { targetType: "rule", targetId: "rule.speed", targetName: "Speed", anchorText: "speed" },
  ]],
  ["spell.ego-whip-ii", [
    { type: "functions_like", targetType: "spell", targetId: "spell.ego-whip-i", targetName: "Ego Whip I", anchorText: "ego whip I" },
    { targetType: "rule", targetId: "rule.ability-score", targetName: "Ability score", anchorText: "ability score" },
  ]],
  ["spell.ego-whip-iii", [
    { type: "functions_like", targetType: "spell", targetId: "spell.ego-whip-i", targetName: "Ego Whip I", anchorText: "ego whip I" },
    { targetType: "rule", targetId: "rule.ability-score", targetName: "Ability score", anchorText: "ability score" },
  ]],
  ["spell.ego-whip-iv", [
    { type: "functions_like", targetType: "spell", targetId: "spell.ego-whip-i", targetName: "Ego Whip I", anchorText: "ego whip I" },
    { targetType: "rule", targetId: "rule.ability-score", targetName: "Ability score", anchorText: "ability score" },
  ]],
  ["spell.ego-whip-v", [
    { type: "functions_like", targetType: "spell", targetId: "spell.ego-whip-i", targetName: "Ego Whip I", anchorText: "ego whip I" },
    { targetType: "rule", targetId: "rule.ability-score", targetName: "Ability score", anchorText: "ability score" },
  ]],
  ["spell.elemental-assessor", [
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "rule", targetId: "rule.energy-resistance", targetName: "Energy Resistance", anchorText: "resistances" },
  ]],
  ["spell.elemental-aura", [
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster levels" },
  ]],
  ["spell.elemental-mastery", [
    { targetType: "rule", targetId: "rule.catch-on-fire", targetName: "Catch on fire", anchorText: "on fire" },
    { targetType: "rule", targetId: "rule.ifrit", targetName: "Ifrit", anchorText: "ifrits" },
    { targetType: "rule", targetId: "rule.undine", targetName: "Undine", anchorText: "undines" },
    { targetType: "rule", targetId: "rule.speed", targetName: "Speed", anchorText: "speed" },
  ]],
  ["spell.elemental-speech", [
    { targetType: "descriptor", targetId: "descriptor.air", targetName: "Air", anchorText: "air spell" },
    { targetType: "descriptor", targetId: "descriptor.earth", targetName: "Earth", anchorText: "earth spell" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire spell" },
    { targetType: "descriptor", targetId: "descriptor.water", targetName: "Water", anchorText: "water spell" },
    { targetType: "rule", targetId: "rule.air", targetName: "Air", anchorText: "air subtype" },
    { targetType: "rule", targetId: "rule.earth", targetName: "Earth", anchorText: "earth subtype" },
    { targetType: "rule", targetId: "rule.fire", targetName: "Fire", anchorText: "fire subtype" },
    { targetType: "rule", targetId: "rule.water", targetName: "Water", anchorText: "water subtype" },
  ]],
  ["spell.elemental-swarm", [
    { targetType: "rule", targetId: "rule.plane", targetName: "Planes", anchorText: "plane" },
    { targetType: "subschool", targetId: "subschool.summoning", targetName: "Summoning", anchorText: "summoning spell" },
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrate" },
    { targetType: "rule", targetId: "rule.hit-points", targetName: "Hit points", anchorText: "hit points" },
    { targetType: "rule", targetId: "rule.hit-dice", targetName: "Hit Dice", anchorText: "HD" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Large" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Huge" },
    { targetType: "rule", targetId: "rule.air", targetName: "Air", anchorText: "air creature" },
    { targetType: "rule", targetId: "rule.earth", targetName: "Earth", anchorText: "earth creature" },
    { targetType: "rule", targetId: "rule.fire", targetName: "Fire", anchorText: "fire creature" },
    { targetType: "rule", targetId: "rule.water", targetName: "Water", anchorText: "water creature" },
  ]],
  ["spell.emblem-of-greed", [
    { targetType: "rule", targetId: "rule.magic-weapons", targetName: "Magic Weapons", anchorText: "magic weapon" },
    { targetType: "rule", targetId: "rule.artifact", targetName: "Artifact", anchorText: "artifacts" },
  ]],
  ["spell.embrace-destiny", [
    { targetType: "rule", targetId: "rule.ability-check", targetName: "Ability checks", anchorText: "ability check" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill check" },
  ]],
  ["spell.emergency-force-sphere", [
    { targetType: "rule", targetId: "rule.hardness", targetName: "Hardness", anchorText: "hardness" },
    { targetType: "rule", targetId: "rule.hit-points", targetName: "Hit points", anchorText: "hit points" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster level" },
  ]],
  ["spell.emotive-block", [
    { targetType: "descriptor", targetId: "descriptor.emotion", targetName: "Emotion", anchorText: "emotion" },
  ]],
  ["spell.empathy-conduit", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.enchantment-foil", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throws" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.endothermic-touch", [
    { targetType: "rule", targetId: "rule.speed", targetName: "Speed", anchorText: "speed" },
  ]],
  ["spell.enemys-heart", [
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrating" },
  ]],
  ["spell.energy-hack", [
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "class_feature", targetId: "class-feature.hexes", targetName: "Hexes", anchorText: "hex" },
  ]],
  ["spell.energy-siege-shot", [
    { targetType: "descriptor", targetId: "descriptor.acid", targetName: "Acid", anchorText: "acid" },
    { targetType: "descriptor", targetId: "descriptor.cold", targetName: "Cold", anchorText: "cold" },
    { targetType: "descriptor", targetId: "descriptor.electricity", targetName: "Electricity", anchorText: "electricity" },
    { targetType: "descriptor", targetId: "descriptor.fire", targetName: "Fire", anchorText: "fire" },
    { targetType: "descriptor", targetId: "descriptor.sonic", targetName: "Sonic", anchorText: "sonic" },
    { targetType: "descriptor", targetId: "descriptor.force", targetName: "Force", anchorText: "force" },
  ]],
  ["spell.enhance-water", [
    { targetType: "rule", targetId: "rule.poison", targetName: "Poison", anchorText: "poisons" },
    { targetType: "rule", targetId: "rule.disease", targetName: "Disease", anchorText: "diseases" },
  ]],
  ["spell.enlightened-step", [
    { targetType: "rule", targetId: "rule.speed", targetName: "Speed", anchorText: "fly speed" },
  ]],
  ["spell.enshroud-thoughts", [
    { targetType: "descriptor", targetId: "descriptor.mind-affecting", targetName: "Mind-affecting", anchorText: "mind-affecting" },
  ]],
  ["spell.enter-image", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "action", targetId: "action.immediate-action", targetName: "Immediate action", anchorText: "immediate action" },
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrating" },
  ]],
  ["spell.enthrall", [
    { targetType: "rule", targetId: "rule.attitude", targetName: "Attitude", anchorText: "attitude" },
    { targetType: "rule", targetId: "rule.hit-dice", targetName: "Hit Dice", anchorText: "HD" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentration" },
  ]],
  ["spell.enticing-adulation", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.entrap-spirit", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.erode-defenses", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.escape-alarm", [
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster level" },
  ]],
  ["spell.escaping-ward", [
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "size" },
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster levels" },
  ]],
  ["spell.ether-step", [
    { targetType: "rule", targetId: "rule.ethereal", targetName: "Ethereal", anchorText: "ethereal" },
    { type: "uses_action", targetType: "action", targetId: "action.move-action", targetName: "Move action", anchorText: "move actions" },
    { type: "uses_action", targetType: "action", targetId: "action.free-action", targetName: "Free action", anchorText: "free actions" },
  ]],
  ["spell.ethereal-envelope", [
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "size" },
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
  ]],
  ["spell.ethereal-fists", [
    { targetType: "rule", targetId: "rule.ethereal-plane", targetName: "Ethereal Plane", anchorText: "Ethereal Plane" },
    { targetType: "rule", targetId: "rule.material-plane", targetName: "Material Plane", anchorText: "Material Plane" },
    { targetType: "rule", targetId: "rule.ethereal", targetName: "Ethereal", anchorText: "ethereal" },
    { targetType: "rule", targetId: "rule.unarmed-strike", targetName: "Unarmed strike", anchorText: "unarmed strikes" },
  ]],
  ["spell.ethereal-jaunt", [
    { targetType: "rule", targetId: "rule.speed", targetName: "Speed", anchorText: "speed" },
    { targetType: "descriptor", targetId: "descriptor.force", targetName: "Force", anchorText: "Force effects" },
    { targetType: "magic_school", targetId: "magic-school.abjuration", targetName: "Abjuration", anchorText: "abjurations" },
  ]],
  ["spell.etherealness", [
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster levels" },
  ]],
  ["spell.etheric-shards", [
    { targetType: "rule", targetId: "rule.ethereal", targetName: "Ethereal", anchorText: "ethereal" },
    { targetType: "rule", targetId: "rule.hit-points", targetName: "Hit points", anchorText: "hit point damage" },
  ]],
  ["spell.euphoric-tranquility", [
    { targetType: "rule", targetId: "rule.speed", targetName: "Speed", anchorText: "speed" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.attitude", targetName: "Attitude", anchorText: "attitude" },
  ]],
  ["spell.evaluators-lens", [
    { targetType: "descriptor", targetId: "descriptor.force", targetName: "Force", anchorText: "force" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.artifact", targetName: "Artifact", anchorText: "artifacts" },
    { targetType: "item", targetId: "item.rod-of-cancellation", targetName: "Rod of cancellation", anchorText: "rod of cancellation" },
    { targetType: "rule", targetId: "rule.armor-class", targetName: "Armor Class", anchorText: "AC" },
  ]],
  ["spell.excruciating-deformation", [
    { targetType: "rule", targetId: "rule.speed", targetName: "Speed", anchorText: "speed" },
  ]],
  ["spell.expeditious-construction", [
    { targetType: "rule", targetId: "rule.caster-level", targetName: "Caster level", anchorText: "caster levels" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Large" },
  ]],
  ["spell.expeditious-excavation", [
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Medium" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "size" },
    { targetType: "rule", targetId: "rule.attacks-of-opportunity", targetName: "Attacks of opportunity", anchorText: "attacks of opportunity" },
  ]],
  ["spell.expel-blood", [
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "size" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Large" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Small" },
  ]],
  ["spell.expend", [
    { targetType: "rule", targetId: "rule.supernatural", targetName: "Supernatural abilities", anchorText: "supernatural" },
    { targetType: "rule", targetId: "rule.spell-like-abilities", targetName: "Spell-like abilities", anchorText: "spell-like ability" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
  ]],
  ["spell.explosive-runes", [
    { targetType: "descriptor", targetId: "descriptor.force", targetName: "Force", anchorText: "force" },
    { targetType: "rule", targetId: "rule.saving-throws", targetName: "Saving throws", anchorText: "saving throw" },
    { targetType: "rule", targetId: "rule.trap", targetName: "Trap", anchorText: "traps" },
    { targetType: "rule", targetId: "rule.trapfinding", targetName: "Trapfinding", anchorText: "trapfinding" },
    { targetType: "rule", targetId: "rule.disable-device", targetName: "Disable Device", anchorText: "Disable Device" },
    { targetType: "rule", targetId: "rule.perception", targetName: "Perception", anchorText: "Perception" },
  ]],
  ["spell.eyes-of-the-void", [
    { targetType: "rule", targetId: "illumination.darkness", targetName: "Darkness", anchorText: "total darkness" },
  ]],
  ["spell.face-of-the-devourer", [
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Medium" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Small" },
    { targetType: "rule", targetId: "rule.size", targetName: "Size", anchorText: "Large" },
  ]],
  ["spell.fair-is-foul", [
    { targetType: "rule", targetId: "rule.curse", targetName: "Curse", anchorText: "curse" },
  ]],
  ["spell.fairness", [
    { targetType: "deity", targetId: "deity.abadar", targetName: "Abadar", anchorText: "Abadar" },
  ]],
  ["spell.fallback-strategy", [
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill check" },
  ]],
  ["spell.false-future", [
    { targetType: "magic_school", targetId: "magic-school.divination", targetName: "Divination", anchorText: "divinations" },
  ]],
  ["spell.false-resurrection-greater", [
    { targetType: "rule", targetId: "rule.skill-check", targetName: "Skill checks", anchorText: "skill check" },
    { targetType: "descriptor", targetId: "descriptor.ruse", targetName: "Ruse", anchorText: "ruse descriptor" },
    { targetType: "magic_school", targetId: "magic-school.conjuration", targetName: "Conjuration", anchorText: "conjuration" },
  ]],
  ["spell.false-vision", [
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrate" },
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrating" },
  ]],
  ["spell.false-vision-greater", [
    { type: "functions_like", targetType: "spell", targetId: "spell.false-vision", targetName: "False Vision", anchorText: "false vision" },
    { targetType: "rule", targetId: "rule.plane", targetName: "Planes", anchorText: "plane" },
    { targetType: "rule", targetId: "rule.concentration", targetName: "Concentration", anchorText: "concentrating" },
  ]],
]);


function addReviewedDescriptionReferences(
  spellId: string,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const additions = reviewedDescriptionReferences.get(spellId) ?? [];
  if (additions.length === 0) return relationships;
  const byId = new Map(relationships.map((item) => [String(item.relationship_id), item]));
  for (const addition of additions) {
    const item = relationship(
      spellId,
      addition.type ?? "uses_definition",
      addition.targetType,
      addition.targetId,
      addition.targetName,
      addition.anchorText,
      observationId,
      sourceUrl,
    );
    const existing = byId.get(String(item.relationship_id));
    if (!existing) {
      byId.set(String(item.relationship_id), item);
      continue;
    }
    for (const evidence of item.evidence) {
      if (!existing.evidence.some((current: ValidatedJson) =>
        JSON.stringify(current) === JSON.stringify(evidence)
      )) existing.evidence.push(evidence);
    }
  }
  return [...byId.values()].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function linkContext(
  document: RichTextDocument,
  context: string,
  links: { value: string; relationshipId: string }[],
): void {
  let contextMatches = 0;
  const replace = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.flatMap((node) => {
      if (node.node_type !== "text") return [node];
      const contextStart = node.value.indexOf(context);
      if (contextStart < 0) return [node];
      contextMatches += 1;
      const ranges = links.map((link) => {
        const start = context.indexOf(link.value);
        if (start < 0) throw new Error(`${JSON.stringify(link.value)} is absent from ${JSON.stringify(context)}`);
        return { ...link, start, end: start + link.value.length };
      }).sort((left, right) => left.start - right.start);
      for (let index = 1; index < ranges.length; index += 1) {
        if (ranges[index]!.start < ranges[index - 1]!.end) {
          throw new Error(`Overlapping contextual links in ${JSON.stringify(context)}`);
        }
      }
      const replacement: RichTextInlineNode[] = [];
      const marks = node.marks ? { marks: node.marks } : {};
      if (contextStart > 0) {
        replacement.push({ node_type: "text", value: node.value.slice(0, contextStart), ...marks });
      }
      let offset = 0;
      for (const range of ranges) {
        if (range.start > offset) {
          replacement.push({ node_type: "text", value: context.slice(offset, range.start), ...marks });
        }
        replacement.push({
          node_type: "entity_link",
          value: context.slice(range.start, range.end),
          relationship_id: range.relationshipId,
          ...marks,
        });
        offset = range.end;
      }
      if (offset < context.length) {
        replacement.push({ node_type: "text", value: context.slice(offset), ...marks });
      }
      const contextEnd = contextStart + context.length;
      if (contextEnd < node.value.length) {
        replacement.push({ node_type: "text", value: node.value.slice(contextEnd), ...marks });
      }
      return replacement;
    });

  document.content = document.content.map((block) =>
    mapRichTextBlockInlines(block, replace)
  );
  if (contextMatches !== 1) {
    throw new Error(`Expected one rich-text context match for ${JSON.stringify(context)}, found ${contextMatches}`);
  }
}


function keepFirstRelationshipLink(
  document: RichTextDocument,
  relationshipId: string,
): void {
  let matches = 0;
  const replace = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.map((node) => {
      if (node.node_type !== "entity_link" || node.relationship_id !== relationshipId) {
        return node;
      }
      matches += 1;
      if (matches === 1) return node;
      return {
        node_type: "text",
        value: node.value,
        ...(node.marks ? { marks: node.marks } : {}),
      };
    });
  document.content = document.content.map((block) =>
    mapRichTextBlockInlines(block, replace)
  );
  if (matches < 1) {
    throw new Error(`Expected at least one rich-text link for ${relationshipId}`);
  }
}


function keepRelationshipLinkOccurrences(
  document: RichTextDocument,
  relationshipId: string,
  keptOccurrences: readonly number[],
  expectedMatches: number,
): void {
  const kept = new Set(keptOccurrences);
  let occurrence = 0;
  const replace = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.map((node) => {
      if (node.node_type !== "entity_link" || node.relationship_id !== relationshipId) {
        return node;
      }
      occurrence += 1;
      if (kept.has(occurrence)) return node;
      return {
        node_type: "text",
        value: node.value,
        ...(node.marks ? { marks: node.marks } : {}),
      };
    });
  document.content = document.content.map((block) =>
    mapRichTextBlockInlines(block, replace)
  );
  if (occurrence !== expectedMatches) {
    throw new Error(
      `Expected ${expectedMatches} rich-text links for ${relationshipId}, found ${occurrence}`,
    );
  }
}


function removeRelationshipLinkValues(
  document: RichTextDocument,
  relationshipId: string,
  values: string[],
): void {
  const rejected = new Set(values);
  const replace = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.map((node) =>
      node.node_type === "entity_link" &&
        node.relationship_id === relationshipId &&
        rejected.has(node.value)
        ? {
            node_type: "text",
            value: node.value,
            ...(node.marks ? { marks: node.marks } : {}),
          }
        : node
    );
  document.content = document.content.map((block) =>
    mapRichTextBlockInlines(block, replace)
  );
}


function keepFirstAndLastRelationshipLinks(
  document: RichTextDocument,
  relationshipId: string,
): void {
  const count = (content: RichTextInlineNode[]): number => content.filter((node) =>
    node.node_type === "entity_link" && node.relationship_id === relationshipId
  ).length;
  const matches = document.content.reduce((total, block) =>
    total + count(richTextBlockInlines(block)), 0);
  if (matches < 2) {
    throw new Error(`Expected at least two rich-text links for ${relationshipId}, found ${matches}`);
  }
  let occurrence = 0;
  const replace = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.map((node) => {
      if (node.node_type !== "entity_link" || node.relationship_id !== relationshipId) {
        return node;
      }
      occurrence += 1;
      if (occurrence === 1 || occurrence === matches) return node;
      return {
        node_type: "text",
        value: node.value,
        ...(node.marks ? { marks: node.marks } : {}),
      };
    });
  document.content = document.content.map((block) =>
    mapRichTextBlockInlines(block, replace)
  );
}


function distinguishGreaterDarkvisionReferences(document: RichTextDocument): void {
  const spellRelationshipId =
    "spell.darkvision-greater:functions_like:spell.darkvision";
  const ruleRelationshipId =
    "spell.darkvision-greater:uses_definition:rule.darkvision";
  let occurrence = 0;
  const replace = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.map((node) => {
      if (
        node.node_type !== "entity_link" ||
        node.relationship_id !== spellRelationshipId
      ) return node;
      occurrence += 1;
      return occurrence === 1 ? node : { ...node, relationship_id: ruleRelationshipId };
    });
  document.content = document.content.map((block) =>
    mapRichTextBlockInlines(block, replace)
  );
  if (occurrence !== 2) {
    throw new Error(`Expected two Darkvision references, found ${occurrence}`);
  }
}


function distinguishDeeperDarknessReferences(document: RichTextDocument): void {
  const spellRelationshipId = "spell.deeper-darkness:functions_like:spell.darkness";
  const replacements = [
    spellRelationshipId,
    "spell.deeper-darkness:uses_definition:descriptor.darkness",
    "spell.deeper-darkness:uses_definition:illumination.darkness",
    "spell.deeper-darkness:uses_definition:illumination.darkness",
    spellRelationshipId,
    null,
  ] as const;
  let occurrence = 0;
  const replace = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.map((node) => {
      if (
        node.node_type !== "entity_link" ||
        node.relationship_id !== spellRelationshipId
      ) return node;
      const replacement = replacements[occurrence++];
      if (replacement) return { ...node, relationship_id: replacement };
      return {
        node_type: "text",
        value: node.value,
        ...(node.marks ? { marks: node.marks } : {}),
      };
    });
  document.content = document.content.map((block) =>
    mapRichTextBlockInlines(block, replace)
  );
  if (occurrence !== replacements.length) {
    throw new Error(
      `Expected ${replacements.length} Deeper Darkness references, found ${occurrence}`,
    );
  }
}


function addDarknessReferences(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const additions = [
    relationship("spell.darkness", "uses_definition", "rule", "illumination.bright-light", "Bright light", "bright light", observationId, sourceUrl),
    relationship("spell.darkness", "uses_definition", "rule", "illumination.normal-light", "Normal light", "normal light", observationId, sourceUrl),
    relationship("spell.darkness", "uses_definition", "rule", "illumination.dim-light", "Dim light", "dim light", observationId, sourceUrl),
    relationship("spell.darkness", "uses_definition", "rule", "illumination.darkness", "Darkness", "darkness", observationId, sourceUrl),
    relationship("spell.darkness", "uses_definition", "rule", "rule.light-vulnerability", "Light vulnerability", "light vulnerability", observationId, sourceUrl),
    relationship("spell.darkness", "uses_definition", "rule", "rule.light-sensitivity", "Light sensitivity", "sensitivity", observationId, sourceUrl),
    relationship("spell.darkness", "uses_definition", "rule", "rule.concealment", "Concealment", "concealment", observationId, sourceUrl),
    relationship("spell.darkness", "uses_definition", "rule", "rule.total-concealment", "Total concealment", "total concealment", observationId, sourceUrl),
    relationship("spell.darkness", "references", "item", "item.torch", "Torch", "torches", observationId, sourceUrl),
    relationship("spell.darkness", "references", "item", "item.lantern", "Lantern", "lanterns", observationId, sourceUrl),
    relationship("spell.darkness", "has_mythic_variant", "mythic_spell_variant", "mythic-spell-variant.darkness", "Mythic Darkness", "Mythic Darkness", observationId, sourceUrl),
  ];
  const byId = new Map(relationships.map((item) => [String(item.relationship_id), item]));
  for (const addition of additions) byId.set(addition.relationship_id, addition);

  const descriptorId = "spell.darkness:has_descriptor:descriptor.darkness";
  linkContext(document, "radiate darkness out to a 20-foot radius", [
    { value: "darkness", relationshipId: descriptorId },
  ]);
  linkContext(document, "from bright light to normal light", [
    { value: "bright light", relationshipId: "spell.darkness:uses_definition:illumination.bright-light" },
    { value: "normal light", relationshipId: "spell.darkness:uses_definition:illumination.normal-light" },
  ]);
  linkContext(document, "from normal light to dim light", [
    { value: "normal light", relationshipId: "spell.darkness:uses_definition:illumination.normal-light" },
    { value: "dim light", relationshipId: "spell.darkness:uses_definition:illumination.dim-light" },
  ]);
  linkContext(document, "from dim light to darkness", [
    { value: "dim light", relationshipId: "spell.darkness:uses_definition:illumination.dim-light" },
    { value: "darkness", relationshipId: "spell.darkness:uses_definition:illumination.darkness" },
  ]);
  linkContext(document, "light vulnerability or sensitivity", [
    { value: "light vulnerability", relationshipId: "spell.darkness:uses_definition:rule.light-vulnerability" },
    { value: "sensitivity", relationshipId: "spell.darkness:uses_definition:rule.light-sensitivity" },
  ]);
  linkContext(document, "gain concealment (20% miss chance)", [
    { value: "concealment", relationshipId: "spell.darkness:uses_definition:rule.concealment" },
  ]);
  linkContext(document, "gain total concealment (50% miss chance)", [
    { value: "total concealment", relationshipId: "spell.darkness:uses_definition:rule.total-concealment" },
  ]);
  linkContext(document, "such as torches and lanterns", [
    { value: "torches", relationshipId: "spell.darkness:references:item.torch" },
    { value: "lanterns", relationshipId: "spell.darkness:references:item.lantern" },
  ]);
  return [...byId.values()].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function addDiscoveryTorchReferences(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const spellId = "spell.discovery-torch";
  const additions = [
    relationship(spellId, "uses_definition", "rule", "illumination.bright-light", "Bright light", "bright light", observationId, sourceUrl),
    relationship(spellId, "uses_definition", "descriptor", "descriptor.light", "Light", "Light spells", observationId, sourceUrl),
    relationship(spellId, "uses_definition", "descriptor", "descriptor.darkness", "Darkness", "darkness spells", observationId, sourceUrl),
  ];
  const byId = new Map(relationships.map((item) => [String(item.relationship_id), item]));
  for (const addition of additions) byId.set(String(addition.relationship_id), addition);

  linkContext(document, "20-foot radius of bright light", [{
    value: "bright light",
    relationshipId: `${spellId}:uses_definition:illumination.bright-light`,
  }]);
  linkContext(document, "Light spells counter and dispel darkness spells", [
    { value: "Light", relationshipId: `${spellId}:uses_definition:descriptor.light` },
    { value: "darkness", relationshipId: `${spellId}:uses_definition:descriptor.darkness` },
  ]);
  return [...byId.values()].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function distinguishGreaterDischargeReferences(document: RichTextDocument): void {
  const relationshipId =
    "spell.discharge-greater:functions_like:spell.discharge";
  const keptOccurrences = new Set([1, 8, 10]);
  let occurrence = 0;
  const replace = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.map((node) => {
      if (node.node_type !== "entity_link" || node.relationship_id !== relationshipId) {
        return node;
      }
      occurrence += 1;
      if (keptOccurrences.has(occurrence)) return node;
      return {
        node_type: "text",
        value: node.value,
        ...(node.marks ? { marks: node.marks } : {}),
      };
    });
  document.content = document.content.map((block) => {
    if (block.node_type === "paragraph") {
      return { ...block, content: replace(block.content) };
    }
    if (block.node_type === "unordered_list") {
      return {
        ...block,
        content: block.content.map((item) => ({
          ...item,
          content: replace(item.content),
        })),
      };
    }
    return block;
  });
  if (occurrence !== 11) {
    throw new Error(`Expected 11 Greater Discharge candidates, found ${occurrence}`);
  }
}


function addAlluringLightReferences(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const spellId = "spell.alluring-light";
  const additions = [
    relationship(spellId, "uses_definition", "rule", "illumination.normal-light", "Normal light", "normal light", observationId, sourceUrl),
    relationship(spellId, "uses_definition", "rule", "illumination.dim-light", "Dim light", "dim light", observationId, sourceUrl),
    relationship(spellId, "uses_definition", "rule", "illumination.darkness", "Darkness", "darkness", observationId, sourceUrl),
  ];
  const byId = new Map(relationships.map((item) => [String(item.relationship_id), item]));
  for (const addition of additions) byId.set(addition.relationship_id, addition);

  linkContext(document, "up to normal light", [{
    value: "normal light",
    relationshipId: `${spellId}:uses_definition:illumination.normal-light`,
  }]);
  linkContext(document, "darkness becomes dim light", [
    { value: "darkness", relationshipId: `${spellId}:uses_definition:illumination.darkness` },
    { value: "dim light", relationshipId: `${spellId}:uses_definition:illumination.dim-light` },
  ]);
  linkContext(document, "dim light becomes normal light", [
    { value: "dim light", relationshipId: `${spellId}:uses_definition:illumination.dim-light` },
    { value: "normal light", relationshipId: `${spellId}:uses_definition:illumination.normal-light` },
  ]);
  return [...byId.values()].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function addBlacklightReferences(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const spellId = "spell.blacklight";
  const additions = [
    relationship(spellId, "uses_definition", "rule", "illumination.darkness", "Darkness", "total darkness", observationId, sourceUrl),
    relationship(spellId, "uses_definition", "rule", "rule.darkvision", "Darkvision", "darkvision", observationId, sourceUrl),
    relationship(spellId, "uses_definition", "descriptor", "descriptor.light", "Light", "light spell", observationId, sourceUrl),
    relationship(spellId, "references", "spell", "spell.daylight", "Daylight", "Daylight", observationId, sourceUrl),
  ];
  const byId = new Map(relationships.map((item) => [String(item.relationship_id), item]));
  for (const addition of additions) byId.set(addition.relationship_id, addition);

  linkContext(document, "total darkness", [{
    value: "total darkness",
    relationshipId: `${spellId}:uses_definition:illumination.darkness`,
  }]);
  linkContext(document, "darkvision", [{
    value: "darkvision",
    relationshipId: `${spellId}:uses_definition:rule.darkvision`,
  }]);
  linkContext(document, "light spell", [{
    value: "light",
    relationshipId: `${spellId}:uses_definition:descriptor.light`,
  }]);
  linkContext(document, "Daylight", [{
    value: "Daylight",
    relationshipId: `${spellId}:references:spell.daylight`,
  }]);
  return [...byId.values()].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function addBlightReferences(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const spellId = "spell.blight";
  const plant = relationship(
    spellId,
    "uses_definition",
    "rule",
    "rule.plant",
    "Plant",
    "plant",
    observationId,
    sourceUrl,
  );
  const relationshipId = String(plant.relationship_id);
  for (const context of [
    "single plant of any size",
    "plant creature",
    "A plant that",
    "plant life",
  ]) {
    linkContext(document, context, [{ value: "plant", relationshipId }]);
  }
  return [...relationships.filter((item) => item.relationship_id !== relationshipId), plant].sort(
    (left, right) => String(left.relationship_id).localeCompare(String(right.relationship_id)),
  );
}


function addBlurReferences(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const concealment = relationship(
    "spell.blur",
    "uses_definition",
    "rule",
    "rule.concealment",
    "Concealment",
    "concealment",
    observationId,
    sourceUrl,
  );
  linkContext(document, "concealment (20% miss chance)", [{
    value: "concealment",
    relationshipId: String(concealment.relationship_id),
  }]);
  return [
    ...relationships.filter((item) => item.relationship_id !== concealment.relationship_id),
    concealment,
  ].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function addBoneFlenseReferences(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const redMantis = relationship(
    "spell.bone-flense",
    "uses_definition",
    "class",
    "class.red-mantis-assassin",
    "Red Mantis Assassin",
    "Red Mantis",
    observationId,
    sourceUrl,
  );
  linkContext(document, "member of the Red Mantis", [{
    value: "Red Mantis",
    relationshipId: String(redMantis.relationship_id),
  }]);
  return [
    ...relationships.filter((item) => item.relationship_id !== redMantis.relationship_id),
    redMantis,
  ].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function linkAntiSummoningShieldContext(document: RichTextDocument): void {
  linkContext(document, "summon spell-like ability", [{
    value: "summon",
    relationshipId: "spell.anti-summoning-shield:uses_definition:rule.summon",
  }]);
}


function distinguishBalefulShadowPolymorphReferences(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  observationId: string,
  sourceUrl: string,
): ValidatedJson[] {
  const spellRelationshipId =
    "spell.baleful-shadow-transmutation:references:spell.polymorph";
  const ruleRelationshipId =
    "spell.baleful-shadow-transmutation:uses_definition:subschool.polymorph";
  let spellLinks = 0;
  let ruleLinks = 0;

  for (const block of document.content) {
    for (const node of richTextBlockInlines(block)) {
      if (
        node.node_type !== "entity_link" ||
        node.relationship_id !== spellRelationshipId
      ) continue;
      if (node.marks?.includes("italic")) {
        spellLinks += 1;
      } else {
        node.relationship_id = ruleRelationshipId;
        ruleLinks += 1;
      }
    }
  }
  if (spellLinks !== 1 || ruleLinks !== 2) {
    throw new Error(
      `Expected one Polymorph spell link and two polymorph-rule links, found ${spellLinks} and ${ruleLinks}`,
    );
  }

  return [
    ...relationships.filter((item) => item.relationship_id !== ruleRelationshipId),
    relationship(
    "spell.baleful-shadow-transmutation",
    "uses_definition",
    "subschool",
    "subschool.polymorph",
    "Polymorph",
    "polymorph",
    observationId,
    sourceUrl,
  )].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
}


function explicitlyFunctionsLike(description: string, targetName: string): boolean {
  const normalizedDescription = description.normalize("NFKC").toLocaleLowerCase("en-US");
  const normalizedTarget = targetName.normalize("NFKC").toLocaleLowerCase("en-US");
  const escapedTarget = normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = "(?=$|[,.);:]|\\s+directed\\b|\\s+\\()";
  const target = `(?:like|as) ${escapedTarget}${boundary}`;
  return [
    `\\bthis(?: spell)?(?: otherwise)? functions ${target}`,
    `\\bthis spell functions similarly to ${escapedTarget}${boundary}`,
    `\\bthis(?: [\\p{L}\\p{N}'’-]+){0,4} spell` +
      `(?: [\\p{L}\\p{N}'’-]+){0,8} functions ${target}`,
    `\\bthis spell is(?: otherwise)? similar to ${escapedTarget}${boundary}`,
  ].some((pattern) => new RegExp(pattern, "u").test(normalizedDescription));
}


function mergeRelationships(
  relationships: ValidatedJson[],
  spellId: string,
  canonicalSpells: Map<string, ValidatedJson>,
): { relationships: ValidatedJson[]; changedIds: Map<string, string> } {
  const merged = new Map<string, ValidatedJson>();
  const changedIds = new Map<string, string>();
  for (const original of relationships) {
    const relationship = structuredClone(original);
    const hyperlinkEvidence = relationship.evidence.filter(
      (evidence: ValidatedJson) => evidence.evidence_kind === "hyperlink",
    );
    if (
      relationship.status === "accepted" &&
      hyperlinkEvidence.length > 0 &&
      hyperlinkEvidence.every((evidence: ValidatedJson) =>
        /\/void\(0\)$/i.test(String(evidence.source_href ?? ""))
      )
    ) {
      relationship.status = "rejected";
      relationship.note = "The source href is a non-navigating void(0) placeholder, not relationship evidence.";
    }
    if (relationship.status === "accepted" && relationship.target.entity_type === "spell") {
      const resolved = resolveCanonicalSpellReference(
        String(relationship.target.name),
        canonicalSpells,
        relationship.target.entity_id ?? undefined,
      );
      if (resolved) {
        relationship.target.entity_id = resolved.spell_id;
        relationship.target.name = resolved.name;
        relationship.relationship_id = `${spellId}:${relationship.type}:${resolved.spell_id}`;
      }
    }
    const relationshipTarget = canonicalRelationshipTargets.get(
      String(original.relationship_id),
    );
    if (relationshipTarget) {
      relationship.target.entity_id = relationshipTarget.id;
      relationship.target.name = relationshipTarget.name;
      relationship.target.entity_type = relationshipTarget.type;
      relationship.type = relationshipTarget.relationshipType;
      relationship.relationship_id = `${spellId}:${relationship.type}:${relationshipTarget.id}`;
    }
    const canonicalTarget = canonicalTargets.get(String(relationship.target.entity_id));
    if (canonicalTarget) {
      relationship.target.entity_id = canonicalTarget.id;
      relationship.target.name = canonicalTarget.name;
      relationship.target.entity_type = canonicalTarget.type ?? relationship.target.entity_type;
      relationship.type = canonicalTarget.relationshipType ?? relationship.type;
      relationship.relationship_id = `${spellId}:${relationship.type}:${canonicalTarget.id}`;
    }
    if (
      relationship.status === "accepted" &&
      relationship.type === "references" &&
      relationship.target.entity_type === "spell" &&
      explicitlyFunctionsLike(
        String(canonicalSpells.get(spellId)?.description?.raw ?? ""),
        String(relationship.target.name),
      )
    ) {
      relationship.type = "functions_like";
      relationship.relationship_id =
        `${spellId}:functions_like:${relationship.target.entity_id}`;
    }
    const rejectionReason = rejectedDescriptionRelationships.get(
      String(relationship.relationship_id),
    ) ?? rejectedRelationshipTargets.get(
      `${relationship.type}:${relationship.target.entity_id}`,
    );
    if (relationship.status === "accepted" && rejectionReason) {
      relationship.status = "rejected";
      relationship.note = rejectionReason;
    }
    if (
      relationship.type === "references" &&
      relationship.target.entity_type === "spell" &&
      relationship.target.entity_id === spellId
    ) continue;
    changedIds.set(String(original.relationship_id), String(relationship.relationship_id));
    const existing = merged.get(relationship.relationship_id);
    if (!existing) {
      merged.set(relationship.relationship_id, relationship);
      continue;
    }
    for (const evidence of relationship.evidence) {
      if (!existing.evidence.some((item: ValidatedJson) =>
        JSON.stringify(item) === JSON.stringify(evidence)
      )) existing.evidence.push(evidence);
    }
  }
  return {
    relationships: [...merged.values()].sort((left, right) =>
      String(left.relationship_id).localeCompare(String(right.relationship_id))
    ),
    changedIds,
  };
}


function updateDecision(
  spellId: string,
  observationId: string,
  changedIds: Map<string, string>,
  relationships: ValidatedJson[],
  warningMessages: string[],
): void {
  const filename = path.join(
    projectRoot,
    "data",
    "decisions",
    `${spellId.replace(/^spell\./, "")}.json`,
  );
  const decision = loadJson(filename);
  const canonicalRelationshipIds = new Set(
    relationships.map((relationship) => String(relationship.relationship_id)),
  );
  const canonicalRelationshipById = new Map(
    relationships.map((relationship) => [String(relationship.relationship_id), relationship]),
  );
  const relationshipDecisions = new Map<string, ValidatedJson>();
  for (const original of decision.relationship_decisions) {
    const item = structuredClone(original);
    item.relationship_id = changedIds.get(item.relationship_id) ?? item.relationship_id;
    if (!canonicalRelationshipIds.has(item.relationship_id)) {
      if (item.decision === "reject") relationshipDecisions.set(item.relationship_id, item);
      continue;
    }
    const canonicalRelationship = canonicalRelationshipById.get(item.relationship_id)!;
    item.decision = canonicalRelationship.status === "accepted"
      ? "accept"
      : canonicalRelationship.status === "rejected"
        ? "reject"
        : "defer";
    if (canonicalRelationship.note) item.rationale = canonicalRelationship.note;
    const existing = relationshipDecisions.get(item.relationship_id);
    if (!existing) {
      relationshipDecisions.set(item.relationship_id, item);
      continue;
    }
    existing.evidence = [...existing.evidence, ...item.evidence].filter(
      (evidence: ValidatedJson, index: number, all: ValidatedJson[]) =>
        all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(evidence)) === index,
    );
  }
  for (const relationship of relationships) {
    if (relationshipDecisions.has(relationship.relationship_id)) continue;
    relationshipDecisions.set(relationship.relationship_id, {
      relationship_id: relationship.relationship_id,
      decision: relationship.status === "accepted"
        ? "accept"
        : relationship.status === "rejected"
          ? "reject"
          : "defer",
      evidence: relationship.evidence.map((evidence: ValidatedJson) => ({
        observation_id: evidence.observation_id,
        source_field: evidence.source_field,
      })),
      considered_observation_ids: decision.observation_ids,
      rationale: relationship.note ??
        "The accepted relationship is explicit in the selected source evidence.",
    });
  }
  decision.relationship_decisions = [...relationshipDecisions.values()].sort((left, right) =>
    String(left.relationship_id).localeCompare(String(right.relationship_id))
  );
  if (!decision.field_decisions.some((field: ValidatedJson) =>
    field.canonical_path === "/description/document"
  )) {
    decision.field_decisions.push({
      canonical_path: "/description/document",
      decision: "derived",
      selected_evidence: [{
        observation_id: observationId,
        source_field: "spell_raw.description_raw",
      }],
      considered_observation_ids: decision.observation_ids,
      rationale:
        "AoN supplies block structure and emphasis; accepted canonical relationships supply entity links.",
    });
  }
  decision.unresolved_questions = [
    ...decision.unresolved_questions.filter((question: string) =>
      !question.startsWith("Rich-text link:")
    ),
    ...warningMessages.map((message) => `Rich-text link: ${message}`),
  ];
  fs.writeFileSync(filename, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
}


function canonicalIndex(): Map<string, ValidatedJson> {
  const canonicalSpells = new Map<string, ValidatedJson>();
  for (const filename of jsonFiles(path.join(projectRoot, "data", "canonical"))) {
    const spell = loadJson(filename);
    canonicalSpells.set(spell.spell_id, spell);
  }
  return canonicalSpells;
}


function baselineObservationId(canonical: ValidatedJson): string | null {
  return canonical.provenance.find((item: ValidatedJson) =>
    item.field_path === "/description" || item.source_field === "spell_raw.description_raw"
  )?.observation_id ?? canonical.relationships.flatMap(
    (relationship: ValidatedJson) => relationship.evidence,
  ).find((evidence: ValidatedJson) =>
    evidence.source_field === "spell_raw.description_raw" &&
    String(evidence.observation_id).startsWith("aon:")
  )?.observation_id ?? null;
}


function entityLinkCount(document: RichTextDocument): number {
  return document.content.reduce((count, block) => count +
    richTextBlockInlines(block).filter((node) => node.node_type === "entity_link").length, 0);
}


export function sourceDescriptionMatch(
  canonicalRaw: string,
  sourceRaw: string,
): { exact: boolean; leakedMythicSuffix: boolean } {
  return {
    exact: comparableRichText(sourceRaw) === comparableRichText(canonicalRaw),
    leakedMythicSuffix: canonicalRaw.startsWith(sourceRaw) &&
      /\bMythic\b/.test(canonicalRaw.slice(sourceRaw.length)),
  };
}


export function syncDescriptionInheritanceOverrides(canonical: ValidatedJson): void {
  for (const rule of canonical.rules_inheritance) {
    for (const override of rule.overrides) {
      if (override.path === "/description/raw") override.value = canonical.description.raw;
    }
  }
}


export function auditRichTextRollout(): {
  summary: {
    total: number;
    already_rich_text: number;
    safe_with_links: number;
    safe_structure_only: number;
    source_mismatch: number;
    missing_aon_baseline: number;
    parser_error: number;
    link_warnings: number;
  };
  safe_spell_ids: string[];
  issue_samples: Record<string, string[]>;
  issue_spell_ids: Record<string, string[]>;
  link_warning_details: Record<string, ReturnType<typeof linkRichTextDocument>["warnings"]>;
} {
  const canonicalSpells = canonicalIndex();
  const observations = observationIndex();
  const summary = {
    total: canonicalSpells.size,
    already_rich_text: 0,
    safe_with_links: 0,
    safe_structure_only: 0,
    source_mismatch: 0,
    missing_aon_baseline: 0,
    parser_error: 0,
    link_warnings: 0,
  };
  const safeSpellIds: string[] = [];
  const issueSamples: Record<string, string[]> = {};
  const issueSpellIds: Record<string, string[]> = {};
  const linkWarningDetails: Record<
    string,
    ReturnType<typeof linkRichTextDocument>["warnings"]
  > = {};
  const issue = (
    category: "source_mismatch" | "missing_aon_baseline" | "parser_error" | "link_warnings",
    spellId: string,
  ): void => {
    summary[category] += 1;
    (issueSpellIds[category] ??= []).push(spellId);
    const samples = issueSamples[category] ?? [];
    if (samples.length < 25) samples.push(spellId);
    issueSamples[category] = samples;
  };

  for (const [spellId, canonical] of [...canonicalSpells].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (canonical.schema_version === "0.2.0") {
      summary.already_rich_text += 1;
      continue;
    }
    const observationId = baselineObservationId(canonical);
    const observation = observationId ? observations.get(observationId) : null;
    if (!observationId || !observation || observation.record.source.site_id !== "aon") {
      issue("missing_aon_baseline", spellId);
      continue;
    }
    try {
      const artifactPath = resolveArtifactPath(
        observation.filename,
        observation.record.retrieval.raw_artifact_path,
        observation.record.retrieval.content_sha256,
      );
      const parsed = parseAonSpell(
        fs.readFileSync(artifactPath, "utf8"),
        observation.record.source.url,
      );
      const canonicalRaw = String(canonical.description.raw);
      const {
        exact: exactSourceDescription,
        leakedMythicSuffix,
      } = sourceDescriptionMatch(canonicalRaw, parsed.descriptionRaw);
      if (!exactSourceDescription && !leakedMythicSuffix) {
        issue("source_mismatch", spellId);
        continue;
      }
      const document = parseRichTextHtml(parsed.descriptionHtml);
      const reconciled = mergeRelationships(
        canonical.relationships,
        spellId,
        canonicalSpells,
      );
      const richText = linkRichTextDocument(document, reconciled.relationships, {
        ownerEntityId: spellId,
      });
      if (
        comparableRichText(richTextLeafText(richText.document)) !==
        comparableRichText(parsed.descriptionRaw)
      ) {
        issue("parser_error", spellId);
        continue;
      }
      if (richText.warnings.length > 0) {
        linkWarningDetails[spellId] = richText.warnings;
        issue("link_warnings", spellId);
        continue;
      }
      if (entityLinkCount(richText.document) > 0) {
        summary.safe_with_links += 1;
      } else {
        summary.safe_structure_only += 1;
      }
      safeSpellIds.push(spellId);
    } catch {
      issue("parser_error", spellId);
    }
  }
  return {
    summary,
    safe_spell_ids: safeSpellIds,
    issue_samples: issueSamples,
    issue_spell_ids: issueSpellIds,
    link_warning_details: linkWarningDetails,
  };
}


export function enrichRichTextSpells(spellIds: readonly string[]): void {
  const canonicalSpells = canonicalIndex();
  const observations = observationIndex();

  for (const spellId of spellIds) {
    const filename = canonicalFilename(spellId);
    const canonical = loadJson(filename);
    const baselineId = baselineObservationId(canonical);
    const observation = baselineId ? observations.get(baselineId) : null;
    if (!baselineId || !observation || observation.record.source.site_id !== "aon") {
      throw new Error(`${spellId} has no indexed AoN baseline observation`);
    }
    const artifactPath = resolveArtifactPath(
      observation.filename,
      observation.record.retrieval.raw_artifact_path,
      observation.record.retrieval.content_sha256,
    );
    const parsed = parseAonSpell(
      fs.readFileSync(artifactPath, "utf8"),
      observation.record.source.url,
    );
    const canonicalRaw = String(canonical.description.raw);
    const {
      exact: exactSourceDescription,
      leakedMythicSuffix,
    } = sourceDescriptionMatch(canonicalRaw, parsed.descriptionRaw);
    if (!exactSourceDescription && !leakedMythicSuffix) {
      throw new Error(
        `${spellId} AoN HTML differs from the canonical description:\n` +
        `AoN: ${JSON.stringify(parsed.descriptionRaw)}\n` +
        `Canonical: ${JSON.stringify(canonical.description.raw)}`,
      );
    }
    if (leakedMythicSuffix) {
      canonical.description.raw = parsed.descriptionRaw;
      canonical.description.search_text = JSON.stringify(parsed.descriptionRaw)
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en-US");
    }
    syncDescriptionInheritanceOverrides(canonical);
    const sourceDocument = parseRichTextHtml(parsed.descriptionHtml);

    const reconciled = mergeRelationships(
      canonical.relationships.filter((relationship: ValidatedJson) =>
        spellId !== "spell.darkness" || (
          relationship.target.entity_id !== "spell.darkness" &&
          !darknessMythicOnlyTargets.has(String(relationship.target.entity_id))
        )
      ),
      spellId,
      canonicalSpells,
    );
    reconciled.relationships = addReviewedDescriptionReferences(
      spellId,
      reconciled.relationships,
      baselineId,
      observation.record.source.url,
    );
    const automaticRelationships = reconciled.relationships.filter((relationship) =>
      (
        spellId !== "spell.darkness" ||
        !darknessContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.alluring-light" ||
        !alluringLightContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.anti-summoning-shield" ||
        !antiSummoningContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.baleful-shadow-transmutation" ||
        relationship.target.entity_id !== "subschool.polymorph"
      ) && (
        spellId !== "spell.dancing-darkness" ||
        !dancingDarknessContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.deeper-darkness" ||
        !deeperDarknessContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.curse-water" ||
        !curseWaterContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.detect-snares-and-pits" ||
        !detectSnaresContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.diminish-resistance" ||
        !diminishResistanceRejectedTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.discovery-torch" ||
        !discoveryTorchContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.displacement" ||
        !displacementContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.divine-power" ||
        !divinePowerRejectedTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.divine-vessel" ||
        !divineVesselRejectedTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.elemental-speech" ||
        !elementalSpeechContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.elemental-swarm" ||
        !elementalSwarmContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.enthrall" ||
        !enthrallContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.ethereal-fists" ||
        !etherealFistsContextualTargets.has(String(relationship.target.entity_id))
      ) && (
        spellId !== "spell.euphoric-tranquility" ||
        !euphoricTranquilityContextualTargets.has(String(relationship.target.entity_id))
      )
    );
    if (spellId === "spell.darkness") {
      reconciled.relationships = addDarknessReferences(
        sourceDocument,
        reconciled.relationships,
        baselineId,
        observation.record.source.url,
      );
    }
    if (spellId === "spell.alluring-light") {
      reconciled.relationships = addAlluringLightReferences(
        sourceDocument,
        reconciled.relationships,
        baselineId,
        observation.record.source.url,
      );
    }
    if (spellId === "spell.blacklight") {
      reconciled.relationships = addBlacklightReferences(
        sourceDocument,
        reconciled.relationships,
        baselineId,
        observation.record.source.url,
      );
    }
    if (spellId === "spell.discovery-torch") {
      reconciled.relationships = addDiscoveryTorchReferences(
        sourceDocument,
        reconciled.relationships,
        baselineId,
        observation.record.source.url,
      );
    }
    if (spellId === "spell.blight") {
      reconciled.relationships = addBlightReferences(
        sourceDocument,
        reconciled.relationships,
        baselineId,
        observation.record.source.url,
      );
    }
    if (spellId === "spell.blur") {
      reconciled.relationships = addBlurReferences(
        sourceDocument,
        reconciled.relationships,
        baselineId,
        observation.record.source.url,
      );
    }
    if (spellId === "spell.bone-flense") {
      reconciled.relationships = addBoneFlenseReferences(
        sourceDocument,
        reconciled.relationships,
        baselineId,
        observation.record.source.url,
      );
    }
    if (spellId === "spell.anti-summoning-shield") {
      linkAntiSummoningShieldContext(sourceDocument);
    }
    if (spellId === "spell.dancing-darkness") {
      linkContext(sourceDocument, "spheres of darkness", [{
        value: "darkness",
        relationshipId: "spell.dancing-darkness:uses_definition:illumination.darkness",
      }]);
    }
    if (spellId === "spell.curse-water") {
      linkContext(sourceDocument, "good outsiders", [
        {
          value: "good",
          relationshipId: "spell.curse-water:uses_definition:rule.good",
        },
        {
          value: "outsiders",
          relationshipId: "spell.curse-water:uses_definition:rule.outsider",
        },
      ]);
      linkContext(sourceDocument, "evil outsiders", [
        {
          value: "evil",
          relationshipId: "spell.curse-water:uses_definition:rule.evil",
        },
        {
          value: "outsiders",
          relationshipId: "spell.curse-water:uses_definition:rule.outsider",
        },
      ]);
    }
    if (spellId === "spell.elemental-speech") {
      for (const element of ["air", "earth", "fire", "water"] as const) {
        linkContext(sourceDocument, `${element} spell`, [{
          value: element,
          relationshipId: `spell.elemental-speech:uses_definition:descriptor.${element}`,
        }]);
        linkContext(sourceDocument, `${element} subtype`, [{
          value: element,
          relationshipId: `spell.elemental-speech:uses_definition:rule.${element}`,
        }]);
      }
    }
    if (spellId === "spell.elemental-swarm") {
      linkContext(sourceDocument, "air, earth, fire, or water creature", [
        { value: "air", relationshipId: "spell.elemental-swarm:uses_definition:rule.air" },
        { value: "earth", relationshipId: "spell.elemental-swarm:uses_definition:rule.earth" },
        { value: "fire", relationshipId: "spell.elemental-swarm:uses_definition:rule.fire" },
        { value: "water", relationshipId: "spell.elemental-swarm:uses_definition:rule.water" },
      ]);
      for (const size of ["Large", "Huge"] as const) {
        linkContext(sourceDocument, `${size} elementals`, [{
          value: size,
          relationshipId: "spell.elemental-swarm:uses_definition:rule.size",
        }]);
      }
    }
    if (spellId === "spell.enthrall") {
      for (const [context, values] of [
        ["attitude of friendly", ["friendly"]],
        ["attitude of indifferent", ["indifferent"]],
        ["unfriendly or hostile attitudes", ["unfriendly", "hostile"]],
        ["become immediately unfriendly", ["unfriendly"]],
        ["becomes hostile", ["hostile"]],
      ] as const) {
        linkContext(sourceDocument, context, values.map((value) => ({
          value,
          relationshipId: "spell.enthrall:uses_definition:rule.attitude",
        })));
      }
    }
    if (spellId === "spell.ethereal-fists") {
      linkContext(sourceDocument, "Ethereal and Material planes", [
        {
          value: "Ethereal",
          relationshipId: "spell.ethereal-fists:uses_definition:rule.ethereal-plane",
        },
        {
          value: "Material",
          relationshipId: "spell.ethereal-fists:uses_definition:rule.material-plane",
        },
      ]);
      linkContext(sourceDocument, "ethereal creatures", [{
        value: "ethereal",
        relationshipId: "spell.ethereal-fists:uses_definition:rule.ethereal",
      }]);
      linkContext(sourceDocument, "due to etherealness", [{
        value: "etherealness",
        relationshipId: "spell.ethereal-fists:uses_definition:rule.ethereal",
      }]);
    }
    if (spellId === "spell.euphoric-tranquility") {
      linkContext(sourceDocument, "attitude of Helpful", [{
        value: "Helpful",
        relationshipId: "spell.euphoric-tranquility:uses_definition:rule.attitude",
      }]);
    }
    if (spellId === "spell.echeans-excellent-enclosure") {
      linkContext(sourceDocument, "field of antimagic", [{
        value: "field of antimagic",
        relationshipId: "spell.echeans-excellent-enclosure:references:spell.antimagic-field",
      }]);
    }
    if (spellId === "spell.ectoplasmic-hand") {
      for (const maneuver of ["drag", "steal"] as const) {
        linkContext(sourceDocument, `${maneuver}APG`, [{
          value: maneuver,
          relationshipId: `spell.ectoplasmic-hand:uses_definition:rule.${maneuver}`,
        }]);
      }
    }
    if (spellId === "spell.elemental-mastery") {
      linkContext(sourceDocument, "all speeds", [{
        value: "speeds",
        relationshipId: "spell.elemental-mastery:uses_definition:rule.speed",
      }]);
    }
    if (spellId === "spell.detect-snares-and-pits") {
      linkContext(sourceDocument, "see the spell snare", [{
        value: "snare",
        relationshipId: "spell.detect-snares-and-pits:references:spell.snare",
      }]);
    }
    if (spellId === "spell.displacement") {
      linkContext(sourceDocument, "50% miss chance as if it had total concealment", [{
        value: "total concealment",
        relationshipId: "spell.displacement:uses_definition:rule.total-concealment",
      }]);
      linkContext(sourceDocument, "Unlike actual total concealment", [{
        value: "total concealment",
        relationshipId: "spell.displacement:uses_definition:rule.total-concealment",
      }]);
    }
    const richText = linkRichTextDocument(
      sourceDocument,
      automaticRelationships,
      { ownerEntityId: spellId },
    );
    if (spellId === "spell.brand-greater") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.brand-greater:functions_like:spell.brand",
      );
    }
    if (spellId === "spell.charm-person-mass") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.charm-person-mass:functions_like:spell.charm-person",
      );
    }
    if (spellId === "spell.command-greater") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.command-greater:functions_like:spell.command",
      );
    }
    if (spellId === "spell.escape-alarm") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.escape-alarm:functions_like:spell.alarm",
      );
    }
    if (spellId === "spell.explosive-runes") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.explosive-runes:references:spell.erase",
      );
    }
    if (spellId === "spell.false-resurrection-greater") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.false-resurrection-greater:functions_like:spell.false-resurrection",
        [1, 2],
        4,
      );
    }
    if (spellId === "spell.ceremony") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.ceremony:uses_definition:rule.touch-attack",
        [2, 4, 5],
        5,
      );
      for (const [descriptor, keptOccurrence, expectedMatches] of [
        ["air", 2, 2],
        ["earth", 2, 2],
        ["fire", 3, 3],
        ["water", 3, 3],
      ] as const) {
        keepRelationshipLinkOccurrences(
          richText.document,
          `spell.ceremony:uses_definition:descriptor.${descriptor}`,
          [keptOccurrence],
          expectedMatches,
        );
      }
    }
    if (spellId === "spell.curse-terrain-lesser") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.curse-terrain-lesser:references:spell.curse-terrain",
        [3],
        3,
      );
    }
    if (spellId === "spell.contact-high") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.contact-high:uses_definition:rule.touch-attack",
        ["touch"],
      );
    }
    if (spellId === "spell.contagious-suggestion") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.contagious-suggestion:functions_like:spell.suggestion",
      );
    }
    if (spellId === "spell.controlled-fireball") {
      keepFirstAndLastRelationshipLinks(
        richText.document,
        "spell.controlled-fireball:functions_like:spell.fireball",
      );
    }
    if (spellId === "spell.create-mindscape-greater") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.create-mindscape-greater:functions_like:spell.create-mindscape",
      );
    }
    if (spellId === "spell.darkvision-greater") {
      distinguishGreaterDarkvisionReferences(richText.document);
    }
    if (spellId === "spell.detect-undead") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.detect-undead:uses_definition:rule.undead",
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        11,
      );
    }
    if (spellId === "spell.dream-council") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.dream-council:functions_like:spell.dream",
        [1, 2, 6],
        7,
      );
    }
    if (spellId === "spell.dream-scan") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.dream-scan:functions_like:spell.dream",
        [1, 4],
        4,
      );
    }
    if (spellId === "spell.dream-travel") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.dream-travel:references:spell.dream",
        [2],
        16,
      );
    }
    if (spellId === "spell.deeper-darkness") {
      distinguishDeeperDarknessReferences(richText.document);
    }
    if (spellId === "spell.delayed-blast-fireball") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.delayed-blast-fireball:functions_like:spell.fireball",
      );
    }
    if (spellId === "spell.detect-magic-greater") {
      keepFirstRelationshipLink(
        richText.document,
        "spell.detect-magic-greater:functions_like:spell.detect-magic",
      );
    }
    if (spellId === "spell.discharge-greater") {
      distinguishGreaterDischargeReferences(richText.document);
    }
    if (spellId === "spell.disrupt-link") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.disrupt-link:uses_definition:rule.touch-attack",
        ["touch"],
      );
    }
    if (spellId === "spell.disrupt-silence") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.disrupt-silence:references:spell.silence",
        [5],
        7,
      );
    }
    if (spellId === "spell.dissolution") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.dissolution:uses_definition:rule.touch-attack",
        ["touch"],
      );
    }
    if (spellId === "spell.dominate-animal") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.dominate-animal:uses_definition:rule.animal",
        [1, 2, 4, 5],
        5,
      );
    }
    if (spellId === "spell.divine-vessel") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.divine-vessel:uses_definition:descriptor.cold",
        [2, 3, 4],
        4,
      );
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.divine-vessel:uses_definition:rule.good",
        [4, 5, 7],
        7,
      );
    }
    if (spellId === "spell.elemental-speech") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.elemental-speech:uses_definition:rule.elemental",
        [1, 2],
        3,
      );
    }
    if (spellId === "spell.elemental-swarm") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.elemental-swarm:uses_definition:rule.elemental",
        [2, 3, 4, 5, 6, 7, 8],
        8,
      );
    }
    if (spellId === "spell.enchantment-sight") {
      keepRelationshipLinkOccurrences(
        richText.document,
        "spell.enchantment-sight:uses_definition:magic-school.enchantment",
        [1, 2, 3, 4],
        5,
      );
    }
    if (spellId === "spell.determine-depth") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.determine-depth:uses_definition:rule.touch-attack",
        ["touch"],
      );
    }
    if (spellId === "spell.devil-snare") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.devil-snare:uses_definition:rule.touch-attack",
        ["touch"],
      );
    }
    if (spellId === "spell.dispel-balance") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.dispel-balance:uses_definition:rule.touch-attack",
        ["touch"],
      );
    }
    if (spellId === "spell.cure-light-wounds-mass") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.cure-light-wounds-mass:mass_variant_of:spell.cure-light-wounds",
        ["cure light wounds"],
      );
    }
    if (spellId === "spell.curse-of-unexpected-death") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.curse-of-unexpected-death:uses_definition:rule.touch-attack",
        ["touch"],
      );
    }
    if (spellId === "spell.cursed-treasure") {
      removeRelationshipLinkValues(
        richText.document,
        "spell.cursed-treasure:uses_definition:rule.touch-attack",
        ["touch"],
      );
    }
    if (spellId === "spell.baleful-shadow-transmutation") {
      reconciled.relationships = distinguishBalefulShadowPolymorphReferences(
        richText.document,
        reconciled.relationships,
        baselineId,
        observation.record.source.url,
      );
    }
    const inheritanceRules = reconciled.relationships
      .filter((item) =>
        item.status === "accepted" &&
        item.type === "functions_like" &&
        item.target.entity_type === "spell" &&
        item.target.entity_id
      )
      .map((item) => materializeSpellInheritanceRule(
        canonical,
        baselineId,
        parsed,
        canonicalSpells,
        String(item.target.entity_id),
        String(item.target.name),
      ));
    if (canonical.rules_inheritance.length === 0 && inheritanceRules.length > 0) {
      canonical.rules_inheritance = inheritanceRules;
    }
    if (
      comparableRichText(richTextLeafText(richText.document)) !==
      comparableRichText(String(canonical.description.raw))
    ) {
      throw new Error(`${spellId} rich-text parsing changed the visible description`);
    }

    canonical.schema_version = "0.2.0";
    canonical.relationships = reconciled.relationships;
    canonical.description.document = richText.document;
    canonical.provenance = canonical.provenance.filter((item: ValidatedJson) =>
      item.field_path !== "/description/document"
    );
    canonical.provenance.push({
      field_path: "/description/document",
      observation_id: baselineId,
      source_field: "spell_raw.description_raw",
      raw_value_sha256: crypto.createHash("sha256").update(JSON.stringify(parsed.descriptionRaw)).digest("hex"),
      decision: "normalized",
      note:
        "Block structure and emphasis come from the selected AoN HTML; entity links come from accepted canonical relationships.",
    });
    canonical.normalization.normalizer_version = "0.2.0-rich-text";
    canonical.normalization.warnings = canonical.normalization.warnings.filter(
      (warning: ValidatedJson) =>
        warning.code !== "AMBIGUOUS_RICH_TEXT_LINK" &&
        warning.code !== "UNMATCHED_RICH_TEXT_LINK" &&
        warning.code !== "RICH_TEXT_SOURCE_STRUCTURE_FALLBACK",
    );
    const warningMessages: string[] = [];
    for (const warning of richText.warnings) {
      const message = warning.code === "AMBIGUOUS_RICH_TEXT_LINK"
        ? `The phrase ${JSON.stringify(warning.phrase)} matches multiple accepted relationships ` +
          `(${warning.relationship_ids.join(", ")}); it remains unlinked.`
        : `No occurrence of ${JSON.stringify(warning.phrase)} matched accepted relationship ` +
          `${warning.relationship_ids[0]}; the relationship remains under Related rules.`;
      warningMessages.push(message);
      canonical.normalization.warnings.push({
        code: warning.code,
        field_path: "/description/document",
        message,
      });
    }
    if (richText.warnings.length > 0) {
      canonical.normalization.status = "needs_review";
    } else if (leakedMythicSuffix) {
      canonical.normalization.status = "validated";
    }

    fs.writeFileSync(filename, `${JSON.stringify(canonical, null, 2)}\n`, "utf8");
    updateDecision(
      spellId,
      baselineId,
      reconciled.changedIds,
      reconciled.relationships,
      warningMessages,
    );
    canonicalSpells.set(spellId, canonical);
  }
}


export function enrichRichTextPilot(): void {
  enrichRichTextSpells(richTextPilotSpellIds);
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const batchArgument = process.argv.slice(2).find((argument) => argument.startsWith("--safe-batch="));
  const idsArgument = process.argv.slice(2).find((argument) => argument.startsWith("--ids="));
  if (process.argv.includes("--audit")) {
    const audit = auditRichTextRollout();
    console.log(JSON.stringify({
      summary: audit.summary,
      safe_spell_id_samples: audit.safe_spell_ids.slice(0, 25),
      issue_samples: audit.issue_samples,
    }, null, 2));
  } else if (idsArgument) {
    const spellIds = idsArgument.slice("--ids=".length).split(",").filter(Boolean);
    if (spellIds.length === 0) throw new Error("--ids must contain at least one spell ID");
    enrichRichTextSpells(spellIds);
    console.log(`Enriched ${spellIds.length} selected spells with rich text.`);
  } else if (batchArgument) {
    const audit = auditRichTextRollout();
    const batchSize = Number.parseInt(batchArgument.slice("--safe-batch=".length), 10);
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
      throw new Error("--safe-batch must be a positive integer");
    }
    const spellIds = audit.safe_spell_ids.slice(0, batchSize);
    enrichRichTextSpells(spellIds);
    console.log(`Enriched ${spellIds.length} safe rollout spells with rich text.`);
    console.log(spellIds.join("\n"));
  } else {
    enrichRichTextPilot();
    console.log(`Enriched ${richTextPilotSpellIds.length} pilot spells with rich text.`);
  }
}
