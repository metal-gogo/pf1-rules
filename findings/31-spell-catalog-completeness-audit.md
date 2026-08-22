# Spell catalog completeness audit

Audit date: 2026-08-21 (America/Mexico_City)

Post-audit update: the 12 canonical spells with blank printed Range values now
have explicit reviewed overrides. See
[Reviewed decisions for spells with a blank printed Range](32-reviewed-missing-range-decisions.md).

Post-audit scope update: all 23 legacy first-party 3.5 spells and their 115
class/level memberships are now ingested with explicit legacy markers. The
canonical spell count is 3,024. The 273 apparent Red Mantis Assassin gaps were
then reconciled as compact-label normalization failures, leaving zero AoN
catalog membership gaps. See
[Legacy first-party 3.5 spell ingestion](33-legacy-35-scope-ingestion.md).

Post-audit catalog update: all 25 d20PFSRD-only candidate memberships are now
resolved under the reviewed AoN/Foundry PF1/d20PFSRD authority workflow. Fourteen
genuinely additional class memberships were added; eleven competing-level claims
were resolved without adding duplicate levels. See
[Reviewed secondary-catalog membership decisions](35-reviewed-catalog-membership-decisions.md).

Post-audit Foundry update: a pinned full-pack comparison found six AoN identities
that the class-catalog discovery path could not see and 175 remaining Foundry
class assertions. The six identities and 38 d20PFSRD-corroborated memberships are
now canonical; 25 competing levels retain AoN; 112 Foundry-only membership
candidates remain pending review. The canonical spell count is now 3,030. See
[Foundry spell catalog reconciliation](36-foundry-spell-catalog-reconciliation.md).

## Outcome

[C] The validated local database now has **3,024 canonical spells**. The audit compared **21,602 captured AoN class/level memberships** across all 30 project class lists and spell levels 0 through 9 with the canonical `spell_levels` table. The database has 21,595 nonblank summary observations because Contact Nalfeshnee has seven memberships with blank catalog summaries; those seven memberships are still validated and canonical.

[C] The initial database had 456 missing AoN membership rows involving 308 names: 68 membership rows for 12 source-blocked spells, 115 rows for 23 deliberate legacy-3.5 exclusions, and 273 apparent Red Mantis Assassin catalog/detail disagreements. The safe ingestion fix added all 12 source-blocked spells without inventing Range values. The later scope approval added the legacy records. A final evidence replay proved that all 273 spell pages print the same Red Mantis level as the catalog under the compact token `redmantisassassin`; normalizing that token to `spell-list.red-mantis-assassin` leaves **zero AoN membership gaps**.

[C] d20PFSRD exposes 20 catalog pages covering 22 of the 30 AoN class lists; it has no separate catalog for Adept, Arcanist, Hunter, Investigator, Red Mantis Assassin, Sahir-Afiyun, Skald, or Warpriest. A live comparison parsed 13,096 d20PFSRD membership rows. Exact spell-name and spell-URL matches were checked against the d20PFSRD spell page's printed level field. This produced 25 d20PFSRD memberships (20 unique spells) that are absent from both AoN and canonical levels.

## Classification and safest action

| Category | Initial unique spells | Current unique spells | Safest action |
| --- | ---: | ---: | --- |
| Source failure | 12 | 0 | [C] Ingest with Range `unknown`, raw `null`, `MISSING_PRINTED_RANGE`, source-field provenance, and `needs_review`. Do not derive Range from Target, Effect, or prose. |
| Normalization failure | 0 | 0 | [C] No action. Keep replay validation in place. |
| Deliberate scope exclusion | 23 | 0 | [C] Resolved after explicit scope approval. Canonical records and memberships carry legacy 3.5 markers and remain distinguishable from Pathfinder-native material. |
| AoN catalog mismatch | 273 | 0 | [C] Resolved as a normalization failure after replaying the spell-page evidence. The approved policy allows catalog precedence, but none of these 273 rows needed a catalog-only override. Keep catalog summaries separate from the spell-page raw level text. |
| d20PFSRD catalog mismatch | 20 | 0 | [C] Resolved under the reviewed authority workflow: add genuine class-union memberships, keep applicable AoN levels when the same class conflicts, and retain explicit reviewed exceptions. |

## Current AoN gap count matrix

The cells show remaining membership gaps by class and level. Zero means the local canonical table covers every AoN catalog membership at that class/level.

