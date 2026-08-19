# Data and schemas

## Durable records

- [Canonical spell records](../data/canonical/)
- [Source observations](../data/observations/)
- [Canonicalization decisions](../data/decisions/)
- [Entity registries](../data/entities/)
- [Spell variants](../data/variants/)
- [Source coverage checks](../data/coverage/)
- [Ingestion manifests](../data/ingestion/)
- [Captured source artifacts](../data/raw/)

## Contracts and fixtures

- [JSON schemas](../schemas/)
- [Test spell fixture](../fixtures/test-spells.json)
- [Prisma data model](../prisma/schema.prisma)

The generated SQLite database at `data/database/pf1_spells.db` is intentionally
ignored by Git. Migrations and validated JSON records can rebuild it.

Return to the [project index](index.md).
