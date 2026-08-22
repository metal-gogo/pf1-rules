# Spell-list owners and inherited-list audit

Audit date: 2026-08-22 (America/Mexico_City)

This document is the decision backlog for the remaining Foundry-only memberships and the broader spell-list ownership work. It supplements [the pinned Foundry reconciliation](./36-foundry-spell-catalog-reconciliation.md); it does not replace the field-level source evidence in that report.

## Modeling requirement

[C] A spell-list row and the rule option that grants access to that row are different concepts. The database currently models most names as `spell_list` entities, which causes domains, bloodlines, mysteries, patrons, spirits, and the Sahir-Afiyun feat to look like classes.

The target model must preserve three independent facts:

1. The printed spell or formula-list membership and level.
2. The owning rules concept, such as a class, domain, mystery, bloodline, patron, spirit, or feat.
3. The basis of access: printed membership, a reviewed canonical override, or a value derived from an explicit class rule.

Derived memberships must not be presented as printed spell-page values. Reviewed overrides must remain distinguishable from both printed and derived values.

## Current inventory

| List | Canonical spells | Current interpretation |
| --- | ---: | --- |
| Adept | 76 | Spell data is present, but Adept lacks an explicit NPC-class owner concept. |
| Cleric | 1,133 | Printed class-list rows. |
| Inquisitor | 656 | Printed class-list rows. |
| Omdura | 0 | Missing. The derived union would currently contain 1,238 spells. |
| Oracle | 1,130 | Includes explicit Oracle rows and mystery-qualified rows that need separate ownership. |
| Sorcerer | 1,887 | Not expected to equal Wizard because Wizard-only spells exist. |
| Wizard | 1,897 | Contains 10 rows not currently on Sorcerer. |
| Arcanist | 1,892 | Missing five memberships implied by the sorcerer/wizard source list. |
| Alchemist | 408 | Formula list. |
| Investigator | 402 | Missing seven Alchemist-derived memberships; one explicit Investigator-only row exists. |
| Bard | 868 | Printed class-list rows. |
| Skald | 850 | Missing 19 Bard-derived memberships; one explicit Skald-only row exists. |
| Warpriest | 982 | Missing six Cleric-derived memberships of level 6 or lower; three explicit Warpriest-only rows exist. |
| Sahirafiyun | 17 | Incorrectly represented as a class spell list; the source is the Sahir-Afiyun feat. |

The Omdura union uses the lower eligible level from Cleric or Inquisitor and excludes Cleric levels 7–9. With the current canonical input, it contains 1,238 spells: 26 at level 0, 212 at level 1, 283 at level 2, 257 at level 3, 211 at level 4, 132 at level 5, and 117 at level 6.

## Source-backed class rules

