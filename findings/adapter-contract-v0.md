# Source Adapter Contract v0

The Light inspection suggests the crawler should be split into two independent parts.

## Fetcher

The fetcher performs network work and produces an immutable snapshot:

```text
fetch(source_id, url) -> raw HTML + retrieval metadata
```

It is responsible for the URL, user-agent, request rate, HTTP status, retrieval timestamp, content type, hash, and raw file path. It does not understand spells.

## Source adapter

Each source has its own adapter:

```text
parse(snapshot) -> SourceSpellObservation
```

The adapter reads an already-downloaded page and performs no web requests. It extracts raw spell fields, page provenance, source notices, publisher evidence, and warnings. It does not create or modify a canonical spell.

The three initial adapters will be:

- `AonSpellAdapter`
- `LegacyAonSpellAdapter`
- `D20PfsrdSpellAdapter`

## Required adapter behavior

Every adapter must:

1. Confirm that the page appears to be the expected spell.
2. Extract visible source values without rewriting them.
3. Retain combined list names in `levels_raw`.
4. Preserve every literal hyperlink inside the verified spell-entry boundary, including its anchor, raw URL, resolved URL, field, and context.
5. Exclude navigation, advertising, scripts, artwork, discussion links, and store content.
6. Emit a warning for a missing expected field.
7. Emit an error-level warning when the content boundary cannot be established safely.
8. Return an observation even when some fields cannot be parsed.

## Why the adapters remain separate

- AoN uses one dense content span with bold labels and heading boundaries.
- Legacy PRD uses dedicated stat-block paragraphs followed by description paragraphs.
- d20PFSRD uses article metadata, divider paragraphs, mixed field paragraphs, and embedded page noise.

A generic parser would either contain source-specific branches disguised as shared logic or would become too permissive to detect silent failures.

## Deferred work

The adapter does not yet:

- split combined class names;
- decide whether a spell list is core or later first-party scope;
- choose between conflicting description text;
- apply FAQ or errata changes;
- generate the canonical spell record.

Those operations belong to comparison and normalization after all source observations have been preserved.
