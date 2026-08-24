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
- [Native Markdown read model for LLM use](../findings/29-native-markdown-read-model.md)

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

`pnpm ingest:rollout-inheritance` repeatably reprocesses the legacy inheritance
backlog from local cached observations, then reconciles child records after all
new parent records are available. The [rollout finding](../findings/30-spell-inheritance-rollout.md)
records the completed migration and remaining source-quality issues.

## Qualified spell-list access

A canonical `levels` item represents one access path onto a base spell list.
Its optional `qualifications` array preserves deity, mystery, archetype,
free-form conditional, and publication restrictions as ordered discriminated
objects. Qualifications on one item are conjunctive. Alternative access paths,
including a different qualified level on the same list, are separate `levels`
items rather than synthetic spell-list IDs.

The relational read model mirrors that shape: `spell_levels` uses the canonical
array ordinal as membership identity, while `spell_list_qualifications` stores
each qualification's kind and complete JSON payload. This keeps kinds queryable
without flattening or discarding their nested domain fields.

Normalization treats a trailing parenthetical after a comma-separated class
group as a restriction on every entry in that group. Known deity names become
deity qualifications; explicit archetypes and generic conditions retain their
own typed payloads. `Mystery` sections normalize onto the Oracle spell list, and
each mystery alternative keeps its own optional publication product-code scope.

## Derived representations

Human-facing HTML and any future LLM-facing Markdown are replaceable read
models. They are rendered from canonical/query data and may include provenance,
but they do not replace canonical JSON, source observations, or captured source
artifacts. The [native Markdown design note](../findings/29-native-markdown-read-model.md)
records a possible future route and content-negotiation contract.

## Rich-text spell descriptions

Schema version `0.2.0` stores a small semantic JSON document under
`description.document`. The document contains paragraphs, unordered lists, list
items, text, hard breaks, and entity links. Text and entity links may carry
bold or italic marks. Entity-link nodes store only a canonical relationship ID;
the accepted relationship remains authoritative for the target and local URL.
Schema version `0.1.0` remains valid and uses the plain-text renderer.

The canonical payload remains the only persistent store for rich text. The
relational database has no duplicate rich-text tables. `description.raw`,
`search_text`, and description sections remain available for compatibility,
and validation compares document leaf text with `description.raw` after
normalizing structural whitespace.

Inline links come from bounded source HTML and accepted canonical
relationships. Classification relationships such as `has_descriptor` do not
become description links merely because their label occurs in prose. When an
ordinary term has the same name as the current spell, source context determines
the referenced rules entity; a spell never links to its own page. Ambiguous
occurrences remain plain text. Mythic and other separately titled variants must
not be included in a base spell's description. A modeled mythic variant instead
renders as its own section on the base spell page.

The web read model renders semantic, escaped HTML and normal same-tab links.
Resolved `functions_like` parents expand once after the description and never
recurse. Separately, base, `, Lesser`, `, Greater`, and `Deeper` titles form a
navigation family and may also display once. Title grouping does not assert
rules inheritance; only a canonical relationship can do that.

See [Rich-text spell descriptions](rich-text.md) for the pilot scope,
normalization rules, and rollout checklist.

Return to the [project index](index.md).
