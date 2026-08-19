# Finding 02: Source Links and Canonical Decisions

## Decision

Store all three source observations independently and relate them to an auditable canonicalization decision. Preserve source hyperlinks as evidence, then convert accepted rules references into canonical relationships for the offline product.

## Light → Permanency example

The Light descriptions produce these observations:

| Source | Mentions Permanency | Supplies hyperlink |
|---|---:|---:|
| AoN | Yes | No |
| Legacy PRD | Yes | Yes, relative URL |
| d20PFSRD | Yes | Yes, absolute URL |

The accepted canonical relationship is:

```text
spell.light --references--> spell.permanency
```

The local application navigates using the canonical target ID, `spell.permanency`. It does not need a website at runtime. The two original hyperlinks and AoN's plain-text mention remain attached as evidence.

## Why both layers matter

If only source URLs were stored, internal navigation would break when a website changed. If only the canonical relationship were stored, we would lose the evidence showing why the relationship exists.

Keeping both provides:

- offline links between spells, rules, feats, conditions, and other entities;
- traceability back to every source;
- the ability to discover references from a source without accepting them automatically;
- comparison of link coverage among sources;
- future backlinks such as “Referenced by Light.”

## Canonical decision

`data/decisions/light.json` considers all three observations and records decisions independently:

- AoN supplies the printed page number.
- AoN supplies the compiled first-party spell lists and canonical wording under the provenance-first policy.
- Legacy PRD and d20PFSRD preserve their wording variant for a possible case-by-case override.
- All three sources support accepting the Permanency relationship.

This means a canonical record is not described by a single global `source = AoN` value. Each field or relationship can have its own evidence and rationale.

## Expected SQLite mapping

The JSON experiment can later map to relational tables approximately as follows:

| Table | Purpose |
|---|---|
| `source_observation` | One downloaded and parsed entity from one source |
| `source_reference` | A hyperlink or plain-text rules reference found in an observation |
| `canonical_entity` | The locally addressable spell, feat, rule, condition, or other entity |
| `canonical_relationship` | An accepted semantic edge between canonical entities |
| `canonical_decision` | A versioned review decision for a canonical entity |
| `decision_evidence` | Connects a field or relationship decision to one or more observations |

Important uniqueness rules will include:

```text
source_observation: unique(source_id, source_url, content_sha256)
canonical_entity: unique(entity_type, canonical_slug)
canonical_relationship: unique(source_entity_id, relationship_type, target_entity_id)
decision_evidence: unique(decision_item_id, observation_id, source_field)
```

## Relationship types

The first schema supports more than generic links:

- `references`
- `functions_like`
- `counteracts`
- `dispels`
- `modifies`
- `requires`

This distinction will eventually improve search and rules assembly. For example, “functions like raise dead” is more important than a casual mention and should be retrieved automatically with the spell.

## Current status

The relationship and decision schemas validate. The Light canonical record and its provenance-first decision are accepted. Exact publication attribution for each later spell-list addition remains an enrichment task, but does not block using AoN's verified first-party compilation.
