# Fireball: three-source evaluation

Fireball is the second spell evaluated under `provenance-first-v0`. It is a stronger test than Light because it combines scaling damage, an area shape, later class access, non-class spell lists, and a mythic version from a different publication.

## Result

AoN remains the best canonical baseline. The Legacy PRD remains the cleanest Core Rulebook control. d20PFSRD is valuable as a relationship and supplemental-access discovery source, but its Fireball page has weaker publication metadata than its Light page.

The canonical decision is accepted, with two deliberately visible enrichment questions:

1. Independently verify the originating first-party books for the fire elemental school, efreeti bloodline, and flame mystery access entries.
2. Wait for at least one more scaling damage spell before committing to a reusable structured damage-expression model.

## What agrees

The three sources agree on every base mechanical field inspected:

| Field | Shared value |
|---|---|
| School | evocation [fire] |
| Casting time | 1 standard action |
| Components | V, S, M (a ball of bat guano and sulfur) |
| Range | long (400 ft. + 40 ft./level) |
| Area | 20-ft.-radius spread |
| Duration | instantaneous |
| Saving throw | Reflex half |
| Spell resistance | yes |
| Base damage | 1d6 fire damage/caster level, maximum 10d6 |

The base description is substantively identical. Legacy places the narrow-passage paragraph break differently, while AoN and d20PFSRD retain it in the surrounding paragraph. That is formatting, not a rules conflict.

## What differs

### Spell-list scope

- Legacy PRD shows the Core baseline: sorcerer/wizard 3.
- AoN shows six compiled class lists: arcanist, bloodrager, magus, occultist, sorcerer, and wizard, all at level 3.
- d20PFSRD shows bloodrager, magus, and sorcerer/wizard, plus Fire domain 3, fire elemental school 3, efreeti bloodline 3, and flame mystery 3.

The canonical record uses AoN for class lists. The four d20PFSRD additions are not treated as competing class-list values; they are explicitly typed as `domain`, `elemental_school`, `bloodline`, and `mystery`. This is a case-by-case combination, not an automatic merge.

### Mythic Fireball

- Legacy PRD has no mythic section because it represents the Core Rulebook baseline.
- AoN includes Mythic Fireball and attributes it to *Mythic Adventures*, page 94.
- d20PFSRD includes substantially the same mythic rules but does not identify the book or page on this entry.
- AoN retains the parenthetical `Core Rulebook 444` after the rule that a failed save causes the creature to catch on fire; d20PFSRD omits that cross-reference.

AoN therefore supplies the canonical mythic wording and its separate publication record. This material was initially embedded in Fireball and has since migrated to `mythic-spell-variant.fireball`; see `08-spell-variant-entities.md`.

### Publication provenance

- AoN explicitly identifies the base spell as *Pathfinder RPG Core Rulebook*, page 283, and the mythic section as *Mythic Adventures*, page 94. It also reports PFS Legal.
- Legacy PRD identifies the Core Rulebook through its page hierarchy but does not display the printed page number.
- d20PFSRD has a `Spells (Paizo, Inc.)` breadcrumb but no book/page notice for either the base or mythic material. This is notably weaker than the Section 15/source cues found during the Light evaluation.

This inconsistency means a d20PFSRD adapter cannot assume every first-party spell page exposes publication metadata in the same way.

## Entry-boundary finding

AoN's Fireball response continues into a separate spell, Controlled Fireball, within the same result container. A parser that simply consumes the whole container would corrupt Fireball with a sibling spell.

The safe boundary is:

1. Start at the exact top-level `Fireball` heading.
2. Include its base and Mythic Fireball sections.
3. Stop at the next top-level spell heading.

The observation records `Controlled Fireball` as an excluded sibling so this decision is auditable.

## Link inventory

Only links inside the bounded spell entry were recorded. Breadcrumbs, navigation, advertisements, store widgets, and sibling-spell links were excluded.

| Source | Literal entry links | Useful link types |
|---|---:|---|
| AoN | 4 | Core publication, school, descriptor, mythic publication |
| Legacy PRD | 2 | Reflex rule, Spell Resistance rule |
| d20PFSRD | 14 | school, class/access lists, action, Reflex, caster level, energy resistance, energy immunity |
| Total | 20 | 17 unique local targets |

Eleven target entities were new to the registry for this experiment. Each can remain a name-and-ID stub until its own rules content is imported. The canonical product can already link to the local targets without depending on the source URLs; every original URL remains attached as evidence.

## Schema lessons

Fireball justified three changes:

1. `effect.area` now supports searchable geometry while `effect.delivery.entries` preserves the literal source header and value. Fireball is stored as a `spread` with a 20-foot radius.
2. Spell-list entries now include `list_kind`, preventing domains, bloodlines, mysteries, and elemental schools from being flattened into classes.
3. Source `supplemental_sources_raw` preserves the subsection attribution. The canonical Mythic Fireball variant now owns its Mythic Adventures book and page without misattributing the base spell.

Damage is intentionally still preserved in wording rather than prematurely modeled as dice. Fireball alone does not tell us how well one structure will handle multiple damage instances, caps, choices, persistent damage, or level-dependent changes.

## Canonical decision in plain language

- Start with AoN.
- Use Legacy PRD to confirm the Core spell and expose rule-definition links.
- Accept d20PFSRD links as navigation evidence.
- Accept its four extra access lists only as an explicit, typed, reviewable enrichment.
- Use AoN's mythic wording and book/page attribution.
- Preserve all three observations and never erase the alternatives.

This is the intended source strategy working as designed: provenance selects the rules baseline, while lower-priority sources may still add useful relationships without silently rewriting the spell.
