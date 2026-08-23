# Foundry-only spell-membership evaluation

Audit date: 2026-08-22 (America/Mexico_City)

> Historical snapshot: all 63 missing-membership assertions and 24 competing
> levels below were resolved by reviewed project decisions on 2026-08-23. The
> current zero-gap result is in
> [Reviewed Foundry membership resolution](./39-reviewed-foundry-membership-resolution.md).

Foundry PF1 snapshot: [`1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f`](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/commit/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f)

Machine-readable result: [`data/reports/foundry-membership-audit.json`](../data/reports/foundry-membership-audit.json)

## Result

[C] The audit maps all 3,028 Foundry spell records to local canonical identities. There are no missing identities.

[C] Foundry contains 19,484 class-membership assertions. After the owner, inherited-list, and reviewed-override reconciliation, 63 Foundry assertions name a class that is absent locally, and 24 more propose a different level for a class that is already present locally.

| Category | Rows | Status | Safest action |
| --- | ---: | --- | --- |
| Class-rule-derived memberships | 41 | Resolved | Keep as derived access, separate from printed values. |
| *Monster Summoner's Handbook* compatibility | 7 | Resolved | Keep as narrowly scoped derived access backed by Paizo's explicit compatibility statement. |
| Other Unchained Summoner candidates | 34 | Pending | Inspect the cited publication; otherwise ask for an explicit reviewed override. |
| Hostile Juxtaposition, Greater | 1 | Pending probable rejection | Keep absent unless print or an explicit reviewed override establishes Unchained Summoner 6. |
| Probable Foundry catalog errors | 6 | Pending rejection decision | Record a rejection; do not ingest the rows. |
| Independent publication-review rows | 22 | Pending | Check print or official errata, then ingest as printed or record an explicit override. |

