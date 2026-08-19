import fs from "node:fs";
import path from "node:path";

import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

import { projectRoot } from "../config.js";
import { observationEntityId, type ValidatedJson } from "../domain/json.js";
import { validatePackage, type PackageStatistics } from "./validate.js";


const importerVersion = "0.2.0-prisma";

export interface ImportStatistics extends PackageStatistics {
  entityEvidence: number;
  searchableRecords: number;
}


function loadJson(filename: string): ValidatedJson {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as ValidatedJson;
}


function jsonFiles(directory: string, recursive = false): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      return recursive && entry.isDirectory() ? jsonFiles(filename, true) : [filename];
    })
    .filter((filename) => filename.endsWith(".json"))
    .sort();
}


async function clearImportedData(tx: Prisma.TransactionClient): Promise<void> {
  await tx.decisionRelationshipItem.deleteMany();
  await tx.decisionFieldItem.deleteMany();
  await tx.canonicalDecision.deleteMany();
  await tx.normalizationWarning.deleteMany();
  await tx.recordProvenance.deleteMany();
  await tx.relationshipEvidence.deleteMany();
  await tx.ruleRelationship.deleteMany();
  await tx.mythicAugmentation.deleteMany();
  await tx.mythicSpellVariant.deleteMany();
  await tx.spellInheritance.deleteMany();
  await tx.spellDescriptionSection.deleteMany();
  await tx.spellDeliveryField.deleteMany();
  await tx.spellComponent.deleteMany();
  await tx.spellLevel.deleteMany();
  await tx.spellDescriptor.deleteMany();
  await tx.spellAlias.deleteMany();
  await tx.canonicalSpell.deleteMany();
  await tx.entityEvidence.deleteMany();
  await tx.coverageCheck.deleteMany();
  await tx.sourceDeliveryField.deleteMany();
  await tx.sourceSection.deleteMany();
  await tx.sourceReference.deleteMany();
  await tx.sourceLink.deleteMany();
  await tx.sourceObservation.deleteMany();
  await tx.ingestionQueueItem.deleteMany();
  await tx.entity.deleteMany();
  await tx.importRun.deleteMany();
}


async function insertEntities(tx: Prisma.TransactionClient): Promise<number> {
  let count = 0;
  for (const filename of jsonFiles(path.join(projectRoot, "data", "entities"))) {
    const registry = loadJson(filename);
    for (const entity of registry.entities) {
      await tx.entity.create({
        data: {
          id: entity.entity_id,
          type: entity.entity_type,
          name: entity.name,
          status: entity.status,
          aliases: entity.aliases,
          notes: entity.notes,
          registryId: registry.registry_id,
        },
      });
      count += 1;
    }
  }
  return count;
}


