# Cure Moderate Wounds and the Inflict Pair

## Scope

This comparison evaluates Cure Moderate Wounds, Inflict Light Wounds, and Inflict Moderate Wounds across Archives of Nethys, the legacy PRD, and d20PFSRD. Inflict Light Wounds is included because Inflict Moderate Wounds explicitly depends on it. Mass Cure Moderate Wounds and Mass Inflict Moderate Wounds are deliberately deferred.

## Finding 1: omitted repeated fields are not negative facts

AoN repeats the casting and effect stat blocks for both moderate spells. The Legacy PRD and d20PFSRD generally omit those repeated fields and rely on the sentence saying the spell functions like its light-wounds parent.

Therefore a source observation must preserve each omission as an omission. A source adapter must not copy the parent fields into the raw page record. Parent resolution belongs in the canonical/query layer, where it can be explained and audited.

## Finding 2: `functions_like` carries rules, while `counterpart_of` does not

Cure Moderate Wounds inherits its general operation from Cure Light Wounds and overrides the amount with 2d8 + 1 per caster level, maximum +10. Inflict Moderate Wounds does the same from Inflict Light Wounds.

The canonical schema now records:

- the parent spell;
- the exact source sentence that establishes the dependency;
- which canonical paths were resolved from the parent;
- the child's explicit overrides;
- whether resolution succeeded; and
- a human-readable explanation.

Cure Moderate Wounds and Inflict Moderate Wounds are also counterparts. That link supports paired navigation and comparison, but it never authorizes copying rules between them. The same counterpart link is recorded for the two light-wounds spells.

## Finding 3: preserve raw wording and resolved behavior together

The canonical `description.raw` for each moderate spell remains the compact printed functions-like sentence. The searchable summary resolves the parent behavior so a user can find and understand the complete result without manually opening the parent.

This gives the product two useful views:

1. **Answer view:** complete resolved behavior for play.
2. **Why view:** child text, parent dependency, override, source pages, and canonical decision.

## Finding 4: the three sources contribute different value

- **AoN** remains the baseline. It has the broad compiled first-party class lists, explicit repeated stat blocks, Core book/page attribution, and the Mythic sections.
- **Legacy PRD** is the strongest compact Core baseline and directly links each moderate spell to its light-wounds parent.
- **d20PFSRD** also links the parent spells, provides useful rules/class navigation, and exposes Healing domain 2 for Cure Moderate Wounds. The domain entry remains flagged for independent first-party-source confirmation.

No source omission is automatically merged, and no conflict is silently resolved.

## Canonical results

### Cure Moderate Wounds

- Parent: Cure Light Wounds
- Override: cures 2d8 + 1/caster level, maximum +10
- Mythic: 4d8 + 2/caster level, maximum +20; cures up to 2 points of ability damage for a living target
- Counterpart: Inflict Moderate Wounds

### Inflict Light Wounds

- Base spell with no inherited parent
- Living creature: 1d8 + 1/caster level damage, maximum +5
- Undead creature: cured by the same amount
- Will half; spell resistance yes
- Mythic: 2d8 + 2/caster level, maximum +10; a living target that fails its save is sickened for up to 5 rounds
- Counterpart: Cure Light Wounds

### Inflict Moderate Wounds

- Parent: Inflict Light Wounds
- Override: 2d8 + 1/caster level, maximum +10
- Mythic: 4d8 + 2/caster level, maximum +20; a living target that fails its save is sickened for up to 10 rounds
- Counterpart: Cure Moderate Wounds

## Deferred modeling question

The current structured effect object cannot fully express the creature-type branches without becoming misleading. For now the canonical records preserve the complete living-versus-undead behavior in source text and searchable resolved prose. A later family test should design a reusable conditional effect model for damage, healing, saving throws, spell resistance, and mythic condition riders.

## Result

The experiment can now represent three different related-spell concepts without conflating them:

- family membership for discovery;
- rules inheritance for `functions like`; and
- counterpart pairing for cure/inflict comparison.

This is enough to answer the moderate-wounds rules accurately while retaining the evidence needed to verify every inherited claim.
