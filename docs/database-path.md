# Database path: SQLite to Neon

## Current local phase

- Prisma schema: `prisma/schema.prisma`
- SQLite migration history: `prisma/migrations/`
- Local adapter: `@prisma/adapter-better-sqlite3`
- Rebuildable database: `data/database/pf1_spells.db`
- Durable inputs: versioned JSON records and captured source artifacts under `data/`

SQLite keeps early ingestion fast and completely local. The Prisma schema deliberately uses types that also have direct PostgreSQL equivalents: strings, numbers, booleans, timestamps, JSON, relations, unique constraints, and indexes.

## Portability boundary

Prisma migration files contain provider-specific SQL. The SQLite migration history is therefore a development history, not the future Neon deployment history. The portable artifacts are:

1. The conceptual Prisma data model.
2. The validated source and canonical JSON records.
3. The TypeScript importer and query contracts.
4. The integrity and behavior tests.

Search is also kept behind a query service. We can use SQLite FTS5 locally and PostgreSQL full-text search or `pg_trgm` on Neon without leaking either implementation into the canonical spell model.

## Neon transition

When remote hosting is useful:

1. Create an isolated Neon branch for the migration rehearsal.
2. Preserve the SQLite migration history as an archive.
3. Change the Prisma datasource provider from `sqlite` to `postgresql`.
4. Set `DATABASE_URL` to the Neon PostgreSQL connection string.
5. Generate a fresh PostgreSQL baseline migration from the reviewed Prisma model.
6. Regenerate Prisma Client and instantiate it with `@prisma/adapter-neon`.
7. Run the importer against the empty Neon branch.
8. Run the same database checks and behavioral tests.
9. Promote only after record counts, provenance links, and representative spell queries match SQLite.

No application code should select a database by silently guessing from a URL. At the transition we will expose explicit local and Neon client factories, so an accidental production connection is difficult.
