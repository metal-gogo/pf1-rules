const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const cost = "(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)";
const anyCost = new RegExp(`\\b(?:expend|expending) ${cost} (?:additional )?uses? of mythic power\\b`, "gi");
const initialCost = new RegExp(`\\b(?:If you|You can) expend ${cost} uses? of mythic power\\b`, "i");
const variableCost = /\badditional uses? of mythic power\b|\buses? of mythic power (?:for|per) each\b/i;

export type MythicPowerCostExpression =
  | {
    kind: "alternatives";
    options: { total_mythic_power_uses: number; minimum_tier: number | null }[];
  }
  | {
    kind: "base_plus_per_unit";
    base_mythic_power_uses: number;
    additional_uses_per_unit: number;
    unit: string;
  };

const variableExpressions: Record<string, MythicPowerCostExpression> = {
  "mythic-spell-variant.animate-dead": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 10, minimum_tier: 8 }],
  },
  "mythic-spell-variant.deep-slumber": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 3, minimum_tier: 5 }, { total_mythic_power_uses: 4, minimum_tier: 5 }],
  },
  "mythic-spell-variant.fog-cloud": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 3, minimum_tier: 6 }],
  },
  "mythic-spell-variant.giant-vermin": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 3, minimum_tier: 9 }],
  },
  "mythic-spell-variant.hex-ward": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 3, minimum_tier: 6 }],
  },
  "mythic-spell-variant.obscuring-mist": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 3, minimum_tier: 6 }],
  },
  "mythic-spell-variant.pernicious-poison": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 3, minimum_tier: null }],
  },
  "mythic-spell-variant.soulreaver": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 3, minimum_tier: null }],
  },
  "mythic-spell-variant.vomit-twin": {
    kind: "alternatives",
    options: [{ total_mythic_power_uses: 2, minimum_tier: null }, { total_mythic_power_uses: 3, minimum_tier: null }],
  },
  "mythic-spell-variant.damnation-stride": {
    kind: "base_plus_per_unit",
    base_mythic_power_uses: 2,
    additional_uses_per_unit: 1,
    unit: "additional_creature",
  },
  "mythic-spell-variant.earthquake": {
    kind: "base_plus_per_unit",
    base_mythic_power_uses: 2,
    additional_uses_per_unit: 1,
    unit: "continued_round",
  },
  "mythic-spell-variant.fire-storm": {
    kind: "base_plus_per_unit",
    base_mythic_power_uses: 2,
    additional_uses_per_unit: 1,
    unit: "additional_excluded_creature_type",
  },
  "mythic-spell-variant.goodberry": {
    kind: "base_plus_per_unit",
    base_mythic_power_uses: 1,
    additional_uses_per_unit: 1,
    unit: "imbued_spell_level",
  },
  "mythic-spell-variant.guards-and-wards": {
    kind: "base_plus_per_unit",
    base_mythic_power_uses: 1,
    additional_uses_per_unit: 1,
    unit: "selected_ward_effect",
  },
  "mythic-spell-variant.nightmare": {
    kind: "base_plus_per_unit",
    base_mythic_power_uses: 1,
    additional_uses_per_unit: 1,
    unit: "delivered_spell_level",
  },
};

function value(raw: string): number {
  return numberWords[raw.toLowerCase()] ?? Number(raw);
}

export function fixedTotalMythicPowerUses(raw: string): number | null {
  const costs = [...raw.matchAll(anyCost)];
  const initial = raw.match(initialCost);
  return costs.length === 1 && initial && !variableCost.test(raw) ? value(initial[1]!) : null;
}

export function variableMythicPowerCostExpression(
  variantId: string,
): MythicPowerCostExpression | null {
  return variableExpressions[variantId] ?? null;
}
