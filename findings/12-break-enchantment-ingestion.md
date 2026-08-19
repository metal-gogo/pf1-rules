# Break Enchantment Ingestion Result

Break Enchantment and Mythic Break Enchantment are now complete, validated examples in the local source experiment.

## Four observations, not three

The three sites produced four independently hashed observations:

1. AoN combines the Core base spell and mythic version on one page.
2. Legacy has a Core base-spell page.
3. Legacy has a separate Mythic Adventures page.
4. d20PFSRD combines the base spell and mythic text.

The separate Legacy mythic page is not folded into the Legacy Core observation. It retains its own URL, retrieval timestamp, content hash, warnings, and source fields.

## Canonical wording decision

AoN and Legacy say:

> If the spell is one that cannot be dispelled by dispel magic or stone to flesh...

d20PFSRD omits `or stone to flesh`. This is a material conflict because it changes the explicit exception set. The canonical record selects the AoN wording, corroborated by Legacy. The d20PFSRD observation and warning retain the omission for audit.

No automatic field merge was performed.

## Structured base spell

The canonical record captures:

- Abjuration classification;
- all 18 AoN class-list entries, distinguishing Core from later first-party access;
- one-minute casting with verbal and somatic components;
- close range;
- up to one selected creature per level;
- a pairwise maximum separation of 30 feet;
- instantaneous duration;
- conditional `see text` saving-throw behavior;
- no spell resistance; and
- Core Rulebook page 251 and PFS legality.

The phrase “for each such effect” remains in lossless and searchable text. It is not forced into a generic repeated-check structure before more examples establish that model.

## Links and local entities

All bounded entry links were retained. The d20PFSRD observation contains 21 literal links, including repeated caster-level and school links where the page repeats them.

New placeholders include:

- Dispel Magic and Stone to Flesh;
- Abjuration, Enchantment, and Transmutation;
- Curse;
- Liberation and Luck domains;
- Restoration subdomain;
- Destined bloodline; and
- Godclaw and Spellscar mysteries.

Stone to Flesh is retained as a relationship even though AoN and Legacy present it as plain text rather than a hyperlink.

## Mythic ownership

`mythic-spell-variant.break-enchantment` is separate from `spell.break-enchantment`. The relationship is checked in both directions:

- the base spell has `has_mythic_variant`; and
- the mythic record has `mythic_version_of` through its required base-spell reference.

The variant is attributed to Mythic Adventures page 87. Its labeled augmentation is normalized as:

- minimum tier: 7;
- total mythic-power uses: 2; and
- exact returned-effect wording preserved.

## Validation result

The experiment now validates:

- 7 schemas;
- 25 source observations;
- 8 canonical spells;
- 6 mythic spell variants;
- 14 decision records;
- 7 entity registries; and
- 87 linked entities.

A semantic audit additionally confirms the contested wording, the 21-link inventory, reciprocal mythic identity, and augmentation values.

## Next spell

Death Clutch is next. It will test first-party material outside the Legacy PRD and branching outcomes based on both saving-throw result and remaining hit points.