async function insertObservations(tx: Prisma.TransactionClient): Promise<number> {
  let count = 0;
  for (const filename of jsonFiles(path.join(projectRoot, "data", "observations"), true)) {
    const record = loadJson(filename);
    const raw = record.spell_raw;
    await tx.sourceObservation.create({
      data: {
        id: record.observation_id,
        entityId: observationEntityId(record.observation_id),
        entityType: record.entity_type,
        siteId: record.source.site_id,
        sourceUrl: record.source.url,
        firstPartyStatus: record.source.first_party_status ?? null,
        retrievedAt: new Date(record.retrieval.retrieved_at),
        httpStatus: record.retrieval.http_status,
        contentSha256: record.retrieval.content_sha256,
        rawArtifactPath: record.retrieval.raw_artifact_path,
        parserName: record.parser.name,
        parserVersion: record.parser.version,
        pageTitleRaw: record.page?.title_raw ?? null,
        nameRaw: raw.name_raw,
        schoolRaw: raw.school_raw ?? null,
        levelsRaw: raw.levels_raw ?? null,
        domainsRaw: raw.domains_raw ?? null,
        castingTimeRaw: raw.casting_time_raw ?? null,
        componentsRaw: raw.components_raw ?? null,
        rangeRaw: raw.range_raw ?? null,
        durationRaw: raw.duration_raw ?? null,
        savingThrowRaw: raw.saving_throw_raw ?? null,
        spellResistanceRaw: raw.spell_resistance_raw ?? null,
        descriptionRaw: raw.description_raw,
        mythicTextRaw: raw.mythic_text_raw ?? null,
        sourceBookRaw: raw.source_book_raw ?? null,
        sourcePageRaw: raw.source_page_raw ?? null,
        pfsStatusRaw: raw.pfs_status_raw ?? null,
        payload: record,
      },
    });
    for (const [index, link] of (raw.links_raw ?? []).entries()) {
      await tx.sourceLink.create({
        data: {
          observationId: record.observation_id,
          occurrenceIndex: index,
          anchorTextRaw: link.anchor_text_raw,
          hrefRaw: link.href_raw ?? null,
          hrefResolved: link.href_resolved ?? null,
          sourceField: link.source_field,
          contextRaw: link.context_raw ?? null,
          roleHint: link.role_hint ?? null,
          targetEntityTypeHint: link.target_entity_type_hint ?? null,
          targetEntityIdHint: link.target_entity_id_hint ?? null,
        },
      });
    }
    for (const [index, reference] of (raw.references_raw ?? []).entries()) {
      await tx.sourceReference.create({
        data: {
          observationId: record.observation_id,
          occurrenceIndex: index,
          anchorTextRaw: reference.anchor_text_raw,
          hrefRaw: reference.href_raw ?? null,
          evidenceKind: reference.evidence_kind,
          sourceField: reference.source_field,
          contextRaw: reference.context_raw ?? null,
          targetEntityType: reference.target_entity_type ?? null,
          targetNameHint: reference.target_name_hint ?? null,
          relationshipHint: reference.relationship_hint ?? null,
        },
      });
    }
    for (const [index, section] of (raw.sections_raw ?? []).entries()) {
      await tx.sourceSection.create({
        data: {
          observationId: record.observation_id,
          sectionIndex: index,
          headingRaw: section.heading_raw,
          bodyRaw: section.body_raw,
        },
      });
    }
    for (const [index, field] of (raw.delivery_fields_raw ?? []).entries()) {
      await tx.sourceDeliveryField.create({
        data: {
          observationId: record.observation_id,
          fieldIndex: index,
          labelRaw: field.label_raw,
          valueRaw: field.value_raw ?? null,
          kinds: field.kinds,
        },
      });
    }
    count += 1;
  }
  return count;
}


async function insertEntityEvidence(tx: Prisma.TransactionClient): Promise<number> {
  let count = 0;
  for (const filename of jsonFiles(path.join(projectRoot, "data", "entities"))) {
    const registry = loadJson(filename);
    for (const entity of registry.entities) {
      for (const [index, evidence] of entity.evidence.entries()) {
        await tx.entityEvidence.create({
          data: {
            entityId: entity.entity_id,
            evidenceIndex: index,
            observationId: evidence.observation_id,
            sourceField: evidence.source_field,
            anchorTextRaw: evidence.anchor_text_raw ?? null,
            sourceHref: evidence.source_href ?? null,
          },
        });
        count += 1;
      }
    }
  }
  return count;
}


async function insertCoverage(tx: Prisma.TransactionClient): Promise<number> {
  let count = 0;
  for (const filename of jsonFiles(path.join(projectRoot, "data", "coverage"))) {
    const record = loadJson(filename);
    await tx.coverageCheck.create({
      data: {
        id: record.coverage_check_id,
        entityId: record.entity_id,
        siteId: record.source.site_id,
        sourceUrl: record.source.url,
        retrievedAt: new Date(record.retrieval.retrieved_at),
        contentSha256: record.retrieval.content_sha256,
        rawArtifactPath: record.retrieval.raw_artifact_path,
        method: record.check.method,
        query: record.check.query,
        caseSensitive: record.check.case_sensitive,
        scopeRaw: record.check.scope_raw,
        resultStatus: record.result.status,
        matchCount: record.result.match_count,
        note: record.result.note ?? null,
        payload: record,
      },
    });
    count += 1;
  }
  return count;
}


async function insertRelationship(
  tx: Prisma.TransactionClient,
  ownerEntityId: string,
  ownerKind: string,
  relationship: ValidatedJson,
): Promise<void> {
  await tx.ruleRelationship.create({
    data: {
      id: relationship.relationship_id,
      ownerEntityId,
      ownerKind,
      relationshipType: relationship.type,
      targetEntityType: relationship.target.entity_type,
      targetEntityId: relationship.target.entity_id ?? null,
      targetName: relationship.target.name,
      status: relationship.status,
      note: relationship.note ?? null,
    },
  });
  for (const [index, evidence] of relationship.evidence.entries()) {
    await tx.relationshipEvidence.create({
      data: {
        relationshipId: relationship.relationship_id,
        evidenceIndex: index,
        observationId: evidence.observation_id,
        sourceField: evidence.source_field,
        evidenceKind: evidence.evidence_kind,
        anchorTextRaw: evidence.anchor_text_raw ?? null,
        sourceHref: evidence.source_href ?? null,
      },
    });
  }
}


