# Level-4 bulk ingestion

All 75 level-4 catalog batches were attempted on 2026-08-20. Individual
failures were written to the manifest and the remaining queue continued.

## Catalog result

- 745 distinct level-4 catalog spells across 30 AoN class-list pages.
- 479 catalog spells have canonical records. This run added 294 new canonical
  spells; 185 already existed from reviewed records, lower-level catalogs, or
  discovered dependencies.
- 266 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 153 source retrieval failures, predominantly deterministic d20PFSRD
  comparison URLs that returned an error.
- 3 source issues where the deterministic d20PFSRD result did not match the
  AoN spell name.
- 3 source issues where AoN did not expose a range.
- 33 schema issues for spell-list qualifications the current parser cannot
  normalize losslessly.
- 68 schema issues for explicit spell inheritance requiring reviewed inherited
  paths and overrides.
- 6 scope exclusions for entries AoN marks as legacy 3.5 material: Apparent
  Master; Hurricane Blast; Shield Speech, Greater; Thorn Snare; Traveling
  Dream; and Water Shield.

Every issue retains the observations captured before normalization stopped.
Raw artifacts can be reparsed later without another source request.

## Dependencies and linked entities

The run tracked 104 spell dependencies outside or across the level-4 catalog
entry set. Sixty have canonical records and 44 remain explicitly pending; none
ended in an issue state. They were not silently treated as completed level-4
queue items.

New linked concepts were registered with observation evidence in the level-4
entity registry. Cross-level appearances remain separate catalog queue items
but resolve to one canonical spell entity.

## Resumable batch ranges

A long-running source capture can now resume at a selected batch without
replaying earlier issue entries. The all-batches command accepts optional start
and end batch numbers while retaining one robots-policy check for the bounded
run. For example, this processes only batches 29 through 45:

```bash
pnpm tsx src/ingestion/ingest-level-zero-batch.ts all 4 29 45
```

## Commands

```bash
pnpm catalog:level-4
pnpm ingest:level-4:all
pnpm db:rebuild
pnpm verify
```
