import fs from "node:fs";
import path from "node:path";

import Ajv2020Module, { type ValidateFunction } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  spellListQualificationsLabel,
  type SpellListQualification,
} from "../src/domain/spell-lists.js";
import { parseLevels } from "../src/ingestion/normalize-level-zero.js";


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

  it("applies a trailing deity qualification to the whole class group", () => {
    const levels = parseLevels(
      "cleric 1, oracle 1, wizard 1 (Rovagug)",
      "Inner Sea Gods",
    );

    expect(levels).toHaveLength(3);
    expect(levels.map((level) => level.spell_list_id)).toEqual([
      "spell-list.cleric",
      "spell-list.oracle",
      "spell-list.wizard",
    ]);
    expect(levels.every((level) => level.qualifications[0]?.kind === "deity")).toBe(true);
    expect(levels[0]?.qualifications[0]).toEqual({
      kind: "deity",
      deity: { entity_id: "deity.rovagug", name: "Rovagug" },
      raw: "Rovagug",
    });
  });

  it("keeps publication scope attached to its mystery alternative", () => {
    const levels = parseLevels(
      "bard 3; Mystery juju(PAP39/PZO9039) 1, juju(PZO9436) 1",
      "Occult Mysteries",
    );

    expect(levels).toHaveLength(3);
    expect(levels.slice(1).map((level) => ({
      list: level.spell_list_id,
      level: level.level,
      qualifications: level.qualifications,
    }))).toEqual([
      {
        list: "spell-list.oracle",
        level: 1,
        qualifications: [
          {
            kind: "mystery",
            mystery: { entity_id: "mystery.juju", name: "juju" },
            raw: "Mystery juju",
          },
          {
            kind: "publication",
            publication_scope: {
              entity_id: null,
              name: null,
              product_code: "PAP39/PZO9039",
            },
            raw: "PAP39/PZO9039",
          },
        ],
      },
      {
        list: "spell-list.oracle",
        level: 1,
        qualifications: [
          {
            kind: "mystery",
            mystery: { entity_id: "mystery.juju", name: "juju" },
            raw: "Mystery juju",
          },
          {
            kind: "publication",
            publication_scope: {
              entity_id: null,
              name: null,
              product_code: "PZO9436",
            },
            raw: "PZO9436",
          },
        ],
      },
    ]);
  });

  it("normalizes explicit archetype and generic conditional restrictions", () => {
    expect(parseLevels("Archetype sanctified slayer (inquisitor) 2", "Advanced Class Guide"))
      .toContainEqual(expect.objectContaining({
        spell_list_id: "spell-list.inquisitor",
        level: 2,
        qualifications: [{
          kind: "archetype",
          archetype: {
            entity_id: "archetype.sanctified-slayer",
            name: "sanctified slayer",
          },
          raw: "Archetype sanctified slayer",
        }],
      }));
    expect(parseLevels(
      "cleric/oracle 7 (must worship the associated deity)",
      "Book of the Damned",
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({
        spell_list_id: "spell-list.cleric",
        qualifications: [expect.objectContaining({ kind: "conditional" })],
      }),
      expect.objectContaining({
        spell_list_id: "spell-list.oracle",
        qualifications: [expect.objectContaining({ kind: "conditional" })],
      }),
    ]));
  });
});
