# Level-5 bulk ingestion

All 50 level-5 catalog batches were attempted on 2026-08-20. Individual
failures were written to the manifest and the remaining queue continued.

## Catalog result

- 492 distinct level-5 catalog spells across 30 AoN class-list pages.
- 305 catalog spells have canonical records. This run added 135 new canonical
  spells; 170 already existed from reviewed records, lower-level catalogs, or
  discovered dependencies.
- 187 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 114 source retrieval failures, predominantly deterministic d20PFSRD
  comparison URLs that returned an error.
- 2 source issues where the deterministic d20PFSRD result did not match the
  AoN spell name.
- 3 source issues where AoN did not expose a range.
- 15 schema issues for spell-list qualifications the current parser cannot
  normalize losslessly.
- 51 schema issues for explicit spell inheritance requiring reviewed inherited
  paths and overrides.
- 2 scope exclusions for entries AoN marks as legacy 3.5 material: Apparent
  Master and Sand Whirlwind, Greater.

Every issue retains the observations captured before normalization stopped.
Raw artifacts can be reparsed later without another source request.

## Dependencies and linked entities

The run tracked 95 spell dependencies outside or across the level-5 catalog
entry set. Fifty-one have canonical records and 44 remain explicitly pending;
none ended in an issue state. They were not silently treated as completed
level-5 queue items.

New linked concepts were registered with observation evidence in the level-5
entity registry. Cross-level appearances remain separate catalog queue items
but resolve to one canonical spell entity.

## Commands

```bash
pnpm catalog:level-5
pnpm ingest:level-5:all
pnpm db:rebuild
pnpm verify
```
