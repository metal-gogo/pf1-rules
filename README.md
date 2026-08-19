# PF1 Rules

A lightweight, provenance-first toolkit for building a local Pathfinder 1E rules database. It focuses on reproducible spell ingestion, canonicalization with explicit provenance, and tools for searching and auditing rule decisions.

Quick links

- Project setup and environment: [docs/database-path.md](docs/database-path.md)
- Command-line tools: [src/cli.ts](src/cli.ts)
- Database schema: [prisma/schema.prisma](prisma/schema.prisma)
- JSON schemas: [schemas/](schemas/)
- Ingested data and artifacts: [data/](data/)
- Canonical records: [data/canonical/](data/canonical/)
- Decisions and provenance: [data/decisions/](data/decisions/)
- Findings and notes: [findings/](findings/)
- Tests and fixtures: [tests/](tests/) • [fixtures/test-spells.json](fixtures/test-spells.json)
- Development: [package.json](package.json) • [pnpm-workspace.yaml](pnpm-workspace.yaml)

Read on for setup, usage, and design notes.

## Ubuntu setup

The project lives at `/home/mgogo/src/pf1-rules` in the `Ubuntu-24.04` WSL distribution. Open it from Ubuntu with:

```bash
cd /home/mgogo/src/pf1-rules
code .
```

The exact toolchain is pinned in `.mise.toml`, `package.json`, and `pnpm-lock.yaml`:

- Node.js 24.19.0 LTS
- pnpm 11.22.0 through Corepack
- Prisma ORM and Prisma Client 7.9.1
- TypeScript 7.0.2

For a fresh checkout:

```bash
mise trust
mise install
corepack enable
pnpm install
pnpm db:setup
pnpm verify
```

Useful commands:

```bash
pnpm db:studio
pnpm web
pnpm web:dev
pnpm db:stats
pnpm tsx src/cli.ts spell Wish
pnpm tsx src/cli.ts search afflictions
pnpm tsx src/cli.ts list spell-list.cleric 9
pnpm tsx src/cli.ts ingestion stats
pnpm tsx src/cli.ts ingestion batch 1
pnpm tsx src/cli.ts ingestion issues
```

## Local rules browser

Run `pnpm web`, then open `http://127.0.0.1:3000`. The server reads the same
local SQLite database as the command-line tools. It provides server-rendered
pages for search, spells, entities, spell lists, relationships, and source
observations. Navigation uses ordinary links and forms, so the content works
without client-side JavaScript and remains available to assistive technology.

The generated SQLite database is `data/database/pf1_spells.db`; it is intentionally ignored by Git because it can be rebuilt from migrations and the validated JSON records.

## Level-0 ingestion queue

`data/ingestion/level-0-spells.json` is the auditable work manifest for the level-0 catalog. It was built from sequential, rate-limited captures of all 30 AoN class-list pages. The manifest preserves every page hash, every level-0 catalog membership, the AoN summary and flags, and a stable alphabetical batch assignment.

The SQLite queue derives its status during every import:

- `ingested` means a validated canonical spell with a level-0 list entry exists.
- `pending` means the catalog entry is ready for a future ingestion batch.
- `schema_issue`, `source_issue`, and `scope_issue` preserve explicit blockers without pretending the spell was ingested.

The current catalog contains 53 unique spells in six batches of ten (the last has three). Light is already ingested. Enhanced Diplomacy and Sign of the Dawnflower are marked `scope_issue` because AoN identifies them as legacy 3.5 material. Accepted policy keeps them visible for coverage but excludes them from PF1 canonicalization unless an official PF1 conversion is found or the legacy scope is deliberately enabled.

`pnpm catalog:level-0` is the capture command. It uses an identifying user-agent, waits between requests, preserves raw HTML under `data/raw/catalogs/`, and refuses to overwrite an existing manifest or raw snapshot.

## Database direction

Prisma is the application model and migration tool. SQLite is the local prototype database, using `@prisma/adapter-better-sqlite3`. The eventual hosted database is Neon PostgreSQL, using `@prisma/adapter-neon`.

SQLite and PostgreSQL do not share migration SQL. When the project moves to Neon, we will keep the data model, change the Prisma provider to `postgresql`, generate a new PostgreSQL baseline migration, and import the canonical/source records through this same importer. We will not try to deploy the SQLite migration files to Neon. See `docs/database-path.md`.

## Source strategy

1. Archives of Nethys (AoN) is the primary first-party catalog candidate.
2. The legacy Pathfinder Reference Document is the stable baseline.
3. d20PFSRD is a secondary comparison source.
4. Third-party material is excluded unless it is deliberately enabled.
5. Conflicting values are recorded for review and are never merged automatically.

The experiment does not make the application depend on any website. Raw pages are captured during an explicit import operation and converted into versioned local records.

## The two-layer model

### Source observations

A source observation preserves what one page said at one moment. It includes the URL, retrieval time, content hash, parser version, raw values, and warnings. It must remain valid even when normalization fails.

Schema: `schemas/source-spell-observation.schema.json`

### Canonical spells

