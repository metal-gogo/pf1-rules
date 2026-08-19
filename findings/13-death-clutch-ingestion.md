# Death Clutch Ingestion Result

Death Clutch is now a complete, validated canonical example based on two positive spell observations and one preserved Legacy coverage check.

## Source coverage

- AoN provides the canonical first-party record and identifies Horror Adventures page 115.
- d20PFSRD independently agrees on the mechanics and provides a dense semantic-link inventory. Its Section 15 notice corroborates Horror Adventures.
- The captured Legacy spell index contains no `Death Clutch` entry. This is recorded as absent coverage, not as an empty spell observation.

The Legacy index artifact is stored with the two spell pages. A validated source-coverage record stores its URL, retrieval time, content hash, case sensitivity, exact query, and zero-match result. The validator reruns the search against the hashed artifact.

## Component punctuation

AoN renders `Components V, S,` with a trailing comma. d20PFSRD renders `V, S` and neither source displays a third component.

The canonical record therefore contains exactly two structured components—verbal and somatic—while preserving AoN's literal `V, S,` value in `components_raw`. A warning explains the presentation artifact.

## Branching outcomes

The spell has three materially different branches:

1. Failed Fortitude save with 200 or fewer remaining hit points: heart removal, negative hit-point reduction, temporary Staggered, then death unless the recovery sequence intervenes.
2. Failed save with 201 or more remaining hit points: one minute of Staggered, 1d4 Constitution drain, and 1d4 Constitution bleed.
3. Successful save at any hit-point total: Staggered until the caster's next turn.

These branches remain intact in canonical raw and searchable text. They are not flattened into one damage or condition value, and a one-spell `failure_below_200_hp` structure was deliberately rejected.

## Recovery graph

The canonical relationship graph records:

- `requires` → Regenerate, explicitly scoped by its note to recovery rather than casting;
- `references` → Breath of Life;
- `references` → Raise Dead;
- `uses_definition` → Regeneration; and
- `uses_definition` → Dead.

Breath of Life and Raise Dead do not by themselves resolve the missing-heart requirement. The exact following-round Regenerate rule remains in the canonical wording.

If this pattern recurs, a future `recovery_requires` relationship may be more precise than the current general-purpose `requires` edge.

## Classification and rules links

The spell is Necromancy with Death and Evil descriptors. The d20PFSRD bounded entry contains 27 literal links, including repeated links where the page repeats them. Local entities now cover:

- Fortitude saving throws;
- hit points;
- caster level;
- Constitution;
- Staggered;
- ability drain;
- Bleed;
- Regeneration and Dead; and
- all three named recovery spells.

## No mythic entity

No source provides a Mythic Death Clutch section. The canonical spell has no `has_mythic_variant` relationship, and no mythic entity was inferred from its level or theme.

## Schema decision

No new outcome schema was added. Death Clutch confirms the need for an eventual predicate/outcome model, but one example is not enough to determine how save results, numeric thresholds, timing, damage, conditions, and recovery clauses should compose.

## Validation result

The experiment now validates:

- 8 schemas;
- 27 source observations;
- 1 source coverage check;
- 9 canonical spells;
- 6 mythic spell variants;
- 15 decision records;
- 8 entity registries; and
- 102 linked entities.

A semantic audit additionally verifies all three outcome branches, the 27-link inventory, two-component interpretation, recovery graph, absence of a mythic relationship, and absence from the captured Legacy index.

## Next spell

Wish is next. It will exercise the combined `Target, Effect, or Area` delivery header, a mandatory 25,000 gp diamond, flexible spell duplication, and a complex mythic version.
