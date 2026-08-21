# Architecture and policy

PF1 Rules separates captured source claims from reviewed application data.
Source observations preserve what a specific page said at retrieval time.
Canonical records contain normalized values and retain links to the observations
that support each decision.

## Core references

- [Prisma data model](../prisma/schema.prisma)
- [Database migration history](../prisma/migrations/)
- [Database setup and SQLite-to-Neon path](database-path.md)
- [Source adapter contract](../findings/adapter-contract-v0.md)
- [Canonical source policy](../findings/canonical-source-policy-v0.md)
- [Source comparison rubric](../rubric/source-comparison-rubric.md)
- [Schema cleanliness audit](../findings/09-schema-cleanliness-audit.md)
- [Schema evolution notes](../findings/11-schema-evolution-after-four-spells.md)
- [Prisma and SQLite foundation](../findings/16-prisma-sqlite-foundation.md)

Source conflicts are recorded for review rather than merged automatically. Raw
snapshots and versioned JSON records keep the database reproducible without a
runtime dependency on a rules website.

## Spell inheritance

Spells that explicitly function like another spell use an executable patch
model. Each inheritance edge names non-overlapping canonical JSON Pointer roots
to copy from its parent. Every child difference inside those roots is an
override with a JSON Pointer, typed canonical value, exact source wording, and
source field. Resolution is recursive, so lesser/greater, mass, and communal
chains share one mechanism.

Canonical child records remain fully materialized. Package validation resolves
each completed chain and compares the result with the stored child, rejecting
missing overrides, stale parent status, invalid pointers, overlapping parents,
and cycles. `spell-resolved <name-or-id>` exposes the materialized record,
lineage, and applied-path trace through the CLI.

Return to the [project index](index.md).
