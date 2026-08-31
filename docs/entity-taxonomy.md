# Entity taxonomy

This document defines canonical entity identity and classification for PF1
Rules. Apply these rules to new ingestion and to the comprehensive registry
migration.

## Identity model

An entity ID identifies one game concept. It does not encode every way that
the concept can be classified.

Use this shape:

```text
<kind>[.<structural-parent>...].<canonical-name>
```

Use a dotted parent path only when the source defines one unique, stable
parent that is part of the entity's identity. Record every such parent
explicitly in the registry. Use relationships for classifications that are
multiple, optional, inferred, or likely to change.

Examples:

```text
saving-throw
saving-throw.fortitude
magic-school.conjuration
magic-school.conjuration.teleportation
bloodline.sorcerer.celestial
```

Creature type, feat category, weapon group, alignment, size, and similar
facets are classifications. They do not belong in the canonical entity ID.

```text
monster.trumpet-archon
feat.power-attack
weapon.longbow
```

The corresponding relationships can classify these entities as an outsider,
archon, combat feat, martial weapon, ranged weapon, or bow without assigning
one classification privileged ownership of the ID.

## Identifier syntax

- Use periods to separate taxonomy segments.
- Use hyphens between words inside one segment.
- Use underscores in schema fields and relationship types.
- Use lowercase ASCII in IDs.
- Use singular taxonomy terms, such as `saving-throw`, `weapon`, and `hex`.
- Preserve an official titled entity's canonical title even when the title is
  grammatically plural.
- Do not retain replaced IDs as compatibility aliases. Lexical aliases remain
  valid when they are names that a source or user might use for the same
  concept.

A relationship ID has this shape:

```text
<owner-entity-id>:<relationship_type>:<target-entity-id>
```

For example:

```text
spell.heckle:uses_definition:saving-throw.will
```

## Structural parents

A nested ID must satisfy all of these conditions:

1. The immediate parent exists as a canonical entity.
2. The source definition establishes the parent-child relationship.
3. The child has no competing structural parent.
4. Moving the child would mean correcting its identity, not changing a tag.

Spell subschools meet these conditions. Use the school as the parent:

```text
magic-school.conjuration.calling
magic-school.conjuration.creation
magic-school.conjuration.healing
magic-school.conjuration.summoning
magic-school.conjuration.teleportation
magic-school.divination.scrying
magic-school.enchantment.charm
magic-school.enchantment.compulsion
magic-school.illusion.figment
magic-school.illusion.glamer
magic-school.illusion.pattern
magic-school.illusion.phantasm
magic-school.illusion.shadow
magic-school.transmutation.polymorph
```

The entity type for these children is `magic_subschool`. A spell can reference
both its school and its subschool. The subschool's parent relationship makes
the school derivable, but retaining both spell relationships is allowed when
it preserves the source record directly.

Monster taxonomies do not meet the single-parent rule. A monster can have a
creature type, several subtypes, templates, variants, and other classifications
at the same time. Keep the monster ID flat and record those facets as
relationships. Use an explicit `is_variant_of` relationship when a source
defines one monster as a variant of another.

Feat categories also remain relationships. Keep `feat.maximize-spell` and
classify it as metamagic; keep `feat.improved-critical` and classify it as
combat. This avoids making one category part of identity when feats can gain
additional categories.

Apply the same single-parent rule to subdomains. Nest a subdomain under its
domain when it has one source-defined parent, such as
`domain.magic.divine`. Keep a multiply inherited subdomain flat, such as
`subdomain.archon`, and record each associated domain as a relationship.

## Entity roles

Choose the most specific source-defined role. `rule` is not a fallback for an
unclassified link.

Use these distinctions:

- `descriptor.<name>` for spell descriptors such as `curse`, `poison`,
  `earth`, `evil`, and `lawful`.
- `magic-school.<school>.<subschool>` for spell subschools. The same label may
  validly identify both a descriptor and a subschool, as with `shadow`.
- `condition.<state>` for defined conditions such as `grappled`, `invisible`,
  `paralyzed`, and `stable`.
- `special-ability.<name>` for defined abilities such as `darkvision` and
  `invisibility`.
- `<mechanical-family>.<concept>` when the source defines a stable family, such
  as `defense.spell-resistance`, `damage.precision`, or
  `saving-throw.fortitude`.
- `rule.<topic>` only for an independently defined rule that lacks a clearer
  mechanical family.
- `spell-range.<kind>` for spell range categories such as touch.
- `attack.<kind>` for attack modes such as touch attacks.
- `weapon.<name>` for weapons rather than the generic `item` kind.
- `magic-item.<category>.<name>` when an official magic-item category is a
  unique structural parent, such as `magic-item.rod.cancellation`.
- `publication.<name>` only for an identified published work.

Generic link labels such as “here,” “source,” and “see source blog post” are
not entities. Resolve their destinations to a source-defined entity or reject
the link candidate.

## Canonical names and aliases

Canonical names follow the source-defined concept:

- Use the state name for conditions: `grappled`, not `grappling`.
- Use `lawful` for the descriptor and retain “law” only when evidence shows it
  is a lexical alias.
- Use singular taxonomy labels: `negative-level`, not `negative-levels`.
- Keep abbreviations and common forms such as “AC” and “Will save” as lexical
  aliases of their canonical entities.

An alias must denote the same definition and game role. Do not use aliases to
redirect an obsolete ID or combine same-named concepts from different roles.

## Resolution rules

Resolve a discovered candidate in this order:

1. Identify the destination page and source-defined role.
2. Match an existing entity by definition and role.
3. Confirm that the candidate and entity denote the same concept.
4. Add source wording as a lexical alias when useful.
5. Create a new entity only when no matching canonical entity exists.
6. Leave the candidate unresolved when the evidence does not establish its
   role.

The same normalized name or URL is evidence for review, not proof of identity.
A page can define several entities, and separate pages can define the same
entity.

## Validation invariants

Package validation must eventually enforce these conditions in one migration:

- Every entity ID is unique.
- Every taxonomy-bearing ID agrees with its entity type.
- Every nested entity has its immediate structural parent.
- Every relationship target exists and declares the target's actual entity
  type.
- Every relationship ID agrees with its owner, type, and target.
- Canonical taxonomy terms are singular unless they preserve an official
  titled name.
- Placeholder navigation labels cannot become canonical entities.
- Accepted relationships cannot target superseded entity IDs.

Do not enable an invariant against only part of the registry. Generate the
complete migration, update incoming references, and enable the corresponding
validation in the same change.

## Migration policy

The registry is still a work in progress and has no compatibility requirement.
The comprehensive migration therefore replaces inaccurate IDs directly. It
does not create redirect entities or preserve historical IDs as aliases.

Historical source observations remain immutable. Migration updates canonical
entities and current references while retaining observation evidence that
explains where each candidate originated.