- [Omdura](https://www.d20pfsrd.com/classes/base-classes/omdura/) uses Cleric spells through level 6 and all Inquisitor spells, taking the lower level when both lists contain the spell. [P] Archives of Nethys and Foundry do not currently expose this class, so the d20PFSRD transcription and the printed *Niobe* supplement are the available rule sources.
- [Adept](https://legacy.aonprd.com/corerulebook/nPCClasses.html) is an NPC class with its own printed list. [C] Its 76 local rows are already ingested.
- [Sahir-Afiyun](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Sahir-Afiyun) is a feat. [C] Its 17 named spells are selectable additions to one chosen class list; they are not a standalone caster class.
- [Oracle](https://legacy.aonprd.com/advancedPlayersGuide/baseClasses/oracle.html) draws spells from the Cleric lists.
- [Arcanist](https://legacy.aonprd.com/advancedClassGuide/classes/arcanist.html) draws spells from the Sorcerer/Wizard list.
- [Investigator](https://legacy.aonprd.com/advancedclassguide/classes/investigator.html) uses the Alchemist formula list.
- [Skald](https://legacy.aonprd.com/advancedClassGuide/classes/skald.html) draws spells from the Bard list.
- [Warpriest](https://legacy.aonprd.com/advancedClassGuide/classes/warpriest.html) draws Cleric spells through level 6.

## Inherited-list discrepancies

These sets compare current canonical identities, not raw row counts. Explicit class-specific rows are not automatically errors.

### Cleric to Oracle

[C] Twelve Cleric spells are absent from Oracle:

- Alleviate Corruption
- Detect the Faithful
- Enlightened Step
- Firewalker's Meditation
- Rite of Bodily Purity
- Rite of Centered Mind
- Roaming Pit
- See Beyond
- Spirit Bonds
- Talisman of Reprieve
- Visualization of the Body
- Visualization of the Mind

Nine Oracle rows are absent from Cleric and require ownership review rather than automatic deletion: Borrow Fortune, Divine Vessel, Embrace Destiny, Find Fault, Fireball, Foretell Failure, Jungle Mind, Oracle's Burden, and Oracle's Vessel. Mystery-granted access must move to mystery ownership instead of becoming general Oracle class membership.

### Sorcerer and Wizard

[C] Wizard has 10 rows not present on Sorcerer: Blood Transcription, Deceitful Veneer, Firewalker's Meditation, Mage's Lucubration, Mnemonic Enhancer, Rite of Centered Mind, Spirit Bonds, Temporal Regression, Visualization of the Body, and Visualization of the Mind. Sorcerer has no rows absent from Wizard.

[C] Equal Sorcerer and Wizard counts are not a valid invariant. Mage's Lucubration and Mnemonic Enhancer are intentional Wizard-only spell values. The remaining eight rows need publication review before any Sorcerer membership is added. Arcanist access is a separate question because the Arcanist class explicitly draws from the combined Sorcerer/Wizard list.

### Sorcerer/Wizard to Arcanist

[C] Five memberships implied by the source lists are absent from Arcanist: Deceitful Veneer 5, Mage's Lucubration 6, Mnemonic Enhancer 4, Passing Fancy, Mass 5, and Twisted Innards 3.

### Alchemist to Investigator

[C] Seven Alchemist formulas are absent from Investigator: Apsu's Shining Scales, Earsend, Form of the Alien Dragon I, Purify Body, Qlippoth Appearance, Radiation Ward, and Skin Tag.

[C] Defensive Grace is an explicit Investigator row absent from Alchemist. It must not be deleted merely to equalize list counts.

### Bard to Skald

[C] Nineteen Bard spells are absent from Skald: Brightest Light, Compelling Rant, Covetous Aura, Crafter's Nightmare, Crime Wave, Flexile Curse, Haunting Reminder, Hold Fey, Horrific Doubles, Instant Fake, Mage's Crawl Space, Nature's Paths, Neutral Buoyancy, Obscured Script, Sleepwalking Suggestion, Symbol of Distraction, Tough Crowd, Triggered Hallucination, and Unsettling Presence.

[C] Languid Venom is an explicit Skald row absent from Bard. It must remain until its publication evidence is reviewed.

### Cleric to Warpriest

[C] Six Cleric spells of level 6 or lower are absent from Warpriest: Barbed Chains, Besmara's Grasping Depths, Poisonous Balm, Sense Fear, Spellcurse, and Toxic Blood. Besmara's Grasping Depths derives as Warpriest 6; Foundry's proposed Warpriest 5 is inconsistent with the Cleric source level.

[C] Extreme Buoyancy, Pack Empathy, and Realm Retribution are explicit Warpriest rows absent from Cleric. They require publication review rather than deletion.

## Foundry-only decision backlog

The 112 unresolved Foundry-only rows remain divided as follows:

| Category | Rows | Planned action |
| --- | ---: | --- |
| Memberships implied by class rules | 40 | Address through the general derived-membership model. Do not label them as printed Foundry values. |
| Unchained Summoner entries from *Monster Summoner's Handbook* | 7 | Candidate reviewed compatibility overrides based on Paizo's statement that the book supports both Summoners. |
| Other later Unchained Summoner candidates | 34 | Await an explicit compatibility-policy decision. |
| Hostile Juxtaposition, Greater for Unchained Summoner | 1 | Probable rejection because the revised printed list keeps the base spell but omits the greater spell. |
| Probable Foundry catalog errors | 6 | Reject or correct after recording the reviewed decision. |
| Independent publication-review rows | 24 | Inspect print or errata; otherwise decide individually as reviewed overrides. |

The complete names and Foundry links are in [the Foundry reconciliation](./36-foundry-spell-catalog-reconciliation.md).

## Planned ingestion sequence

1. Add explicit owner entity types and routes for classes, NPC classes, domains, subdomains, mysteries, bloodlines, patrons, spirits, and feats.
2. Add a source-backed derivation representation that records the source list, rule, level policy, and evidence separately from printed spell-page values.
3. Derive Omdura, Oracle, Arcanist, Investigator, Skald, and Warpriest memberships without overwriting explicit printed levels.
4. Reclassify Sahir-Afiyun access from a class list to a feat-owned selectable spell set.
5. Ingest the complete domain/subdomain, mystery, bloodline, patron, and spirit catalogs and link each spell to its owner page.
6. Add NPC-class navigation and verify the Adept list against the printed Core Rulebook list.
7. Re-run the Foundry reconciliation against the resulting effective lists before making the remaining override decisions.

## Safety rules

- Do not infer a printed spell-page value from a class inheritance rule.
- Do not replace an explicit printed class level with a derived level.
- Do not treat Foundry or d20PFSRD as proof when they are the only source for a disputed value.
- Record every approved non-printed value as a reviewed canonical override.
- Keep unresolved source conflicts visible in the decision backlog.
