# Native Markdown read model for LLM use

## Status

This is a future-facing design note, not an implementation commitment. It
records a useful idea that emerged from the `markdown.new` evaluation: Markdown
can be valuable for LLM-assisted discovery even though an external HTML-to-
Markdown converter is not suitable for evidence processing.

## Opportunity

PF1 Rules could expose its own pages and search results as Markdown whenever a
person or tool wants a compact, structured representation. The application
already knows the canonical entity boundary and has structured fields,
relationships, inheritance, and provenance. Rendering that data directly is
more reliable than converting the human-facing HTML back into Markdown.

Illustrative routes are:

```text
/spells/fireball            human-facing HTML
/spells/fireball.md         LLM-friendly Markdown
/search.md?q=fire+damage    Markdown search results
```

The final route design may instead use content negotiation on the existing URL:

```http
Accept: text/markdown
```

Supporting both a discoverable `.md` URL and `Accept: text/markdown` may be
useful. Both forms should invoke the same renderer and return equivalent
content.

## Authority model

Native Markdown would be a read model only. The authority order remains:

1. captured source artifact and retrieval hash for original source evidence;
2. immutable source observation for bounded literal claims;
3. reviewed canonical JSON and decisions for application rules data; and
4. generated HTML, Markdown, search indexes, and database rows as replaceable
   projections.

The Markdown response must identify itself as derived. It must never become an
input to ingestion, source comparison, canonicalization, or validation merely
because it is convenient for an LLM to read.

## Rendering principle

Render Markdown from the same query/domain objects that produce the PF1 Rules
page or API response. Do not scrape the rendered HTML, refetch a source site, or
send the page through an external converter.

This gives the renderer an explicit spell boundary and lets it include only the
desired information. It also keeps labels, relationships, and evidence links
typed until the final serialization step.

An entity document could use a stable shape such as:

```markdown
---
representation: pf1-rules-markdown-v1
entity_id: spell.fireball
canonical_revision: <content hash or dataset revision>
authoritative: false
---

# Fireball

> Derived PF1 Rules read model. See Provenance for authoritative evidence.

## Rules

- School: evocation [fire]
- Level: sorcerer/wizard 3
- Casting time: 1 standard action
- Range: long

## Description

...

## Relationships

- Has descriptor: Fire
- Appears on spell list: Wizard

## Provenance

- Canonical decision: canonical-decision:spell.fireball:v0.1
- Selected observation: aon:spell.fireball:<hash>
- Original artifact SHA-256: <hash>
```

The exact fields should follow the canonical schema rather than this sketch.
Null, unknown, conditional, and not-applicable values must remain distinct when
that distinction matters.

## Search representation

A Markdown search response should be a deterministic result document rather
than prose invented for the request. It should include:

- the submitted query and applied filters;
- result count, pagination, and sort order;
- stable entity IDs and links to HTML and Markdown representations;
- concise canonical snippets rather than copied page chrome;
- relevant relationship or inheritance context when requested; and
- enough provenance to let an LLM cite the local PF1 Rules record.

Search summaries should not silently flatten inherited rules or source
disagreements. If resolved inheritance is shown, the response should label it
and expose lineage. If a field has unresolved source variation, that state
should remain visible.

## HTTP and caching considerations

A future implementation should consider:

- `Content-Type: text/markdown; charset=utf-8`;
- `Vary: Accept` when content negotiation is supported;
- an `ETag` derived from the dataset revision and representation version;
- deterministic output so unchanged canonical data produces unchanged bytes;
- the same authorization rules as the corresponding HTML page;
- bounded pagination and response sizes for search; and
- a visible link between the HTML and Markdown representations.

Avoid embedding a wall-clock generation timestamp in the document body unless
it is semantically necessary, because it defeats stable hashes and caching.

## LLM safety and usability

Source wording is data, not instruction. The representation should clearly
delimit quoted or literal source material and should not place it in metadata or
control fields that an LLM might mistake for application instructions.

The renderer should also:

- escape Markdown syntax in untrusted labels and link destinations;
- omit page navigation, scripts, styling, and unrelated sibling entities;
- use stable headings that are suitable chunk boundaries;
- prefer explicit identifiers over ambiguous names; and
- keep provenance adjacent to the claims it supports.

These measures make the document easier to retrieve and cite, but consumers
must still treat its contents as untrusted data.

## Possible uses

- Give an LLM one compact spell or entity record for explanation.
- Search the local rules database and pass structured results to an LLM.
- Build a local retrieval index without parsing the web UI.
- Compare canonical, inherited, and source-observation views during review.
- Let agents follow stable local relationships while retaining citations.

## Non-goals

The Markdown read model would not:

- replace canonical JSON, source observations, or raw artifacts;
- discover or validate source references;
- decide source conflicts;
- become a new editable content format;
- require `markdown.new` or another remote conversion service; or
- imply that every source artifact may be redistributed as Markdown.

## Suggested proof of concept

If this idea is revisited, start with one read-only spell route and one search
route. Reuse the existing query service and test them against canonical JSON,
resolved inheritance, relationships, and provenance.

Adoption criteria should include:

1. Semantic parity with the canonical/query response for every represented
   field.
2. Stable output for unchanged data.
3. No mutation path from Markdown back into authoritative records.
4. Correct escaping, content type, caching, pagination, and authorization.
5. Coverage of grouped spell families, long descriptions, dense relationships,
   null fields, source conflicts, and inheritance chains.
6. Clear provenance links and an explicit non-authoritative marker.

The difficult corpus from the external-converter evaluation can inspire the
edge cases, but native rendering should be tested against canonical and query
contracts rather than against converted HTML.

## Relationship to the external converter evaluation

The [`markdown.new` evaluation](28-markdown-new-evaluation.md) rejected an
unversioned remote converter for ingestion and source-reference checking. That
decision does not reject Markdown as a delivery format. A native read model
keeps the useful part—compact LLM-readable output—while avoiding refetching,
lossy page conversion, sibling-page contamination, and a new evidence
authority.
