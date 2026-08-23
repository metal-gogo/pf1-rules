# Ingestion

Source capture must be explicit, rate-limited, and reproducible. Raw snapshots
are immutable, so parsing can be repeated locally without downloading a page
again. Conflicting values remain visible for review.

## Commands

```bash
pnpm catalog:level-0
pnpm ingest:level-0:all
pnpm catalog:level-1
pnpm ingest:level-1:all
pnpm catalog:level-2
pnpm ingest:level-2:all
pnpm catalog:level-3
pnpm ingest:level-3:all
pnpm catalog:level-4
pnpm ingest:level-4:all
pnpm catalog:level-5
pnpm ingest:level-5:all
pnpm catalog:level-6
pnpm ingest:level-6:all
pnpm catalog:level-7
pnpm ingest:level-7:all
pnpm catalog:level-8
pnpm ingest:level-8:all
pnpm catalog:level-9
pnpm ingest:level-9:all
pnpm ingest:retry-normalization
pnpm ingest:retry-source-issues
pnpm ingest:retry-reviewed-overrides
pnpm ingest:reviewed-list-overrides
pnpm ingest:reconcile-inherited-lists
pnpm ingest:legacy-3.5
pnpm ingest:dependencies
pnpm ingest:linked-entities
pnpm db:stats
pnpm validate
pnpm verify
```

## Implementation and design notes

`pnpm ingest:retry-normalization` replays stale `unparsed-spell-level` issues
from immutable local captures. It does not download source pages, and it skips
unrelated issue kinds and spells that already have canonical records. Pass a
level directly to `src/ingestion/ingest-level-zero-batch.ts` when a scoped
retry is preferable to the default all-level replay. Run `pnpm db:import`
afterward to load newly generated canonical records into the local database.

`pnpm ingest:retry-source-issues` replays source issue records from immutable
local captures. It does not download source pages. This allows a valid AoN or
d20pfsrd capture to proceed when an optional source is absent or malformed,
while retaining any source issue that the cached evidence cannot resolve.

`pnpm ingest:retry-reviewed-overrides` replays only records with an explicit
reviewed canonical override. The canonical value, missing raw source value,
supporting source field, and manual-resolution rationale remain separate in the
generated provenance and decision records. Run `pnpm ingest:reviewed-list-overrides`
and `pnpm ingest:reconcile-inherited-lists` afterward so reviewed membership
decisions and their class-rule consequences are reapplied to regenerated records.

`pnpm ingest:legacy-3.5` ingests the explicitly enabled first-party legacy 3.5
scope from AoN catalog evidence. Generated records set
`legacy_3_5_material: true`, every spell-list membership uses scope
`legacy_3_5`, and the local database and web pages expose the same flag. These
records are cataloged for use with the PF1 database but are not represented as
Pathfinder-native rules.

`pnpm ingest:dependencies` reconciles dependency references across every spell-level
manifest. It resolves canonical names and known aliases, ingests missing parents from
existing raw captures without downloading new sources, regenerates children that had
missing parents, and rebuilds the dependency queues from current observation evidence.
The command is idempotent; a completed run reports no pending dependencies.

- [Ingestion implementation](../src/ingestion/)
- [Level-0 ingestion queue](../findings/17-level-zero-ingestion-queue.md)
- [Level-0 bulk ingestion result](../findings/18-level-zero-bulk-ingestion.md)
- [Level-1 bulk ingestion result](../findings/19-level-one-bulk-ingestion.md)
- [Level-2 bulk ingestion result](../findings/20-level-two-bulk-ingestion.md)
- [Level-3 bulk ingestion result](../findings/21-level-three-bulk-ingestion.md)
- [Level-4 bulk ingestion result](../findings/22-level-four-bulk-ingestion.md)
- [Level-5 bulk ingestion result](../findings/23-level-five-bulk-ingestion.md)
- [Level-6 bulk ingestion result](../findings/24-level-six-bulk-ingestion.md)
- [Level-7 bulk ingestion result](../findings/25-level-seven-bulk-ingestion.md)
- [Level-8 bulk ingestion result](../findings/26-level-eight-bulk-ingestion.md)
- [Level-9 bulk ingestion result](../findings/27-level-nine-bulk-ingestion.md)
- [`markdown.new` normalization evaluation](../findings/28-markdown-new-evaluation.md)
- [Source adapter contract](../findings/adapter-contract-v0.md)
- [Source links and canonical decisions](../findings/02-source-links-and-canonical-decisions.md)
- [Entry-link inventory](../findings/03-all-entry-links.md)
- [Area rules and visual aids](../findings/05-area-rules-and-visual-aids.md)
- [Spell variant entities](../findings/08-spell-variant-entities.md)
- [Reviewed Foundry membership resolution](../findings/39-reviewed-foundry-membership-resolution.md)

Return to the [project index](index.md).
