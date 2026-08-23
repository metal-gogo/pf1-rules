import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import type { ValidatedJson } from "../domain/json.js";
import { validatePackage } from "./validate.js";


interface ListOverride {
  spellId: string;
  spellName: string;
  sourceSpellListId: string;
  sourceListName: string;
  targetSpellListId: string;
  targetListName: string;
  level: number;
}

interface FoundryMembershipReview {
  spellId: string;
  spellName: string;
  targetSpellListId: string;
  targetListName: string;
  foundryLevel: number;
  foundryPath: string;
  canonicalLevel?: number;
}

const foundryCommit = "1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f";

const reviewedAdditions: ListOverride[] = [
  ["blood-transcription", "Blood Transcription", 2],
  ["deceitful-veneer", "Deceitful Veneer", 5],
  ["firewalkers-meditation", "Firewalker's Meditation", 4],
  ["mages-lucubration", "Mage's Lucubration", 6],
  ["mnemonic-enhancer", "Mnemonic Enhancer", 4],
  ["rite-of-centered-mind", "Rite of Centered Mind", 1],
  ["spirit-bonds", "Spirit Bonds", 3],
  ["temporal-regression", "Temporal Regression", 8],
  ["visualization-of-the-body", "Visualization of the Body", 2],
  ["visualization-of-the-mind", "Visualization of the Mind", 2],
].map(([slug, spellName, level]) => ({
  spellId: `spell.${slug}`,
  spellName: String(spellName),
  sourceSpellListId: "spell-list.wizard",
  sourceListName: "wizard",
  targetSpellListId: "spell-list.sorcerer",
  targetListName: "sorcerer",
  level: Number(level),
})).concat([
  ["borrow-fortune", "Borrow Fortune", 3],
  ["divine-vessel", "Divine Vessel", 8],
  ["embrace-destiny", "Embrace Destiny", 1],
  ["find-fault", "Find Fault", 3],
  ["foretell-failure", "Foretell Failure", 4],
  ["jungle-mind", "Jungle Mind", 5],
].map(([slug, spellName, level]) => ({
  spellId: `spell.${slug}`,
  spellName: String(spellName),
  sourceSpellListId: "spell-list.oracle",
  sourceListName: "oracle",
  targetSpellListId: "spell-list.cleric",
  targetListName: "cleric",
  level: Number(level),
})));

const reviewedExclusions: ListOverride[] = [
  {
    spellId: "spell.oracles-burden",
    spellName: "Oracle's Burden",
    sourceSpellListId: "spell-list.oracle",
    sourceListName: "oracle",
    targetSpellListId: "spell-list.cleric",
    targetListName: "cleric",
    level: 2,
  },
  {
    spellId: "spell.oracles-vessel",
    spellName: "Oracle's Vessel",
    sourceSpellListId: "spell-list.oracle",
    sourceListName: "oracle",
    targetSpellListId: "spell-list.cleric",
    targetListName: "cleric",
    level: 4,
  },
];


function foundryReview(
  [slug, spellName, listSlug, foundryLevel, foundryPath, canonicalLevel]:
  [string, string, string, number, string, number?],
): FoundryMembershipReview {
  const targetListName = listSlug === "summoner-unchained"
    ? "Summoner (Unchained)"
    : `${listSlug[0]?.toLocaleUpperCase("en-US")}${listSlug.slice(1)}`;
  return {
    spellId: `spell.${slug}`,
    spellName,
    targetSpellListId: `spell-list.${listSlug}`,
    targetListName,
    foundryLevel,
    foundryPath,
    ...(canonicalLevel === undefined ? {} : { canonicalLevel }),
  };
}