async function insertProvenanceAndWarnings(
  tx: Prisma.TransactionClient,
  ownerEntityId: string,
  record: ValidatedJson,
): Promise<void> {
  for (const [index, item] of record.provenance.entries()) {
    await tx.recordProvenance.create({
      data: {
        ownerEntityId,
        provenanceIndex: index,
        fieldPath: item.field_path,
        observationId: item.observation_id,
        sourceField: item.source_field,
        rawValueSha256: item.raw_value_sha256 ?? null,
        decision: item.decision,
        note: item.note ?? null,
      },
    });
  }
  for (const [index, warning] of record.normalization.warnings.entries()) {
    await tx.normalizationWarning.create({
      data: {
        ownerEntityId,
        warningIndex: index,
        code: warning.code,
        fieldPath: warning.field_path ?? null,
        message: warning.message,
      },
    });
  }
}


function canonicalRecords(): ValidatedJson[] {
  return jsonFiles(path.join(projectRoot, "data", "canonical")).map(loadJson);
}


async function insertCanonicalSpells(tx: Prisma.TransactionClient): Promise<number> {
  const records = canonicalRecords();
  for (const record of records) {
    const casting = record.casting;
    const effect = record.effect;
    const publication = record.publication;
    await tx.canonicalSpell.create({
      data: {
        spellId: record.spell_id,
        ruleset: record.ruleset,
        name: record.name,
        school: record.classification.school,
        subschool: record.classification.subschool ?? null,
        classificationRaw: record.classification.raw ?? null,
        castingTimeKind: casting.time.kind,
        castingTimeAmount: casting.time.amount ?? null,
        castingTimeUnit: casting.time.unit,
        castingTimeRaw: casting.time.raw ?? null,
        componentsRaw: casting.components_raw ?? null,
        rangeCategory: effect.range.category,
        rangeFormula: effect.range.formula ?? null,
        rangeRaw: effect.range.raw ?? null,
        deliveryResolution: effect.delivery.resolution,
        targeting: effect.targeting ?? Prisma.DbNull,
        area: effect.area ?? Prisma.DbNull,
        durationKind: effect.duration.kind,
        durationFormula: effect.duration.formula ?? null,
        durationRaw: effect.duration.raw ?? null,
        savingThrow: effect.saving_throw,
        spellResistance: effect.spell_resistance,
        descriptionRaw: record.description.raw,
        searchText: record.description.search_text,
        publisher: publication.publisher,
        publicationBook: publication.book,
        publicationPage: publication.page ?? null,
        firstPartyStatus: publication.first_party_status,
        pfsStatus: publication.pfs_status,
        normalizationStatus: record.normalization.status,
        payload: record,
      },
    });
  }

  for (const record of records) {
    for (const alias of record.aliases) {
      await tx.spellAlias.create({ data: { spellId: record.spell_id, alias } });
    }
    for (const descriptor of record.classification.descriptors) {
      await tx.spellDescriptor.create({ data: { spellId: record.spell_id, descriptor } });
    }
    for (const level of record.levels) {
      await tx.spellLevel.create({
        data: {
          spellId: record.spell_id,
          spellListId: level.spell_list_id,
          listKind: level.list_kind,
          listName: level.list_name,
          spellLevel: level.level,
          scope: level.scope,
          raw: level.raw ?? null,
        },
      });
    }
    for (const [index, component] of record.casting.components.entries()) {
      await tx.spellComponent.create({
        data: {
          spellId: record.spell_id,
          componentScope: "required",
          componentIndex: index,
          componentType: component.type,
          details: component.details ?? null,
          costGp: component.cost_gp ?? null,
          raw: component.raw ?? null,
        },
      });
    }
    for (const [index, conditional] of record.casting.conditional_components.entries()) {
      const component = conditional.component;
      await tx.spellComponent.create({
        data: {
          spellId: record.spell_id,
          componentScope: "conditional",
          componentIndex: index,
          componentType: component.type,
          details: component.details ?? null,
          costGp: component.cost_gp ?? null,
          raw: component.raw ?? null,
          conditionRaw: conditional.condition_raw,
          conditionSearchText: conditional.condition_search_text,
        },
      });
    }
    for (const [index, field] of record.effect.delivery.entries.entries()) {
      await tx.spellDeliveryField.create({
        data: {
          spellId: record.spell_id,
          fieldIndex: index,
          labelRaw: field.label_raw,
          valueRaw: field.value_raw ?? null,
          kinds: field.kinds,
        },
      });
    }
    for (const [index, section] of (record.description.sections ?? []).entries()) {
      await tx.spellDescriptionSection.create({
        data: {
          spellId: record.spell_id,
          sectionIndex: index,
          heading: section.heading,
          body: section.body,
        },
      });
    }
    for (const [index, inheritance] of record.rules_inheritance.entries()) {
      await tx.spellInheritance.create({
        data: {
          spellId: record.spell_id,
          inheritanceIndex: index,
          fromSpellId: inheritance.from_spell_id,
          relationship: inheritance.relationship,
          basis: inheritance.basis,
          inheritedPaths: inheritance.inherited_paths,
          overrides: inheritance.overrides,
          resolutionStatus: inheritance.resolution_status,
          note: inheritance.note ?? null,
        },
      });
    }
    for (const relationship of record.relationships) {
      await insertRelationship(tx, record.spell_id, "canonical_spell", relationship);
    }
    await insertProvenanceAndWarnings(tx, record.spell_id, record);
  }
  return records.length;
}


