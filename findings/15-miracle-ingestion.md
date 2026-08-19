# Miracle Ingestion Result

Miracle is now a complete, validated canonical example based on three positive spell observations and one reproducible Legacy mythic-coverage check.

## 1. Source agreement

AoN, Legacy, and d20PFSRD agree on the base rules:

- Evocation.
- Cleric 9 in the Core scope.
- Casting time of 1 standard action.
- Components `V, S; see text`.
- Range, delivery, duration, and saving throws determined by the selected request or duplicated spell.
- Spell resistance yes, with normal handling for duplicated spells.
- The same four ordinary categories, three examples of especially powerful requests, deity/alignment refusal rule, 9th-level duplicated-spell save DC, and 100 gp inherited-component threshold.

AoN is the canonical wording source because it explicitly identifies PRPG Core Rulebook page 314. It also adds Oracle 9 as later first-party class access.

## 2. The most important cost distinction

Miracle does not always cost 25,000 gp.

Its ordinary structured components are only verbal and somatic. The source's `see text` introduces two independent conditional components:

1. A very powerful request requires 25,000 gp of powdered diamond.
2. Duplicating a spell with a material component costing more than 100 gp additionally requires that component.

The first has a fixed `cost_gp: 25000`. The second has no fabricated fixed cost because the item and price depend on the duplicated spell; its exact threshold remains in `condition_raw`.

This creates an important query distinction from Wish: Wish always requires its own 25,000 gp diamond, while Miracle reaches that cost only for one request branch.

## 3. Choice-dependent delivery

All three sources render the same combined header: `Target, Effect, or Area: see text`.

The canonical delivery resolution is `determined_by_selected_effect`. Targeting and area remain null at the top level because Miracle can inherit different delivery behavior from different duplicated or requested effects.

## 4. Access-list observations

AoN supplies Cleric 9 and Oracle 9. d20PFSRD additionally links:

- Community domain 9;
- Luck domain 9; and
- Divine subdomain 9.

These are preserved as typed access records, but their publication scope is `unknown` and their canonical relationships remain pending review until a higher-provenance source confirms them. They do not replace the AoN class list.

## 5. Link inventory

Every literal link inside each bounded spell entry is preserved, including repeated links:

- AoN: 2 links—the Core Rulebook publication and Evocation school.
- Legacy: 4 links—Spell Resistance twice, Feeblemind, and Insanity.
- d20PFSRD: 8 links—Evocation, Cleric/Oracle, three domain-style lists, Standard Action, Feeblemind, and Insanity.

The canonical graph links Miracle to Feeblemind and Insanity and retains the rules concepts for spell resistance, material components, alignment, and spell duplication.

## 6. No Mythic Miracle

No mythic entity was created:

- AoN's Miracle page has no mythic subsection.
- d20PFSRD's Miracle article has no mythic section.
- The captured Legacy Mythic Spell Index contains zero case-insensitive exact-text matches for `Miracle` while containing entries such as Wish and Break Enchantment.

The Legacy result is stored as a hashed source-coverage check, not as a fake empty spell observation. Absence from these sources is not generalized into a claim that no publication anywhere could ever add such a variant; it is the current evidence boundary.

## 7. Deferred request model

Miracle has ordinary duplication options, a comparable free-form effect, and an alternative very powerful request. These are similar to Wish but not identical: the spell-level limits, divine refusal constraint, examples, and component rules differ.

The complete wording remains lossless and searchable. A generic option-and-outcome structure is still deferred until more spells establish reusable boundaries.

## 8. Schema result

No new schema field was needed. Miracle validates the combined-delivery and conditional-component structures introduced during the earlier four-spell review.

## 9. Validation result

The experiment now validates:

- 8 schemas;
- 34 source observations;
- 2 source coverage checks;
- 11 canonical spells;
- 7 mythic spell variants;
- 18 decision records;
- 10 entity registries; and
- 129 linked entities.

Miracle-specific checks confirm the 2/4/8 source-link counts, two unconditional components, two conditional component branches, both cost thresholds, choice-dependent delivery, all named spell relationships, the Legacy zero-match result, and the absence of a mythic relationship or variant record.
