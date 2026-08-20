# Level-2 bulk ingestion

All 77 level-2 catalog batches were attempted on 2026-08-19. Individual
failures were written to the manifest and the remaining queue continued.

## Catalog result

- 768 distinct level-2 catalog spells across 30 AoN class-list pages.
- 583 catalog spells have canonical records. This run added 506 new canonical
  spells; 77 already existed from reviewed records, lower-level catalogs, or
  discovered dependencies.
- 185 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 93 source retrieval failures, predominantly deterministic d20PFSRD
  comparison URLs that returned an error.
- 47 schema issues for spell-list qualifications the current parser cannot
  normalize losslessly.
- 36 schema issues for explicit spell inheritance requiring reviewed inherited
  paths and overrides.
- 3 source issues where AoN did not expose a range.
- 6 scope exclusions for entries AoN marks as legacy 3.5 material: Admonishing
  Ray, Drunkard's Breath, Impede Speech, Reveal True Shape, Sympathetic Wounds,
  and Veil of Ash.

Every issue retains the observations captured before normalization stopped.
Raw artifacts can be reparsed later without another source request.

## Publication page zero

Soothing Word exposed a new normalization edge case. AoN reports publication
page `0`, while the canonical schema requires real page numbers to be positive.
The source value remains losslessly preserved in its observation; the canonical
publication page is `null`, and normalization emits an
`INVALID_PUBLICATION_PAGE` warning. Treating zero as “unknown” is preferable to
inventing a valid-looking page or rejecting the otherwise representable spell.

## Dependencies and linked entities

The run discovered 44 spell dependencies outside the level-2 catalog entry
set. Twenty-one already have canonical records and 23 remain explicitly
pending. They were not silently included in this level-scoped run.

New linked concepts were registered with observation evidence in the level-2
entity registry. Cross-level appearances remain separate catalog queue items
but resolve to one canonical spell entity.

## Batch scaling

Replaying a large catalog showed that robots-policy checks were repeated for
every batch. An all-batches run now checks each source once before processing;
direct single-batch runs continue to check for themselves. Full package
validation still runs at every batch boundary.

## Commands

```bash
pnpm catalog:level-2
pnpm ingest:level-2:all
pnpm db:rebuild
pnpm verify
```