const reviewedFoundryAdditions = [
  ["pressure-adaptation", "Pressure Adaptation", "paladin", 3, "packs/spells/abjuration/pressure-adaptation.wvvk67okw1sueisy.yaml"],
  ["seers-bane", "Seer's Bane", "sorcerer", 6, "packs/spells/abjuration/seer-s-bane.5ggd0hecvu0una9p.yaml"],
  ["seers-bane", "Seer's Bane", "wizard", 6, "packs/spells/abjuration/seer-s-bane.5ggd0hecvu0una9p.yaml"],
  ["shield-speech-greater", "Shield Speech, Greater", "skald", 4, "packs/spells/abjuration/shield-speech-greater.7y0xvorQBvCtjoYn.yaml"],
  ["stabilize-pressure", "Stabilize Pressure", "paladin", 2, "packs/spells/abjuration/stabilize-pressure.u46fk0bmnnkarvcm.yaml"],
  ["hostile-juxtaposition-greater", "Hostile Juxtaposition, Greater", "summoner-unchained", 6, "packs/spells/conjuration/hostile-juxtaposition-greater.oiop1tjfchmo4atk.yaml"],
  ["waters-of-lamashtu", "Waters of Lamashtu", "shaman", 3, "packs/spells/conjuration/waters-of-lamashtu.yzxabopbmjm1uyw5.yaml"],
  ["petulengros-validation", "Petulengro's Validation", "sorcerer", 1, "packs/spells/divination/petulengro-s-validation.w7jvuilf20pwx45x.yaml"],
  ["petulengros-validation", "Petulengro's Validation", "wizard", 1, "packs/spells/divination/petulengro-s-validation.w7jvuilf20pwx45x.yaml"],
  ["probe-history", "Probe History", "medium", 2, "packs/spells/divination/probe-history.frxwocsreolvb4tk.yaml"],
  ["probe-history", "Probe History", "mesmerist", 3, "packs/spells/divination/probe-history.frxwocsreolvb4tk.yaml"],
  ["probe-history", "Probe History", "occultist", 3, "packs/spells/divination/probe-history.frxwocsreolvb4tk.yaml"],
  ["bleaching-resistance", "Bleaching Resistance", "spiritualist", 4, "packs/spells/enchantment/bleaching-resistance.inuj1vmyo9cygt0e.yaml"],
  ["lost-locale", "Lost Locale", "psychic", 9, "packs/spells/enchantment/lost-locale.8u47mrsvdw4ssinw.yaml"],
  ["lost-passage", "Lost Passage", "mesmerist", 3, "packs/spells/enchantment/lost-passage.1gm2ngzes1xi3zuu.yaml"],
  ["lost-passage", "Lost Passage", "psychic", 4, "packs/spells/enchantment/lost-passage.1gm2ngzes1xi3zuu.yaml"],
  ["miasmal-dread", "Miasmal Dread", "mesmerist", 3, "packs/spells/enchantment/miasmal-dread.9jcelzrc91kpr5ew.yaml"],
  ["shadow-of-doubt", "Shadow of Doubt", "mesmerist", 4, "packs/spells/enchantment/shadow-of-doubt.rh2v2fq3q6l7u7f1.yaml"],
  ["shadow-of-doubt", "Shadow of Doubt", "psychic", 6, "packs/spells/enchantment/shadow-of-doubt.rh2v2fq3q6l7u7f1.yaml"],
  ["shadow-of-doubt", "Shadow of Doubt", "spiritualist", 4, "packs/spells/enchantment/shadow-of-doubt.rh2v2fq3q6l7u7f1.yaml"],
  ["cloak-of-shadows", "Cloak of Shadows", "spiritualist", 5, "packs/spells/illusion/cloak-of-shadows.pdf0u992f7pe66yu.yaml"],
  ["fable-tapestry", "Fable Tapestry", "medium", 4, "packs/spells/illusion/fable-tapestry.ne8s12d98d9df1d2.yaml"],
  ["shadowfade", "Shadowfade", "magus", 1, "packs/spells/illusion/shadowfade.5w68w4yw2oivz7b3.yaml"],
  ["mages-crawl-space", "Mage's Crawl Space", "witch", 2, "packs/spells/transmutation/mage-s-crawl-space.ip70uslfhmjl0vo0.yaml"],
  ["pesh-vigor", "Pesh Vigor", "medium", 1, "packs/spells/transmutation/pesh-vigor.l8mfdvp48i7du08y.yaml"],
  ["pesh-vigor", "Pesh Vigor", "psychic", 1, "packs/spells/transmutation/pesh-vigor.l8mfdvp48i7du08y.yaml"],
  ["vermin-shape-ii", "Vermin Shape II", "bloodrager", 4, "packs/spells/transmutation/vermin-shape-ii.j8fufy7sr3bty5du.yaml"],
].map((item) => foundryReview(item as [string, string, string, number, string]));

