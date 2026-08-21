# Level-9 bulk ingestion

All 11 level-9 catalog batches were attempted on 2026-08-20. Individual
failures were written to the manifest and the remaining queue continued.

## Catalog result

- 109 distinct level-9 catalog spells across 30 AoN class-list pages.
- 56 catalog spells have canonical records. This run added 43 new canonical
  spells; 13 already existed from reviewed records, lower-level catalogs, or
  discovered dependencies.
- 53 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 36 source retrieval failures, predominantly deterministic d20PFSRD
  comparison URLs that returned an error.
- 2 source issues where AoN did not expose a range.
- 15 schema issues for explicit spell inheritance requiring reviewed inherited
  paths and overrides.

Every issue retains the observations captured before normalization stopped.
Raw artifacts can be reparsed later without another source request.

## Dependencies and linked entities

The run tracked 37 spell dependencies outside or across the level-9 catalog
entry set. Twenty-two have canonical records and 15 remain explicitly pending;
none ended in an issue state. They were not silently treated as completed
level-9 queue items.

New linked concepts were registered with observation evidence in the level-9
entity registry. Cross-level appearances remain separate catalog queue items
but resolve to one canonical spell entity.

## Commands

```bash
pnpm catalog:level-9
pnpm ingest:level-9:all
pnpm db:rebuild
pnpm verify
```
