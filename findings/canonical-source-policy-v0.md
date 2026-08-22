# Canonical Source Policy v0

Policy ID: `provenance-first-v0`

## Default

Choose the source observation with the strongest provenance as the baseline for the complete canonical entity. Preserve its rules wording rather than assembling an invisible mixture of text from several sites.

For spell identities, fields, and class catalogs, use this reviewed workflow:

1. Use AoN when it clearly transcribes the applicable publication.
2. Use Foundry PF1 and d20PFSRD as candidate and catalog evidence. Agreement
   strengthens a candidate but does not turn either source into printed evidence.
3. When Foundry PF1 and d20PFSRD disagree, recommend the Foundry PF1 version
   and request an explicit reviewed decision before changing canonical data.
4. When those sources are insufficient, record an explicit reviewed canonical
   override or inspect the printed Paizo publication and official errata.

This is a decision workflow rather than a claim that a reviewed override changes
what a publication printed. A reviewed override must remain labeled, and later
printed evidence must be preserved and presented for a superseding decision if it
conflicts with the override.

Legacy PRD remains a stable Core/OGL comparison source. It does not control later
class catalogs that it does not cover.

This order is a current working policy, not an irreversible system rule.

## PF1 scope boundary

The primary canonical ruleset is Pathfinder Roleplaying Game First Edition. Presence in the AoN PF1 catalog establishes discoverability, but does not by itself establish PF1 canonical eligibility.

- First-party material explicitly marked by AoN as `3.5 Material` remains in catalog coverage.
- It is not canonicalized as a PF1 spell by default.
- It can become eligible only if an official PF1 conversion or reprint is found, or if legacy first-party 3.5 material is deliberately enabled as a separate scope.
- Third-party material remains excluded unless separately enabled; legacy first-party 3.5 and third-party content are distinct scope categories.
- Affected queue entries remain `scope_issue` so they cannot be mistaken for missing ingestion work or schema failures.

This boundary was accepted for Enhanced Diplomacy and Sign of the Dawnflower on 2026-08-19.

## Case-by-case override

A conflicting field does not automatically change the canonical record. The difference is shown for review, and the user may choose a different source for that field or relationship.

Every override must record:

- the canonical field or relationship affected;
- the selected source observation;
- the other observations considered;
- the rationale for the decision.

The original source observations are never changed.

## Class membership and level conflicts

Class membership uses a reviewed union policy: a class printed by a secondary
catalog may be added without removing classes printed by another source. Class
union does not imply level union. When AoN and the secondary catalogs assign the
same class different levels, keep the applicable AoN transcription unless a
reviewed decision selects another level.

Do not add two unqualified levels for the same class merely to preserve a source
disagreement. Preserve the competing raw claims in their observations and record
the chosen canonical level in the decision record.

## Wording differences

Minor wording differences default to the baseline source. They remain visible in comparison data but do not block the canonical record unless the wording could materially alter play.

Materiality is decided case by case for now. If the number of reviews becomes burdensome or a stable pattern emerges, the project can introduce a general resolution rule later using the accumulated decisions as evidence.

## Missing metadata

Another source may supplement metadata that the baseline does not provide—for example, an explicit hyperlink or a useful publication notice. Supplemental metadata must not silently replace the baseline rules text.

The Light → Permanency relationship demonstrates this:

- AoN is the baseline and contains the textual reference.
- Legacy PRD and d20PFSRD contribute direct-link evidence.
- The product creates one local canonical relationship to `spell.permanency`.

## Current Light decision

AoN is the baseline for the canonical Light record because it supplies the richest provenance. Therefore:

- AoN wording is canonical by default.
- AoN's compiled first-party spell lists are included.
- Core versus later-list scope is retained where it is currently known; uncertain per-list origins remain marked rather than discarded.
- Legacy PRD and d20PFSRD remain attached for comparison and link evidence.
