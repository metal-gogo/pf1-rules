# Spell inheritance rollout

Date: 2026-08-21

## Scope

The inheritance rollout revisited every ingestion entry previously blocked by
`inheritance-requires-manual-resolution`. The starting queue contained 682
entries representing 490 unique spells. Reprocessing used the versioned local
AoN and d20PFSRD observations only; it did not fetch new network content.

## Result

- Canonical spell coverage increased from 2,274 to 2,735 records (+461).
- 454 formerly blocked spells now use explicit inherited paths and source-backed
  overrides.
- Seven formerly blocked spells normalized as self-contained records after the
  old broad blocker was removed.
- The catalog now contains 456 inheritance records in total, including the two
  hand-reviewed records that predated the rollout.
- Those records contain 1,295 explicit overrides: 378 inheritance edges are
  fully resolved, 73 name a parent that is not yet canonical, and five are
  pending because an ancestor chain is incomplete.
- No ingestion entry retains the legacy inheritance blocker.
- Twenty-nine of the original 490 spells remain non-canonical because of real
  source parsing or coverage failures. They remain visible as ingestion issues
  instead of being mislabeled as inheritance failures.

## Reconciliation

The first pass can discover a child before its parent. The rollout therefore
performs a second, cache-only reconciliation pass after all levels have been
visited. That pass refreshes generated inheritance records against the complete
canonical corpus and checks the full ancestor chain before marking an edge
resolved. Missing parents, incomplete ancestors, and cycles remain explicit and
auditable.

The rollout is repeatable with:

```sh
pnpm ingest:rollout-inheritance
```

## Verification

The derived SQLite database was rebuilt with 2,735 canonical spells and 456
inheritance records. Package validation, TypeScript checking, database integrity
checking, and all 30 automated tests pass through `pnpm verify`. A resolved
query for `spell.baleful-polymorph` also materializes its parent chain and
override trace successfully.

