# Rich-text rollout status

This tracker covers the conversion of all canonical spell descriptions to the
version `0.2.0` rich-text contract. A converted record preserves source wording,
stores semantic structure and accepted relationship links, and passes the
validation rules in [Rich-text spell descriptions](rich-text.md).

## Current status

Audit date: 2026-08-23.

| Category | Spells | Meaning |
| --- | ---: | --- |
| Total canonical spells | 3,030 | Complete corpus |
| Rich text stored | 462 | 11-spell pilot, eighteen reviewed 25-spell rollout batches, and one reviewed warning record |
| Safe candidates with links | 1,795 | Source text matches, parsing is lossless, and known accepted relationships produce no warning |
| Safe structure-only candidates | 310 | Source text matches, but no known relationship currently produces an inline link |
| Source mismatch | 291 | Current canonical text and the newly bounded AoN description differ |
| Link warnings | 172 | At least one accepted relationship is ambiguous or unmatched |
| Missing AoN baseline | 0 | No current blocker |
| Parser errors | 0 | No current blocker |

“Safe candidate” is an automation gate, not final semantic approval. Each batch
still requires review for incorrect source relationships, duplicate entity IDs,
and terms whose ordinary meaning differs from the linked rules entity.

Run the live audit with:

```bash
pnpm audit:rich-text
```

## Completed batches

### Pilot

