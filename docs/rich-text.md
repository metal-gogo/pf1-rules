# Rich-text spell descriptions

Rich-text descriptions preserve source wording while adding semantic structure
and local entity links. They are canonical data, not HTML and not offsets into
another string.

## Canonical contract

Schema version `0.2.0` requires `description.document`. A document supports:

- `document` blocks containing `paragraph`, `heading`, `unordered_list`, and
  `table` nodes.
- `heading` nodes with a source heading level from 2 through 6.
- `unordered_list` nodes containing `list_item` nodes.
- `table` nodes containing rows and cells; cells record whether they are
  column headers.
- Inline `text`, `entity_link`, and `hard_break` nodes.
- Optional `italic` and `bold` marks on text and entity links.
- One `relationship_id` on each entity link. Target IDs, names, types, and
  navigation remain authoritative in the referenced accepted relationship.

`description.raw`, `search_text`, and sections remain for compatibility.
Validation rejects a document whose leaf text differs from `description.raw`
after structural whitespace is normalized. Version `0.1.0` records remain
valid and render as escaped plain text.

## Link and structure rules

The normalizer parses the selected, bounded AoN description HTML with the
project's existing HTML parser. It preserves paragraphs, headings, lists,
tables, hard breaks, italic text, and bold text. A new spell title or mythic
title ends the bounded description; other supplemental second-level headings
remain inside it.

Accepted relationships are matched with Unicode-normalized, word-bounded text,
longest phrase first. Priority is `functions_like`, other spell relationships,
`uses_definition`, then other explicitly description-evidenced relationships.
Every non-overlapping occurrence is linked. Spell names are resolved through
the canonical spell resolver before relationships or entity-link nodes are
written.

Classification and access metadata are not prose links. For example,
`has_descriptor: descriptor.darkness` can classify the Darkness spell without
turning each ordinary use of “darkness” into a descriptor link. When one word
can mean a descriptor, illumination level, spell, or ordinary noun, the pilot
normalizer uses an exact source phrase to assign the persisted entity link. It
does not store offsets, and a spell never links to its own page. An unmatched or
changed context fails normalization instead of guessing.

Ambiguous or unmatched phrases remain unlinked and produce a normalization
warning. Rejected relationships never produce an entity-link node.

## Rendering rules

The web renderer escapes node text and emits semantic paragraphs, headings,
unordered lists, accessible data tables, emphasis, strong emphasis, hard
breaks, and local links. Links use normal same-tab browser navigation.

A resolved direct `functions_like` relationship expands its referenced spell
once after the current description. The expansion includes the rules metadata
and description needed to understand the spell, but excludes provenance,
backlinks, Related rules, mythic sections, and further embedded spells.

Title variants also form a display family: the base title, `, Lesser`,
`, Greater`, and `Deeper ` plus the base title. Existing family members may be
shown once even when the current description does not name them. This is a
navigation rule only and must be labeled as such; it does not create or imply
`functions_like` inheritance.

A mythic version is a separate canonical variant linked to its base spell. The
web page renders its named rules and publication in a dedicated `#mythic`
section after the base description and family content. Mythic prose never
becomes part of `description.raw` or `description.document`.

## Pilot scope

The reviewed pilot contains 11 spells:

- Break Enchantment.
- Restoration, Greater Restoration, and Lesser Restoration.
- Bestow Curse, Greater Bestow Curse, Curse, Major, and Conditional Curse.
- Cure Light Wounds and Cure Moderate Wounds.
- Darkness.

Run the targeted normalization with:

```bash
pnpm ingest:rich-text-pilot
pnpm validate
pnpm db:import
```

## Rollout checklist

Use this checklist when adding the remaining spells:

1. Confirm the source fragment ends before mythic, augmented, or separately
   titled content that does not belong to the base description.
2. Verify paragraph, list, hard-break, italic, and bold parsing against the raw
   observation.
3. Resolve spell phrases to existing canonical IDs before adding or changing a
   relationship. Do not create modifier-first stub IDs.
4. Review every accepted relationship for prose-link eligibility. Exclude
   classification, publication, access, and other metadata unless the evidence
   explicitly identifies description text.
5. Review same-name and rules-term ambiguity in context. Use an exact contextual
   phrase for a persisted link when global matching would be wrong; do not link
   an ordinary noun or the current spell merely because its spelling matches an
   entity name.
6. Confirm repeated matches, singular/plural overlap, priority, unmatched
   warnings, and rejected relationships.
7. Persist the document and `/description/document` provenance, update
   `search_text` only when corrected source boundaries change the base text,
   and set the canonical record to schema version `0.2.0`.
8. Regenerate the matching decision artifact and validate raw/document text
   equivalence plus accepted relationship references.
9. Check direct inheritance expansion and base, lesser, greater, or deeper
   family display independently. Never infer inheritance from a title.
10. Add table-driven web coverage, browser navigation and accessibility checks,
    import the database, and run the complete `pnpm verify` workflow.

Backfill additional spells in reviewed batches rather than changing all records
at once. Keep non-reviewed records on version `0.1.0` until their source
boundaries and links pass this checklist.

See [Rich-text rollout status](rich-text-rollout.md) for current corpus counts,
completed batches, and unresolved issue categories.

Return to the [project index](index.md).
