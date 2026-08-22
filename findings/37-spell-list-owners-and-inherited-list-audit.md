# Spell-list owners and inherited-list audit

Audit date: 2026-08-22 (America/Mexico_City)

This audit is complete. The current Foundry decision backlog is in [the Foundry-only membership evaluation](./38-foundry-only-membership-evaluation.md).

## Outcome

[C] The model now preserves three separate facts:

1. A membership and level printed on a spell or owner page.
2. The rules concept that owns the list, such as a class, NPC class, domain, subdomain, mystery, bloodline, patron, spirit, or feat.
3. Effective access derived from an explicit class or compatibility rule.

Derived access is labeled `access_basis: derived`. It does not replace or masquerade as a printed spell-page value. Reviewed canonical overrides remain a separate decision type.

## Current class-list inventory

| List | Canonical memberships | Result |
| --- | ---: | --- |
| Adept | 76 | Owned by an explicit NPC-class entity. |
| Cleric | 1,133 | Printed memberships. |
| Inquisitor | 656 | Printed memberships. |
| Omdura | 1,238 | Derived from its Cleric/Inquisitor rule. |
| Oracle | 1,141 | General Cleric-derived access plus explicit Oracle rows; mystery access is separate. |
| Sorcerer | 1,887 | Printed memberships; intentionally not forced to equal Wizard. |
| Wizard | 1,897 | Printed memberships. |
| Arcanist | 1,897 | Effective Sorcerer/Wizard access, with derived rows labeled. |
| Alchemist | 408 | Printed formula-list memberships. |
| Investigator | 409 | Effective Alchemist access plus explicit Investigator rows. |
| Bard | 868 | Printed memberships. |
| Skald | 869 | Effective Bard access plus explicit Skald rows. |
| Warpriest | 988 | Effective Cleric access through level 6 plus explicit Warpriest rows. |
| Hunter | 817 | Effective Druid/Ranger access through level 6. |
| Summoner (Unchained) | 370 | Includes seven narrowly derived *Monster Summoner's Handbook* options. |

## Owner catalogs completed

- [C] 34 Oracle mysteries with 306 printed rows.
- [C] 52 Witch patrons with 469 printed rows.
- [C] 17 Shaman spirits with 153 printed rows.
- [C] 51 Sorcerer bloodlines with 459 printed rows.
- [C] 24 Bloodrager bloodlines with 96 printed rows.
- [C] 35 domains with 315 printed rows.
- [C] 136 unique subdomains represented by 150 parent-specific effective lists: 427 printed replacement rows and 926 derived inherited rows.
- [C] Sahir-Afiyun is modeled as feat-granted selectable access, not a caster class.

## Source-backed inherited access completed

- Omdura: 1,238 derived rows.
- Oracle: 12 derived rows were added during the class-rule reconciliation; owner ingestion then separated mystery-only access from the general class list.
- Arcanist: 5 derived rows.
- Investigator: 7 derived rows.
- Skald: 19 derived rows.
- Warpriest: 6 derived rows.
- Hunter: 7 derived rows.
- Summoner (Unchained): 7 *Monster Summoner's Handbook* rows derived from Paizo's explicit compatibility statement.

## Safety invariants

- Do not infer a printed spell-page value from a class or owner inheritance rule.
- Do not replace an explicit printed class level with a derived level.
- Do not treat Foundry or d20PFSRD as proof when they are the only source for a disputed value.
- Record every approved non-printed value as a reviewed canonical override unless an explicit rules statement supports derived access.
- Keep unresolved source conflicts visible in the decision backlog.
