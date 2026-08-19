export type ValidatedJson = Record<string, any>;


export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}


function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}


export function observationEntityId(observationId: string): string {
  const firstColon = observationId.indexOf(":");
  const lastColon = observationId.lastIndexOf(":");
  if (firstColon < 0 || lastColon <= firstColon) {
    throw new Error(`Malformed observation ID: ${observationId}`);
  }
  return observationId.slice(firstColon + 1, lastColon);
}
