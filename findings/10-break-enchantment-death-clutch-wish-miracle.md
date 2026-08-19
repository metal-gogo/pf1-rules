# Break Enchantment, Death Clutch, Wish, and Miracle

This evaluation applies the provenance-first source strategy to four spells chosen to stress different parts of the model:

- **Break Enchantment**: multiple targets, per-effect checks, a material wording conflict, and a mythic augmentation;
- **Death Clutch**: later first-party publication, save- and hit-point-dependent outcomes, delayed death, and recovery dependencies;
- **Wish**: flexible spell emulation, enumerated and free-form effects, costly components, and a complex mythic version; and
- **Miracle**: flexible divine emulation with a conditional material cost and no published mythic version.

## Source coverage

| Spell | Archives of Nethys | Legacy PRD | d20PFSRD |
|---|---|---|---|
| Break Enchantment | Core base and Mythic Adventures variant on one page | Core base page plus a separate Mythic Adventures page | Core base and mythic text on one page |
| Death Clutch | Horror Adventures, page 115 | No entry found | Present; Section 15 identifies Horror Adventures |
| Wish | Core base and Mythic Adventures variant on one page | Core base page plus a separate Mythic Adventures page | Core base present; mythic text absent |
| Miracle | Core base spell | Core base spell | Core base spell |

Primary pages:

