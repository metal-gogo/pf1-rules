# Rich-text rollout status

This tracker covers the conversion of all canonical spell descriptions to the
version `0.2.0` rich-text contract. A converted record preserves source wording,
stores semantic structure and accepted relationship links, and passes the
validation rules in [Rich-text spell descriptions](rich-text.md).

## Current status

Audit date: 2026-08-26.

| Category | Spells | Meaning |
| --- | ---: | --- |
| Total canonical spells | 3,030 | Complete corpus |
| Rich text stored | 738 | 11-spell pilot, twenty-nine reviewed 25-spell rollout batches, Reincarnate, and one reviewed warning record |
| Safe candidates with links | 1,532 | Source text matches, parsing is lossless, and known accepted relationships produce no warning |
| Safe structure-only candidates | 306 | Source text matches, but no known relationship currently produces an inline link |
| Source mismatch | 280 | Current canonical text and the newly bounded AoN description differ |
| Link warnings | 174 | At least one accepted relationship is ambiguous or unmatched |
| Missing AoN baseline | 0 | No current blocker |
| Parser errors | 0 | No current blocker |

“Safe candidate” is an automation gate, not final semantic approval. Each batch
still requires review for incorrect source relationships, duplicate entity IDs,
and terms whose ordinary meaning differs from the linked rules entity.

Run the live audit with:

```bash
pnpm audit:rich-text
```

## Deterministic batch workflow

Use the manifest commands for a reviewed rollout batch. The plan is written
under `.git/pf1-rich-text-batches/`, so it does not modify the working tree.
Each later command verifies the planned commit, source hashes, and exact file
set before it continues.

```bash
pnpm rich-text:plan-batch --size 5
pnpm rich-text:apply-batch --manifest <manifest-path>
pnpm rich-text:verify-batch --manifest <manifest-path>
pnpm rich-text:commit-batch --manifest <manifest-path>
pnpm rich-text:push-batch --manifest <manifest-path>
```

Use a five-spell batch for the first run; omit `--size` for the normal
25-spell batch. Run `plan-batch` on a clean branch synchronized with its
upstream. Review the spell IDs it prints before running `apply-batch`. Every command stops on an
unexpected file, changed input, validation failure, commit-signing failure, or
upstream change.

Generated commit subjects identify the reviewed range and batch size, such as
`ingest rich-text: Heart of the Mammoth + 4 spells`.

## Test boundaries

Choose the smallest test boundary that proves the behavior. Test parsing,
validation, and HTML rendering directly. Use request tests for route and
database integration. Use browser tests for navigation, accessibility, and
responsive behavior that cannot be proved below the browser boundary.

Do not use a spell that is expected to be enriched as a permanent plain-text
fixture. Test plain-text rendering with a minimal input instead, so an expected
rollout change does not block a data-only batch.

For an unattended run, use one command instead. It executes the same steps in
order and stops at the first failure:

