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
pnpm ingest:dependencies
pnpm ingest:linked-entities
pnpm db:stats
pnpm validate
pnpm verify
```

## Implementation and design notes

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
- [Source adapter contract](../findings/adapter-contract-v0.md)
- [Source links and canonical decisions](../findings/02-source-links-and-canonical-decisions.md)
- [Entry-link inventory](../findings/03-all-entry-links.md)
- [Area rules and visual aids](../findings/05-area-rules-and-visual-aids.md)
- [Spell variant entities](../findings/08-spell-variant-entities.md)

Return to the [project index](index.md).
