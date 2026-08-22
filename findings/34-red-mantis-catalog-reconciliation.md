# Red Mantis Assassin catalog reconciliation

Decision date: 2026-08-21 (America/Mexico_City)

## Reviewed policy

[C] The project owner approved using the AoN Red Mantis Assassin class catalog
as canonical class-access evidence when a spell detail page disagrees. Any real
catalog-only addition must remain distinguishable from a value printed on the
spell page; approval does not authorize inventing a level.

## Evidence correction

[C] The 273 pending rows did not exercise that precedence rule. Every affected
spell page prints `redmantisassassin` at exactly the same level as the class
catalog. The gap came from treating that compact token as
`spell-list.redmantisassassin` instead of the catalog's canonical
`spell-list.red-mantis-assassin` ID.

The reconciliation made these evidence-preserving changes:

- Normalized 74 level-1, 76 level-2, 73 level-3, and 50 level-4 memberships.
- Preserved the spell-page token and level in each canonical level's `raw`
  field.
- Preserved the class catalog URL, summary, and level in
  `spell_summary_observations`.
- Merged the duplicate compact spell-list entity into the normalized Red
  Mantis Assassin entity.
- Updated canonical relationships and their reviewed decision IDs without
  changing spell levels.
- Added validation that every captured AoN catalog membership matches an exact
  canonical spell-list ID and level whenever that spell is canonical.

## Result

[C] The database contains 274 Red Mantis Assassin memberships: the 273
reconciled rows plus the already-normalized legacy spell Pattern Recognition.
All 21,602 captured AoN class/level memberships now resolve canonically. The
database has 21,595 summary observations because seven unrelated Contact
Nalfeshnee memberships have blank catalog summaries. No
spell identity, printed value, or reviewed Range override changed.