const reviewedFoundryUnchainedAdditions = [
  ["banishing-blade", "Banishing Blade", "summoner-unchained", 5, "packs/spells/abjuration/banishing-blade.t4l1o78v9gcp3jag.yaml"],
  ["punishing-armor", "Punishing Armor", "summoner-unchained", 1, "packs/spells/abjuration/punishing-armor.bmr954ayksd33hdk.yaml"],
  ["thaumaturgic-circle", "Thaumaturgic Circle", "summoner-unchained", 4, "packs/spells/abjuration/thaumaturgic-circle.phlu5va1l0h3v3do.yaml"],
  ["apport-animal", "Apport Animal", "summoner-unchained", 3, "packs/spells/conjuration/apport-animal.rq2jsb061wjpzf3s.yaml"],
  ["celestial-healing-greater", "Celestial Healing, Greater", "summoner-unchained", 4, "packs/spells/conjuration/celestial-healing-greater.q8tyi2rrplhf5625.yaml"],
  ["celestial-healing", "Celestial Healing", "summoner-unchained", 1, "packs/spells/conjuration/celestial-healing.6d6bgiakwmwiu7qv.yaml"],
  ["curse-of-dragonflies", "Curse of Dragonflies", "summoner-unchained", 4, "packs/spells/conjuration/curse-of-dragonflies.bLOXAvcgrCd2cIty.yaml"],
  ["evaluators-lens", "Evaluator's Lens", "summoner-unchained", 2, "packs/spells/conjuration/evaluator-s-lens.rsnriqszpqneevhi.yaml"],
  ["fleshwarping-swarm-drow", "Fleshwarping Swarm (Drow)", "summoner-unchained", 3, "packs/spells/conjuration/fleshwarping-swarm.4amchj89pppg180r.yaml"],
  ["garden-of-peril", "Garden of Peril", "summoner-unchained", 2, "packs/spells/conjuration/garden-of-peril.1jvikwzrr06uwtzp.yaml"],
  ["grasping-tentacles", "Grasping Tentacles", "summoner-unchained", 3, "packs/spells/conjuration/grasping-tentacles.8vu9wseuc1em7afq.yaml"],
  ["grease-greater", "Grease, Greater", "summoner-unchained", 5, "packs/spells/conjuration/grease-greater.lkmgyqm6pzgb349s.yaml"],
  ["knell-of-the-depths", "Knell of the Depths", "summoner-unchained", 3, "packs/spells/conjuration/knell-of-the-depths.wcKbbzudKI2A2cUc.yaml"],
  ["leshy-swarm", "Leshy Swarm", "summoner-unchained", 3, "packs/spells/conjuration/leshy-swarm.dCg1ecr5Ofguqq5x.yaml"],
  ["murderous-crow", "Murderous Crow", "summoner-unchained", 1, "packs/spells/conjuration/murderous-crow.8ikma6e6wqrx1dh7.yaml"],
  ["planar-refuge", "Planar Refuge", "summoner-unchained", 6, "packs/spells/conjuration/planar-refuge.utf4h7pte468n7f6.yaml"],
  ["shackle", "Shackle", "summoner-unchained", 2, "packs/spells/conjuration/shackle.9pv2xecdqfmpvyq9.yaml"],
  ["grand-destiny", "Grand Destiny", "summoner-unchained", 5, "packs/spells/enchantment/grand-destiny.xd2qwtfqojajmk6e.yaml"],
  ["mind-swap", "Mind Swap", "summoner-unchained", 5, "packs/spells/enchantment/mind-swap.nepwelwi6tlh1vo0.yaml"],
  ["baleful-shadow-transmutation", "Baleful Shadow Transmutation", "summoner-unchained", 6, "packs/spells/illusion/baleful-shadow-transmutation.1b8n86gdmks2q9in.yaml"],
  ["blend-with-surroundings", "Blend with Surroundings", "summoner-unchained", 1, "packs/spells/illusion/blend-with-surroundings.16ms1wen0vd3iezx.yaml"],
  ["selective-invisibility", "Selective Invisibility", "summoner-unchained", 3, "packs/spells/illusion/selective-invisibility.1tpm2xczywufi3r8.yaml"],
  ["shadow-transmutation", "Shadow Transmutation", "summoner-unchained", 6, "packs/spells/illusion/shadow-transmutation.iv56csqwu1no7ht8.yaml"],
  ["blood-tentacles", "Blood Tentacles", "summoner-unchained", 4, "packs/spells/necromancy/blood-tentacles.lsa1lozdd39s7iwd.yaml"],
  ["possession", "Possession", "summoner-unchained", 5, "packs/spells/necromancy/possession.4mw83czf7b62rar3.yaml"],
  ["riding-possession", "Riding Possession", "summoner-unchained", 4, "packs/spells/necromancy/riding-possession.vpqwav2vexafom8c.yaml"],
  ["deft-digits", "Deft Digits", "summoner-unchained", 3, "packs/spells/transmutation/deft-digits.bdyhf7y50zelcsd1.yaml"],
  ["dissolution", "Dissolution", "summoner-unchained", 6, "packs/spells/transmutation/dissolution.blsl7v5wr0rm28su.yaml"],
  ["ether-step", "Ether Step", "summoner-unchained", 5, "packs/spells/transmutation/ether-step.7a95u92t5y8zjwrl.yaml"],
  ["human-potential-mass", "Human Potential, Mass", "summoner-unchained", 6, "packs/spells/transmutation/human-potential-mass.e0e6jhhkwxclo4em.yaml"],
  ["pesh-vigor", "Pesh Vigor", "summoner-unchained", 1, "packs/spells/transmutation/pesh-vigor.l8mfdvp48i7du08y.yaml"],
  ["sword-to-snake", "Sword to Snake", "summoner-unchained", 4, "packs/spells/transmutation/sword-to-snake.pxxhtg3wnijnrxmz.yaml"],
  ["venomous-bite", "Venomous Bite", "summoner-unchained", 2, "packs/spells/transmutation/venomous-bite.2fsop8wg3cfpbrff.yaml"],
  ["wooden-wing-shield", "Wooden Wing Shield", "summoner-unchained", 4, "packs/spells/transmutation/wooden-wing-shield.HBdrFlsq2J8hfyDn.yaml"],
].map((item) => foundryReview(item as [string, string, string, number, string]));

