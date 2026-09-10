# Feat ingestion plan

Status: AoN batches support d20PFSRD source comparison and evidence-backed
entity links. Foundry remains a separate audit source.

Last reviewed: 2026-09-09.

This plan defines an initial feat-ingestion pilot and the path from source
capture to a canonical feat catalog. Confidence markers follow the project
convention: `[C]` for evidence-backed conclusions, `[P]` for strong proposals,
and `[S]` for details that still require discovery.

## Decision summary

- [C] Feat categories are multi-valued. A feat can have more than one type,
  such as Combat and Teamwork.
- [C] Archives of Nethys (AoN), d20PFSRD, and Foundry VTT do not expose
  identical category sets or meanings.
- [P] Treat categories as source-attributed tags during capture. Do not create
  a canonical category by taking the union of every source's tags.
- [P] Use AoN's displayed feat types as the initial `printed_types` baseline.
  Preserve tags from every source separately as `source_tags`.
- [P] Start with ten deliberately varied feats. Do not build a bulk catalog
  importer until the pilot establishes page boundaries, identity rules, and
  provenance.
- [P] Reuse the existing snapshot, observation, provenance, validation, and
  import infrastructure. Add feat-specific canonical storage only after the
  observation pilot succeeds.

## Existing foundation

- [C] [`source-entity-observation.schema.json`](../schemas/source-entity-observation.schema.json)
  already accepts `feat` as an entity type.
- [C] [`importer.ts`](../src/ingestion/importer.ts) can import generic raw
  entities, sections, and links.
- [C] Entity registries already contain feat stubs, and the Sahir-Afiyun data
  includes an existing `grants_spell_access` relationship.
- [C] The Prisma model does not yet define a canonical feat read model.
- [P] Extend the generic observation link vocabulary only where the pilot
  proves a need. The first likely additions are a `prerequisite` role and a
  `feat` target hint.

## Taxonomy contract

Store two distinct concepts:

| Field | Meaning | Mutation rule |
| --- | --- | --- |
| `printed_types` | Reviewed types accepted for the canonical feat, initially from AoN | Changes through a reviewed canonicalization decision |
| `source_tags` | Tags exactly observed in one source | Immutable with the source observation |

[C] For example, AoN presents Channel Smite as Combat, while Foundry tags it
as Combat, Channeling, and Combat Trick. These values are evidence about
different source representations; they are not automatically three printed
types.

[P] Keep category values open-ended instead of enforcing a closed enum.
Preserve the raw label and, when useful for search, a normalized value. This
avoids schema churn when a source exposes categories such as Conduit, Story,
Style, or Combat Stamina.

## Ten-feat pilot

The pilot favors boundary cases over a statistically representative sample.

