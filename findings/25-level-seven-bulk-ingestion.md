# Level-7 bulk ingestion

All 21 level-7 catalog batches were attempted on 2026-08-20. Individual
failures were written to the manifest and the remaining queue continued.

## Catalog result

- 206 distinct level-7 catalog spells across 30 AoN class-list pages.
- 118 catalog spells have canonical records. This run added 44 new canonical
  spells; 74 already existed from reviewed records, lower-level catalogs, or
  discovered dependencies.
- 88 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 64 source retrieval failures, predominantly deterministic d20PFSRD
  comparison URLs that returned an error.
- 5 schema issues for spell-list qualifications the current parser cannot
  normalize losslessly.
- 19 schema issues for explicit spell inheritance requiring reviewed inherited
  paths and overrides.

Every issue retains the observations captured before normalization stopped.
Raw artifacts can be reparsed later without another source request.

## Dependencies and linked entities

The run tracked 53 spell dependencies outside or across the level-7 catalog
entry set. Thirty have canonical records and 23 remain explicitly pending;
none ended in an issue state. They were not silently treated as completed
level-7 queue items.

New linked concepts were registered with observation evidence in the level-7
entity registry. Cross-level appearances remain separate catalog queue items
but resolve to one canonical spell entity.

## Commands

```bash
pnpm catalog:level-7
pnpm ingest:level-7:all
pnpm db:rebuild
pnpm verify
```