const reviewedFoundryLowerLevels = [
  ["soul-vault", "Soul Vault", "shaman", 3, "packs/spells/abjuration/soul-vault.kfn6zv75qwgc0cwy.yaml", 4],
  ["hostile-juxtaposition-greater", "Hostile Juxtaposition, Greater", "mesmerist", 4, "packs/spells/conjuration/hostile-juxtaposition-greater.oiop1tjfchmo4atk.yaml", 6],
  ["phantom-steed", "Phantom Steed", "spiritualist", 2, "packs/spells/conjuration/phantom-steed.zpwd0f19q1lm04p3.yaml", 3],
  ["waters-of-lamashtu", "Waters of Lamashtu", "investigator", 2, "packs/spells/conjuration/waters-of-lamashtu.yzxabopbmjm1uyw5.yaml", 3],
  ["locate-object", "Locate Object", "spiritualist", 2, "packs/spells/divination/locate-object.tcnirpnzjdaym1fd.yaml", 3],
  ["curse-of-the-outcast", "Curse of the Outcast", "skald", 4, "packs/spells/enchantment/curse-of-the-outcast.zyzlq7sbjvozd6mb.yaml", 5],
  ["mad-sultans-melody", "Mad Sultan's Melody", "skald", 3, "packs/spells/enchantment/mad-sultan-s-melody.522dibwtdu2g7sj0.yaml", 4],
  ["agonizing-rebuke", "Agonizing Rebuke", "mesmerist", 2, "packs/spells/illusion/agonizing-rebuke.e44sv3ki2n8dndcy.yaml", 3],
  ["besmaras-grasping-depths", "Besmara's Grasping Depths", "cleric", 5, "packs/spells/necromancy/besmara-s-grasping-depths.8p6eshc9ef48anim.yaml", 6],
  ["besmaras-grasping-depths", "Besmara's Grasping Depths", "oracle", 5, "packs/spells/necromancy/besmara-s-grasping-depths.8p6eshc9ef48anim.yaml", 6],
  ["positive-pulse-greater", "Positive Pulse, Greater", "paladin", 3, "packs/spells/necromancy/positive-pulse-greater.spgvi2usnqe551ai.yaml", 4],
  ["positive-pulse-greater", "Positive Pulse, Greater", "summoner", 3, "packs/spells/necromancy/positive-pulse-greater.spgvi2usnqe551ai.yaml", 4],
  ["positive-pulse-greater", "Positive Pulse, Greater", "summoner-unchained", 3, "packs/spells/necromancy/positive-pulse-greater.spgvi2usnqe551ai.yaml", 4],
  ["wither-limb", "Wither Limb", "spiritualist", 5, "packs/spells/necromancy/wither-limb.e5kr1ggh1k4c2i8z.yaml", 6],
  ["vermin-shape-i", "Vermin Shape I", "bloodrager", 3, "packs/spells/transmutation/vermin-shape-i.uus00fo4fn7yro0w.yaml", 4],
].map((item) => foundryReview(item as [string, string, string, number, string, number]));

