export interface QualifiedEntity {
  entity_id: string | null;
  name: string;
}


export type SpellListQualification =
  | { kind: "deity"; deity: QualifiedEntity; raw: string }
  | { kind: "mystery"; mystery: QualifiedEntity; raw: string }
  | { kind: "archetype"; archetype: QualifiedEntity; raw: string }
  | {
      kind: "conditional";
      condition: { raw: string; search_text: string };
      raw: string;
    }
  | {
      kind: "publication";
      publication_scope: {
        entity_id: string | null;
        name: string | null;
        product_code: string | null;
      };
      raw: string;
    };


export function spellListQualificationLabel(qualification: SpellListQualification): string {
  switch (qualification.kind) {
    case "deity":
      return `Deity: ${qualification.deity.name}`;
    case "mystery":
      return `Mystery: ${qualification.mystery.name}`;
    case "archetype":
      return `Archetype: ${qualification.archetype.name}`;
    case "conditional":
      return qualification.condition.raw;
    case "publication": {
      const { name, product_code: productCode } = qualification.publication_scope;
      const publication = name && productCode
        ? `${name} (${productCode})`
        : name ?? productCode ?? qualification.raw;
      return `Publication: ${publication}`;
    }
  }
}


export function spellListQualificationsLabel(
  qualifications: readonly SpellListQualification[],
): string | null {
  if (qualifications.length === 0) return null;
  return qualifications.map(spellListQualificationLabel).join("; ");
}
