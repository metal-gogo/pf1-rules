# Legacy first-party 3.5 spell ingestion

Decision date: 2026-08-21 (America/Mexico_City)

## Outcome

[C] The project now includes all 23 spells that AoN marks as legacy 3.5
material. Their 115 captured class-and-level memberships are canonical, and
the ingestion manifests have no remaining `legacy-3.5-out-of-scope` issues.
Ingestion completed with zero source or normalization issues.

[C] These records are available in the PF1 rules database for reference, but
they are not represented as Pathfinder-native spells. Each record has all of
the following markers:

- `legacy_3_5_material: true` in the canonical spell record.
- `legacy35Material: true` in the local database.
- `scope: legacy_3_5` on every canonical spell-list membership.
- `LEGACY_3_5_MATERIAL` in normalization warnings as an informational marker.
- A visible `Legacy 3.5` label in alphabetical, class, and spell-detail pages.

## Included spells

Admonishing Ray; Apparent Master; Blacklight; Diamond Spray; Drunkard's
Breath; Enhanced Diplomacy; Flesh to Ooze; Hardening; Hurricane Blast; Impede
Speech; Pattern Recognition; Reveal True Shape; Sand Whirlwind; Sand
Whirlwind, Greater; Shield Speech; Shield Speech, Greater; Sign of the
Dawnflower; Sympathetic Wounds; Thorn Snare; Torrent of Elemental Rage;
Traveling Dream; Veil of Ash; Water Shield.

## Decision pattern

[C] AoN catalog membership is the scope signal. Once the project explicitly
enabled that scope, canonical values still came from the bounded AoN spell
detail page under the existing provenance policy. Enabling the scope did not
authorize inferred values or general promotion of catalog-only memberships.

[C] Pattern Recognition exposed a compact detail-page list label,
`redmantisassassin 1`. The normalizer maps that printed label to the existing
`spell-list.red-mantis-assassin` identity while retaining the printed raw text.
The catalog independently confirms the same class and level. This is a label
normalization, not a catalog-derived level override.

[C] The 273 other Red Mantis Assassin catalog/detail mismatches remain outside
canonical spell levels. This decision enabled legacy 3.5 material only; it did
not establish catalog precedence for unrelated mismatches.

## Reproducibility

Run `pnpm ingest:legacy-3.5` to replay the 23 explicitly enabled records from
their captured source artifacts. The command processes each unique spell once,
refreshes its canonical and decision records, and validates the package.
