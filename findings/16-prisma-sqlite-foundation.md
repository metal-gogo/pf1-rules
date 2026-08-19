# Prisma and SQLite foundation

The spell experiment is now an executable TypeScript project rather than only a collection of schemas and examples.

## Implemented

- Prisma models for entities, source observations, links, raw references, coverage checks, canonical spells, spell access, components, inheritance, mythic variants, relationships, provenance, decisions, and ingestion workflow.
- Prisma Migrate history for the local SQLite database.
- A TypeScript importer that validates all JSON inputs before replacing database contents in one transaction.
- Typed queries for spell lookup, text search, and spell-list/level filtering.
- Foreign-key and SQLite integrity checks.
- Behavioral tests for Wish, Miracle, Mythic Wish, search, and Cleric spell access.

## Schema findings

Database constraints exposed two gaps that the earlier JSON-only checks did not catch:

1. `spell.light` lacked an entity registry row even though it had observations and a canonical record. The entity was added, and package validation now requires every canonical spell to be registered.
2. Spell inheritance `basis` is structured evidence, not a string. The database field is now JSON so observation ID, source field, and exact wording remain independently queryable and portable to PostgreSQL.

## Current validated contents

- 130 registered entities
- 34 source observations
- 11 canonical spells
- 7 mythic spell variants
- 139 semantic relationships
- 18 canonical decisions
