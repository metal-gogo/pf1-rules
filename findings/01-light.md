# Finding 01: Light

This is the first single-spell inspection. It is intentionally manual: the purpose is to learn the three page patterns before encoding them in parsers.

## Result

The three sources agree on the core stat block and almost all description text. The differences divide into three categories: publication scope, provenance richness, and one small wording variant.

## Field comparison

| Field | AoN | Legacy PRD | d20PFSRD | Classification |
|---|---|---|---|---|
| Name | Light | Light | Light | Exact match |
| School/descriptor | evocation [light] | evocation [light] | evocation [light] | Exact match |
| Casting time | 1 standard action | 1 standard action | 1 standard action | Exact match |
| Components | V, M/DF (a firefly) | Same | Same | Exact match |
| Range/target | touch; object touched | Same | Same | Exact match |
| Duration | 10 min./level | Same | Same | Exact match |
| Save/SR | none; no | Same | Same | Exact match |
| Spell lists | Broad later first-party coverage | Core lists only | Partial later coverage plus elemental school | Scope expansion, not a rules conflict |
| Printed source | Core Rulebook p. 304 | Core Rulebook context, no page | Core Rulebook Section 15 notice, no page | AoN has strongest provenance |
| PFS status | PFS Legal | Absent | Absent | AoN-only metadata |
| Description phrase | Omits “from the point touched” | Includes it | Includes it | Needs review |

## Important interpretation

The spell-list differences should not be flattened into a single undifferentiated list. The legacy PRD describes the Core Rulebook's original lists. AoN and d20PFSRD incorporate spell access added by later first-party books, but they do so to different extents.

This confirms the need for the canonical `levels[].scope` field. A later list is additional ruleset scope, not evidence that the Core Rulebook record was wrong.

## Wording difference

Legacy PRD and d20PFSRD say that the spell sheds normal light in a 20-foot radius “from the point touched.” AoN omits those five words.

The practical meaning appears likely to be equivalent because the target remains “object touched,” but the cause of the difference is not established. It might be a correction, a transcription variation, or an accidental omission.

Follow-up decision: under `provenance-first-v0`, the AoN wording is canonical by default and the variation remains preserved for optional case-by-case review. It no longer blocks validation of the canonical record.

## HTML patterns

### AoN

- The complete spell is contained in `MainContent_DataListTypes_LabelName_0`.
- Most fields are separated by bold labels and `<br>` elements rather than dedicated field containers.
- Section boundaries use `h3.framing`.
- Printed source and page are explicit.
- PFS legality is conveyed by an image title rather than ordinary field text.

Implication: the adapter should walk DOM nodes and labels in sequence. Splitting a page's visible text by lines would be fragile.

### Legacy PRD

- The spell begins at `p#light.stat-block-title`.
- Stat-block values use separate `p.stat-block-1` elements.
- Description paragraphs follow as ordinary paragraphs.
- The book is evident from the page hierarchy, but the printed page number is absent.

Implication: this is the cleanest of the three initial parser targets.

### d20PFSRD

- The spell resides in an `article` whose classes include `publisher-paizo` and a Core Rulebook source marker.
- Primary content begins in `#article-content`.
- Sections are marked by `p.divider`.
- Multiple fields can share one paragraph and be separated by `<br>` elements.
- Advertisements and scripts occur inside or adjacent to the article content.
- The Section 15 notice identifies the publication but not a printed page.

Implication: the adapter must select the rules portion of the article, discard scripts and advertising, stop before unrelated footer content, and retain publisher classes as provenance evidence.

## Schema findings

The v0 observation and canonical schemas handled this spell without a structural change. Three existing design decisions proved useful:

1. Raw and normalized values are separate.
2. Spell-list entries carry a scope.
3. Source warnings can retain unresolved differences.

The next spell should test a different shape rather than another simple stat block. Fireball is a useful next step because AoN and d20PFSRD add later spell-list and mythic information while the legacy PRD provides the Core-only baseline.