The 11 reviewed pilot spells are listed in
[Rich-text spell descriptions](rich-text.md#pilot-scope).

### Batch 1

The first rollout batch contains:

- Abeyance; Abjuring Step; Aboleth's Lung; Absolution.
- Absorb Rune I, II, and III; Absorb Toxicity; Absorbing Barrier; Absorbing
  Inhalation; Absorbing Touch.
- Abyssal Vermin; Accept Affliction; Accursed Glare.
- Acid Arrow; Acid Fog; Acid Maw; Acid Pit; Acidic Spray.
- Acute Senses; Adhesive Blood; Adhesive Spittle.
- Adjustable Disguise; Adjustable Polymorph; Adoration.

Review of this batch established three additional normalization rules:

- Same-page spell anchors are navigation artifacts, not spell relationships;
  they are removed rather than linked back to the current page.
- A `void(0)` source href is not relationship evidence. Such relationships are
  rejected and their decisions record the reason.
- `rule.fortitude`, `rule.reflex`, and `rule.will` resolve to the canonical
  grouped saving-throw entities and anchors.

### Batch 2

The second rollout batch contains:

- Accelerate Poison; Adroit Retrieval; Advanced Scurvy; Aerial Tracks.
- Age Resistance and its Greater and Lesser variants; Aggravate Affliction.
- Aggressive Thundercloud and its Greater variant; Agonize; Agonizing Rebuke;
  Aid.
- Air Breathing; Air Bubble; Air Geyser; Air of Authority; Air Step; Air Walk;
  Air Walk, Communal.
- Akashic Communion; Alarm; Alchemical Allocation; Alchemical Tinkering;
  Align Weapon.

Review of this batch established these normalization rules:

- Hyperlink evidence contributes its exact anchor phrase. This preserves valid
  singular and plural wording after entity aliases merge.
- Capitalized single-word rules names match case exactly. For example,
  `Knowledge` links to the skill, while ordinary lowercase `knowledge` does
  not.
- `rule.affliction` resolves to `rule.afflictions`; `condition.fatigue`
  resolves to `condition.fatigued`; and `rule.fort` resolves to the canonical
  Fortitude saving-throw entity.
- A source `rule.candle` target resolves to the equipment entity `item.candle`.

Semantic review rejected links where the source anchor used the same spelling
for a different concept. The rejected cases include natural healing versus
natural armor, conjuration healing versus ordinary healing, supernatural
swiftness versus supernatural abilities, dying of old age versus the Dying
condition, ordinary air versus the air subtype, an ordinary use of “stable”
versus the Stable condition, a touch verb versus touch attacks, and an
extraplanar repository versus the extraplanar creature subtype. Align Weapon's
misclassified `publication.will` relationship was also rejected because its
source href is the Will saving-throw rule.

### Batch 3

The third rollout batch contains:

- Align Weapon, Communal; Allegro; Alleviate Corruption; Allfood; Allied Cloak;
  Alluring Light; Alluring Spores; Ally Across Time; Alpha Instinct.
- Alter River; Alter Self; Alter Summoned Monster; Alter Winds; Amnesia; Amplify
  Elixir; Analyze Aura; Analyze Dweomer.
- Ancestral Communion; Ancestral Gift; Ancestral Memory; Ancestral Regression;
  Anchored Step; Angelic Aspect, Greater; Animal Ambassador; Animal Aspect,
  Greater.

Review of this batch established these normalization rules:

- Singular and abbreviated rule IDs now resolve to their established entities:
  attack roll, CMD, DR, animal, elf, and Magic Aura.
- Enchantment links resolve to the grouped magic-school heading. Light-level
  links resolve to the grouped illumination page, and Alluring Light links each
  explicit illumination level in context.
- Caltrops resolves to equipment, Clay Golem resolves to a monster, and Bard
  and Wizard references resolve to their local class pages.
- A relationship misclassified as `publication.will` is rejected whenever its
  source is actually the Will saving-throw rule.

Semantic review rejected the monster Summon ability when “summon” was only a
spellcasting verb, and rejected the Wind oracle mystery when Alter Winds used
ordinary wind terminology. Source evidence remains in the rejected
relationships and decision records.

### Batch 4

The fourth rollout batch contains:

- Animal Growth; Animal Purpose Training; Animal Shapes; Animate Dead, Lesser;
  Animus Mine and its Greater variant; Anonymous Interaction.
- Ant Haul and its Communal variant; Anthropomorphic Animal;
  Anti-Incorporeal Shell; Anti-Summoning Shield; Anticipate Thoughts; Antilife
  Shell; Antipathy; Antitech Field; Antithetical Constraint; Antitoxin Touch.
- Anywhere but Here; Ape Walk; Aphasia; Apparent Treachery; Appearance of Life;
  Apport Animal; Apport Object.

Review of this batch established these normalization rules:

- Skeleton, zombie, natural-attack, spell-like-ability, Armor Class, and common
  creature-type singular/plural IDs resolve to one canonical target.
- Summoning resolves to the magic subschool, Summoner resolves to its class
  page, Sling resolves to equipment, Monkey resolves to a monster, and Magic
  Missile resolves to the spell.
- Generic component references route to the existing spell-components page.
- Anti-Summoning Shield links `summon` only where the text names the monster
  Summon ability; other uses remain plain verbs.

Semantic review rejected the monster Summon ability from Apport Object because
that spell uses “summon” only as a transport verb.

### Batch 5

The fifth rollout batch contains:

- Aquatic Cavalry; Aquatic Trail; Aqueous Orb; Arbitrament; Arcana Theft;
  Arcane Concordance; Arcane Disruption; Arcane Eye; Arcane Lock; Arcane Mark;
  Arcane Pocket; Arcane Reinforcement; Arcane Sight and its Greater variant.
- Archon's Aura; Archon's Trumpet; Ardor's Onslaught; Arid Refuge; Army Across
  Time; Arrow Eruption; Arrow of Law; Ash Storm; Ashen Path; Aspect of the Bear;
  Aspect of the Falcon.

Review of this batch established these normalization rules:

- Hippocampus and trumpet archon references resolve to monsters; common magic
  items resolve as items; Arcanist resolves to its class page; metamagic and
  Improved Critical references resolve as feats; and magus arcana and hexes
  resolve as class features.
- Saving-throw, touch-attack, CMB, Dazed, Archon, and Dispel Magic aliases
  resolve to their established canonical targets. Generic saving-throw links
  route to the grouped saving-throws page.
- The verb `dispelled` in Arcane Mark resolves to Dispel Magic because its
  captured source href explicitly names that spell.

Semantic review rejected links from ordinary `summon`, `arcane`, `impervious`,
and `touch` wording when their captured hrefs instead described the monster
Summon ability, Arcane subdomain, Impervious weapon ability, or touch attacks.

### Batch 6

The sixth rollout batch contains:

- Aspect of the Nightingale; Aspect of the Stag; Aspect of the Wolf; Assume
  Appearance, Greater; Assumed Likeness; Astral Projection, Lesser; Atavism and
  its Mass variant; Atonement.
- Audiovisual Hallucination; Auditory Hallucination; Aura Alteration; Aura of
  Cannibalism; Aura of Distraction; Aura of Doom; Aura of Greater Courage;
  Aura of Inviolate Ownership; Aura of the Unremarkable; Aura Sight;
  Authenticating Gaze; Aversion.
- Awaken; Awaken Construct; Awaken the Devoured; Babble.

Review of this batch established these normalization rules:

- Charm and Illusion resolve to grouped magic references; HD resolves to Hit
  Dice; Paladin resolves to its class page; animal companion resolves to a
  class feature; shield guardian resolves to a monster; and daemon singular
  and plural references share one entity.
- Magic Aura references resolve to the canonical spell. Aura of Greater
  Courage's `fear` resolves to the fear rule rather than the spell named Fear.
- The combined `detect chaos/evil/good/law` phrase resolves to a registered
  spell-family record. Only `references` relationships to a spell family are
  eligible for inline matching; family-membership metadata is not description
  text.

Semantic review rejected Atonement's moral `Redemption` heading as a link to
the Redemption subdomain and Aura of Distraction's title wording as a link to
the monster Distraction ability.

Magic Aura was additionally converted from the warning queue. Its accepted
Arcane Sight and Greater Detect Magic relationships do not appear in the
canonical description, so they remain unlinked under Related rules with two
documented `UNMATCHED_RICH_TEXT_LINK` warnings.

### Batch 7

The seventh rollout batch contains:

- Badger's Ferocity; Balance of Suffering; Baleful Shadow Transmutation; Ball
  Lightning; Banish Seeming; Banishing Blade; Banishment; Banshee Blast;
  Baphomet's Blessing.
- Barbed Chains; Bard's Escape; Barghest Feast; Barrow Haze; Batrachian Surge;
  Battering Blast; Beacon of Guilt; Beacon of Luck; Beanstalk.
- Bear's Endurance and its Mass variant; Beastspeak; Bed of Iron; Befuddled
  Combatant; Beguiling Gift; Beloved of the Forge.

Review of this batch established these normalization rules:

- Singular Hit Die and combat maneuver targets resolve to the existing Hit
  Dice and Combat Maneuvers rules. Chain and rope resolve to equipment, Wild
  Shape resolves to the druid class feature, and ghosts resolve to the Ghost
  monster entry.
- A reference to a generic polymorph effect resolves to the Polymorph
  subschool, not automatically to the spell named Polymorph. Baleful Shadow
  Transmutation is context-sensitive: italic “as per *polymorph*” links to the
  spell, while its two unitalicized polymorph-effect references link to the
  subschool. Beastspeak has only the generic subschool link.

Semantic review rejected Barbed Chains' ordinary spellcasting verb `summon` as
a link to the monster Summon ability and Beacon of Guilt's ordinary verb
`touch` as a link to touch-attack rules.

### Batch 8

The eighth rollout batch contains Bereave through Blast Barrier: 25 reviewed
spells covering the Bestow, Binding, Bite the Hand, blade, and Bladed Dash
families, plus Black Spot, Blacklight, and related entries.

Review of this batch established these normalization rules:

- Kilt, rod of cancellation, and sphere of annihilation resolve to items;
  Caulborn resolves to a monster; Power Attack resolves to a feat; and Eidolon
  and Aura of Resolve resolve to class features.
- Blacklight adds reviewed links that were absent from the captured
  relationships: total darkness, darkvision, the light descriptor, and the
  Daylight spell.
- Source-page navigation is not a spell relationship. Bereave's unrelated
  Chain link, Binding's domain-navigation links, publication-navigation links,
  and Binding Earth's partial title match to the Binding spell are rejected.

### Batch 9

The ninth rollout batch contains Blast of Wind through Blood Money: 25
reviewed spells covering Bleed, Blessing, Blight, and blood-themed entries.

Review of this batch established these normalization rules:

- Explicit whole-spell wording such as “this spell functions like/as” promotes
  a spell reference to `functions_like`. A duplicate plain reference to the
  same target merges into that relationship, so the referenced spell expands
  once rather than appearing twice under Related rules. Expansion requires the
  parent to have a reviewed rich-text document; otherwise the page shows the
  existing local-link notice instead of exposing an unreviewed description or
  folded mythic suffix.
- Longbow, shortbow, and holy water resolve to items; Improved Unarmed Strike
  resolves to a feat; Monk resolves to its class page; and sharks resolve to
  the Shark monster entry. Bleed and bleed-damage source anchors share the
  canonical Bleed condition.
- Blight adds the missing Plant rule link to all four explicit occurrences.
  Touched allies and triggered corpses do not imply touch attacks.

Semantic review rejected unrelated domain, publication, daemon, radiation,
and seasons navigation artifacts that do not occur in the selected spell
descriptions.

### Batch 10

The tenth rollout batch contains Binding Earth, Mass through Boneshaker: 25
reviewed spells covering blood, blur, body, and bone-themed entries.

Review of this batch established these normalization rules:

- Conjuration and Transmutation resolve to magic schools, Healing resolves to
  the subschool, and mind-affecting resolves to the descriptor. Bleed wording
  shares the canonical Bleed condition, and “dazes” resolves to Dazed.
- Alertness resolves to a feat; dagger, armor spikes, and sawtooth sabre resolve
  to equipment; Arazni resolves to a deity; giant mantis resolves to a monster;
  and natural weapons share the Natural Attacks rule.
- Blur adds the missing Concealment link. Bone Flense replaces the secondary
  source’s IP-safe “Crimson Assassins” artifact with a reviewed Red Mantis
  Assassin class link and rejects an unsupported Humanoid relationship.

### Batch 11

The eleventh rollout batch contains Boneshatter through Buoyancy: 25 reviewed
spells covering bow, brand, bright, bullet, and Bull's Strength entries.

Review of this batch established these normalization rules:

- Whole-spell inheritance detection accepts a short descriptive phrase around
  `spell`, allowing “This trademark spell of the Lantern Bearers functions as
  daylight” to resolve to `functions_like` without treating an effect-level
  “works as” clause as whole-spell inheritance.
- Darkness in Brightest Light means the Darkness descriptor, not the spell.
  Torch resolves to equipment, and dwarf and gnome singular/plural source
  anchors share one entity per ancestry.
- Reviewed missing links cover falling damage; ability and skill checks; Armor
  Class; enhancement bonuses and attack rolls; dim light; Bleed; the sphere of
  annihilation; and the shortbow, club, longbow, and quarterstaff equipment
  named by Bowstaff.
- Brand, Greater links only the first `brand` that names its parent spell. Its
  later “greater brand” wording describes the current spell and remains plain
  text.

Semantic review rejected Boneshatter's anatomical skeleton as the Skeleton
undead template, Borrow Corruption's ordinary `touch` as a touch attack, and
Bountiful Banquet's roasted animals as the Animal creature type.

### Batch 12

The twelfth rollout batch contains Burdened Thoughts through Callback: 25
reviewed spells covering burst, call, and cacophonous entries.

Review of this batch established these normalization rules:

- Grappling and grapple source anchors share the Grapple rule, and singular or
  plural temporary-hit-point anchors share one definition.
- Burst with Light uses the same four illumination destinations established by
  the Darkness pilot. Heavy encumbrance routes to carrying capacity, and
  Swallow Whole routes to its monster rule.
- Calcific Touch links its explicit *slow* spell reference and the Petrified
  condition. Call Construct's ordinary `summon` verb does not link to the
  monster Summon ability.

Calculated Luck and Call Spirit expose a contract gap: their source
descriptions contain real data tables. The `0.2.0` AST preserves their leaf
text and Calculated Luck's preceding list, but it flattens table cells because
the minimal schema has no table nodes. This needs a schema, parser, renderer,
and accessibility decision before those tables can receive reliable cell-level
links.

### Batch 13

The thirteenth rollout batch contains Callback, Greater through Chains of Fire:
25 reviewed spells covering calm, canopic, casting, caustic, and chain entries.

Review of this batch established these normalization rules:

- “This spell is otherwise similar to” is whole-spell inheritance when the
  exact canonical target follows it; Carve Passage therefore inherits from
  Expeditious Excavation. Effect-level “similar to” wording remains a plain
  spell reference.
- Singular and plural haunt anchors share one rule. Ghost resolves to the
  monster entry, Compulsion to the subschool, and blind/entangle maneuver
  outcomes to the Blinded and Entangled conditions.
- Generic darkness and invisibility in Chain of Perdition resolve to the
  illumination level and condition, not the identically named spells.
- Reviewed missing links cover wind force, total concealment, torch, Mummy,
  Canopic Conversion's four referenced spells, Castigate's inflected `cowers`,
  energy descriptors and materials in Cauterizing Weapon, and the spirit animal
  class feature in Cave Fangs.

Semantic review rejected ordinary `touch` prose in Carry Companion and
Catatonia, the touch trigger in Caustic Safeguard, ordinary healing and
`negating` verbs in Cauterizing Weapon, and Cave Fangs' trap-disabled and
partial spirit-animal matches.

### Batch 14

The fourteenth rollout batch contains Chains of Light through Clear Grove: 25
reviewed spells covering charm, channel, identity, and cleansing entries.

Review of this batch established these normalization rules:

- Figment and glamer plurals resolve to their subschools, and “evil descriptor”
  resolves to the Evil descriptor rather than a duplicate generic rule.
- Mass Charm Person links only the first Charm Person phrase that names its
  parent spell. Its later reordered title phrases describe the current spell
  and remain plain text.
- Reviewed missing links cover Mindwipe; climb, fly, and swim movement;
  polymorph effects; and Cleanse's ability-damage, disease, and poison rules.

Semantic review rejected an Advanced Player's Guide citation treated as a
definition and Charnel House's ordinary grisly `meat` as a link to equipment.

### Batch 15

The fifteenth rollout batch contains Cleromancy through Compel Tongue: 25
reviewed spells covering cloak, cloud, command, and commune entries.

Review of this batch established these normalization rules:

- Constitution abbreviations, thought-component singular/plural wording,
  spell-like wording, and metamagic-feat singular/plural wording share their
  existing canonical rules.
- Empower Spell, Maximize Spell, and Widen Spell resolve to feats. Generic
  sunlight vulnerability resolves to its monster rule, and ordinary strong
  winds resolve to wind effects rather than the Wind oracle mystery.
- Reviewed missing links cover Cloak of Shadows' illumination and concealment
  terms, Cloud Shape's Fly rule, Coin Shot's full “touch attacks” phrase and
  silver material, Cold Ice Strike's Cold descriptor, Command Undead's creature
  type, and Compel Hostility's subschool, Summoner class, and eidolon feature.
- Greater Command links only the first `command` that names its parent spell;
  the later ordinary command noun remains plain text.

Semantic review rejected Climbing Beanstalk's botanical plant wording as the
Plant creature type and Cloak of Secrets' ordinary `identify` verb as the
Identify spell.

### Batch 16

The sixteenth rollout batch contains:

- Compel Tongue, Mass; Compelling Rant; Complex Hallucination; Comprehend
  Languages; Compulsive Liar; Concealed Breath; Condensed Ether; Conditional
  Favor; Confess; Confusion, Lesser.
- Conjuration Foil; Conjure Carriage; Conjure Deadfall; Constricting Coils;
  Contact Entity II, III, and IV; Contact High; Contact Nalfeshnee; Contact
  Other Plane.
- Contagion, Greater; Contagious Flame; Contagious Suggestion; Contagious Zeal;
  Contest of Skill.

Review of this batch established these normalization rules:

- `sickening` and `confused` source IDs resolve to the Sickened and Confused
  conditions. `Int` and `Cha` resolve to Intelligence and Charisma.
- Blind-Fight resolves to a feat. Light horses, snakes, and nalfeshnees resolve
  to monsters; Fighter resolves to its class page; and Weapon Mastery resolves
  to the Fighter class feature.
- Reviewed missing links cover Compelling Rant's sanity rules and named remedy
  spells, Concealed Breath's drowning and poison rules, Conditional Favor's
  poison, disease, and curse terms, Contagion's disease rule, and Contagious
  Flame's Fire descriptor.
- Contact High links the complete `touch attack` term but leaves its ordinary
  `touch` verb plain. Contagious Suggestion links only the first `suggestion`
  phrase that identifies its parent spell.

Compelling Rant's selected source text says that Greater Restoration removes a
decrease from casting Borrow Corruption. The wording is preserved and the named
spell is linked, but it appears to be a source copy-editing anomaly rather than
a description of Compelling Rant. Do not silently rewrite it without errata or
another authoritative source.

### Batch 17

The seventeenth rollout batch contains:

- Calm Emotions; Cloak of Chaos; Contingent Action; Contingent Scroll;
  Contingent Venom; Continual Flame.
- Control Construct; Control Plants; Control Summoned Creature; Control Undead;
  Control Vermin; Control Water; Control Winds; Controlled Fireball; Conversing
  Wind.
- Coordinated Effort; Corpse Lanterns; Corrosive Consumption; Corrosive Touch;
  Cosmic Ray; Counterbalancing Aura; Countless Eyes; Covetous Urge; Coward's
  Cowl; Coward's Lament.

Review of this batch established these normalization rules:

- Scroll singular and possessive forms share the Scroll rule; poison singular
  and possessive forms share the Poison rule; `readied` resolves to Ready;
  `concentrate` resolves to Concentration; and `flanked` resolves to Flanking.
- Magic Mouth resolves to the spell, Pattern to the illusion subschool, and
  `nauseating` to the Nauseated condition. Occultist, Bloodrager, Sorcerer, and
  Magus references resolve to class pages rather than generic rules.
- Calm Emotions distinguishes the Rage spell from the barbarian Rage class
  feature and links Inspire Courage, morale bonuses, and fear effects.
- Continual Flame treats light and darkness as descriptors and links Torch.
  Control Summoned Creature links summoning terminology; Control Water links
  water elementals; and Control Winds routes its wind terms to the general
  wind-effects rule rather than the Wind oracle mystery.
- Controlled Fireball links only its initial Fireball parent and the final
  explicit Fireball identification, leaving occurrences inside its own title
  plain. It also links the named classes and Ruse descriptor.
- Reviewed missing links cover teamwork feats and Outflank, Corpse Lanterns'
  illumination levels, Countless Eyes' Flanking rule, and the defensive rules
  in Coward's Cowl and Coward's Lament.

Semantic review rejected Cloak of Chaos title navigation to the Chaos domain,
Corrosive Consumption's ordinary `touch` delivery prose as a touch attack, and
Counterbalancing Aura's alignment `components` as spell components.

### Batch 18

The eighteenth rollout batch contains:

- Crafter's Curse; Crafter's Fortune; Create Armaments; Create Demiplane,
  Greater; Create Greater Undead; Create Mindscape and its Greater variant.
- Create Pit; Create Soul Gem; Create Treasure Map; Create Variant Mummy;
  Creeping Doom; Creeping Ice; Crime of Opportunity; Crime Wave.
- Crimson Breath; Crimson Confession; Crown of Glory; Cruel Jaunt; Crushing
  Despair; Crushing Hand; Cultural Adaptation; Curative Distillation; Mass Cure
  Critical Wounds; Mass Cure Light Wounds.

Review of this batch established these normalization rules:

- Secondary-source links to a domain, subdomain, mystery, elemental school, or
  class spell list are spell-list membership, not description definitions.
  Batch 18 corrects Artifice, Industry, Medium, Caves, Earth, Juju, Jungle,
  Nature, Scalykind, Isolation, and Community relationships accordingly.
- Creature links resolve to monster entities for shadows, wraiths, spectres,
  devourers, centipede swarms, and the three variant mummies. Create Greater
  Undead also links the Undead type and caster-level rule.
- Crime of Opportunity's entire effect is expressed through Crime Wave, so the
  direct relationship is `functions_like` and expands Crime Wave once. Greater
  Create Mindscape links only the first parent reference; its later reordered
  title remains plain. Mass Cure Light Wounds likewise does not link its own
  title fragment back to Cure Light Wounds.
- Reviewed missing links cover Creeping Doom's swarm rules and action; Creeping
  Ice's difficult terrain and bull rush; Crime Wave's teamwork feats and saving
  throw; Crown of Glory's enhancement bonus and Hit Dice; Cruel Jaunt's Sense
  Fear, fear, and carrying-capacity references; Crushing Despair's checks and
  rolls; and Mass Cure Light Wounds' positive energy and Undead rules.

Semantic review rejected Create Demiplane, Greater's unrelated Solitude
navigation, Create Soul Gem's self-link and false Expend, Judgment, and Unholy
targets, Creeping Ice's ordinary adjective `slow` as the Slow spell, Cruel
Jaunt's own teleportation effect as the Teleport spell, and Crushing Despair's
unrelated third-party modified-spell link.

Create Greater Undead and Crime Wave contain source tables. Their text remains
lossless, but row and cell semantics are flattened under the current `0.2.0`
AST. Links were not added across concatenated cell boundaries.

## Open questions and issues

### Source boundaries

The 291 source mismatches require comparison before conversion. Likely causes
include mythic text folded into a base description, supplemental headings,
parser-version differences, and prior manual corrections. Do not overwrite a
canonical description merely to make it match the current parser.

### Ambiguous or unmatched relationships

The 172 warning records remain unconverted. Review whether each relationship is
description evidence, metadata only, a source-navigation artifact, or a real
relationship whose phrase needs contextual matching.

### Missing relationships

The 310 structure-only candidates may be genuinely link-free, but the audit can
only evaluate relationships already present in canonical data. Review source
links and common rules terminology before concluding that a spell needs no
inline links.

### Duplicate rule identities

The linked-entity registries still contain probable aliases such as
tanglefoot-bag variants. Batches 3 and 4 resolved attack-roll, animal, CMD, DR,
elf, enchantment, Magic Aura, Armor Class, natural-attack, spell-like-ability,
common creature-type, saving-throw, touch-attack, CMB, and Dazed aliases using
shared source destinations. Resolve remaining IDs only with equivalent
evidence; do not merge them based only on similar spelling.

### Stub definitions

Many valid links currently lead to stub entity records. Illumination levels,
equipment, skills, conditions, monster rules, and other common definitions need
dedicated source captures or grouped reference pages so the destination is as
useful as the link.

### Semantic review beyond warnings

Exact phrase matching can still be wrong when one phrase has multiple meanings.
Review each generated batch in rendered context. Add contextual normalization
only when source wording or another authoritative relationship distinguishes
the intended target.

### Source tables

The current AST supports paragraphs and unordered lists, not tables. Calculated
Luck, Call Spirit, Contact Other Plane, Create Greater Undead, and Crime Wave
demonstrate that flattening cells preserves words but not their relationships.
Decide whether `0.3.0` should add semantic table nodes or whether the canonical
normalizer should convert source tables to another accessible structure. Do not
add phrase links across concatenated cells.

## Batch workflow

1. Run `pnpm audit:rich-text` and select the next warning-free linked batch.
2. Run `pnpm ingest:rich-text-batch` to convert 25 candidates.
3. Inspect every generated entity-link value and target in context.
4. Correct shared normalization defects before accepting record-specific
   exceptions.
5. Run canonical validation and the rich-text tests.
6. Import the database and run `pnpm verify` before publishing a batch.

Completion requires all 3,030 spells to have a validated rich-text document or
an explicitly reviewed issue that has been resolved. A green audit for one
batch does not prove corpus-wide completion.

Return to the [project index](index.md).
