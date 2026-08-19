# Mythic Spell Variant Entities

## Decision

Mythic spell versions are now separately identifiable `mythic_spell_variant` entities rather than text owned by their base spells.

The stable identifier shape is:

```text
mythic-spell-variant.<base-spell-name>
```

Examples:

```text
mythic-spell-variant.fireball
mythic-spell-variant.cure-moderate-wounds
mythic-spell-variant.inflict-moderate-wounds
```

The entity type and identifier namespace are explicitly mythic. The schema does not carry a redundant discriminator or reserve speculative values for other kinds. A different kind of variant should get its own contract only after concrete source material reveals its relationship, inheritance, and nested-option semantics.

## Base-spell integrity

Every variant contains a required base-spell edge:

```json
{
  "base_spell": {
    "spell_id": "spell.fireball",
    "relationship": "mythic_version_of",
    "rules_combination": "inherits_unless_replaced",
    "evidence": []
  }
}
```

The base spell contains the reciprocal edge:

```text
spell.fireball
  └── has_mythic_variant → mythic-spell-variant.fireball
```

The validator rejects a missing base spell, a missing reciprocal link, disagreement between the two directions, a duplicate variant kind for one base spell, or an unregistered variant. The canonical-spell schema uses `additionalProperties: false`, so variant-only fields cannot be added to a base spell.

## Ownership

The variant owns:

- its mythic rules text and search text;
- its Mythic Adventures publication and page;
- its source evidence and field-level provenance;
- relationships that apply only to the mythic effect; and
- any explicitly labeled augmented mythic options.

The base spell continues to own its normal stat block, description, Core publication, spell lists, family relationships, and rules inheritance from other ordinary spells.

This means normal Inflict Light Wounds no longer has a direct Sickened relationship. Mythic Inflict Light Wounds does.

## Augmented mythic options

An `Augmented` subsection is nested within the mythic variant rather than treated as another spell or another top-level variant.

Mythic Fireball currently contains:

```text
mythic-spell-variant.fireball
└── mythic-spell-variant.fireball.augmentation-6th
    ├── minimum_tier: 6
    ├── total_mythic_power_uses: 2
    ├── uses_definition → Energy Resistance
    └── uses_definition → Energy Immunity
```

The cost field is named `total_mythic_power_uses` to avoid ambiguity about whether the text includes the normal one-use mythic cost.

## Migrated records

Five variants were created from the source observations already captured:

1. Mythic Fireball
2. Mythic Cure Light Wounds
3. Mythic Cure Moderate Wounds
4. Mythic Inflict Light Wounds
5. Mythic Inflict Moderate Wounds

Each has an independent canonical decision record. The base spell decisions now cover the `has_mythic_variant` edge, while variant decisions cover mythic wording, publication, base identity, and augmentation parsing.

## Compatibility field

The canonical-spell schema does not define `description.mythic`. Mythic rules exist only in the related spell-variant record; there is no compatibility field or transitional `null` value on the base spell.

## Deliberate non-variants

Mass, lesser, greater, communal, and separately published adaptations remain canonical spells connected by related-spell edges. Metamagic and other cast-time modifications belong to a future casting-configuration model. Neither category should produce `mythic_spell_variant` records.
