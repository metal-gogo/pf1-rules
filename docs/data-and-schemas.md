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

Canonical entity IDs and registry relationships follow the
[entity taxonomy](entity-taxonomy.md). Apply its identity rules before adding a
new entity kind or converting a discovered link into a canonical entity.

Canonical schema versions `0.1.0` and `0.2.0` are accepted. Version `0.2.0`
requires `description.document`; version `0.1.0` retains the plain-text
description contract. Rich-text documents live inside the existing canonical
payload and do not require a Prisma migration. See
[Rich-text spell descriptions](rich-text.md) for the node contract and rollout
policy.

Return to the [project index](index.md).