A canonical spell is the normalized representation used by filtering and search. Every normalized value retains a raw form, and every material field can point back to one or more source observations.

Schema: `schemas/canonical-spell.schema.json`

### Source coverage checks

A coverage check records a reproducible lookup against a captured source index. It can prove that a name was found or not found without creating a fake empty spell observation. The query, result, retrieval metadata, and raw index hash are validated together.

Schema: `schemas/source-coverage-check.schema.json`

### Spell variants

A spell variant is a separately identifiable published modification that retains a required relationship to its base spell. Mythic versions are the first supported kind. Variant-only text, publication data, semantic links, provenance, and augmented mythic options belong to the variant rather than the base spell.

Schema: `schemas/mythic-spell-variant.schema.json`

### Comparisons

A comparison describes whether source values match, differ only in formatting, add later ruleset scope, conflict materially, or require human review.

Schema: `schemas/spell-comparison.schema.json`

## Experiment sequence

1. Run a five-spell smoke test: Light, Fireball, Web, Permanency, and Wish.
2. Save the raw HTML from all three sites before parsing it.
3. Implement one source adapter per site. Adapters emit source observations only.
4. Validate every observation against the observation schema.
5. Expand to the complete 22-spell test set in `fixtures/test-spells.json`.
6. Compare observations field by field and classify every difference.
7. Score each source with the rubric in `rubric/source-comparison-rubric.md`.
8. Choose the canonical source policy. This can be a primary source plus fallbacks; it does not have to be one source for every field.

## Incremental findings