```bash
pnpm rich-text:run-batch --size 5
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

Calculated Luck and Call Spirit were converted before table nodes existed, so
their leaf text is preserved but their cells remain flattened. Re-enrich these
records before adding cell-level links.

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

Create Greater Undead and Crime Wave were converted before table nodes existed.
Their text remains lossless, but their row and cell semantics stay flattened
until they are re-enriched. Links were not added across concatenated cell
boundaries.

### Batch 19

The nineteenth rollout batch contains:

- Mass Cure Moderate Wounds; Mass Cure Serious Wounds; Curse of Befouled
  Fortune; Curse of Disgust; Curse of Dragonflies; Curse of Keeping; Curse of
  Magic Negation; Curse of the Outcast; Curse of Unexpected Death; Curse Water.
- Cursed Earth; Cursed Treasure; Cushioning Bands; Cyclic Reincarnation; Daemon
  Ward; Damnation; Damnation of Memory; Damp Powder; Dance of a Hundred Cuts;
  Dance of a Thousand Cuts.
- Dancing Darkness; Dancing Lantern; Dancing Lights; Dark-Light; Dark Whispers.

Review of this batch established these normalization rules:

- Mass Cure Moderate Wounds and Mass Cure Serious Wounds inherit directly from
  Mass Cure Light Wounds. Cyclic Reincarnation inherits from Reincarnate even
  though its source phrase places `except as noted` after the parent name.
- Swashbuckler resolves to its class page; Charmed Life and Lore Master resolve
  to class-feature pages; plural caster-level and disease IDs share their
  established canonical definitions; and the truncated secondary anchor
  `hakes` resolves to the Shakes disease.
- Curse Water links Negative Energy, Unholy Water, Holy Water, Undead, and
  separately links Good/Evil from each Outsider occurrence. Curse of Unexpected
  Death links only its two explicit touch attacks, while ordinary `touch` verbs
  remain plain. Cursed Treasure's delivery verb likewise remains plain.
- Reviewed missing links cover Curse of Befouled Fortune's checks, bonuses, and
  class features; Curse of the Outcast's attitude rule; Cushioning Bands'
  defensive rules; Damp Powder's actions and firearm rules; Dancing Darkness'
  illumination terms; Dancing Lantern and Dancing Lights equipment and monster
  references; Dark-Light's Light descriptor; and Dark Whispers' line of effect.
- Damnation of Memory's ordinary detectable magic aura resolves to a rules
  entity, not the identically named Magic Aura spell.

Semantic review rejected Curse of Dragonflies' medium range as a link to the
Medium class and Daemon Ward's duplicate publication navigation as a rules
definition.

Dancing Darkness's selected source says “Dancing shadows can be made
permanent,” although the spell is named Dancing Darkness. The wording is
preserved as source evidence and may be a copy-editing anomaly; do not silently
rewrite it without errata or another authoritative source.

### Batch 20

The twentieth rollout batch contains:

- Darkvault; Communal Darkvision; Greater Darkvision; Darting Duplicate;
  Daywalker; Daze; Mass Daze; Daze Monster; Dazzling Blade; Mass Dazzling
  Blade.
- Deadeye's Lore; Deadly Finale; Deadly Juggernaut; Deadman's Contingency;
  Deafening Song Bolt; Death Candle; Death Clutch; Greater Death Knell Aura;
  Death Pact; Deathwine.
- Debilitating Pain; Mass Debilitating Pain; Debilitating Portent;
  Debilitating Speech; Decapitate.

Review of this batch established these normalization rules:

- An accepted `uses_action` relationship is eligible for inline matching when
  its exact action phrase appears in description prose. This links free,
  immediate, standard, and full-round actions without duplicating metadata or
  guessing at render time.
- Greater Darkvision links only its first `darkvision` occurrence to the parent
  spell. Its second occurrence names the granted sense and links to the
  Darkvision rule. Greater Death Knell Aura similarly treats Magic Jar as a
  spell reference, while Death Candle resolves a named fire elemental to a
  monster and retains Elemental as the creature type.
- Plural cleric, oracle, witch, undead, and potion references resolve to their
  established canonical entities. `Deafening` resolves to the Deafened
  condition, and Daywalker's energy drain resolves to the monster rule rather
  than the identically named spell.
- Reviewed missing links cover Darkvault's illumination levels; Daze's Hit
  Dice; Dazzling Blade's silver material; Deadly Juggernaut's checks, damage
  reduction, and skills; Greater Death Knell Aura's Dying and Stable
  conditions; Deathwine's negative energy; and Debilitating Portent's Witch
  class reference.

Semantic review rejected Daywalker's ordinary `touch`, descriptive `dead
flesh`, unrelated unholy-water navigation, and misclassified Energy Drain
spell target; Death Candle's spellcasting verb `summon`; Death Clutch's
ordinary heart regeneration as the monster Regeneration ability; Daze's
publication navigation; and Greater Death Knell Aura's duplicate publication
navigation.

### Batch 21

The twenty-first rollout batch contains:

- Blood Salvation; Companion Life Link; Deceitful Veneer; Deceptive
  Redundancy; Decollate; Decompose Corpse; Decrepit Disguise; Deeper Darkness;
  Defending Bone; Defensive Grace.
- Defensive Shock; Deflect Blame; Deflection; Defoliate; Deft Digits; Deja Vu;
  Delay Disease; Delay Pain; Communal Delay Poison; Delayed Blast Fireball.
- Delectable Flesh; Delusional Pride; Demand; Demand Offering; Demanding
  Message.

Review of this batch established these normalization rules:

- Deeper Darkness links only the two phrases that explicitly invoke the
  Darkness spell. Its emitted darkness links to the Darkness descriptor, its
  illumination changes link to the exact light-level headings, and the
  `darkness` inside its own title remains plain. Delayed Blast Fireball
  likewise links Fireball only in its inheritance clause, not inside its own
  title.
- Secondary-source Div bloodline, Shadow mystery, Metal elemental school,
  Defense, Radiation, Kyton, Arson, Charm, Nobility, and Torture navigation is
  normalized as spell-list membership. These relationships remain available
  in spell metadata but never compete with description terms.
- Reviewed missing links cover Blood Salvation's class features; Defensive
  Grace's investigator and swashbuckler features and precision damage;
  Defensive Shock's Electricity descriptor; Deflection's Force descriptor;
  Defoliate's negative energy, Plant type, and touch attack; Deft Digits' Fly,
  skill-check, and line-of-sight rules; Deja Vu's action types; Delay Pain's
  Pain descriptor; Delayed Blast Fireball's Fire descriptor and caster level;
  and Delectable Flesh and Delusional Pride's rolls, checks, and saves.

Semantic review rejected Blood Salvation's duplicate publication navigation
as a rules definition and Decollate's merely apparent `dead` head as the Dead
condition.

### Batch 22

The twenty-second rollout batch contains:

- Mass Demanding Message; Denounce; Depilate; Destabilize Powder; Destroy
  Robot; Destruction; Detect Aberration; Detect Animals or Plants.
- Detect Anxieties; Detect Chaos; Detect Charm; Detect Demon; Detect Desires;
  Detect Evil; Detect Fiendish Presence; Detect Good; Detect Law.
- Greater Detect Magic; Detect Metal; Detect Mindscape; Detect Poison; Detect
  Psychic Significance; Detect Radiation; Detect Relations; Detect Snares and
  Pits.

Review of this batch established these normalization rules:

- “Functions similarly to” identifies direct spell inheritance, so Detect
  Mindscape inherits from Detect Thoughts. Parent links inside a greater
  spell's own title remain plain; Greater Detect Magic links Detect Magic only
  in its inheritance clause.
- Secondary-source Medium spell-list navigation is normalized as spell-list
  membership for Detect Mindscape and Detect Psychic Significance. Greater
  Detect Magic's duplicate publication and product-code navigation is
  rejected as rules-definition evidence.
- Common verb phrases do not become spell or monster-ability links. “Detect
  magic items,” “does not detect magic traps,” and “see in darkness” remain
  plain. Detect Snares and Pits links Snare only where the wording explicitly
  says “the spell snare.”
- Reviewed missing links cover line of sight; firearms, caster levels, and
  standard actions; saving throws and Androids; hit points and ability scores;
  Hit Dice; Asmodeus; Clerics and creature types; Silver; Poison; and traps.

Detect Evil was converted before table nodes existed. Its source tables remain
lossless text but need re-enrichment to recover row and cell semantics.

### Batch 23

The twenty-third rollout batch contains:

- Detect the Faithful; Detect Thoughts; Determine Depth; Detonate; Detoxify;
  Devil Snare; Diagnose Disease; Die for Your Master.
- Dimensional Anchor; Dimensional Blade; Dimensional Bounce; Diminish Plants;
  Diminish Resistance; Diminished Detection; Disable Construct; Discern
  Location; Discharge; Greater Discharge.
- Discovery Torch; Disguise Other; Disguise Self; Disguise Weapon; Dismissal;
  Dispel Balance; Dispel Chaos.

Review of this batch established these normalization rules:

- Greater Discharge has eleven occurrences of `discharge`, but only three name
  the parent spell: its two “functions as” clauses and “as though by” clause.
  The title fragments, category headings, and discharge verbs remain plain.
  The three links still expand the parent only once.
- Generic resistance does not identify the Resistance spell. Diminish
  Resistance instead links Acid, Cold, Electricity, Fire, and Sonic to their
  descriptor headings. Energy-rule source IDs for those terms normalize to the
  same canonical descriptor identities.
- Ordinary contact wording remains plain. Determine Depth's range phrase,
  Devil Snare's “Your touch,” and Dispel Balance's “with a touch” do not link
  the touch-attack rule; explicit ranged, melee, and other touch attacks do.
- Discovery Torch links bright light to the illumination page and treats
  “Light spells” and “darkness spells” as descriptors rather than individual
  spells. Disguise Weapon resolves greatsword, quarterstaff, club, and dagger
  to equipment entities.
- Reviewed missing links cover line of sight; energy descriptors and saving
  throws; extradimensional travel, spell-like abilities, and summoning;
  attacks, Armor Class, Force, and line of effect; Plant creatures; immunity to
  magic; scrying and planes; robots; creature types, creature subtypes, and the
  Glamer subschool; and extraplanar creatures.

Detect Undead was deliberately not substituted into this batch. Its selected
source description contains a table, so converting it while table-AST work was
changing concurrently would couple this rollout to unreviewed structural
changes. Re-run it after that work is committed and verify its row and cell
semantics before accepting inline links.

### Batch 24

The twenty-fourth rollout batch contains:

- Dispel Evil; Dispel Good; Dispel Law; Greater Dispel Magic; Displacement;
  Display Aversion; Disrupt Link; Disrupt Silence; Disrupting Weapon.
- Dissolution; Distracting Cacophony; Distressing Tone; Divide Mind; Divination;
  Divine Arrow; Divine Power; Divine Transfer; Divine Vessel.
- Dominate Animal; Dominate Monster; Domination Link; Dousing Rain; Draconic
  Ally; Draconic Malice; Draconic Suppression.

Review of this batch established these normalization rules:

- Dispel Good and Dispel Law link and expand Dispel Evil once. Greater Dispel
  Magic retains its explicit Dispel Magic references. Disrupt Silence links
  only the example Silence spell; occurrences inside its own name and generic
  magical-silence wording remain plain.
- A bare `touch` does not imply a touch attack. Disrupt Link's “deliver touch
  spells” familiar ability and Dissolution's ordinary contact wording remain
  plain, while Dispel Evil's explicit melee touch attack links to the rule.
- Displacement links both occurrences of total concealment to that specific
  rule rather than linking the `concealment` substring. Divine Power's italic
  `speed` names the weapon special ability, not movement speed.
- Divine Vessel distinguishes energy descriptors from ordinary adjectives and
  alignment terms from “good maneuverability.” Its SR, DR, energy types,
  poison, attacks, and alignment effects link without treating the introductory
  “cold and alien” description as Cold energy.
- Draconic Ally normalizes Inquisitor and Warpriest references to class pages
  and links Apsu and Dahak. Draconic Malice links Antipaladin and Aura of
  Cowardice. These newly referenced entities remain documented stubs until
  dedicated source captures are available.

Both selected first-party and secondary-source artifacts for Dissolution say
`1d0 points of damage`. The canonical wording remains unchanged because the
rich-text rollout does not silently correct source text. Confirm the intended
die from the printed source before making a separate erratum decision.

### Batch 25

The twenty-fifth rollout batch contains:

- Ceremony; Create Drug; Lesser Curse Terrain; Detect Undead; Dragon Turtle
  Shell; Dragonvoice; Drain Construct; Drain Poison; Dread Bolt; Dreadscape.
- Dream Council; Dream Dalliance; Dream Feast; Dream Reality; Dream Scan;
  Dream Shield; Dream Travel; Dream Voyage; Dress Corpse; Drunkard's Breath.
- Dungeonsight; Duplicate Familiar; Dust Form; Dust Ward; Dwarven Veil.

Review of this batch established these normalization rules:

- A `dream` match is retained only when the surrounding phrase names the Dream
  spell. Dream Council, Dream Scan, and Dream Travel leave their own titles,
  ordinary dreams, and the verb `dream` unlinked. Dream Voyage's four explicit
  Dream Travel references remain linked and expand the parent once.
- Ordinary `touch` remains plain. Ceremony links its three explicit touch
  attacks but not “with a touch” or the Touch of Assuagement heading. Drain
  Poison's weapon handling and Dream Voyage's target selection reject the
  secondary source's touch-attack relationships.
- Air, Earth, Fire, Light, and Water descriptor aliases resolve to the shared
  descriptor pages. Profane bonus and swarm aliases resolve to their existing
  definitions. Improved Natural Attack resolves to a feat, and iron golem
  resolves to a monster rather than duplicate generic-rule stubs.
- Lesser Curse Terrain and Detect Undead preserve their source tables as table,
  row, header-cell, and data-cell nodes. The terrain-cost table links the three
  other named Curse Terrain spells without self-linking the current spell.
- Reviewed missing links cover Undead; Good and Evil alignment terms; hostile
  attitude and sanity rules; Divination and possession; Emotion and Fear;
  Poison; Cayden Cailean; Dwarf; and the Water descriptor.

Detect Undead was deferred from Batch 23 while table support was changing. Its
row and cell semantics are now reviewed and covered by canonical, web, and
browser tests.

### Batch 26

The twenty-sixth rollout batch contains:

- Dweomer Retaliation; Eagle Aerie; Eagle's Splendor; Mass Eagle's Splendor;
  Eaglesoul; Early Judgment; Ears of the City; Earth Glide; Earth Tremor.
- Echean's Excellent Enclosure; Echo; Echolocation; Ectoplasmic Eruption;
  Ectoplasmic Hand; Ectoplasmic Snare; Effortless Armor.
- Ego Whip II–V; Eldritch Fever; Elemental Assessor; Elemental Aura;
  Elemental Mastery; Elemental Speech.

Review of this batch established these normalization rules:

- Ectoplasmic Snare rejects the secondary source's Snare relationship because
  every occurrence names the current spell's tether. Elemental Aura likewise
  leaves `elemental` plain when it occurs only in the current spell's name.
- Elemental Speech distinguishes spell descriptors from creature subtypes:
  `air spell` links the Air descriptor, while `air subtype` links the Air rules
  entity, with the same treatment for Earth, Fire, and Water. Its own title
  remains plain.
- Eaglesoul's `Resistance 5 to acid and fire` resolves to Energy Resistance,
  not the unrelated Resistance spell or a generic resistance record. Ifrit,
  oread, sylph, and undine plurals resolve to their singular canonical race
  entities.
- Explicit inheritance from Ego Whip II–V to Ego Whip I is represented as
  `functions_like`. Echean's Excellent Enclosure links every named spell and
  item while preserving the inverted phrase `field of antimagic`.
- Elemental Mastery's source table remains a table with one header row, four
  body rows, row headers, and inline links. Source wording, emphasis, paragraph
  boundaries, and all other rich-text structures remain text-equivalent.

Canonical, database-backed web, and desktop/mobile browser tests cover these
distinctions. Manual rendered review covered Echean's Excellent Enclosure,
Elemental Aura, Elemental Speech, Ectoplasmic Snare, and Elemental Mastery.

### Batch 27

The twenty-seventh rollout batch contains:

- Elemental Swarm; Elude Time; Emblem of Greed; Embrace Destiny; Emergency
  Force Sphere; Emotive Block; Empathy Conduit; Empower Holy Water.
- Enchantment Foil; Enchantment Sight; Endothermic Touch; Communal Endure
  Elements; Enemy Insight; Enemy's Heart; Energy Drain; Energy Hack; Energy
  Siege Shot; Enhance Water.
- Mass Enlarge Person; Enlarge Tail; Enlightened Step; Enshroud Thoughts;
  Enter Image; Enthrall; Entice Fey.

Review of this batch established these normalization rules:

- Elemental Swarm distinguishes creature subtypes from spell descriptors. Its
  final air, earth, fire, and water subtype terms resolve to rules entities,
  while the same words in planar names remain plain. Large and Huge resolve to
  the size rule, and Elemental in the spell title remains plain.
- Enchantment Sight links four explicit references to the Enchantment school
  while leaving its own italicized title plain. Energy Hack and Energy Siege
  Shot link only explicit spell-descriptor uses; Energy Siege Shot normalizes
  deafened to the canonical Deaf condition.
- Enemy's Heart and Enlightened Step express explicit behavioral inheritance
  from Death Knell and Air Walk as `functions_like`. Emblem of Greed resolves
  Greater Magic Weapon to the spell, and Enhance Water resolves unholy water
  to the item.
- Enthrall links friendly, indifferent, unfriendly, and hostile only where the
  text describes attitude values. Ordinary uses in “unfriendly to yours” and
  “hostile act” remain plain.

Canonical, database-backed web, and desktop/mobile browser tests cover these
distinctions. Manual rendered review covered Elemental Swarm, Energy Siege
Shot, and Enthrall, including link targets, paragraph structure, and preserved
emphasis.

### Batch 28

The twenty-eighth rollout batch contains:

- Greater Entice Fey; Enticing Adulation; Entomb; Entrap Spirit; Envious Urge;
  Epidemic; Erase; Erase Impressions; Erode Defenses; Eroding Ray.
- Escape Alarm; Escaping Ward; Ether Step; Ethereal Envelope; Ethereal
  Envelopment; Ethereal Fists; Ethereal Jaunt; Etherealness; Etheric Shards.
- Euphoric Cloud; Euphoric Tranquility; Evaluator's Lens; Evolution Surge and
  its Greater variant; Excruciating Deformation.

Review of this batch established these normalization rules:

- Escape Alarm links only the explicit parent-spell reference in “functions as
  alarm.” Alarm inside the current spell's title and ordinary descriptions of
  its audible and mental effects remain plain.
- Ethereal Fists treats lowercase `etherealness` as the ethereal state, not the
  Etherealness spell. Its Ethereal and Material planar terms, unarmed strikes,
  touch effects, Blink example, and concealment remain linked to their distinct
  canonical destinations.
- Evaluator's Lens normalizes Figment to the shared illusion subschool and
  links Pattern, Force, saving throws, artifacts, Rod of Cancellation, Armor
  Class, skills, and explicitly named spells without altering emphasis.
- Ordinary verbs and metadata remain unlinked: Ether Step's “dodge a blow” is
  not a Dodge rules reference, Ethereal Envelope being “broken open” does not
  apply the Broken condition, and Etheric Shards being impossible to disable
  does not apply the Disabled condition. Its broken-glass material component is
  likewise not the Broken condition.
- Explicit missing links cover saving throws, caster level, size, actions,
  speed, planes, the ethereal state, Hit Points, Force, Abjuration, and Helpful
  attitude where those terms appear in the description.

Canonical, database-backed web, and desktop/mobile browser tests cover these
distinctions. Manual rendered review covered Ethereal Fists, Etheric Shards,
and Evaluator's Lens, including paragraph boundaries, emphasis, contextual
targets, and rejected relationships.

### Batch 29

The twenty-ninth rollout batch contains:

- Expeditious Construction; Expeditious Excavation; Expel Blood; Expend;
  Explode Head; Explosion of Rot; Explosive Runes; Exquisite Accompaniment;
  Extreme Buoyancy; Extreme Flexibility.
- Eyes of the Void; Fable Tapestry; Fabricate Disguise; Face of the Devourer;
  Fair Is Foul; Fairness; Fairy Ring Retreat; Fallback Strategy; False Alibi;
  False Belief.
- False Future; Greater False Life; Greater False Resurrection; False Vision;
  Greater False Vision.

Review of this batch established these normalization rules:

- Expel Blood rejects `vortex` because it names the water elemental ability,
  not the Vortex spell. Exquisite Accompaniment leaves the ordinary verb
  `teleport` unlinked, and Fairy Ring Retreat leaves animal-like servants
  unlinked rather than treating them as the Animal creature type.
- False Vision and Greater False Vision normalize `scrying` to the shared
  subschool destination. False Belief → Modify Memory and Fairy Ring Retreat
  → Unseen Servant are represented as `functions_like` relationships.
- Explosive Runes → Erase and Greater False Resurrection → False Resurrection
  use contextual occurrence filtering so only explicit references are linked.
  Self/title links and ordinary homonyms remain plain.
- Fable Tapestry preserves its source table, row and cell structure, emphasis,
  and inline links for the explicitly named character abilities. Additional
  reviewed links cover rules terms, actions, size, saving throws, skills,
  descriptors, schools, planes, concentration, and Abadar.
- `rule.supernatural-abilities` canonicalizes to the registered
  `rule.supernatural` entity during normalization, preventing stale generated
  relationships from failing validation.

Canonical, database-backed web, and desktop/mobile browser tests cover these
distinctions. Manual rendered review covered Expel Blood, Explosive Runes,
Fable Tapestry, Greater False Resurrection, and Greater False Vision,
including links, rejected relationships, table structure, emphasis,
accessibility, and unchanged visible text.

The 2026-08-26 audit reports 3,030 total spells, 738 rich-text records, 1,532
safe candidates with links, 306 structure-only candidates, 280 source
mismatches, 174 link warnings, 0 missing AoN baselines, and 0 parser errors.

### Batch 30

The thirtieth rollout batch contains:

- Familiar Double; Familiar Figment; Familiar Melding; Fastidiousness; Fear
  the Sun; Fearsome Duplicate; Feast on Fear; Feather Step, Mass; Feeblemind;
  Ferment; Fester; and Fester, Mass.
- Fey Form II, Fey Form III, Fey Form IV; Fey Gate; Fickle Winds; Fiendish
  Wrath; Fiery Body; Fiery Runes; Fiery Shuriken; Final Sacrifice; Find Fault;
  Find Quarry; and Find the Path.

Review of this batch established these normalization rules:

- Familiar Melding's body merely appears dead while the caster possesses its
  familiar. This is not the Dead condition.
- Fey Form II–IV list a form ability called `blood rage`; it does not refer to
  the Blood Rage spell. Fey Form III–IV's granted energy resistance similarly
  does not refer to the Resistance spell.
- Fiery Body lists poison as an affliction to which the caster is immune, not
  the Poison spell. Its concealment, disease, ability-score, and condition
  references remain semantically linked.
- Explicit parent and named-spell links remain links: Familiar Double → Project
  Image; Feather Step, Mass → Feather Step; Fey Form II–IV → the preceding
  form; Fey Gate → Gate; Fickle Winds → Wind Wall; Find Quarry → Locate
  Creature; and Find the Path → Maze.
- The Fey Form ability lists retain all ordinary wording and source punctuation
  while linking discrete rules terms such as fast healing, blindsense,
  damage reduction, and spell resistance.

Canonical, database-backed web, and desktop/mobile browser tests cover the
accepted and rejected links. Manual rendered review covered Familiar Figment,
Fey Form II, Fey Form IV, Fiery Body, Find the Path, and Fable Tapestry,
including link targets, rejected homonyms, paragraph and table structure,
emphasis, accessibility, and unchanged visible text.

The 2026-08-26 audit reports 3,030 total spells, 763 rich-text records, 1,507
safe candidates with links, 306 structure-only candidates, 280 source
mismatches, 174 link warnings, 0 missing AoN baselines, and 0 parser errors.

## Open questions and issues

### Source boundaries

The 280 source mismatches require comparison before conversion. Likely causes
include mythic text folded into a base description, supplemental headings,
parser-version differences, and prior manual corrections. Do not overwrite a
canonical description merely to make it match the current parser.

### Ambiguous or unmatched relationships

The 174 warning records remain unconverted. Review whether each relationship is
description evidence, metadata only, a source-navigation artifact, or a real
relationship whose phrase needs contextual matching.

### Missing relationships

The 306 structure-only candidates may be genuinely link-free, but the audit can
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

The `0.2.0` AST now supports semantic heading, table, row, and cell nodes.
Reincarnate is the first reviewed conversion using them. Calculated Luck, Call
Spirit, Contact Other Plane, Create Greater Undead, Crime Wave, and Detect Evil
were converted earlier and remain migration candidates; re-enrich them before
adding phrase links that depend on cell boundaries.

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
