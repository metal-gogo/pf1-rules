# Level-1 bulk ingestion

All 53 level-1 catalog batches were attempted on 2026-08-19. The same
failure-isolation policy used for level 0 was retained: an individual spell
issue is written to the manifest and does not stop the remaining queue.

## Catalog result

- 526 distinct level-1 catalog spells across 30 AoN class-list pages.
- 393 catalog spells have canonical records. This run added 381 new canonical
  spells; the other 12 were already present from reviewed records, level-0
  work, or discovered dependencies.
- 133 catalog entries have explicit issues.
- 0 catalog entries remain pending or unattempted.

The issue breakdown is:

- 56 schema issues for spell-list entries with qualifications the current
  level parser cannot normalize losslessly, commonly deity-specific lists.
- 25 schema issues for inheritance wording such as “functions like.” These
  require explicit inherited paths and overrides rather than flattening.
- 45 source issues, predominantly deterministic d20PFSRD comparison URLs that
  returned an error.
- 3 source issues where AoN did not expose a range.
- 1 d20PFSRD name mismatch.
- 3 scope exclusions for AoN entries marked as legacy 3.5 material: Pattern
  Recognition, Shield Speech, and Sign of the Dawnflower.

Every issue retains any observations captured before the failure. Raw source
artifacts remain reusable for later parser or schema improvements.

## Cross-level queue identity

A spell can appear at different levels on different class lists. Chameleon
Scales, for example, belongs to both the level-0 and level-1 catalogs while
remaining one canonical spell entity. Ingestion queue uniqueness therefore
includes the catalog ID instead of treating the source spell name as globally
unique. Both catalog memberships remain queryable and auditable.

## Linked entities and dependencies

Canonicalization registered every captured link target, including source
publication identifiers that normalize to a different canonical publication
ID. The level-1 entity registry contains the new linked concepts and evidence
without discarding the original target hint.

The run discovered 13 spell dependencies outside the catalog entry set. Three
already have canonical records and 10 remain explicitly pending. They were not
silently pulled into this level-scoped ingestion run.

## Commands

```bash
pnpm catalog:level-1
pnpm ingest:level-1:all
pnpm db:rebuild
pnpm verify
```