- `findings/01-light.md` records the first manual three-source comparison.
- `findings/adapter-contract-v0.md` defines the smallest safe fetcher/adapter boundary learned from that comparison.
- `findings/02-source-links-and-canonical-decisions.md` explains how source hyperlinks become auditable offline relationships.
- `findings/canonical-source-policy-v0.md` defines the provenance-first baseline and case-by-case override policy.
- `findings/03-all-entry-links.md` inventories every Light entry link and explains placeholder entity expansion.
- `findings/04-fireball.md` evaluates Fireball across all three sources, including Mythic Fireball, area geometry, access-list types, and the complete bounded-entry link inventory.
- `findings/05-area-rules-and-visual-aids.md` separates area propagation, geometry, and dimensions while distinguishing authoritative definitions from visual templates.
- `findings/06-cure-light-and-mass.md` evaluates shared-page spell identity, Mythic section ownership, single and multiple targets, and non-inheriting related-spell links.
- `findings/07-cure-moderate-and-inflict.md` distinguishes rules inheritance from cure/inflict counterpart links and preserves both raw compact wording and resolved query behavior.
- `findings/08-spell-variant-entities.md` gives mythic versions stable identifiers, required base-spell relationships, scoped semantic links, and nested augmented options.
- `findings/09-schema-cleanliness-audit.md` audits the seven schemas present at that stage for deprecated, transitional, compatibility-only, and unsupported speculative fields; the later coverage-check schema is independently validated with the rest of the package.
- `findings/10-break-enchantment-death-clutch-wish-miracle.md` verifies four additional spells and records the resulting source conflicts, mythic ownership, semantic links, and schema pressure.
- `findings/11-schema-evolution-after-four-spells.md` records the implemented mythic-identity, delivery-header, and conditional-component changes plus the intentionally deferred outcome model.
- `findings/12-break-enchantment-ingestion.md` records the completed four-observation ingestion, material wording resolution, link inventory, canonical spell, and mythic variant.
- `findings/13-death-clutch-ingestion.md` records the two-source ingestion, Legacy coverage gap, branching outcomes, component punctuation, recovery graph, and deferred outcome model.
- `findings/14-wish-ingestion.md` records the four-observation Wish ingestion, combined delivery header, mandatory and conditional component costs, bloodline access, full link inventory, Mythic Wish ownership, and the immediate-action schema improvement.
- `findings/15-miracle-ingestion.md` records the three-source Miracle ingestion, its two distinct conditional material obligations, choice-dependent delivery, supplemental domain access, full link inventory, and verified absence of a Mythic Miracle entity.
- `findings/16-prisma-sqlite-foundation.md` records the local Prisma/SQLite database foundation and the provider-specific Neon transition plan.
- `findings/17-level-zero-ingestion-queue.md` records the complete AoN level-0 inventory, stable batching, derived statuses, and the two legacy-3.5 scope issues.
- `data/raw/light/` contains the immutable HTML snapshots used for that comparison.
- `data/observations/light/` contains the three schema-shaped source observations.
- `data/canonical/light.json` is the first validated canonical record and contains the local Light → Permanency relationship.
- `data/decisions/light.json` connects all three observations to field- and relationship-level decisions.
- `data/entities/light-linked-entities.json` contains the first placeholder entity registry.
- `data/raw/fireball/` and `data/observations/fireball/` preserve the three Fireball captures and structured observations.
- `data/canonical/fireball.json` and `data/decisions/fireball.json` contain the validated provenance-first Fireball result.
- `data/entities/fireball-linked-entities.json` registers the eleven new link targets exposed by Fireball.
- `data/entities/area-rules-and-visuals.json` registers Core area-rule placeholders separately from the d20PFSRD visual-aid placeholder.
- `data/raw/cure-light-wounds/` preserves the four unique page captures used for the two-spell comparison.
- `data/observations/cure-light-wounds/` and `data/observations/cure-light-wounds-mass/` contain six independent spell observations, including two observations derived from each shared Legacy/d20PFSRD page.
- `data/canonical/cure-light-wounds.json` and `data/canonical/cure-light-wounds-mass.json` are the validated, independent canonical records.
- `data/decisions/cure-light-wounds.json` and `data/decisions/cure-light-wounds-mass.json` record the field and relationship decisions.
- `data/entities/cure-light-linked-entities.json` registers the spell identities, Cure Wounds family, classifications, rule links, and new list types.
- `data/raw/moderate-and-inflict/` preserves the nine page captures for Cure Moderate Wounds, Inflict Light Wounds, and Inflict Moderate Wounds.
- `data/observations/cure-moderate-wounds/`, `data/observations/inflict-light-wounds/`, and `data/observations/inflict-moderate-wounds/` preserve the three-source page claims without filling omitted inherited fields.
- The corresponding files in `data/canonical/` resolve parent behavior for queries, while the files in `data/decisions/` explain every source and relationship choice.
- `data/entities/moderate-and-inflict-entities.json` registers the new spells, Inflict Wounds family, Necromancy school, Antipaladin list, and Sickened condition placeholders.
- `data/variants/` contains seven independently validated mythic spell-variant records covering Fireball, the captured Cure/Inflict spells, Break Enchantment, and Wish.
- `data/entities/mythic-spell-variants.json` registers the new variant identifiers, and the corresponding decision records in `data/decisions/` preserve their case-by-case canonicalization choices.
- `data/raw/break-enchantment/` and `data/observations/break-enchantment/` contain four independently hashed captures: AoN, Legacy Core, separate Legacy mythic, and d20PFSRD.
- `data/canonical/break-enchantment.json`, `data/variants/break-enchantment-mythic.json`, and their decision records preserve the corroborated Stone to Flesh wording and the 7th-tier mythic augmentation.
- `data/entities/break-enchantment-linked-entities.json` registers the new spell, school, rule, and spell-list placeholders discovered by the complete link inventory.
- `data/raw/death-clutch/` preserves AoN, d20PFSRD, and the Legacy spell index used for the reproducible absence check.
- `data/observations/death-clutch/`, `data/canonical/death-clutch.json`, and `data/decisions/death-clutch.json` preserve and resolve the two positive source records without flattening their three outcome branches.
- `data/entities/death-clutch-linked-entities.json` registers the recovery spells, conditions, descriptors, publication, and rules exposed by Death Clutch's link graph.
- `data/coverage/death-clutch-legacy.json` is the first validated negative-coverage record and proves the zero-match Legacy index result against its hashed artifact.
- `data/raw/wish/` and `data/observations/wish/` preserve four independently hashed captures: AoN's combined page, Legacy Core, separate Legacy mythic, and d20PFSRD's base-only page.
- `data/canonical/wish.json`, `data/variants/wish-mythic.json`, and their decision records separate the base spell from its mythic rules while preserving Wish's choice-dependent delivery and two distinct material-component obligations.
- `data/entities/wish-linked-entities.json` registers the new school, bloodline, spell, rule, action, condition, and pending metamagic-feat targets exposed by Wish's complete link and terminology audit.
- `data/raw/miracle/` preserves the three spell pages plus the Legacy Mythic Spell Index used for the negative-coverage check; `data/observations/miracle/` contains the three positive source observations.
- `data/canonical/miracle.json` and `data/decisions/miracle.json` preserve the base spell and its provenance-first decisions without creating a mythic variant.
- `data/entities/miracle-linked-entities.json` registers Miracle, Feeblemind, the new domain-style lists, Alignment, and the reusable Spell Duplication rule placeholder.
- `data/coverage/miracle-legacy-mythic.json` reproducibly records that the captured Legacy Mythic Spell Index contains no Miracle entry.

## Required crawler behavior

- Use an explicit user-agent identifying the private experiment.
- Rate-limit requests and avoid parallel bursts.
- Respect robots.txt and site-specific restrictions.
- Store retrieval status and errors rather than silently skipping pages.
- Never overwrite an existing raw snapshot.
- Re-running a parser must not require re-downloading a page.
- A parser must emit a warning when it encounters unrecognized or ambiguous markup.
- Navigation, advertisements, discussion links, and artwork must not enter rules text.

## Identifiers

- Canonical spell IDs use `spell.<normalized-name>`, for example `spell.fireball`.
- Observation IDs use `<site>:<spell-id>:<content-hash-prefix>`.
- Source IDs are `aon`, `legacy_aon`, and `d20pfsrd`.

## Decision boundary

The first selected source must satisfy all of the following:

- No unexplained first-party/third-party leakage.
- No silent text rewriting.
- Sufficient provenance to audit important fields.
- Reproducible extraction from archived pages.
- Acceptable licensing path for the intended private prototype.

A high aggregate score cannot override one of these failures.
