# Area rules and visual aids

The Fireball evaluation originally normalized `20-ft.-radius spread` with a single `shape: spread` value. Review of the Core aiming rules showed that this conflated three independent ideas:

- **Propagation:** how an effect travels from its origin, such as burst, emanation, or spread.
- **Geometry:** the three-dimensional form, such as sphere, cone, cylinder, or line.
- **Dimensions:** radius, length, width, and height.

The canonical area schema now stores those concepts independently while preserving the literal stat-block text.

## Fireball after normalization

| Property | Value | Basis |
|---|---|---|
| Raw | `20-ft.-radius spread` | Explicit spell text |
| Propagation | `spread` | Explicit spell text |
| Geometry | `sphere` | Derived from the general area rules |
| Radius | 20 feet | Explicit spell text |
| Shapeable | false | No `(S)` marker |

`geometry_basis: derived_from_rules` prevents the product from implying that Fireball's stat block literally used the word `sphere`.

## Source roles

### Canonical rule definition

Archives of Nethys, [Aiming a Spell](https://www.aonprd.com/Rules.aspx?ID=228), reproduces the Core Rulebook page 213 rules. It defines targets, effects, areas, point of origin, spread behavior, burst and emanation behavior, shapes, shapeable areas, and line of effect. This is the provenance-first definition source.

### Secondary comparison

d20PFSRD's [Aiming a Spell](https://www.d20pfsrd.com/magic#TOC-Aiming-a-Spell) section is a useful comparison representation of the same general rules and may expose additional navigation links. It is not needed as the canonical wording when AoN is available.

### Visual aid

The d20PFSRD [Space, Reach, & Threatened Area Templates](https://www.d20pfsrd.com/gamemastering/combat/space-reach-threatened-area-templates/) page helps visualize grid placement. It is not a single clean rules source: the page combines area instructions, site-created templates, Paizo FAQ excerpts, and a separately sourced optional rule for larger creatures.

The experiment therefore registers this as a `visual_aid`, not a rule. Fireball's `illustrated_by` relationship remains pending review, and no external image has been copied.

## Local relationships

Fireball can now navigate offline to placeholders for:

- `rule.aiming-a-spell`
- `rule.area-spread`
- `rule.area-sphere`
- `rule.line-of-effect`
- `visual-aid.area-effect-grid-templates`

The rule entities may remain stubs until the rules corpus is imported. Their source URLs are evidence, not permanent runtime dependencies.

## Why this matters for cure spells

Mass Cure Light Wounds has multiple selected targets rather than an area. Its constraint—one creature per level, with no two more than 30 feet apart—must not be converted into a radius or grid template.

The next comparison will therefore test three distinct selectors:

1. Fireball: area.
2. Cure Light Wounds: one target.
3. Mass Cure Light Wounds: multiple targets with a separation constraint.

The shared Aiming a Spell rule can provide links for all three while their canonical structured data remains mechanically distinct.
