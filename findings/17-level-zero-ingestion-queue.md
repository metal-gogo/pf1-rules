# Level-0 ingestion queue

> Historical setup note: the queue described here has now been processed. See
> [the bulk ingestion result](18-level-zero-bulk-ingestion.md) for current
> statuses and totals.

## Outcome

The level-0 ingestion phase now has a complete, reproducible work inventory before bulk canonicalization begins.

- All 30 AoN class spell-list pages were retrieved sequentially with an identifying user-agent and a one-second interval.
- Twenty-two class lists contain level-0 spells; eight do not.
- The union contains 53 unique spell names.
- The inventory is divided alphabetically into six stable batches of ten, with three spells in the last batch.
- Raw catalog pages are immutable snapshots with retrieval timestamps and SHA-256 hashes.
- The validated manifest preserves each spell's direct AoN URL, every class-list membership, the catalog summary, PFS marker, component/restriction/mythic flags, and legacy-3.5 marker.

## Status semantics

Queue status is rebuilt from validated evidence rather than maintained as an independent checklist.

- `ingested`: the package contains a validated canonical record with at least one level-0 list entry.
- `pending`: cataloged but not yet canonicalized and not blocked.
- `schema_issue`: the source entry cannot be represented losslessly by the current schema.
- `source_issue`: source capture or source interpretation blocks ingestion.
- `scope_issue`: current source policy blocks canonicalization or requires an explicit scope decision.

This prevents a stale queue from claiming success after a canonical file is removed and makes every database rebuild reproduce the current project state.

## Initial state

Light is the only catalog member already represented by a validated level-0 canonical record. Fifty spells are pending.

Enhanced Diplomacy and Sign of the Dawnflower are marked `scope_issue`. AoN explicitly labels both as 3.5 material. The accepted policy keeps them in the coverage inventory but excludes them from PF1 canonicalization unless an official PF1 conversion or reprint is found, or legacy first-party 3.5 material is deliberately enabled as a separate scope.

No entry is currently marked `schema_issue`. Those issues should be added to the manifest when a batch inspection demonstrates that current normalized structures cannot preserve a source rule without flattening or loss.

## Batch workflow

For each batch:

1. Preserve the AoN, Legacy PRD, and d20PFSRD observations or a reproducible negative coverage check where a source lacks the spell.
2. Inventory all meaningful links and register stable target entities.
3. Attempt lossless normalization with field-level provenance.
4. If the schema cannot represent a rule, add a `schema_issue` with a specific code and explanation instead of forcing the spell into an inaccurate record.
5. Create the canonical decision only after conflicts are reviewed case by case.
6. Rebuild the database; completed records become `ingested` automatically.

Useful inspection commands:

```bash
pnpm tsx src/cli.ts ingestion stats
pnpm tsx src/cli.ts ingestion list pending
pnpm tsx src/cli.ts ingestion batch 1
pnpm tsx src/cli.ts ingestion issues
```
