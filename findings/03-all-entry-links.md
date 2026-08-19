# Finding 03: Preserve All In-Entry Links

## Decision

Preserve every literal hyperlink inside the bounded rules entry. Do not restrict extraction to links found in the description.

Links outside the entry—navigation, advertising, subscriptions, discussion sections, storefront recommendations, and site footers—are excluded.

## Light inventory

| Source | In-entry links | Link roles found |
|---|---:|---|
| AoN | 3 | Publication and classification |
| Legacy PRD | 2 | Definition and cross-reference |
| d20PFSRD | 15 | Classification, spell list, definition, cross-reference, and publication |
| **Total** | **20** | **17 unique target hints** |

Examples include:

- Core Rulebook publication
- Evocation school
- Light descriptor
- Spell-list or class-related pages
- Wood elemental school
- Standard Action definition
- Spell Resistance definition
- Permanency spell

## Two representations

### Literal source link

Each source observation retains:

- exact anchor text;
- raw `href`;
- resolved absolute URL;
- the spell field containing the link;
- surrounding context;
- a provisional role;
- a provisional canonical target ID.

This is evidence about the source page and remains unchanged.

### Canonical relationship

When the meaning is clear, the canonical record connects to a local entity ID. Light now contains accepted relationships for:

```text
Light --has school------> Evocation
Light --has descriptor--> Light descriptor
Light --published in----> Pathfinder RPG Core Rulebook
Light --uses action-----> Standard Action
Light --uses definition-> Spell Resistance
Light --references------> Permanency
```

Its 22 spell-list entries also carry canonical `spell-list.*` IDs. These records include the spell level, which makes the structured level entry more useful than a generic graph edge.

## Placeholder entities

A target does not need a completed article before it receives an ID. The Light pass created 32 linked entity records, all currently stubs. They include canonical spell lists as well as three composite labels used by d20PFSRD:

- `spell-list.cleric-oracle`
- `spell-list.sorcerer-wizard`
- `spell-list.summoner-unchained-summoner`

The composite records are not automatically treated as the final canonical structure. Their notes say that they are expected to resolve to separate canonical lists. This prevents an informative source link from being discarded while avoiding a premature merge decision.

## Why this helps later

The registry can be expanded incrementally:

1. A crawler discovers `descriptor.light` and creates a stub.
2. A later descriptor importer retrieves its definition.
3. The same ID changes from `stub` to `resolved`.
4. Every spell already connected to that ID immediately gains a working local definition link.

This creates useful coverage even while most related entities contain only a name and ID.

## Parser requirement

Every source adapter must return two independent products:

- parsed raw fields;
- every anchor found within the verified entry boundary.

Link classification may be imperfect initially. The original anchor and URL are always retained so it can be reclassified without downloading the page again.