async function insertVariants(tx: Prisma.TransactionClient): Promise<number> {
  const records = jsonFiles(path.join(projectRoot, "data", "variants")).map(loadJson);
  for (const record of records) {
    await tx.mythicSpellVariant.create({
      data: {
        id: record.mythic_spell_variant_id,
        baseSpellId: record.base_spell.spell_id,
        ruleset: record.ruleset,
        name: record.name,
        rulesCombination: record.base_spell.rules_combination,
        rulesRaw: record.rules_text.raw,
        searchText: record.rules_text.search_text,
        publisher: record.publication.publisher,
        publicationBook: record.publication.book,
        publicationPage: record.publication.page ?? null,
        firstPartyStatus: record.publication.first_party_status,
        normalizationStatus: record.normalization.status,
        payload: record,
      },
    });
    const baseSpell = await tx.canonicalSpell.findUnique({
      where: { spellId: record.base_spell.spell_id },
      select: { name: true },
    });
    if (!baseSpell) {
      throw new Error(`Missing base spell ${record.base_spell.spell_id}`);
    }
    await insertRelationship(tx, record.mythic_spell_variant_id, "mythic_spell_variant", {
      relationship_id: `${record.mythic_spell_variant_id}:mythic_version_of:${record.base_spell.spell_id}`,
      type: "mythic_version_of",
      target: {
        entity_type: "spell",
        entity_id: record.base_spell.spell_id,
        name: baseSpell.name,
      },
      status: "accepted",
      evidence: record.base_spell.evidence,
      note: "Required base-spell relationship from the mythic variant contract.",
    });
    for (const relationship of record.relationships) {
      await insertRelationship(tx, record.mythic_spell_variant_id, "mythic_spell_variant", relationship);
    }
    for (const [index, augmentation] of record.augmentations.entries()) {
      await tx.mythicAugmentation.create({
        data: {
          id: augmentation.augmentation_id,
          mythicSpellVariantId: record.mythic_spell_variant_id,
          augmentationIndex: index,
          name: augmentation.name,
          minimumTier: augmentation.minimum_tier ?? null,
          totalMythicPowerUses: augmentation.total_mythic_power_uses ?? null,
          raw: augmentation.raw,
        },
      });
      for (const relationship of augmentation.relationships) {
        await insertRelationship(tx, augmentation.augmentation_id, "mythic_augmentation", relationship);
      }
    }
    await insertProvenanceAndWarnings(tx, record.mythic_spell_variant_id, record);
  }
  return records.length;
}


async function insertDecisions(tx: Prisma.TransactionClient): Promise<number> {
  let count = 0;
  for (const filename of jsonFiles(path.join(projectRoot, "data", "decisions"))) {
    const record = loadJson(filename);
    await tx.canonicalDecision.create({
      data: {
        id: record.decision_id,
        entityId: record.entity_id,
        canonicalRecordPath: record.canonical_record_path,
        policyId: record.policy_id,
        baselineObservationId: record.baseline_observation_id,
        status: record.status,
        unresolvedQuestions: record.unresolved_questions,
        payload: record,
      },
    });
    for (const [index, item] of record.field_decisions.entries()) {
      await tx.decisionFieldItem.create({
        data: {
          decisionId: record.decision_id,
          itemIndex: index,
          canonicalPath: item.canonical_path,
          decision: item.decision,
          rationale: item.rationale,
          selectedEvidence: item.selected_evidence,
          consideredObservationIds: item.considered_observation_ids,
        },
      });
    }
    for (const [index, item] of record.relationship_decisions.entries()) {
      await tx.decisionRelationshipItem.create({
        data: {
          decisionId: record.decision_id,
          itemIndex: index,
          relationshipId: item.relationship_id,
          decision: item.decision,
          rationale: item.rationale,
          evidence: item.evidence,
          consideredObservationIds: item.considered_observation_ids,
        },
      });
    }
    count += 1;
  }
  return count;
}