| Class | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Adept | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Alchemist | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Antipaladin | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Arcanist | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Bard | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Bloodrager | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Cleric | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Druid | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Hunter | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Inquisitor | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Investigator | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Magus | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Mesmerist | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Occultist | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Oracle | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Paladin | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Psychic | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Ranger | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Red Mantis Assassin | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Sahir-Afiyun | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Shaman | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Skald | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Sorcerer | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Spiritualist | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Summoner | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Summoner (Unchained) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Warpriest | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Witch | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Wizard | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Fixed source failures

[C] These spells are now canonical. AoN and d20PFSRD both omit a printed Range for the captured spell page. At audit completion, each canonical record used an unknown Range and remained `needs_review`; none used a reviewed override. The subsequent explicit decisions linked above replaced those unknown canonical values with reviewed overrides while preserving every missing printed Range as raw `null`.

- **Antipaladin 1 (1):** Conditional Favor.
- **Arcanist 2 (2):** Aura of Distraction; Stone Throwing.
- **Arcanist 5 (2):** Burst of Force; Hammer of Mending.
- **Arcanist 9 (1):** Massacre.
- **Bard 2 (1):** Conditional Favor.
- **Bard 5 (1):** Frozen Note.
- **Bloodrager 1 (1):** Stone Throwing.
- **Cleric 2 (2):** Conditional Favor; Stone Throwing.
- **Cleric 3 (1):** Damnation.
- **Cleric 4 (1):** Healing Flames.
- **Cleric 5 (1):** Ban Corruption.
- **Cleric 6 (1):** Hammer of Mending.
- **Cleric 9 (1):** Massacre.
- **Druid 2 (1):** Stone Throwing.
- **Hunter 1 (1):** Stone Throwing.
- **Inquisitor 2 (1):** Conditional Favor.
- **Inquisitor 3 (1):** Damnation.
- **Inquisitor 4 (2):** Ban Corruption; Healing Flames.
- **Magus 2 (1):** Stone Throwing.
- **Medium 3 (1):** Ban Corruption.
- **Mesmerist 2 (1):** Conditional Favor.
- **Occultist 2 (1):** Conditional Favor.
- **Occultist 4 (1):** Ban Corruption.
- **Oracle 2 (2):** Conditional Favor; Stone Throwing.
- **Oracle 3 (1):** Damnation.
- **Oracle 4 (1):** Healing Flames.
- **Oracle 5 (1):** Ban Corruption.
- **Oracle 6 (1):** Hammer of Mending.
- **Oracle 9 (1):** Massacre.
- **Paladin 1 (1):** Conditional Favor.
- **Paladin 3 (1):** Damnation.
- **Paladin 4 (3):** Ban Corruption; Blaze of Glory; Healing Flames.
- **Psychic 2 (1):** Aura of Distraction.
- **Psychic 5 (1):** Burst of Force.
- **Psychic 9 (2):** Massacre; Telekinetic Storm.
- **Ranger 1 (1):** Stone Throwing.
- **Shaman 5 (1):** Ban Corruption.
- **Skald 2 (1):** Conditional Favor.
- **Skald 5 (1):** Frozen Note.
- **Sorcerer 2 (2):** Aura of Distraction; Stone Throwing.
- **Sorcerer 5 (2):** Burst of Force; Hammer of Mending.
- **Sorcerer 9 (1):** Massacre.
- **Summoner 5 (1):** Hammer of Mending.
- **Summoner (Unchained) 5 (1):** Hammer of Mending.
- **Warpriest 2 (2):** Conditional Favor; Stone Throwing.
- **Warpriest 3 (1):** Damnation.
- **Warpriest 4 (1):** Healing Flames.
- **Warpriest 5 (1):** Ban Corruption.
- **Warpriest 6 (1):** Hammer of Mending.
- **Witch 2 (2):** Aura of Distraction; Conditional Favor.
- **Witch 9 (1):** Massacre.
- **Wizard 2 (2):** Aura of Distraction; Stone Throwing.
- **Wizard 5 (2):** Burst of Force; Hammer of Mending.
- **Wizard 9 (1):** Massacre.

## Resolved deliberate scope exclusions

[C] AoN marks every spell below as legacy 3.5 material. These memberships were excluded at audit time and are now canonical after explicit scope approval, with legacy markers described in finding 33. Names repeat when the same spell appears on multiple class lists or at different levels.