const reviewedFoundryLowerRetentions = [
  ["animus-mine", "Animus Mine", "psychic", 3, "packs/spells/abjuration/animus-mine.3cwzop9xd0gl8vnd.yaml", 2],
  ["fair-is-foul", "Fair is Foul", "witch", 3, "packs/spells/abjuration/fair-is-foul.61pYmOmQJ2nMk2vL.yaml", 2],
  ["soothing-word", "Soothing Word", "ranger", 3, "packs/spells/conjuration/soothing-word.1zrd29ckubta8s8z.yaml", 2],
  ["alpha-instinct", "Alpha Instinct", "mesmerist", 3, "packs/spells/enchantment/alpha-instinct.gt6958kgaauhi0dc.yaml", 2],
  ["alpha-instinct", "Alpha Instinct", "skald", 3, "packs/spells/enchantment/alpha-instinct.gt6958kgaauhi0dc.yaml", 2],
  ["horrific-doubles", "Horrific Doubles", "mesmerist", 4, "packs/spells/illusion/horrific-doubles.mh1xqo8ohh531mja.yaml", 3],
  ["horrific-doubles", "Horrific Doubles", "psychic", 4, "packs/spells/illusion/horrific-doubles.mh1xqo8ohh531mja.yaml", 3],
  ["contact-high", "Contact High", "skald", 3, "packs/spells/transmutation/contact-high.t8l6fh3yayq38cuy.yaml", 2],
].map((item) => foundryReview(item as [string, string, string, number, string, number]));


function readJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function writeJson(filename: string, value: unknown): void {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}


