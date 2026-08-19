# Level-0 bulk ingestion

All six level-0 catalog batches were attempted on 2026-08-19. The batch runner
continues after individual failures and records each unresolved item in the
manifest instead of aborting the remaining work.

## Catalog result

- 53 level-0 catalog spells total.
- 44 canonical level-0 spells, including the previously reviewed Light record.
- 6 source issues: Breeze, Drench, Jolt, Penumbra, Root, and Scoop. Their
  deterministic d20PFSRD comparison URLs returned HTTP 404; the AoN and any
  Legacy observations remain preserved for a later secondary-source resolver.
- 1 schema issue: Detect Fiendish Presence. Its Detect Evil parent is now
  canonical, but inherited paths and overrides still require a spell-specific
  decision. The generic importer deliberately does not flatten the wording.
- 2 scope issues: Enhanced Diplomacy and Sign of the Dawnflower remain excluded
  because AoN marks them as legacy 3.5 material.
- 0 unattempted catalog spells.

## Living dependency queue

Detect Evil was discovered from the “functions like detect evil” wording,
queued with observation-level evidence, and ingested even though it is not a
level-0 spell. The SQLite queue therefore contains 54 records: 53 catalog
entries plus this discovered dependency.

Future spell references can use the same `discovered_dependencies` collection.
Dependency records preserve the owner spell, observation, source field, anchor,
URL when present, reason, and current status.

## Linked entity enrichment

Spell ingestion also promoted 36 non-spell entities from contentless stubs to
sourced records:

- 32 AoN spell-definition entities covering magic schools, subschools, and
  descriptors.
- Standard, Free, Swift, and Immediate Action from the Legacy PRD Core Rulebook.

Each definition has an immutable source observation and raw artifact. Entity
pages display the captured definition and link back to the observation. The
Necromancy definition records a case-specific source correction: an older
preserved spell link points to AoN definition ID 8, which currently resolves to
Transmutation; Necromancy was verified at ID 7. The conflicting old evidence
was retained.

## Parser evolution

Parser revisions are preserved as separate immutable observations. The current
adapter corrects multi-entry AoN pages, fragmentless Legacy pages, punctuation
variations, publication-title normalization, and overly broad combat-link
classification. Reviewed canonical records such as Light are protected from
bulk refresh. Canonical refreshes use the latest accepted observations while
older parser snapshots remain available for audit.

## Commands

```bash
pnpm ingest:level-0:all
pnpm ingest:dependencies
pnpm ingest:linked-entities
pnpm db:rebuild
pnpm verify
```

Set `PF1_REFRESH_CANONICAL=1` only when intentionally regenerating bulk-created
canonical records after a parser or normalizer change.