- **Arcanist 1 (2):** Pattern Recognition; Shield Speech.
- **Arcanist 2 (3):** Admonishing Ray; Reveal True Shape; Veil of Ash.
- **Arcanist 3 (3):** Blacklight; Diamond Spray; Impede Speech.
- **Arcanist 4 (3):** Hurricane Blast; Shield Speech, Greater; Water Shield.
- **Arcanist 5 (1):** Apparent Master.
- **Arcanist 6 (3):** Flesh to Ooze; Hardening; Torrent of Elemental Rage.
- **Bard 1 (1):** Shield Speech.
- **Bard 2 (3):** Drunkard's Breath; Impede Speech; Reveal True Shape.
- **Bard 4 (1):** Apparent Master.
- **Cleric 0 (2):** Enhanced Diplomacy; Sign of the Dawnflower.
- **Cleric 1 (1):** Shield Speech.
- **Cleric 2 (4):** Admonishing Ray; Drunkard's Breath; Reveal True Shape; Sympathetic Wounds.
- **Cleric 3 (1):** Sand Whirlwind.
- **Cleric 4 (3):** Shield Speech, Greater; Traveling Dream; Water Shield.
- **Cleric 5 (1):** Sand Whirlwind, Greater.
- **Druid 0 (2):** Enhanced Diplomacy; Sign of the Dawnflower.
- **Druid 1 (1):** Shield Speech.
- **Druid 2 (2):** Reveal True Shape; Sympathetic Wounds.
- **Druid 3 (2):** Hurricane Blast; Water Shield.
- **Druid 4 (3):** Shield Speech, Greater; Thorn Snare; Traveling Dream.
- **Hunter 0 (2):** Enhanced Diplomacy; Sign of the Dawnflower.
- **Hunter 1 (1):** Shield Speech.
- **Hunter 2 (2):** Reveal True Shape; Sympathetic Wounds.
- **Hunter 3 (3):** Hurricane Blast; Thorn Snare; Water Shield.
- **Hunter 4 (2):** Shield Speech, Greater; Traveling Dream.
- **Oracle 0 (2):** Enhanced Diplomacy; Sign of the Dawnflower.
- **Oracle 1 (1):** Shield Speech.
- **Oracle 2 (4):** Admonishing Ray; Drunkard's Breath; Reveal True Shape; Sympathetic Wounds.
- **Oracle 3 (1):** Sand Whirlwind.
- **Oracle 4 (3):** Shield Speech, Greater; Traveling Dream; Water Shield.
- **Oracle 5 (1):** Sand Whirlwind, Greater.
- **Paladin 1 (1):** Sign of the Dawnflower.
- **Ranger 1 (1):** Sign of the Dawnflower.
- **Ranger 3 (1):** Thorn Snare.
- **Red Mantis Assassin 1 (1):** Pattern Recognition.
- **Skald 1 (1):** Shield Speech.
- **Skald 2 (3):** Drunkard's Breath; Impede Speech; Reveal True Shape.
- **Skald 4 (1):** Apparent Master.
- **Sorcerer 1 (2):** Pattern Recognition; Shield Speech.
- **Sorcerer 2 (3):** Admonishing Ray; Reveal True Shape; Veil of Ash.
- **Sorcerer 3 (3):** Blacklight; Diamond Spray; Impede Speech.
- **Sorcerer 4 (3):** Hurricane Blast; Shield Speech, Greater; Water Shield.
- **Sorcerer 5 (1):** Apparent Master.
- **Sorcerer 6 (3):** Flesh to Ooze; Hardening; Torrent of Elemental Rage.
- **Warpriest 0 (2):** Enhanced Diplomacy; Sign of the Dawnflower.
- **Warpriest 1 (1):** Shield Speech.
- **Warpriest 2 (4):** Admonishing Ray; Drunkard's Breath; Reveal True Shape; Sympathetic Wounds.
- **Warpriest 3 (1):** Sand Whirlwind.
- **Warpriest 4 (3):** Shield Speech, Greater; Traveling Dream; Water Shield.
- **Warpriest 5 (1):** Sand Whirlwind, Greater.
- **Wizard 1 (2):** Pattern Recognition; Shield Speech.
- **Wizard 2 (3):** Admonishing Ray; Reveal True Shape; Veil of Ash.
- **Wizard 3 (3):** Blacklight; Diamond Spray; Impede Speech.
- **Wizard 4 (3):** Hurricane Blast; Shield Speech, Greater; Water Shield.
- **Wizard 5 (1):** Apparent Master.
- **Wizard 6 (3):** Flesh to Ooze; Hardening; Torrent of Elemental Rage.

