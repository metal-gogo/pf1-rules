# Skill ingestion plan

Status: Planned. Implementation has not started.

Last reviewed: 2026-08-23.

This plan defines the first-party Pathfinder 1e skill ingest, from source
capture through the CLI and web read surfaces. Confidence markers follow the
project convention: `[C]` for evidence-backed conclusions, `[P]` for strong
proposals, and `[S]` for details that still require discovery.

## Decision summary

- [C] The initial catalog contains the 26 standard skills listed by Archives
  of Nethys (AoN).
- [P] Ingest complete first-party skill definitions, including later sections
  and optional unlocks. Label optional rules instead of presenting them as
  always active.
- [P] Treat AoN as the baseline for skill pages. Admit a d20PFSRD-only section
  only when its displayed source proves first-party Paizo provenance and the
  section does not duplicate an AoN section.
- [P] Merge at the section boundary. Keep every accepted section intact and
  attributed to one source; do not blend sentences from different sources.
- [P] Canonicalize the general skill rules from the Legacy PRD Core Rulebook.
  Use the d20PFSRD overview for catalog comparison, not as canonical prose.
- [P] Preserve existing `rule.<slug>` entity IDs while reclassifying the
  records as skills. Do not create parallel `skill.<slug>` identities or
  rewrite immutable historical observations.
- [P] Model Craft, Knowledge, Perform, and Profession specializations within
  their parent skill. Do not create a standalone canonical skill for every
  example specialization.
- [P] Deliver exact skill lookup, search, a general `/skills` rules page, and
  `/skills/:slug` detail pages in the first completed milestone.
- [P] Defer class-skill matrices and character-specific calculations. They are
  separate relationship data, not part of a skill definition.

## Scope

The initial catalog must contain exactly these skills:

1. Acrobatics
2. Appraise
3. Bluff
4. Climb
5. Craft
6. Diplomacy
7. Disable Device
8. Disguise
9. Escape Artist
10. Fly
11. Handle Animal
12. Heal
13. Intimidate
14. Knowledge
15. Linguistics
16. Perception
17. Perform
18. Profession
19. Ride
20. Sense Motive
21. Sleight of Hand
22. Spellcraft
23. Stealth
24. Survival
25. Swim
26. Use Magic Device

For each skill, preserve:

- The canonical name, ability, trained-only status, armor check penalty
  behavior, and source URL.
- Introductory rules and every ordered first-party section displayed on the
  source page.
- Paragraphs, lists, and tables without flattening their order.
- Publication, rules scope, and source evidence for every accepted section.
- Links to other rules entities and unresolved links for later review.
- Specialization guidance inside the relevant parent skill.
- Parser warnings and rejected candidate sections.

The first milestone excludes class-skill membership, background skills,
third-party skills, consolidated skills, character sheets, skill-rank
calculators, and mechanical effect extraction.

## Existing foundation

- [C] Entity registries already contain the standard skills as `rule.<slug>`
  stubs.
- [C] The generic source-observation schema accepts `rule` but does not yet
  accept `skill` as an entity type.
- [C] The repository already has immutable raw artifacts, source
  observations, canonical decisions, validation, SQLite import, search, CLI,
  and web patterns from spell ingestion.
- [P] Reuse those patterns. Add the smallest skill-specific contracts needed
  to retain structured skill content and expose a stable read model.

## Identity and migration policy

Use the existing `rule.<slug>` value as the durable entity ID. Entity type and
entity ID are separate concerns: changing the type from `rule` to `skill`
must not also change identity.

The migration must:

1. Update current registry entries for the 26 standard skills to type
   `skill`.
2. Add `skill` to schemas and type unions that distinguish entity types.
3. Preserve aliases and incoming relationships that already target the
   `rule.<slug>` ID.
4. Leave historical observations immutable. Reconcile their rule-typed
   references to the current skill entity through an explicit decision or
   import mapping.
5. Reject a second canonical record that uses the same normalized name or
   source page for a new `skill.<slug>` ID.

[P] This avoids a high-cost identifier rewrite while still giving callers a
real skill type. The tradeoff is that the `rule.` prefix becomes historical
rather than taxonomically exact; document that invariant in the schema.

## Source policy

### Skill catalog and detail pages

