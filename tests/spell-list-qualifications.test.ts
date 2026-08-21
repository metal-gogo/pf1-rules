import fs from "node:fs";
import path from "node:path";

import Ajv2020Module, { type ValidateFunction } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  spellListQualificationsLabel,
  type SpellListQualification,
} from "../src/domain/spell-lists.js";


interface JsonSchemaValidator {
  compile(schema: object): ValidateFunction;
}

const Ajv2020 = Ajv2020Module as unknown as new (
  options: Record<string, unknown>,
) => JsonSchemaValidator;

const canonicalSchema = JSON.parse(fs.readFileSync(
  path.resolve("schemas/canonical-spell.schema.json"),
  "utf8",
));
const validateQualification = new Ajv2020({ strict: true, allErrors: true }).compile({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $ref: "#/$defs/spellListQualification",
  $defs: canonicalSchema.$defs,
});


describe("qualified spell-list entries", () => {
  const qualifications: SpellListQualification[] = [
    {
      kind: "deity",
      deity: { entity_id: "deity.rovagug", name: "Rovagug" },
      raw: "Rovagug",
    },
    {
      kind: "mystery",
      mystery: { entity_id: "mystery.juju", name: "Juju" },
      raw: "Mystery juju",
    },
    {
      kind: "archetype",
      archetype: { entity_id: "archetype.sanctified-slayer", name: "Sanctified Slayer" },
      raw: "Sanctified Slayer archetype",
    },
    {
      kind: "conditional",
      condition: {
        raw: "must worship the associated deity",
        search_text: "must worship the associated deity",
      },
      raw: "must worship the associated deity",
    },
    {
      kind: "publication",
      publication_scope: {
        entity_id: "publication.occult-mysteries",
        name: "Occult Mysteries",
        product_code: "PZO9436",
      },
      raw: "PZO9436",
    },
  ];

  it("accepts each supported discriminated qualification", () => {
    expect(qualifications.every((qualification) => validateQualification(qualification))).toBe(true);
  });

  it("rejects a qualifier flattened into generic name and publication fields", () => {
    expect(validateQualification({
      kind: "mystery",
      name: "Juju",
      publication_code: "PZO9436",
      raw: "Mystery juju (PZO9436)",
    })).toBe(false);
  });

  it("renders conjunctive qualifications without losing their kinds", () => {
    expect(spellListQualificationsLabel(qualifications)).toBe(
      "Deity: Rovagug; Mystery: Juju; Archetype: Sanctified Slayer; " +
      "must worship the associated deity; Publication: Occult Mysteries (PZO9436)",
    );
    expect(spellListQualificationsLabel([])).toBeNull();
  });
});