## Resolved Red Mantis normalization gaps

[C] Every apparent mismatch below was on the Red Mantis Assassin catalog. A direct replay showed that each spell detail page prints the same level using AoN's compact `redmantisassassin` token. The older canonical records converted that token into the separate ID `spell-list.redmantisassassin`, while the catalog correctly used `spell-list.red-mantis-assassin`. The reconciliation merged the IDs, preserved the compact text in each level's `raw` field, retained the catalog observations separately, and did not infer any level.

- **Red Mantis Assassin 1 (74):** Alchemical Tinkering; Alter Musical Instrument; Alter Winds; Animate Rope; Ant Haul; Blend; Blood Money; Blurred Movement; Body Capacitance; Break; Burning Disarm; Chastise; Clarion Call; Color Spray; Crafter's Curse; Crafter's Fortune; Damp Powder; Dancing Lantern; Dazzling Blade; Disguise Self; Disguise Weapon; Emblazon Crest; Enlarge Person; Enlarge Tail; Erase; Expeditious Excavation; Expeditious Retreat; Fabricate Bullets; Face of the Devourer; Feather Fall; Forced Quiet; Gravity Bow; Illusion of Calm; Jump; Jury-Rig; Liberating Command; Lighten Object; Long Arm; Longshot; Lose the Trail; Lucky Number; Magic Aura; Magic Weapon; Marid's Mastery; Mirror Polish; Mirror Strike; Monkey Fish; Negative Reaction; Peasant Armaments; Poisoned Egg; Polypurpose Panacea; Recharge Innate Magic; Reduce Person; Refine Improvised Weapon; Reinforce Armaments; Serren's Swift Girding; Shadow Weapon; Silent Image; Snapdragon Fireworks; Stone Fist; Strong Wings; Sundering Shards; Touch of Gracelessness; Touch of the Sea; Transfer Tattoo; Tripvine; Unerring Weapon; Urban Grace; Vanish; Ventriloquism; Vocal Alteration; Weaken Powder; Windy Escape; Youthful Appearance.
- **Red Mantis Assassin 2 (76):** Aboleth's Lung; Accelerate Poison; Adhesive Blood; Air Step; Alter Self; Angelic Aspect, Lesser; Animal Aspect; Ant Haul, Communal; Badger's Ferocity; Bear's Endurance; Blood Armor; Blood Blaze; Blur; Boiling Blood; Brittle Portal; Bull's Strength; Buoyancy; Carry Companion; Cat's Grace; Certain Grip; Darkvision; Destabilize Powder; Disfiguring Touch; Disguise Other; Dragonvoice; Eagle's Splendor; Eldritch Conduit; Extreme Flexibility; Familiar Figment; Fleshcurdle; Fox's Cunning; Ghostly Disguise; Glide; Haunting Mists; Hypnotic Pattern; Invisibility; Jitterbugs; Kinetic Reverberation; Knock; Levitate; Mad Hallucination; Magic Mouth; Magic Siege Engine; Make Whole; Masterwork Transformation; Minor Image; Mirror Hideaway; Mirror Image; Misdirection; Owl's Wisdom; Phantom Trap; Pyrotechnics; Raiment of Command; Recoil Fire; Reinforce Armaments, Communal; Rope Trick; Rovagug's Fury; Sculpt Simulacrum; Shadow Anchor; Silent Table; Silk To Steel; Snow Shape (Ulfen); Spider Climb; Squeeze; Stabilize Powder; Staggering Fall; Steal Breath; Symbol of Mirroring; Tattoo Potion; Telekinetic Assembly; Thunder Fire; Time Shudder; Transmute Wine to Blood; Twilight Haze; Twisted Space; Whispering Wind.
- **Red Mantis Assassin 3 (73):** Adjustable Disguise; Ancestral Regression; Anchored Step; Anthropomorphic Animal; Ape Walk; Arcane Reinforcement; Beast Shape I; Blast Barrier; Blink; Blood Scent; Blood Sentinel; Blot; Burrow; Cauterizing Weapon; Countless Eyes; Darkvision, Communal; Dazzling Blade, Mass; Devolution; Disable Construct; Displacement; Display Aversion; Dream; Enter Image; Erode Defenses; Eruptive Pustules; Excruciating Deformation; Fearsome Duplicate; Fins to Feet; Fire Trail; Flame Arrow; Flash Fire; Fly; Fractions of Heal and Harm; Gaseous Form; Haste; Heart of the Metal; Hostile Levitation; Illusory Poison; Illusory Script; Improve Trap; Invisibility Sphere; Keen Edge; Loathsome Veil; Magic Weapon, Greater; Major Image; Minor Dream; Monstrous Extremities; Monstrous Physique I; Paragon Surge; Polymorph Familiar; Prehensile Pilfer; Pup Shape; Raging Rubble; Resinous Skin; Restore Mythic Power; Rune of Durability; Secret Page; Serren's Armor Lock; Share Glory; Shifting Sand; Shrink Item; Slow; Spider Climb, Communal; Steal Years; Stolen Light; Strangling Hair; Touch Injection; Twine Double; Undead Anatomy I; Versatile Weapon; Vision of Hell; Wall of Nausea; Water Breathing.
- **Red Mantis Assassin 4 (50):** Absorbing Inhalation; Abyssal Vermin; Adjustable Polymorph; Age Resistance, Lesser; Animal Aspect, Greater; Baphomet's Blessing; Beast Shape II; Calcific Touch; Cloud Shape; Create Holds; Curse of Burning Sleep; Darkvision, Greater; Earth Glide; Elemental Body I; Enlarge Person, Mass; Eyes of the Void; Film of Filth; Firefall; Hallucinatory Terrain; Hellmouth Lash; Illusory Wall; Imbue with Flight; Invisibility, Greater; Magic Siege Engine, Greater; Make Whole, Greater; Malfunction; Miasmatic Form; Minor Phantom Object; Mirror Transport; Monstrous Physique II; Obsidian Flow; Phantasmal Killer; Rainbow Pattern; Reduce Person, Mass; Renovation; Resilient Reservoir; Ride The Waves; Scorching Ash Form; Shadow Barbs; Shadow Conjuration; Shadow Dragon Aspect; Shadow Step; Shadowy Haven; Share Shape; Shocking Image; Simulacrum, Lesser; Stone Shape; Symbol of Slowing; Vermin Shape I; Wandering Star Motes.

