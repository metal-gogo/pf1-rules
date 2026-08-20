# Level-3 bulk ingestion

All 83 level-3 catalog batches were attempted on 2026-08-20. Individual
failures were written to the manifest and the remaining queue continued.

## Catalog result

- 821 distinct level-3 catalog spells across 30 AoN class-list pages.
- 582 catalog spells have canonical records. This run added 399 new canonical
  spells; 183 already existed from reviewed records, lower-level catalogs, or
  discovered dependencies.
- 239 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 122 source retrieval failures, predominantly deterministic d20PFSRD
  comparison URLs that returned an error.
- 3 source issues where the deterministic d20PFSRD result did not match the
  AoN spell name.
- 2 source issues where AoN did not expose a range.
- 42 schema issues for spell-list qualifications the current parser cannot
  normalize losslessly.
- 63 schema issues for explicit spell inheritance requiring reviewed inherited
  paths and overrides.
- 7 scope exclusions for entries AoN marks as legacy 3.5 material: Blacklight,
  Diamond Spray, Hurricane Blast, Impede Speech, Sand Whirlwind, Thorn Snare,
  and Water Shield.

Every issue retains the observations captured before normalization stopped.
Raw artifacts can be reparsed later without another source request.

## Generic publication anchors

Fickle Winds exposed an evidence-registry invariant. A d20PFSRD link labeled
`here` resolved to a publication-like target. Generic publication labels are
not suitable canonical publication relationships, but the immutable source
observation still refers to their target entity ID. Normalization now registers
that source target as an evidence-backed stub while continuing to omit the
generic label from canonical publication relationships. The spell's actual
canonical publication remains selected from the higher-provenance AoN record.

## Dependencies and linked entities

The run tracked 80 spell dependencies outside or across the level-3 catalog
entry set. Forty-six have canonical records and 34 remain explicitly pending;
none ended in an issue state. They were not silently treated as completed
level-3 queue items.

New linked concepts were registered with observation evidence in the level-3
entity registry. Cross-level appearances remain separate catalog queue items
but resolve to one canonical spell entity.

## Commands

```bash
pnpm catalog:level-3
pnpm ingest:level-3:all
pnpm db:rebuild
pnpm verify
```
