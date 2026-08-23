# Reviewed Foundry membership resolution

Decision date: 2026-08-23 (America/Mexico_City)

Foundry PF1 snapshot: [`1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f`](https://gitlab.com/foundryvtt_pathfinder1e/foundryvtt-pathfinder1/-/commit/1668c1f1e0f9fc67f817e21b30fde01bcda1ad5f)

Machine-readable result: [`data/reports/foundry-membership-audit.json`](../data/reports/foundry-membership-audit.json)

## Outcome

[C] The reviewed decisions resolve all 63 previously missing Foundry class
assertions and all 24 competing-level assertions. The replayed audit maps all
3,028 Foundry spells and reports no missing memberships, no competing levels,
and no unmapped identities.

[C] Reviewed Foundry-only additions use `access_basis: reviewed_override`.
Class-rule consequences remain `derived`; neither category is mislabeled as a
value printed by AoN.

## Decisions

- [C] Keep 34 Foundry-only Unchained Summoner candidates absent. AoN remains the
  preferred list source for these candidates, and every rejection is recorded
  in the spell's canonical decision file.
- [C] Add Hostile Juxtaposition, Greater to Unchained Summoner 6 as a reviewed
  override. Use the lower reviewed Mesmerist 4 level instead of the preserved
  AoN level 6.
- [C] Add the 22 independent publication-review assertions as reviewed
  overrides.
- [C] Add Petulengro's Validation to Sorcerer 1 and Wizard 1. Arcanist 1 is
  derived from the class rule rather than represented as printed evidence.
- [C] Add Seer's Bane to Sorcerer 6 and Wizard 6. Arcanist 6 is derived from the
  class rule. The reviewed secondary transcription that lists Sorcerer/Wizard 6
  is [World Anvil](https://www.worldanvil.com/w/astora-hamilcarbarca/a/seer-s-bane2A-spell).
- [C] For all 24 competing assertions, use the lower level. Sixteen assertions
  adopt the lower Foundry level; eight retain the already-lower canonical level.
  Besmara's Grasping Depths Warpriest 5 is recalculated from its reviewed Cleric
  5 membership through the explicit Warpriest class rule.

## Missing printed values

- [C] Torrent of Elemental Rage now has reviewed range category `distance` and
  formula `persistent line of elements 30 ft. long`, copied from the printed
  Effect field. The missing printed Range remains raw `null` and the override is
  labeled `REVIEWED_RANGE_OVERRIDE`.
- [C] The six canonical identities with no printed spell levels remain unchanged
  and `needs_review`: Armor of Darkness, Bolt of Glory, Bolts of Bedevilment,
  Crown of Glory, Fey Blight, and Fey Boon.

## Safety checks

- [C] A catalog membership may be replaced by a lower reviewed level only when
  the canonical row uses `reviewed_override` and carries a matching
  `REVIEWED_LOWER_SPELL_LEVEL` warning.
- [C] The Foundry audit suppresses a candidate only after finding either an
  exact canonical membership, an explicit rejection decision, or a matching
  reviewed lower-level decision.
