# Ingestion

Source capture must be explicit, rate-limited, and reproducible. Raw snapshots
are immutable, so parsing can be repeated locally without downloading a page
again. Conflicting values remain visible for review.

## Commands

```bash
pnpm catalog:level-0
pnpm ingest:level-0:all
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
- [Source adapter contract](../findings/adapter-contract-v0.md)
- [Source links and canonical decisions](../findings/02-source-links-and-canonical-decisions.md)
- [Entry-link inventory](../findings/03-all-entry-links.md)
- [Area rules and visual aids](../findings/05-area-rules-and-visual-aids.md)
- [Spell variant entities](../findings/08-spell-variant-entities.md)

Return to the [project index](index.md).