## Resolved d20PFSRD-only printed memberships

[C] The list below is the original candidate set. It is retained as historical
audit evidence; none of these memberships is still pending. Finding 35 records
which memberships were added and which conflicting levels were rejected.

- **Bard 5 (1):** Covetous Aura.
- **Bloodrager 1 (1):** Expeditious Excavation.
- **Cleric 5 (1):** Vinetrap.
- **Druid 5 (1):** Vinetrap.
- **Inquisitor 2 (1):** Improve Trap.
- **Mesmerist 3 (1):** Alpha Instinct.
- **Mesmerist 4 (1):** Horrific Doubles.
- **Mesmerist 5 (1):** Death Pact.
- **Oracle 5 (1):** Vinetrap.
- **Paladin 3 (1):** Positive Pulse, Greater.
- **Psychic 4 (1):** Horrific Doubles.
- **Psychic 6 (1):** Death Pact.
- **Ranger 2 (1):** Greensight.
- **Ranger 3 (2):** Pocketful of Vipers; Soothing Word.
- **Shaman 9 (1):** Massacre.
- **Sorcerer 3 (2):** Healing Leak; See Beyond.
- **Spiritualist 5 (1):** Wither Limb.
- **Summoner 2 (1):** Shackle.
- **Summoner 3 (1):** Positive Pulse, Greater.
- **Summoner 5 (1):** Ether Step.
- **Witch 3 (1):** Pack Empathy.
- **Witch 5 (1):** Deceitful Veneer.
- **Witch 9 (1):** Impenetrable Veil.

## Evidence and limitations

- [C] AoN class catalogs: https://www.aonprd.com/Spells.aspx?Class=All and the 30 captured class URLs stored in `data/ingestion/level-0-spells.json` through `level-9-spells.json`.
- [C] d20PFSRD catalog index: https://www.d20pfsrd.com/magic/spell-lists-and-domains/.
- [C] Local validation: `pnpm verify` passed after reconciliation with 55 unit/integration tests and 10 browser tests.
- [S] d20PFSRD class pages contain internal catalog/detail disagreements and grouped-page links. The audit counts a d20PFSRD-only membership only when the class row maps by exact normalized spell name and URL to a captured d20PFSRD observation and that observation's printed level field independently confirms the same class/level.
- [C] No source value was inferred, no reviewed canonical override was added, and the existing Abundant Ammunition reviewed override remains separately labeled `REVIEWED_RANGE_OVERRIDE` with `manually_resolved` provenance.