Use the [AoN skill catalog](https://www.aonprd.com/Skills.aspx) to establish
membership and AoN detail pages as the baseline definition source. Capture
the catalog and each detail page as immutable artifacts.

Use [d20PFSRD skills](https://www.d20pfsrd.com/skills/) as a comparison source.
A d20PFSRD-only section is eligible only when all of these conditions hold:

- The section identifies a Paizo publication or other reviewable first-party
  source.
- It adds rules content absent from AoN.
- It can remain source-atomic; accepting it does not require sentence-level
  editing with AoN prose.
- It is not editorial navigation, third-party content, or a renamed duplicate.
- A canonical decision records why the section was accepted.

AoN wins when overlapping sections conflict. Record the d20PFSRD value and the
conflict instead of silently discarding it.

### General skill rules

Build one canonical rule article from these Legacy PRD Core Rulebook pages:

- [Using skills](https://legacy.aonprd.com/coreRulebook/usingSkills.html)
- [Skill descriptions](https://legacy.aonprd.com/coreRulebook/skillDescriptions.html)

The article should cover checks, difficulty classes, opposed checks, trying
again, taking 10 and 20, aid another, ability and armor check modifiers,
training, and the skill-description field guide. Keep this article separate
from the 26 skill entities so shared rules have one canonical location.

### Source capture rules

- Respect source rate limits and access policies.
- Store retrieval time, URL, response metadata, content hash, parser version,
  and raw artifact path.
- Never overwrite a raw artifact. A changed response creates a new artifact.
- Support an offline parse mode that reads only cached artifacts.
- Review repository licensing and attribution requirements before bulk prose
  is committed or distributed.

## Observation contracts

Add a skill observation contract by extending the generic entity observation
only where its current shape loses information. Expected fields are:

```text
observation_id
entity_id_hint
entity_type = skill
name_raw
ability_raw
trained_only_raw
armor_check_penalty_raw
intro_raw
sections_raw[] {
  heading_raw
  content_raw[] { kind, text_raw, rows_raw, links_raw }
  source_book_raw
  scope_hint
}
links_raw[]
source
retrieval
parser
warnings[]
```

Add a general-rule-article observation for the Legacy PRD pages. It must keep
heading hierarchy, content order, tables, links, and page boundaries. Do not
force the article through skill-specific ability or training fields.

[P] Store source tables as structured rows as well as lossless raw content.
Tables contain core mechanics and cannot be reliably recovered after being
flattened into prose.

## Canonical contracts

Define two canonical read models after the four-skill pilot confirms the
observed shapes.

### Canonical skill

```text
skill_id
ruleset
name
slug
aliases[]
key_ability
trained_only
armor_check_penalty
summary
sections[] {
  section_id
  kind
  heading
  content[] { kind, text, rows, links }
  publication
  scope
  evidence
}
specialization_guidance[]
relationships[]
provenance[]
normalization
```

Use stable section IDs derived from the skill ID and a normalized semantic
heading, with a deterministic suffix for repeated headings. Section order is
presentation data and may change without changing identity.

`scope` must distinguish at least `core`, `later_first_party`, and `optional`.
Unknown scope blocks canonical acceptance rather than defaulting to core.

### Canonical general rule article

```text
article_id
ruleset
title
slug
sections[] { section_id, heading, content, evidence }
relationships[]
provenance[]
normalization
```

Use a stable ID such as `rule.skills-general`. The public `/skills` route may
present this article and the catalog together, but they remain distinct data
records.

## Canonical merge algorithm

For each catalog skill:

1. Resolve the AoN catalog row to the existing `rule.<slug>` entity.
2. Parse the AoN detail page into ordered candidate sections.
3. Parse the matching d20PFSRD page into separate candidate sections.
4. Normalize headings for comparison without changing displayed headings.
5. Accept the AoN section for each overlap.
6. Review each d20PFSRD-only section against the source policy.
7. Append accepted first-party additions in a deterministic order and label
   their scope.
8. Emit a canonical decision for every conflict, rejected section, inferred
   scope, and accepted d20PFSRD-only addition.
9. Fail the record if a required field or section lacks evidence.

[P] “Best of both sources” is too vague to implement safely. The enforceable
rule is a reviewed union of source-atomic sections with AoN precedence on
overlap.

## Commands and data flow

Add commands consistent with the existing ingestion workflow:

```bash
pnpm catalog:skills
pnpm ingest:skills --pilot
pnpm ingest:skills --all
pnpm ingest:skills --all --offline
pnpm db:import
pnpm validate
pnpm verify
```

`catalog:skills` captures or replays the source catalogs and produces a
reviewable manifest. `ingest:skills` captures missing detail artifacts unless
`--offline` is set, parses observations, writes decisions and canonical
records, and produces issues for unresolved entries. Repeated offline runs
against the same artifacts must produce byte-equivalent durable records.

Do not add a parallel queue implementation. Extend the existing manifest and
issue patterns with an entity type and skill payload.

## Pilot

Start with four skills before processing the full catalog:

| Skill | Boundary under test |
| --- | --- |
| Acrobatics | Large core definition, movement DC tables, modifiers, and cross-references |
| Appraise | AoN later material plus the d20PFSRD-only Bargaining section |
| Craft | Parent skill with specializations, formulas, time, cost, and tables |
| Knowledge | Multiple named fields within one parent skill and monster-identification rules |

Appraise is the merge-policy acceptance case. Its canonical record should
retain AoN's Psychometry material and may add d20PFSRD's Bargaining section
only after its first-party source is verified and recorded.

Pilot exit gate:

- All four records validate from cached artifacts.
- Tables, lists, paragraphs, links, and section order round-trip without loss.
- Every canonical value and section has source evidence or an explicit
  normalization decision.
- Optional and later first-party rules are visibly labeled.
- A second offline run produces no semantic diff.
- No pilot record creates a duplicate identity for an existing registry stub.

## Read surfaces

### CLI

Add exact lookup by ID, slug, or case-insensitive name, for example:

```bash
pnpm cli skill appraise
pnpm cli search "identify magic item"
```

Skill lookup should show ability, training and armor-check metadata, ordered
sections, scope labels, and source attribution. General search should return
skills and the general skill-rules article alongside existing entity types.

### Web

- `/skills` shows the general rules article and the 26-skill catalog.
- `/skills/:slug` shows one skill definition with readable tables, section
  scope, cross-links, and source attribution.
- Existing entity URLs that target a `rule.<slug>` skill must continue to
  resolve or redirect to the skill detail page.

The pages must remain usable without client-side JavaScript and pass the
project's existing accessibility and broken-link checks.

## Implementation phases

### 1. Capture and validate the four-skill pilot

Add catalog and detail fixtures, parse lossless observations, and document all
unknown headings and source-boundary warnings.

Exit gate: the four observations validate without discarded content.

### 2. Stabilize schemas and identity migration

Add the `skill` entity type, canonical skill and article schemas, stable
section IDs, and the `rule.<slug>` compatibility rule.

Exit gate: every pilot field traces to evidence, and existing incoming entity
relationships still resolve.

### 3. Add canonical storage and read surfaces

Add the database models or generic canonical storage needed by CLI lookup,
search, `/skills`, and `/skills/:slug`. Keep import idempotent.

Exit gate: the pilot imports twice without duplicates and is queryable through
both read surfaces.

### 4. Ingest and audit all 26 skills

Run the cached catalog manifest, produce one canonical record or actionable
issue per row, and review every d20PFSRD-only candidate section.

Exit gate: the catalog has exactly 26 unique canonical skills, with no
unresolved error-severity issues.

### 5. Complete verification and document the result

Run schema validation, type checking, database tests, parser tests, CLI tests,
web tests, accessibility checks, and relevant end-to-end tests. Record source
coverage and known omissions in a finding.

Exit gate: `pnpm verify` passes from the pinned `mise` toolchain, and a fresh
database rebuild exposes the same 26 skills.

## Acceptance criteria

The first skill-ingestion milestone is complete when:

- Exactly 26 standard skills import from immutable cached artifacts.
- Every catalog row maps to one existing durable ID or one actionable issue.
- The canonical general skill-rules article is available at `/skills`.
- Every skill has CLI and web detail lookup and participates in search.
- AoN overlap wins deterministically, while reviewed first-party additions
  remain separately attributed.
- Optional rules are labeled and are never silently presented as core.
- Craft, Knowledge, Perform, and Profession remain single parent skills.
- Immutable observations and existing `rule.<slug>` links remain valid.
- Repeated offline ingestion and database import are idempotent.
- Validation and relevant automated tests pass.

## Deferred work

- Class-to-skill and archetype-to-skill membership matrices.
- Background skills and consolidated skill variants.
- Optional new skills from later first-party books.
- Standalone specialization entities, if future use cases require them.
- Character ranks, modifiers, take-10/take-20 eligibility, and calculators.
- Mechanical-effect extraction from prose.
- Third-party skill definitions.

## Risks and review triggers

- [C] Source coverage differs. A blind union can import editorial or
  third-party material as first-party rules.
- [P] Existing `rule.<slug>` IDs are worth preserving, but the historical
  prefix must be explicitly supported so future maintainers do not “fix” it
  by creating duplicates.
- [P] General rules and individual definitions overlap at source boundaries.
  Keep one canonical owner for shared rules and link to it from skill pages.
- [S] The 26 detail pages may contain headings or table layouts not covered by
  the pilot. Preserve unknown content and emit issues before expanding enums.
- [S] d20PFSRD source labels may be insufficient for some unique sections.
  Exclude those sections until provenance is independently reviewable.

Return to the [project index](index.md).
