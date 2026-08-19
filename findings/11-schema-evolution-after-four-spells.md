# Schema Evolution After Break Enchantment, Death Clutch, Wish, and Miracle

The four-spell review exposed three changes that were mature enough to implement and one area that should remain deliberately unstructured for now.

## Implemented: precise mythic identity

The mythic contract now identifies itself without generic compatibility fields:

- `mythic_spell_variant_id` replaces the generic `variant_id` field;
- the redundant `variant_kind: mythic` discriminator is gone; and
- base spells use `has_mythic_variant` for the reciprocal relationship.

The identifier itself remains `mythic-spell-variant.<base-spell-name>`. One mythic record is allowed for each base spell, and every link is checked in both directions.

## Implemented: lossless delivery headers

The old independent `target_raw`, `effect_raw`, and `area_raw` properties could not preserve a combined header such as Wish and Miracle's `Target, Effect, or Area: see text`.

Source observations now store `delivery_fields_raw`, an ordered collection of literal header/value pairs. Each entry also records one or more normalized kinds. For example:

```json
{
  "label_raw": "Target, Effect, or Area",
  "value_raw": "see text",
  "kinds": ["target", "effect", "area"]
}
```

Canonical spells use `effect.delivery`. Its `resolution` distinguishes a fixed header from one whose meaning is `determined_by_selected_effect`. The existing structured `targeting` and `area` fields remain available for filters.

This preserves singular and plural labels too: `Target`, `Targets`, `Effect`, and `Area` are not collapsed into one invented source field.

## Implemented: conditional components

Wish's 25,000 gp diamond is an ordinary mandatory material component. Miracle's 25,000 gp powdered diamond applies only to its very powerful request option. Storing both as unconditional components would produce incorrect cost filters.

Canonical casting data now separates:

- `components`: required for an ordinary casting; and
- `conditional_components`: a component plus its exact condition and searchable condition text.

This allows a query to distinguish “always costs at least 25,000 gp” from “can require 25,000 gp for a particular option.”

## Deferred: generic conditional outcomes

Death Clutch branches on both saving-throw result and current hit points. Break Enchantment performs a separate check for every effect. Wish and Miracle delegate many mechanics to a selected or duplicated effect.

These are related, but they are not yet evidence for one stable outcome schema. For now, their full wording and semantic relationships should remain canonical and searchable. A generic predicate/outcome model should be designed only after more branching spells are compared.

## Validation result

All seven schemas, 21 source observations, seven canonical spells, five mythic spell variants, 12 decision records, six entity registries, 73 linked entities, and the 22-spell fixture pass validation after the migration. Additional contract tests confirm that:

- combined delivery headers are accepted;
- non-empty conditional components are accepted;
- the former delivery fields are rejected; and
- omitting `conditional_components` is rejected.

## Next ingestion order

1. Capture Break Enchantment and its mythic version; it exercises multiple targets and a real three-source wording conflict.
2. Capture Death Clutch without prematurely flattening its branches.
3. Capture Wish and Mythic Wish, exercising combined delivery and mandatory costly components.
4. Capture Miracle, exercising combined delivery and conditional costly components while confirming that no mythic entity is invented.
