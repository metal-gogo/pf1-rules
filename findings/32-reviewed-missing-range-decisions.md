# Reviewed decisions for spells with a blank printed Range

Decision date: 2026-08-21 (America/Mexico_City)

## Outcome

[C] Twelve spells whose AoN Range field is blank now have explicit reviewed
canonical overrides. The source observations remain unchanged, canonical
`effect.range.raw` remains `null`, provenance uses `manually_resolved`, and the
normalization warning is `REVIEWED_RANGE_OVERRIDE`. None of these decisions is
represented as a recovered printed Range value.

| Canonical range | Spells |
| --- | --- |
| `personal` | Aura of Distraction; Ban Corruption; Blaze of Glory; Burst of Force; Damnation; Frozen Note; Hammer of Mending; Healing Flames; Telekinetic Storm |
| `touch` | Conditional Favor; Stone Throwing |
| `distance`, formula `60-ft. line` | Massacre |

## Decision patterns

### Centered-on-you Area reviewed as personal

[C] The nine `personal` decisions share the same evidence pattern: the printed
Range is blank and the printed Area is a burst or emanation centered on the
caster. The project approved `personal` as the canonical override. This is a
reviewed project rule, not a parser inference, and the Area remains independently
preserved in `effect.area` and `effect.delivery`.

[C] This decision does not establish a global normalizer rule. Future spells
with a blank Range and a centered-on-you Area still require review unless the
project explicitly approves such a policy.

### Touched Target reviewed as touch

[C] Stone Throwing prints `Target creature touched`, which directly supports
the reviewed `touch` override while the blank printed Range remains preserved.

[C] Conditional Favor is an explicit exception. It prints only `Target one
creature`; neither source prints or implies `touch`. Its canonical `touch`
value records the approved project decision and cites the blank Range field so
that it cannot be mistaken for source-derived evidence.

### Area text copied into the canonical range formula

[C] Massacre prints `Area 60-ft. line` and no Range value. The project approved
copying the Area text into the canonical range formula, producing category
`distance` and formula `60-ft. line`. The canonical raw Range remains `null`,
and the original Area remains preserved separately.

[C] This is a spell-specific reviewed transformation. It does not authorize
copying Area into Range for other spells automatically.

## Provenance requirements

- [C] Preserve the blank AoN and d20PFSRD Range fields in their observations.
- [C] Keep canonical `effect.range.raw` as `null` for every override in this set.
- [C] Use `REVIEWED_RANGE_OVERRIDE`, `manually_resolved`, and the reviewer
  rationale for each canonical Range.
- [C] Do not rewrite the printed Target or Area fields.
- [C] Replay these decisions through `pnpm ingest:retry-reviewed-overrides` so
  generated canonical records and decision records remain reproducible.
