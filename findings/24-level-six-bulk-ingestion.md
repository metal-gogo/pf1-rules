# Level-6 bulk ingestion

All 40 level-6 catalog batches were attempted on 2026-08-20. Individual
failures were written to the manifest and the remaining queue continued.

## Catalog result

- 399 distinct level-6 catalog spells across 30 AoN class-list pages.
- 228 catalog spells have canonical records. This run added 131 new canonical
  spells; 97 already existed from reviewed records, lower-level catalogs, or
  discovered dependencies.
- 171 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 119 source retrieval failures, predominantly deterministic d20PFSRD
  comparison URLs that returned an error.
- 3 source issues where the deterministic d20PFSRD result did not match the
  AoN spell name.
- 10 schema issues for spell-list qualifications the current parser cannot
  normalize losslessly.
- 36 schema issues for explicit spell inheritance requiring reviewed inherited
  paths and overrides.
- 3 scope exclusions for entries AoN marks as legacy 3.5 material: Flesh to
  Ooze, Hardening, and Torrent of Elemental Rage.

Every issue retains the observations captured before normalization stopped.
Raw artifacts can be reparsed later without another source request.

## Dependencies and linked entities

The run tracked 94 spell dependencies outside or across the level-6 catalog
entry set. Forty-eight have canonical records and 46 remain explicitly
pending; none ended in an issue state. They were not silently treated as
completed level-6 queue items.

New linked concepts were registered with observation evidence in the level-6
entity registry. Cross-level appearances remain separate catalog queue items
but resolve to one canonical spell entity.

## Commands

```bash
pnpm catalog:level-6
pnpm ingest:level-6:all
pnpm db:rebuild
pnpm verify
```
