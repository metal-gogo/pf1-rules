# Cure Light Wounds and Cure Light Wounds, Mass

This comparison tests related-spell identity, shared source pages, mythic-section ownership, single versus multiple targets, and spell-family relationships.

## Result

Both spells have accepted, independent canonical records:

- `spell.cure-light-wounds`
- `spell.cure-light-wounds-mass`

Sharing a source page does not merge their identities. Conversely, appearing on separate AoN pages does not erase their semantic relationship.

## Source presentation

| Source | Cure Light Wounds | Mass spell | Mythic ownership |
|---|---|---|---|
| AoN | Separate catalog record | Separate catalog record | Explicitly named Mythic Cure Light Wounds under the ordinary spell |
| Legacy PRD | First entry on one Core page | Second independent entry on the same page | No mythic material |
| d20PFSRD | First entry on one page | Second independent subentry | Generic Mythic heading follows the mass subentry but belongs to the ordinary spell |

The d20PFSRD case proves that document order is insufficient for section ownership. Its Mythic values are 2d8 plus twice caster level, maximum +10—the ordinary Cure Light Wounds progression—and AoN explicitly identifies the same material as Mythic Cure Light Wounds from *Mythic Adventures*, page 89.

The safe ownership rule is:

1. Prefer an explicitly named identity and publication attribution.
2. Check whether the mechanics modify the candidate base spell.
3. Treat document position as weak evidence only.
4. Emit a warning when a generic heading follows another independently castable spell.

## Targeting, not area

### Cure Light Wounds

The Target field is `creature touched`. It is normalized as:

- mode: single
- subject: creature
- selection: selected
- count: fixed at one
- area: null

### Cure Light Wounds, Mass

The Target field is `one creature/level, no two of which can be more than 30 ft. apart`. It is normalized as:

- mode: multiple
- subject: creature
- selection: selected
- count: one creature per caster level
- separation: pairwise maximum of 30 feet
- area: null

The mass description later refers to undead “in its area.” That prose is preserved exactly, but it does not override the mechanical Target field. This is a multiple-target spell, not an area spell, and it should not display a radius template.

## Related-spell semantics

Three relationships are deliberately distinct:

| Relationship | Rules inheritance? | Purpose | Example |
|---|---:|---|---|
| `functions_like` | Yes | Resolve an incomplete spell through another spell's rules | Controlled Fireball → Fireball |
| `mass_variant_of` | No by default | Show a specifically named mass counterpart | Cure Light Wounds, Mass → Cure Light Wounds |
| `member_of_family` | No | Search, browse, compare, and later analyze a family | Both spells → Cure Wounds family |

Mass Cure Light Wounds contains a complete stat block and effect. Its relationship to Cure Light Wounds is semantic and navigational, not a requirement to retrieve missing mechanics.

Future cure spells such as Cure Moderate Wounds will create a different case: they explicitly say they function like Cure Light Wounds except for their healing amount. Those should use `functions_like` as well as `member_of_family`.

## Source comparison

The base rules agree across all three sources. Differences are scope and presentation:

- AoN supplies Core Rulebook page 263, a broad compiled first-party access list, PFS status, and Mythic Adventures page 89.
- Legacy supplies the clean Core class lists and keeps the two spells on one stable page.
- d20PFSRD supplies extensive links, Healing domain access for the ordinary spell, and a Mythic Adventures Section 15 notice, but not the base Core book/page attribution.

d20PFSRD uses a missing space in `damage +1` for the ordinary description. This is formatting only; AoN wording remains canonical.

## Spell-list modeling

Cure Light Wounds exposes another useful distinction: Alchemist and Investigator access is stored as `formulae`, not as a conventional spellcasting class list. Healing domain access is stored as `domain`.

This keeps queries precise, for example:

- “Which classes cast Cure Light Wounds?”
- “Which formula lists contain it?”
- “Which domains grant it?”

Those are related questions but not identical data.

## Link inventory

Only literal links inside each bounded entry were recorded; table-of-contents and general navigation links were excluded.

| Canonical spell | AoN | Legacy | d20PFSRD | Total |
|---|---:|---:|---:|---:|
| Cure Light Wounds | 4 | 2 | 18 | 24 |
| Cure Light Wounds, Mass | 3 | 3 | 11 | 17 |
| Combined | 7 | 5 | 29 | 41 |

The two spells introduce 12 new local registry entities, including Conjuration, the Healing subschool, Will saves, Ability Damage, formulae/class/domain lists, the two spell identities, and the Cure Wounds family.

## Deferred modeling

The full text is preserved, but a generalized conditional effect structure is deliberately deferred. Cure spells combine:

- healing living creatures;
- damaging undead;
- harmless save/resistance behavior for beneficial use;
- hostile Will-half and spell-resistance behavior against undead;
- different numeric scaling in mythic versions.

Testing an Inflict spell is the best next step before deciding how those branches should be normalized.

## Canonical decision in plain language

- Use AoN as the wording, list, publication, and mythic baseline.
- Use Legacy to confirm the Core versions and expose Will-rule links.
- Use d20PFSRD for additional navigation and explicitly reviewed Healing domain access.
- Keep the mass spell independent and self-contained.
- Link the two spells as variants without inventing inheritance.
- Group both in the Cure Wounds family without treating a family as rules text.
- Preserve the living-versus-undead branches verbatim until the corresponding Inflict comparison supports a general model.
