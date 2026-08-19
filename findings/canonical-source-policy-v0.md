# Canonical Source Policy v0

Policy ID: `provenance-first-v0`

## Default

Choose the source observation with the strongest provenance as the baseline for the complete canonical entity. Preserve its rules wording rather than assembling an invisible mixture of text from several sites.

For the current three-source experiment, the default preference is:

1. AoN when it identifies the entity as first-party and supplies publication provenance.
2. Legacy PRD as the stable Core/OGL baseline or when AoN lacks the record.
3. d20PFSRD as secondary evidence or when the other sources lack the record, subject to first-party verification.

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
