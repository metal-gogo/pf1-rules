# Wish Ingestion Result

Wish is now a complete canonical spell example with a separate Mythic Wish entity. Four independently hashed source captures support it: AoN's combined base-and-mythic page, the Legacy Core spell page, the separate Legacy mythic page, and d20PFSRD's base-only page.

## 1. What the sources agree on

All three base entries agree on the important Core mechanics:

- Universal, sorcerer/wizard 9 in the Core scope.
- Casting time of 1 standard action.
- Verbal, somatic, and material components.
- A diamond worth 25,000 gp.
- Range, delivery, and duration determined by the selected effect.
- `Saving Throw none, see text` and `Spell Resistance yes`.
- The same ten listed safe effects, dangerous greater-effect warning, duplicated-spell save rule, and additional costly-component rule.

AoN is the canonical wording source because it has the strongest page-level provenance and explicitly identifies PRPG Core Rulebook page 370.

## 2. Combined delivery header

AoN renders `Target, Effect, or Area: see text`. Legacy and d20PFSRD render `Target, Effect, Area: see text`.

Each literal label is preserved in its source observation. The canonical record uses AoN's wording and sets delivery resolution to `determined_by_selected_effect`. It does not invent one fixed target or area, because different Wish options use different delivery behavior.

## 3. Mandatory and conditional material components

The two component requirements are deliberately separate:

1. Wish always requires its own diamond worth 25,000 gp. This is a normal structured material component with `cost_gp: 25000`.
2. If Wish duplicates a spell whose material component costs more than 10,000 gp, that component is also required. This is a conditional component whose variable item and exact cost depend on the duplicated spell.

The condition retains the exact 10,000 gp threshold. The variable component does not receive a fabricated fixed cost.

## 4. Spell access

AoN adds Arcanist 9 and Psychic 9 to the Core Sorcerer 9 and Wizard 9 access. These are canonical later-first-party class-list records.

d20PFSRD additionally links five bloodline bonus-spell lists: Arcane, Div, Djinni, Draconic, and Efreeti, all at level 9. They are stored as separate `bloodline` access records rather than merged into the class list. A warning marks them for independent higher-provenance verification before public release.

## 5. Link inventory

The bounded entries preserve every literal content link, including repeated links:

- AoN combined entry: 3 links.
- Legacy Core entry: 9 links.
- Legacy mythic entry: 3 links.
- d20PFSRD base entry: 24 links after excluding its four breadcrumb links.

These produce or reuse local entities for Universal, spell lists and bloodlines, Standard and Immediate actions, Geas/Quest, Insanity, Resurrection, ability scores, afflictions, Will saves, spell resistance, opposition schools, inherent bonuses, material components, and permanent negative levels.

Repeated source links remain repeated evidence. Canonical relationships collapse them only at the entity level while retaining all relevant evidence occurrences.

## 6. Mythic Wish ownership

Mythic Wish is stored as `mythic-spell-variant.wish`, with a required `mythic_version_of` reference to `spell.wish`.

AoN includes the mythic text on the base page and identifies Mythic Adventures page 112. Legacy places the same rules on a separate mythic page and links back to Wish. d20PFSRD has no Mythic Wish section; that absence is recorded as a source warning rather than filled from another site.

The mythic text contains several ways to spend additional mythic power. Only the paragraph explicitly labeled `Augmented` becomes an augmentation record:

- ID: `mythic-spell-variant.wish.augmentation-silent-stilled`
- Minimum tier: none stated (`null`)
- Total mythic-power uses: 2
- Effect: cast a silent, stilled Mythic Wish while helpless or otherwise unable to act, but not while unconscious

The other second-use choices remain in the lossless rules text because the source presents them as effect options, not as `Augmented` paragraphs.

## 7. Small schema improvement

The Alter Fate option can cast Mythic Wish as an immediate action. Mythic-variant relationships previously could not point to action entities.

The mythic variant schema now supports the same narrow semantic edge used by canonical spells:

- relationship type `uses_action`
- target entity type `action`

No Wish-specific action field was added.

## 8. What remains deliberately unstructured

Wish's ten safe effects combine spell duplication, healing, resurrection, transport, rerolls, inherent bonuses, and flexible greater effects. One spell is not enough evidence for a durable nested option-and-outcome schema.

For now, the complete wording remains lossless and searchable, while the stable surrounding facts—delivery resolution, components, source links, class access, and mythic ownership—are structured. This avoids a schema designed only around Wish.

## 9. Validation result

The experiment validates:

- 8 schemas;
- 31 source observations;
- 1 source coverage check;
- 10 canonical spells;
- 7 mythic spell variants;
- 17 decision records;
- 9 entity registries; and
- 123 linked entities.

Wish-specific checks also confirm the four artifact hashes, exact source link counts, mandatory and conditional component separation, combined delivery kinds, reciprocal mythic identity, unnumbered augmentation values, and d20PFSRD's missing mythic section.

## Next spell

Miracle is the natural comparison. It should reveal which Wish structures are genuinely reusable and which are arcane-only behavior.
