# Level-8 bulk ingestion

All 14 level-8 catalog batches were attempted on 2026-08-20. Individual
failures were written to the manifest and the remaining queue continued.

## Catalog result

- 136 distinct level-8 catalog spells across 30 AoN class-list pages.
- 71 catalog spells have canonical records. This run added 41 new canonical
  spells; 30 already existed from reviewed records, lower-level catalogs, or
  discovered dependencies.
- 65 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 46 source retrieval failures, predominantly deterministic d20PFSRD
  comparison URLs that returned an error.
- 1 schema issue for a spell-list qualification the current parser cannot
  normalize losslessly.
- 18 schema issues for explicit spell inheritance requiring reviewed inherited
  paths and overrides.

Every issue retains the observations captured before normalization stopped.
Raw artifacts can be reparsed later without another source request.

## Dependencies and linked entities

The run tracked 46 spell dependencies outside or across the level-8 catalog
entry set. Twenty-one have canonical records and 25 remain explicitly pending;
none ended in an issue state. They were not silently treated as completed
level-8 queue items.

New linked concepts were registered with observation evidence in the level-8
entity registry. Cross-level appearances remain separate catalog queue items
but resolve to one canonical spell entity.

## Commands

```bash
pnpm catalog:level-8
pnpm ingest:level-8:all
pnpm db:rebuild
pnpm verify
```