| Feat | Primary types | What it tests |
| --- | --- | --- |
| [Channel Smite](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Channel%20Smite) | Combat | Source-tag disagreement; Foundry actions; Combat Trick and mythic supplements after the base feat |
| [Outflank](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Outflank) | Combat, Teamwork | Multiple printed types; teamwork wording; Combat Trick supplement |
| [Blinding Critical](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Blinding%20Critical) | Combat, Critical | Linked and numeric prerequisites; save DC; conditions; Special section |
| [Jabbing Style](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Jabbing%20Style) | Combat, Style | Semicolon conjunctions and an `or` group in prerequisites |
| [Craft Wondrous Item](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Craft%20Wondrous%20Item) | Item Creation | A simple control record; time and cost rules; Foundry's additional General tag |
| [Empower Spell](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Empower%20Spell) | Metamagic | No prerequisite section; spell-slot adjustment; Foundry's additional Magic tag |
| [Accursed](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Accursed) | Story | Goal and Completion Benefit sections; narrative prerequisite |
| [Sahir-Afiyun](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Sahir-Afiyun) | General | Multiple publications; repeatable acquisition; embedded level-indexed spell list; spell-access relationship |
| [Blazing Aura (ARG)](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Blazing%20Aura%20%28ARG%29) | Combat | One half of a duplicate-name pair; linked prerequisites; Combat Trick supplement |
| [Blazing Aura (PA)](https://www.aonprd.com/FeatDisplay.aspx?ItemName=Blazing%20Aura%20%28PA%29) | Combat, Conduit | Source-qualified identity; different rules and publication; Foundry record-reconciliation anomaly |

[C] The two Blazing Aura entries have different rules and publications. Their
source qualifiers are identity-bearing data and must not be stripped during
catalog ingestion.

[P] Do not add Power Attack to this pilot. Channel Smite already exercises
Combat Trick and mythic page boundaries while also testing source-tag
disagreement and structured Foundry actions.

## Page and entity boundaries

An AoN feat page can append related material after the base feat, including
Combat Tricks and mythic versions.

- [P] End the canonical base feat when the page enters a supplemental heading.
- [C] Preserve the complete immutable source artifact, including appended
  material.
- [P] Record excluded supplements as warnings or deferred entities so their
  presence remains auditable.
- [P] Do not merge Foundry data into the AoN observation. Import it as a
  separate comparison observation.

For each pilot feat, capture:

- The exact displayed name and any source-disambiguation suffix.
- Displayed feat types and source-specific tags.
- Introductory text and prerequisites verbatim.
- Ordered sections, including Benefit, Normal, Special, Goal, Completion
  Benefit, and unknown headings.
- All listed publications and PFS status.
- Every in-entry link and its observed target.
- The raw source artifact, capture metadata, and parser warnings.

## Implementation phases

### 1. Capture immutable pilot observations

- [P] Add AoN feat snapshot fixtures for the ten pilot records.
- [P] Parse the base feat without crossing supplemental boundaries.
- [P] Capture selected Foundry YAML records as comparison observations.
- [P] Capture reviewed d20PFSRD URLs only for AoN pilot feats. Keep the
  reviewed source pairing explicit; a matching display name does not establish
  identity.
- [P] Validate observations with the existing generic schema and importer.

Exit gate: all ten observations round-trip without losing names, types,
ordered sections, publications, links, or boundary warnings.

### 2. Define the canonical feat contract

[P] Add `schemas/canonical-feat.schema.json` only after phase 1 shows the
actual field shapes. The smallest useful contract is expected to contain:

```text
feat_id
ruleset
name
aliases[]
printed_types[]
short_description
prerequisites_raw
sections[] { kind, heading_raw, body_raw }
publications[]
pfs_status
search_text
relationships[]
provenance[]
normalization
```

- [P] Keep `prerequisites_raw` authoritative.
- [P] Create a `requires` relationship only for an unambiguous linked feat.
- [P] Do not build a prerequisite expression tree in the initial ingest.
  Jabbing Style demonstrates why splitting on commas is insufficient.

Exit gate: every canonical field points to source evidence or an explicit
normalization decision.

### 3. Add the canonical read model

- [S] Add `CanonicalFeat`, feat-type, section, and publication storage after
  the schema stabilizes.
- [P] Extend canonical decisions, validation, import statistics, CLI search,
  and the web read model for feats.
- [P] Use the existing generic entity page for observation review until a
  dedicated feat page provides clear value.

Exit gate: importing the pilot twice is idempotent, and all ten feats are
queryable by exact name, alias, and type.

### 4. Capture the AoN catalog

- [P] Capture the AoN all-feats table as an immutable catalog artifact with
  displayed name, raw prerequisite summary, short description, and detail-page
  URL.
- [P] Preserve source-qualified identities such as `(ARG)` and `(PA)`.
- [P] Extend the existing ingestion queue with an entity type and a generic
  catalog payload. Do not create a parallel feat-only queue.

Exit gate: every captured catalog row maps to one canonical feat or one
explicit issue record.

#### Controlled source-observation batch

[C] `pnpm ingest:feats --count=N` captures the first `N` AoN all-feats
catalog rows in source order, writes immutable artifacts and generic feat
observations, and creates only missing feat stubs. `--offline` replays only
the recorded artifacts. It preserves prerequisite prose, publications, raw
rich text, and links. A linked feat receives an entity hint only when its AoN
`ItemName` exactly identifies one catalog row.

[C] This batch does not create canonical feat records or parse prerequisite
expressions. Import its observations with `pnpm db:import` after review.

### Source comparison and graph import

Run `mise exec -- scripts/run-qwen-feat-ingestion.sh N` from the repository
root to process the next N AoN catalog entries without batch observations.
The wrapper preserves its selected ItemNames through offline replay,
validation, import, database checks, and a signed commit. A failed run resumes
the same batch with the same count.

`pnpm ingest:feats:sources --batch-file=PATH` compares the saved batch with a
captured d20PFSRD feat catalog. `--offline` requires cached artifacts, including
cached 404/410 responses. Other fetch failures stop the workflow.

A catalog title finds candidates but does not establish identity. An automatic
match requires one unambiguous source identity and either matching parsed
rule sections or the same feat name and publication. Publication comparison
uses the spell normalizer; this does not create additional publication nodes.
The existing three reviewed source pairings remain explicit overrides.
Multiple URLs that redirect to the same capture count as one candidate.
Source-qualified AoN identities remain separate and require review when a
shared base name is ambiguous.

Accepted observations preserve each website's text, types, links, and
provenance separately. Parser version 0.1.2 recognizes both bold and strong
field labels, including `Prerequisite(s)` and `Benefit(s)`, nested rule
containers, and continuation paragraphs and tables. Pages without a parsed
benefit require review. Older observations remain intact. Source matching outcomes and
raw section differences are stored in `data/feat-source-matches/`:

- `matched`: one supported d20PFSRD identity.
- `pending_review`: ambiguous identity, differing evidence, an unreadable
  page, or a dead catalog link.
- `not_found_in_catalog`: no candidate in the captured catalog; this is not
  a claim that the feat is absent from the whole website.

During import, known observation URLs and registered link evidence resolve
feat hyperlinks to existing entities. Unmapped AoN and d20PFSRD links become
source-specific stubs keyed by URL. Generic `references` relationships keep
the observation and link occurrence as evidence. Ambiguous known URLs remain
unresolved. This derived graph rebuilds on import, using the existing generic
entity and relationship tables.

The wrapper commits feat observations, the feat registry, and source-match
records with subjects such as `ingest feats: Adaptive Fortune + 9 feats`.
It never pushes. Canonical feat mechanics, prerequisite expression parsing,
and Foundry observation import are outside this workflow.

### 5. Run and audit the pilot before bulk ingest

Verify:

- Catalog identity round-trips without collapsing duplicate names.
- Supplemental material does not enter the base feat body.
- Every canonical field has provenance.
- Cached retries make no network requests.
- Validation, type checking, database checks, parser tests, and link-integrity
  tests pass.

### 6. Expand only after the base catalog is stable

[S] Consider these follow-up tracks separately:

- Combat Tricks and mythic feats as their own entity types.
- Structured prerequisite expressions.
- Rich-text normalization.
- Full d20PFSRD comparison.
- Mechanical-effect modeling.
- Category-specific schemas.
- Third-party and Pathfinder 3.5 material.

## Success criteria

The initial feat ingest is ready to expand when:

- [P] The ten pilot feats import deterministically from cached artifacts.
- [P] Duplicate names remain distinct without relying on display-name
  rewriting.
- [P] Multi-valued printed types and source-specific tags remain
  distinguishable.
- [P] Supplemental content is preserved but excluded from the base entity.
- [P] Prerequisite text remains lossless, with only safe linked-feat
  relationships normalized.
- [P] Every rejected or ambiguous catalog row produces an actionable issue
  instead of disappearing.

## Risks and decisions to revisit

- [C] Source tags disagree. A union would silently turn browser,
  implementation, or supplemental labels into canonical printed types.
- [C] Names alone are not unique. Blazing Aura proves that publication and
  source-qualified identity must participate in reconciliation.
- [C] Prerequisite prose is not a comma-separated list. Premature structure
  would create incorrect requirements.
- [P] AoN-first ingestion is the shortest path to a coherent first-party
  catalog. Foundry and d20PFSRD should initially supply comparisons and
  enrichment, not competing canonical records.
- [S] The full catalog may expose additional heading and publication variants.
  Keep unknown sections lossless and report them before extending the schema.

## Source references

- [AoN feat catalog and category navigation](https://www.aonprd.com/Feats.aspx)
- [d20PFSRD feat types](https://www.d20pfsrd.com/feats#TOC-Types-of-Feats)
- [Foundry Channel Smite record](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/blob/master/packs/feats/channel-smite.ftBTltVkin3Ko3NJ.yaml?ref_type=heads)

Return to the [project index](index.md).