async function insertIngestionQueue(tx: Prisma.TransactionClient): Promise<number> {
  const canonicalLevelZeroIds = new Set(
    canonicalRecords()
      .filter((record) => record.levels.some((level: ValidatedJson) => level.level === 0))
      .map((record) => record.spell_id),
  );
  let count = 0;
  for (const filename of jsonFiles(path.join(projectRoot, "data", "ingestion"))) {
    const manifest = loadJson(filename);
    for (const spell of manifest.spells) {
      const issue = spell.issue as ValidatedJson | undefined;
      const status = canonicalLevelZeroIds.has(spell.spell_id)
        ? "ingested"
        : issue
          ? `${issue.kind}_issue`
          : "pending";
      await tx.ingestionQueueItem.create({
        data: {
          entityId: spell.spell_id,
          entityName: spell.name,
          siteId: manifest.source.site_id,
          sourceUrl: spell.source_url,
          catalogId: manifest.manifest_id,
          catalogLevel: manifest.level,
          batchNumber: spell.batch,
          catalogMemberships: spell.catalog_memberships,
          status,
          priority: spell.priority,
          attempts: 0,
          issueKind: issue?.kind ?? null,
          lastError: issue ? `${issue.code}: ${issue.message}` : null,
          updatedAt: new Date(manifest.generated_at),
        },
      });
      count += 1;
    }
  }
  return count;
}


export async function importPackage(prisma: PrismaClient): Promise<ImportStatistics> {
  const packageStats = validatePackage();
  return prisma.$transaction(
    async (tx) => {
      await clearImportedData(tx);
      const run = await tx.importRun.create({
        data: {
          startedAt: new Date(),
          status: "running",
          packageRoot: projectRoot,
          importerVersion,
        },
      });
      const linkedEntities = await insertEntities(tx);
      const observations = await insertObservations(tx);
      const entityEvidence = await insertEntityEvidence(tx);
      const coverageChecks = await insertCoverage(tx);
      const canonicalSpells = await insertCanonicalSpells(tx);
      const mythicSpellVariants = await insertVariants(tx);
      const decisions = await insertDecisions(tx);
      const ingestionQueueItems = await insertIngestionQueue(tx);
      const result: ImportStatistics = {
        ...packageStats,
        linkedEntities,
        observations,
        entityEvidence,
        coverageChecks,
        canonicalSpells,
        mythicSpellVariants,
        decisions,
        ingestionQueueItems,
        searchableRecords: canonicalSpells + mythicSpellVariants,
      };
      await tx.importRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          status: "completed",
          statistics: result as unknown as Prisma.InputJsonValue,
        },
      });
      return result;
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}


export async function checkDatabase(prisma: PrismaClient): Promise<void> {
  const foreignKeyErrors = await prisma.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check");
  if (foreignKeyErrors.length > 0) {
    throw new Error(`Foreign-key check failed: ${JSON.stringify(foreignKeyErrors.slice(0, 10))}`);
  }
  const integrity = await prisma.$queryRawUnsafe<Array<{ integrity_check: string }>>(
    "PRAGMA integrity_check",
  );
  if (integrity[0]?.integrity_check !== "ok") {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
  }
  const [spells, spellEntities] = await Promise.all([
    prisma.canonicalSpell.count(),
    prisma.entity.count({ where: { type: "spell" } }),
  ]);
  if (spells > spellEntities) {
    throw new Error(`There are ${spells} canonical spells but only ${spellEntities} spell entities`);
  }
}


export async function databaseStatistics(prisma: PrismaClient): Promise<Record<string, number>> {
  const [
    entities,
    observations,
    spells,
    variants,
    relationships,
    decisions,
    warnings,
    ingestionQueueItems,
    ingestionIssues,
  ] =
    await Promise.all([
      prisma.entity.count(),
      prisma.sourceObservation.count(),
      prisma.canonicalSpell.count(),
      prisma.mythicSpellVariant.count(),
      prisma.ruleRelationship.count(),
      prisma.canonicalDecision.count(),
      prisma.normalizationWarning.count(),
      prisma.ingestionQueueItem.count(),
      prisma.ingestionQueueItem.count({ where: { issueKind: { not: null } } }),
    ]);
  return {
    entities,
    observations,
    spells,
    variants,
    relationships,
    decisions,
    warnings,
    ingestionQueueItems,
    ingestionIssues,
  };
}
