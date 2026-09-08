import { expect, test } from "vitest";

import { verifyUniqueRelationships } from "../src/ingestion/validate.js";

test("relationship IDs must be unique within records and across imported owners", () => {
  const relationship = { relationship_id: "spell.example:references:spell.other" };
  expect(() => verifyUniqueRelationships([relationship, relationship], "spell.json", new Map()))
    .toThrow("Duplicate relationship ID");
  const seen = new Map<string, string>();
  verifyUniqueRelationships([relationship], "spell.json", seen);
  expect(() => verifyUniqueRelationships([{ ...relationship, status: "rejected" }], "variant.json", seen))
    .toThrow("first declared in spell.json");
  expect(() => verifyUniqueRelationships([{ relationship_id: "variant.example:references:spell.other" }], "variant.json", seen))
    .not.toThrow();
});