function uniqueEvidence(evidence: ValidatedJson[]): ValidatedJson[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.observation_id}:${item.source_field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function sourceEvidence(record: ValidatedJson, sourceSpellListId: string): ValidatedJson[] {
  const relationship = record.relationships.find((item: ValidatedJson) =>
    item.type === "appears_on_spell_list" && item.target?.entity_id === sourceSpellListId,
  );
  return uniqueEvidence(relationship?.evidence ?? []);
}


function decisionEvidence(evidence: ValidatedJson[]): ValidatedJson[] {
  return uniqueEvidence(evidence.map((item: ValidatedJson) => ({
    observation_id: item.observation_id,
    source_field: item.source_field,
  })));
}


function reviewedRationale(spec: ListOverride, action: "add" | "exclude"): string {
  if (action === "exclude") {
    return `Reviewed project decision: keep ${spec.spellName} off the ${spec.targetListName} list. The preserved ${spec.sourceListName} ${spec.level} value is source evidence, not proof of ${spec.targetListName} access.`;
  }
  return `Reviewed project decision: add ${spec.targetListName} ${spec.level} access to match the preserved ${spec.sourceListName} ${spec.level} membership. This is a canonical override, not a printed or derived value.`;
}


function loadSpecFiles(spec: Pick<ListOverride, "spellId" | "spellName">): {
  canonicalPath: string;
  decisionPath: string;
  record: ValidatedJson;
  decision: ValidatedJson;
} {
  const slug = spec.spellId.replace("spell.", "");
  const canonicalPath = path.join(projectRoot, "data", "canonical", `${slug}.json`);
  const decisionPath = path.join(projectRoot, "data", "decisions", `${slug}.json`);
  const record = readJson(canonicalPath);
  const decision = readJson(decisionPath);
  if (record.spell_id !== spec.spellId || record.name !== spec.spellName) {
    throw new Error(`Reviewed override identity mismatch for ${spec.spellId}.`);
  }
  return { canonicalPath, decisionPath, record, decision };
}


function foundryUrl(spec: FoundryMembershipReview): string {
  return `https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/${foundryCommit}/${spec.foundryPath}`;
}


function foundryEvidence(
  decision: ValidatedJson,
  spec: FoundryMembershipReview,
): { full: ValidatedJson[]; selected: ValidatedJson[]; considered: string[] } {
  const observationId = decision.baseline_observation_id;
  const sourceField = "spell_raw.levels_raw";
  return {
    full: [{
      observation_id: observationId,
      source_field: sourceField,
      evidence_kind: "manual_verification",
      anchor_text_raw: `Pinned Foundry PF1 assertion: ${spec.targetListName} ${spec.foundryLevel}`,
      source_href: foundryUrl(spec),
    }],
    selected: [{ observation_id: observationId, source_field: sourceField }],
    considered: decision.observation_ids,
  };
}


function foundryRationale(
  spec: FoundryMembershipReview,
  action: "add" | "lower" | "retain",
): string {
  const source = `pinned Foundry PF1 ${foundryCommit}`;
  if (action === "lower") {
    return `Reviewed project decision: use the lower ${spec.targetListName} ${spec.foundryLevel} level from ${source} instead of canonical level ${spec.canonicalLevel}. This is a canonical override, not a printed AoN value.`;
  }
  if (action === "retain") {
    return `Reviewed project decision: retain the lower canonical ${spec.targetListName} ${spec.canonicalLevel} level instead of ${spec.targetListName} ${spec.foundryLevel} from ${source}.`;
  }
  return `Reviewed project decision: add ${spec.targetListName} ${spec.foundryLevel} from ${source}. This is a canonical override, not a printed AoN value.`;
}


function evidenceContext(
  record: ValidatedJson,
  decision: ValidatedJson,
  spec: ListOverride,
): { full: ValidatedJson[]; selected: ValidatedJson[]; considered: string[] } {
  const full = sourceEvidence(record, spec.sourceSpellListId);
  const selected = decisionEvidence(full);
  const considered = [...new Set(selected.map((item) => item.observation_id))];
  if (considered.length === 0) considered.push(...decision.observation_ids);
  return { full, selected, considered };
}


function applyAddition(spec: ListOverride): boolean {
  const { canonicalPath, decisionPath, record, decision } = loadSpecFiles(spec);
  const sourceLevel = record.levels.find((item: ValidatedJson) =>
    item.spell_list_id === spec.sourceSpellListId && item.level === spec.level,
  );
  if (!sourceLevel) throw new Error(`${spec.spellId} lacks ${spec.sourceListName} ${spec.level}.`);
  const existing = record.levels.filter((item: ValidatedJson) =>
    item.spell_list_id === spec.targetSpellListId,
  );
  if (existing.length > 0) {
    if (existing.length === 1 && existing[0].level === spec.level && existing[0].access_basis === "reviewed_override") {
      return false;
    }
    throw new Error(`${spec.spellId} already has incompatible ${spec.targetListName} access.`);
  }

  const evidence = evidenceContext(record, decision, spec);
  const levelIndex = record.levels.length;
  const relationshipId = `${spec.spellId}:appears_on_spell_list:${spec.targetSpellListId}`;
  const rationale = reviewedRationale(spec, "add");
  record.levels.push({
    spell_list_id: spec.targetSpellListId,
    list_kind: "class",
    list_name: spec.targetListName,
    level: spec.level,
    scope: sourceLevel.scope,
    raw: `Reviewed canonical override: ${spec.targetListName} ${spec.level}; source membership ${spec.sourceListName} ${spec.level}.`,
    access_basis: "reviewed_override",
    qualifications: [],
  });
  record.relationships.push({
    relationship_id: relationshipId,
    type: "appears_on_spell_list",
    target: {
      entity_type: "spell_list",
      entity_id: spec.targetSpellListId,
      name: spec.targetListName,
    },
    status: "accepted",
    evidence: evidence.full,
    note: rationale,
  });
  record.normalization.warnings.push({
    code: "REVIEWED_SPELL_LIST_OVERRIDE",
    field_path: `/levels/${levelIndex}`,
    message: rationale,
  });
  decision.field_decisions.push({
    canonical_path: `/levels/${levelIndex}`,
    decision: "normalize",
    selected_evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale,
  });
  decision.relationship_decisions.push({
    relationship_id: relationshipId,
    decision: "accept",
    evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale,
  });
  writeJson(canonicalPath, record);
  writeJson(decisionPath, decision);
  return true;
}


function applyExclusion(spec: ListOverride): boolean {
  const { decisionPath, record, decision } = loadSpecFiles(spec);
  if (record.levels.some((item: ValidatedJson) => item.spell_list_id === spec.targetSpellListId)) {
    throw new Error(`${spec.spellId} unexpectedly has ${spec.targetListName} access.`);
  }
  const relationshipId = `${spec.spellId}:appears_on_spell_list:${spec.targetSpellListId}`;
  const existing = decision.relationship_decisions.find((item: ValidatedJson) =>
    item.relationship_id === relationshipId,
  );
  if (existing) {
    if (existing.decision === "reject") return false;
    throw new Error(`${spec.spellId} has an incompatible ${spec.targetListName} relationship decision.`);
  }
  const evidence = evidenceContext(record, decision, spec);
  decision.relationship_decisions.push({
    relationship_id: relationshipId,
    decision: "reject",
    evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale: reviewedRationale(spec, "exclude"),
  });
  writeJson(decisionPath, decision);
  return true;
}


function applyFoundryAddition(spec: FoundryMembershipReview): boolean {
  const { canonicalPath, decisionPath, record, decision } = loadSpecFiles(spec);
  const relationshipId = `${spec.spellId}:appears_on_spell_list:${spec.targetSpellListId}`;
  const existing = record.levels.filter((item: ValidatedJson) =>
    item.spell_list_id === spec.targetSpellListId,
  );
  if (existing.length > 0) {
    if (
      existing.length === 1 &&
      existing[0].level === spec.foundryLevel &&
      existing[0].access_basis === "reviewed_override"
    ) {
      const relationshipDecisions = decision.relationship_decisions.filter(
        (item: ValidatedJson) => item.relationship_id === relationshipId,
      );
      if (relationshipDecisions.length === 1 && relationshipDecisions[0].decision === "accept") {
        return false;
      }
      const evidence = foundryEvidence(decision, spec);
      decision.relationship_decisions = decision.relationship_decisions.filter(
        (item: ValidatedJson) => item.relationship_id !== relationshipId,
      );
      decision.relationship_decisions.push({
        relationship_id: relationshipId,
        decision: "accept",
        evidence: evidence.selected,
        considered_observation_ids: evidence.considered,
        rationale: foundryRationale(spec, "add"),
      });
      writeJson(decisionPath, decision);
      return true;
    }
    throw new Error(`${spec.spellId} already has incompatible ${spec.targetListName} access.`);
  }

  const evidence = foundryEvidence(decision, spec);
  const levelIndex = record.levels.length;
  const rationale = foundryRationale(spec, "add");
  const scope = record.levels.find((item: ValidatedJson) => item.level === spec.foundryLevel)?.scope ??
    record.levels[0]?.scope ?? "later_first_party";
  record.levels.push({
    spell_list_id: spec.targetSpellListId,
    list_kind: "class",
    list_name: spec.targetListName.toLocaleLowerCase("en-US"),
    level: spec.foundryLevel,
    scope,
    raw: `Reviewed canonical override: ${spec.targetListName} ${spec.foundryLevel}; ${foundryUrl(spec)}.`,
    access_basis: "reviewed_override",
    qualifications: [],
  });
  record.relationships.push({
    relationship_id: relationshipId,
    type: "appears_on_spell_list",
    target: {
      entity_type: "spell_list",
      entity_id: spec.targetSpellListId,
      name: `${spec.targetListName} Spell List`,
    },
    status: "accepted",
    evidence: evidence.full,
    note: rationale,
  });
  record.normalization.warnings.push({
    code: "REVIEWED_FOUNDRY_MEMBERSHIP",
    field_path: `/levels/${levelIndex}`,
    message: rationale,
  });
  decision.field_decisions.push({
    canonical_path: `/levels/${levelIndex}`,
    decision: "normalize",
    selected_evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale,
  });
  decision.relationship_decisions = decision.relationship_decisions.filter(
    (item: ValidatedJson) => item.relationship_id !== relationshipId,
  );
  decision.relationship_decisions.push({
    relationship_id: relationshipId,
    decision: "accept",
    evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale,
  });
  writeJson(canonicalPath, record);
  writeJson(decisionPath, decision);
  return true;
}


function applyFoundryLowerLevel(spec: FoundryMembershipReview): boolean {
  const { canonicalPath, decisionPath, record, decision } = loadSpecFiles(spec);
  const levelIndex = record.levels.findIndex((item: ValidatedJson) =>
    item.spell_list_id === spec.targetSpellListId,
  );
  const level = record.levels[levelIndex];
  if (!level) throw new Error(`${spec.spellId} lacks ${spec.targetListName} access.`);
  if (level.level === spec.foundryLevel && level.access_basis === "reviewed_override") return false;
  if (level.level !== spec.canonicalLevel || level.access_basis === "derived") {
    throw new Error(`${spec.spellId} has incompatible ${spec.targetListName} ${level.level} access.`);
  }

  const evidence = foundryEvidence(decision, spec);
  const rationale = foundryRationale(spec, "lower");
  level.level = spec.foundryLevel;
  level.raw = `Reviewed canonical override: ${spec.targetListName} ${spec.foundryLevel}; preserved canonical level ${spec.canonicalLevel}; ${foundryUrl(spec)}.`;
  level.access_basis = "reviewed_override";
  delete level.derivation;
  record.normalization.warnings.push({
    code: "REVIEWED_LOWER_SPELL_LEVEL",
    field_path: `/levels/${levelIndex}`,
    message: rationale,
  });
  decision.field_decisions.push({
    canonical_path: `/levels/${levelIndex}`,
    decision: "normalize",
    selected_evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale,
  });
  writeJson(canonicalPath, record);
  writeJson(decisionPath, decision);
  return true;
}


function applyFoundryLowerRetention(spec: FoundryMembershipReview): boolean {
  const { canonicalPath, decisionPath, record, decision } = loadSpecFiles(spec);
  const levelIndex = record.levels.findIndex((item: ValidatedJson) =>
    item.spell_list_id === spec.targetSpellListId && item.level === spec.canonicalLevel,
  );
  if (levelIndex < 0) {
    throw new Error(`${spec.spellId} lacks ${spec.targetListName} ${spec.canonicalLevel} access.`);
  }
  if (record.normalization.warnings.some((item: ValidatedJson) =>
    item.code === "REVIEWED_LOWER_SPELL_LEVEL" && item.field_path === `/levels/${levelIndex}`,
  )) return false;

  const evidence = foundryEvidence(decision, spec);
  const rationale = foundryRationale(spec, "retain");
  record.normalization.warnings.push({
    code: "REVIEWED_LOWER_SPELL_LEVEL",
    field_path: `/levels/${levelIndex}`,
    message: rationale,
  });
  decision.field_decisions.push({
    canonical_path: `/levels/${levelIndex}`,
    decision: "select_source",
    selected_evidence: evidence.selected,
    considered_observation_ids: evidence.considered,
    rationale,
  });
  writeJson(canonicalPath, record);
  writeJson(decisionPath, decision);
  return true;
}


export function applyReviewedListOverrides(): {
  additions: number;
  exclusions: number;
  foundryAdditions: number;
  foundryExclusions: number;
  lowerLevelChanges: number;
  lowerLevelRetentions: number;
} {
  const additions = reviewedAdditions.filter(applyAddition).length;
  const exclusions = reviewedExclusions.filter(applyExclusion).length;
  const foundryAdditions = [
    ...reviewedFoundryAdditions,
    ...reviewedFoundryUnchainedAdditions,
  ].filter(applyFoundryAddition).length;
  const foundryExclusions = 0;
  const lowerLevelChanges = reviewedFoundryLowerLevels.filter(applyFoundryLowerLevel).length;
  const lowerLevelRetentions = reviewedFoundryLowerRetentions
    .filter(applyFoundryLowerRetention).length;
  validatePackage();
  return {
    additions,
    exclusions,
    foundryAdditions,
    foundryExclusions,
    lowerLevelChanges,
    lowerLevelRetentions,
  };
}


process.stdout.write(`${JSON.stringify(applyReviewedListOverrides(), null, 2)}\n`);