- [AoN — Break Enchantment](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Break%20Enchantment)
- [Legacy PRD — Break Enchantment](https://legacy.aonprd.com/coreRulebook/spells/breakEnchantment.html)
- [Legacy PRD — Mythic Break Enchantment](https://legacy.aonprd.com/mythicAdventures/mythicSpells/breakEnchantment.html)
- [d20PFSRD — Break Enchantment](https://www.d20pfsrd.com/magic/all-spells/b/break-enchantment/)
- [AoN — Death Clutch](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Death%20Clutch)
- [d20PFSRD — Death Clutch](https://www.d20pfsrd.com/magic/all-spells/d/death-clutch/)
- [AoN — Wish](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Wish)
- [Legacy PRD — Wish](https://legacy.aonprd.com/coreRulebook/spells/wish.html)
- [Legacy PRD — Mythic Wish](https://legacy.aonprd.com/mythicAdventures/mythicSpells/wish.html)
- [d20PFSRD — Wish](https://www.d20pfsrd.com/magic/all-spells/w/wish/)
- [AoN — Miracle](https://www.aonprd.com/SpellDisplay.aspx?ItemName=Miracle)
- [Legacy PRD — Miracle](https://legacy.aonprd.com/coreRulebook/spells/miracle.html)
- [d20PFSRD — Miracle](https://www.d20pfsrd.com/magic/all-spells/m/miracle/)
- [Legacy PRD — Mythic spell index](https://legacy.aonprd.com/mythicAdventures/mythicSpells/spellIndex.html)

## Break Enchantment

### Stable base facts

- Core Rulebook, page 251; abjuration.
- Casting time 1 minute; components V and S.
- Close range; up to one creature per caster level, with all targets within 30 feet of each other.
- Instantaneous; saving throw `see text`; spell resistance `no`.
- Each removable effect requires its own caster-level check, capped at +15, against DC 11 + the effect's caster level. A cursed item's curse DC replaces that formula.

### Material source conflict

AoN and the Legacy PRD say that if a spell cannot be dispelled by **dispel magic or stone to flesh**, Break Enchantment can affect it only when it is 5th level or lower. d20PFSRD omits **or stone to flesh**.

This is not formatting or a harmless scope expansion. It changes the rule's explicit exception set. The canonical wording should therefore come from AoN, corroborated by the Legacy PRD; the d20PFSRD field should be recorded as a material omission rather than merged.

### Mythic ownership

`mythic-spell-variant.break-enchantment` should be a separate mythic-spell-variant entity related to `spell.break-enchantment` through `mythic_version_of` and the reciprocal `has_mythic_variant` edge.

Mythic Adventures page 87 supplies the variant. Its `Augmented (7th)` option requires two total uses of mythic power, so it fits the current augmentation structure exactly:

- `minimum_tier: 7`
- `total_mythic_power_uses: 2`

### Relationships to retain

- `has_school` → Abjuration
- `references` → Dispel Magic
- `references` → Stone to Flesh
- `uses_definition` → caster-level check
- `uses_definition` → curse
- `has_mythic_variant` → Mythic Break Enchantment

The base mechanics remain accurate in raw and searchable text. A structured representation of “one check for each effect” can wait for the broader conditional-effect model.

## Death Clutch

### Provenance decision

Death Clutch is a first-party spell from Horror Adventures, page 115. It is not a Core spell and no Legacy PRD entry was found. AoN is therefore the canonical baseline; d20PFSRD is an independent wording and link comparison.

The two available sources agree on the mechanics. AoN's rendered component line has a trailing comma after `V, S`; d20PFSRD has `V, S`. This should be treated as a presentation artifact, not as an unknown third component.

### Conditional outcomes

The spell cannot be reduced to one damage or condition record without losing rules:

1. A target at 200 or fewer remaining hit points that fails its Fortitude save loses its heart, is reduced to the specified negative hit-point value, becomes staggered until the caster's next turn, and then dies.
2. A target at 201 or more remaining hit points that fails takes Constitution drain and Constitution bleed and is staggered for 1 minute.
3. A target that succeeds is still staggered until the caster's next turn.

This is strong evidence for a later condition-and-outcome model with predicates such as save result and current hit-point threshold. Until that model is designed from several spells, the full wording should remain canonical and searchable rather than being flattened inaccurately.

### Recovery and definition relationships

- `requires` or a future recovery-specific relation → Regenerate
- `references` → Breath of Life
- `references` → Raise Dead
- `uses_definition` → Staggered
- `uses_definition` → Constitution drain
- `uses_definition` → bleed
- `uses_definition` → death effects
- `has_descriptor` → Death
- `has_descriptor` → Evil

The wording distinguishes two recovery sequences: Regenerate can prevent the delayed death, while a creature already killed and returned by Breath of Life or Raise Dead must receive Regenerate on the following round to restore the missing heart.

## Wish

### Base spell

Wish is a Core Rulebook spell, page 370. AoN provides the strongest catalog record because it includes later first-party access for arcanist and psychic as well as sorcerer and wizard. Legacy supplies the Core baseline; d20PFSRD adds bloodline navigation and extensive semantic links.

All three agree on the base wording and the 25,000 gp diamond material component. If Wish duplicates a spell whose costly material component exceeds 10,000 gp, that component is additionally required.

### Flexible delivery fields

The stat block deliberately says:

- Range: `see text`
- Target, Effect, or Area: `see text`
- Duration: `see text`
- Saving Throw: `none, see text`

These values depend on the chosen effect or duplicated spell. The canonical record should use `special` or conditional normalized values and retain the literal text. It must not invent one target, area, duration, save, or spell-resistance behavior for every use.

The combined header **Target, Effect, or Area** is preserved as one source-observation entry with three normalized kinds. The canonical `effect.delivery` object can therefore retain the literal header and mark its resolution as `determined_by_selected_effect` without assigning `see text` to only one meaning.

### Mythic Wish

Mythic Wish is published in Mythic Adventures, page 112, and should become `mythic-spell-variant.wish`. AoN and the separate Legacy mythic page agree. The d20PFSRD Wish page does not contain the mythic section.

The current mythic schema can represent the final unnumbered `Augmented` option:

- `minimum_tier: null`
- `total_mythic_power_uses: 2`

The earlier mythic choices also allow additional mythic-power expenditure, but they are not labeled `Augmented`. They belong in the mythic rules text and must not be falsely normalized as augmentation records. If querying those choices later becomes important, they need a distinct mythic-option structure.

### Relationships to retain

- `references` → Geas/Quest
- `references` → Insanity
- `references` → Resurrection
- `uses_definition` → inherent bonus
- `uses_definition` → affliction
- `uses_definition` → opposition school
- `has_mythic_variant` → Mythic Wish

Wish's ability to duplicate a broad category of spells should not create an explicit edge to every eligible spell. It is better represented as a capability rule, with explicit spell relationships only for named examples and dependencies.

## Miracle

### Base spell and source agreement

Miracle is a Core Rulebook spell, page 314. AoN lists cleric and oracle access; Legacy provides the cleric Core baseline; d20PFSRD also exposes Community and Luck domains and the Divine subdomain.

The three sources agree on the rules. Like Wish, Miracle delegates range, target/effect/area, duration, saving throws, and spell resistance to the chosen or duplicated effect.

### Conditional component cost

Ordinary uses have components `V, S; see text` and do **not** automatically cost 25,000 gp. Powdered diamond worth 25,000 gp is required only when making the alternative “very powerful request.” When duplicating a spell, Miracle additionally requires any material component costing more than 100 gp.

The canonical ordinary `components` array should therefore contain verbal and somatic components only. Recording a 25,000 gp base material component would be incorrect. The new `conditional_components` collection attaches the powdered diamond and its 25,000 gp cost to the powerful-request condition explicitly.

### No Mythic Miracle entity

AoN has no Mythic Miracle subsection, d20PFSRD has no mythic section, and the Legacy Mythic Spell Index contains Wish and Break Enchantment but not Miracle. We should not create `mythic-spell-variant.miracle`.

### Relationships to retain

- `references` → Feeblemind
- `references` → Insanity
- `uses_definition` → deity
- `uses_definition` → alignment
- `appears_on_spell_list` → Community domain
- `appears_on_spell_list` → Luck domain
- `appears_on_spell_list` → Divine subdomain

## Cross-spell conclusions

### No immediate canonical-schema expansion for conditional outcomes

Death Clutch, Wish, and Miracle all demonstrate conditional mechanics, but they do so in substantially different ways. Adding one narrow structure now would likely encode the examples rather than the underlying rule pattern. Preserve full canonical wording and semantic links while collecting more cases.

### One raw-observation question should be resolved before ingestion

Wish and Miracle both use the combined stat-block label `Target, Effect, or Area`. The observation schema now preserves that as one `delivery_fields_raw` entry whose `kinds` are `target`, `effect`, and `area`; it does not arbitrarily assign the value to one of three columns. The canonical spell records the same entry under `effect.delivery` with `resolution: determined_by_selected_effect`.

### Mythic variants remain source-driven

Break Enchantment and Wish have verified first-party mythic versions. Death Clutch and Miracle do not. Variant entities must be created only from positive source evidence, never inferred from a base spell's level, theme, or similarity to another spell.

### Recommended next modeling step

The two blocking schema questions—combined delivery headers and conditional components—are now resolved. The next step is to capture these four spells as source observations and canonical examples, beginning with Break Enchantment and then using Wish and Miracle to exercise the new structures.
