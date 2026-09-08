import { describe, expect, it } from "vitest";

import { ownsBaseSpell } from "../src/ingestion/generate-mythic-variant-candidates.js";
import {
  fixedTotalMythicPowerUses,
  variableMythicPowerCostExpression,
} from "../src/ingestion/mythic-augmentation-cost.js";

describe("mythic augmentation costs", () => {
  it("derives one explicit total and leaves variable costs unresolved", () => {
    expect(fixedTotalMythicPowerUses("If you expend two uses of mythic power, the spell improves.")).toBe(2);
    expect(fixedTotalMythicPowerUses("If you expend two uses of mythic power, the spell improves. If you expend three uses of mythic power, it improves further.")).toBeNull();
    expect(fixedTotalMythicPowerUses("You must expend one use of mythic power for each spell level.")).toBeNull();
    expect(fixedTotalMythicPowerUses("You can augment the spell. If you expend two uses of mythic power, it improves.")).toBe(2);
    expect(fixedTotalMythicPowerUses("If you expend two uses of mythic power, it improves. Each additional target requires one additional use of mythic power.")).toBeNull();
  });

  it("uses only the observation that owns the base spell", () => {
    expect(ownsBaseSpell({ spell_raw: { name_raw: "Beast Shape I" } }, "Beast Shape I")).toBe(true);
    expect(ownsBaseSpell({ spell_raw: { name_raw: "Share Shape" } }, "Beast Shape I")).toBe(false);
  });

  it("models alternatives and per-unit costs without a fake scalar", () => {
    expect(variableMythicPowerCostExpression("mythic-spell-variant.deep-slumber")).toEqual({
      kind: "alternatives",
      options: [
        { total_mythic_power_uses: 2, minimum_tier: null },
        { total_mythic_power_uses: 3, minimum_tier: 5 },
        { total_mythic_power_uses: 4, minimum_tier: 5 },
      ],
    });
    expect(variableMythicPowerCostExpression("mythic-spell-variant.earthquake")).toEqual({
      kind: "base_plus_per_unit",
      base_mythic_power_uses: 2,
      additional_uses_per_unit: 1,
      unit: "continued_round",
    });
  });
});
