# Schema cleanliness audit

This audit covers all seven JSON Schemas in the experiment. Its purpose is to keep the model focused on the contract being designed now, without deprecated fields, migration scaffolding, backward-compatibility aliases, or unsupported placeholder values.

## Result

No deprecated or transitional fields remain.

One unsupported placeholder was removed during the audit: the earlier generic variant contract allowed speculative kinds even though its base relationship, identifier rules, augmentation structure, tier, and power-cost fields were all mythic-specific. The contract is now named `mythic-spell-variant.schema.json`, uses `mythic_spell_variant_id`, and needs no redundant kind discriminator. Other variant kinds will be designed from concrete source material rather than anticipated in advance.

## Schema-by-schema review

### `canonical-spell.schema.json`

- No mythic or variant-rules field exists on a canonical spell.
- `additionalProperties: false` rejects an attempted `description.mythic` field.
- The base spell refers to a mythic entity only through a `has_mythic_variant` relationship.
- Nullable mechanical and publication values represent information that may genuinely be absent, conditional, unknown, or not applicable. They are not migration placeholders.

### `mythic-spell-variant.schema.json`

- The `mythic_spell_variant_id` namespace identifies the contract unambiguously.
- The required inverse relationship is `mythic_version_of`.
- Mythic rules, publication, semantic relationships, provenance, and augmented options live on this entity rather than on the base spell.
- No generic or future variant values are reserved.

### `source-spell-observation.schema.json`

- `mythic_text_raw` is retained because it records literal evidence extracted from a source page. It is not a canonical compatibility field.
- `legacy_aon` is the identifier for the Legacy PRD source, not a legacy schema version.
- `site_extensions` is currently populated by the observations and preserves source-specific parsing facts such as excluded sibling entries and entry ownership. It is active ingestion evidence, not an obsolete extension mechanism.
- Nullable raw values mean that a source did not state a value or that parsing could not safely assign one.

### `canonical-decision.schema.json`

- `superseded` is an audit-history status for a decision replaced by a later decision; it does not preserve an older data shape.
- `leave_unresolved` and `defer` express deliberate human-review outcomes.
- No migration or compatibility fields are present.

### `entity-registry.schema.json`

- `stub` is the intended state for a linked entity whose identity is known before its full record is modeled. This directly supports incremental expansion from captured links.
- `aliases` stores genuine alternate names, not renamed schema fields.
- No deprecated entity representation is present.

### `spell-comparison.schema.json`

- `compatible_with_expansions` describes a content comparison in which one source adds later first-party material. It does not refer to backward schema compatibility.
- Resolution states preserve review decisions without altering source observations.
- The schema is active in the planned source-comparison stage, although no structured comparison instances have been created yet.

### `test-spell-set.schema.json`

- This is the active fixture-selection contract for the 22-spell evaluation set.
- It contains no version-migration or compatibility fields.

## Retention rule

A field is retained when it represents one of the following:

1. a current canonical rule concept;
2. literal or contextual source evidence;
3. provenance or a human review decision;
4. a relationship needed for local navigation; or
5. an active experiment or validation input.

Possible future concepts are not added merely to reserve names. When a new spell or source demonstrates a new shape, the schema can be extended deliberately and the affected examples can be updated together.

## Verification

The audit includes JSON parsing, JSON Schema self-validation, validation of all existing observations, canonical spells, mythic spell variants, canonical decisions, entity registries, and the test-spell fixture. Negative contract checks also confirm that a canonical `description.mythic` property and the former generic variant fields are rejected.
