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

function value(raw: string): number {
  return numberWords[raw.toLowerCase()] ?? Number(raw);
}

export function fixedTotalMythicPowerUses(raw: string): number | null {
  const costs = [...raw.matchAll(anyCost)];
  const initial = raw.match(initialCost);
  return costs.length === 1 && initial && !variableCost.test(raw) ? value(initial[1]!) : null;
}