[C] The seven resolved handbook rows are Alter Summoned Monster 2, Final Sacrifice 2, Gird Ally 2, Master's Escape 3, Instant Restoration 4, Master's Mutation 5, and Summon Laborers 6. The base-Summoner printed rows remain intact. The Unchained rows are marked `derived` and cite [Paizo's compatibility statement](https://paizo.com/blog/i-can-call-spirits-from-the-vasty-deep).

## Pending Unchained Summoner candidates — 35

The first 34 rows are compatibility candidates. Hostile Juxtaposition, Greater is separate because the revised list includes the base spell but omits the greater spell. The machine-readable report links every pinned Foundry record and its cited publication page.

### Level 1 — 5

- [Blend with Surroundings](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Blend%20with%20Surroundings)
- [Celestial Healing](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Celestial%20Healing)
- [Murderous Crow](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Murderous%20Crow)
- [Pesh Vigor](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Pesh%20Vigor)
- [Punishing Armor](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Punishing%20Armor)

### Level 2 — 4

- [Evaluator's Lens](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Evaluator%27s%20Lens)
- [Garden of Peril](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Garden%20of%20Peril)
- [Shackle](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Shackle)
- [Venomous Bite](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Venomous%20Bite)

### Level 3 — 7

- [Apport Animal](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Apport%20Animal)
- [Deft Digits](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Deft%20Digits)
- [Fleshwarping Swarm (Drow)](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Fleshwarping%20Swarm)
- [Grasping Tentacles](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Grasping%20Tentacles)
- [Knell of the Depths](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Knell%20of%20the%20Depths)
- [Leshy Swarm](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Leshy%20Swarm)
- [Selective Invisibility](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Selective%20Invisibility)

### Level 4 — 7

- [Blood Tentacles](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Blood%20Tentacles)
- [Celestial Healing, Greater](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Celestial%20Healing%2C%20Greater)
- [Curse of Dragonflies](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Curse%20of%20Dragonflies)
- [Riding Possession](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Riding%20Possession)
- [Sword to Snake](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Sword%20to%20Snake)
- [Thaumaturgic Circle](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Thaumaturgic%20Circle)
- [Wooden Wing Shield](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Wooden%20Wing%20Shield)

### Level 5 — 6

- [Banishing Blade](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Banishing%20Blade)
- [Ether Step](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Ether%20Step)
- [Grand Destiny](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Grand%20Destiny)
- [Grease, Greater](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Grease%2C%20Greater)
- [Mind Swap](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Mind%20Swap)
- [Possession](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Possession)

### Level 6 — 6

- [Baleful Shadow Transmutation](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Baleful%20Shadow%20Transmutation)
- [Dissolution](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Dissolution)
- [Human Potential, Mass](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Human%20Potential%2C%20Mass)
- [Planar Refuge](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Planar%20Refuge)
- [Shadow Transmutation](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Shadow%20Transmutation)
- [Hostile Juxtaposition, Greater](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Hostile%20Juxtaposition%2C%20Greater) — probable rejection

## Probable Foundry catalog errors — 6 rows

| Spell | Foundry-only claims | Why the claim is suspect | Links |
| --- | --- | --- | --- |
| Petulengro's Validation | Arcanist 1; Sorcerer 1; Wizard 1 | [C] AoN and the preserved d20PFSRD transcription list Alchemist 1, Inquisitor 1, and Investigator 1. Foundry's arcane rows lack source-page support. | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Petulengro%27s%20Validation); [d20PFSRD](https://www.d20pfsrd.com/magic/all-spells/p/petulengros-validation/); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/divination/petulengro-s-validation.w7jvuilf20pwx45x.yaml) |
| Seer's Bane | Arcanist 6; Sorcerer 6; Wizard 6 | [C] AoN prints deity-qualified Cleric 6, Inquisitor 6, Oracle 6, and Warpriest 6 access. The unrestricted arcane rows lack corroboration. | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Seer%27s%20Bane); [d20PFSRD](https://www.d20pfsrd.com/magic/all-spells/s/seers-bane/); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/abjuration/seer-s-bane.5ggd0hecvu0una9p.yaml) |

Safest action: reject these six rows unless the cited printed pages prove otherwise. Rejection changes no spell value; it records why the candidate was not ingested.

## Independent publication review — 22 rows across 16 spells

| Spell | Foundry-only claims | Foundry source | Links |
| --- | --- | --- | --- |
| Bleaching Resistance | Spiritualist 4 | PZO9280 p. 218 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Bleaching%20Resistance); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/enchantment/bleaching-resistance.inuj1vmyo9cygt0e.yaml) |
| Cloak of Shadows | Spiritualist 5 | PZO1136 p. 80 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Cloak%20of%20Shadows); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/illusion/cloak-of-shadows.pdf0u992f7pe66yu.yaml) |
| Fable Tapestry | Medium 4 | PZO9280 p. 219 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Fable%20Tapestry); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/illusion/fable-tapestry.ne8s12d98d9df1d2.yaml) |
| Lost Locale | Psychic 9 | PZO9280 p. 220 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Lost%20Locale); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/enchantment/lost-locale.8u47mrsvdw4ssinw.yaml) |
| Lost Passage | Mesmerist 3; Psychic 4 | PZO9280 p. 220 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Lost%20Passage); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/enchantment/lost-passage.1gm2ngzes1xi3zuu.yaml) |
| Mage's Crawl Space | Witch 2 | PZO9479 p. 9 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Mage%27s%20Crawl%20Space); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/transmutation/mage-s-crawl-space.ip70uslfhmjl0vo0.yaml) |
| Miasmal Dread | Mesmerist 3 | PZO9280 p. 221 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Miasmal%20Dread); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/enchantment/miasmal-dread.9jcelzrc91kpr5ew.yaml) |
| Pesh Vigor | Medium 1; Psychic 1 | PZO9462 p. 19; PZO9208 p. 57 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Pesh%20Vigor); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/transmutation/pesh-vigor.l8mfdvp48i7du08y.yaml) |
| Pressure Adaptation | Paladin 3 | PZO92102 p. 61 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Pressure%20Adaptation); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/abjuration/pressure-adaptation.wvvk67okw1sueisy.yaml) |
| Probe History | Medium 2; Mesmerist 3; Occultist 3 | PZO9280 p. 222 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Probe%20History); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/divination/probe-history.frxwocsreolvb4tk.yaml) |
| Shadow of Doubt | Mesmerist 4; Psychic 6; Spiritualist 4 | PZO9280 p. 222 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Shadow%20of%20Doubt); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/enchantment/shadow-of-doubt.rh2v2fq3q6l7u7f1.yaml) |
| Shadowfade | Magus 1 | PZO9479 p. 9 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Shadowfade); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/illusion/shadowfade.5w68w4yw2oivz7b3.yaml) |
| Shield Speech, Greater | Skald 4 | PZO9405 p. 25 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Shield%20Speech%2C%20Greater); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/abjuration/shield-speech-greater.7y0xvorQBvCtjoYn.yaml) |
| Stabilize Pressure | Paladin 2 | PZO92102 p. 61 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Stabilize%20Pressure); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/abjuration/stabilize-pressure.u46fk0bmnnkarvcm.yaml) |
| Vermin Shape II | Bloodrager 4 | PZO1117 p. 246; PZO9226 p. 297; PZO9225 p. 49 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Vermin%20Shape%20II); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/transmutation/vermin-shape-ii.j8fufy7sr3bty5du.yaml) |
| Waters of Lamashtu | Shaman 3 | PZO1139 p. 186; PZO9005 p. 71; PZO9202 p. 25; PZO9226 p. 297 | [AoN](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Waters%20of%20Lamashtu); [Foundry](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f/packs/spells/conjuration/waters-of-lamashtu.yzxabopbmjm1uyw5.yaml) |

[P] Review PZO9280 first because it accounts for 12 of these 22 rows, then PZO92102 and PZO9479. A page image or exact printed list can distinguish an AoN transcription omission from a Foundry catalog expansion.

## Competing levels — 24 rows

These are not missing memberships. The class already exists locally at another level. Under the approved authority order, the canonical AoN or source-backed derived level remains unchanged. The machine-readable report records Foundry's proposed level, the canonical level and basis, the Foundry source page, and links for all 24 rows.

Safest action: treat each as a catalog mismatch unless the printed publication or official errata contradicts the canonical value. Never add both levels merely to make catalogs agree.
