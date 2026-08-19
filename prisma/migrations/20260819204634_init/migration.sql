-- CreateTable
CREATE TABLE "entities" (
    "entity_id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "notes" JSONB NOT NULL,
    "registry_id" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "canonical_spells" (
    "spell_id" TEXT NOT NULL PRIMARY KEY,
    "ruleset" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "subschool" TEXT,
    "classification_raw" TEXT,
    "casting_time_kind" TEXT NOT NULL,
    "casting_time_amount" REAL,
    "casting_time_unit" TEXT NOT NULL,
    "casting_time_raw" TEXT,
    "components_raw" TEXT,
    "range_category" TEXT NOT NULL,
    "range_formula" TEXT,
    "range_raw" TEXT,
    "delivery_resolution" TEXT NOT NULL,
    "targeting" JSONB,
    "area" JSONB,
    "duration_kind" TEXT NOT NULL,
    "duration_formula" TEXT,
    "duration_raw" TEXT,
    "saving_throw" JSONB NOT NULL,
    "spell_resistance" JSONB NOT NULL,
    "description_raw" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "publication_book" TEXT NOT NULL,
    "publication_page" INTEGER,
    "first_party_status" TEXT NOT NULL,
    "pfs_status" TEXT NOT NULL,
    "normalization_status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    CONSTRAINT "canonical_spells_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spell_aliases" (
    "spell_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    PRIMARY KEY ("spell_id", "alias"),
    CONSTRAINT "spell_aliases_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spell_descriptors" (
    "spell_id" TEXT NOT NULL,
    "descriptor" TEXT NOT NULL,

    PRIMARY KEY ("spell_id", "descriptor"),
    CONSTRAINT "spell_descriptors_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spell_levels" (
    "spell_id" TEXT NOT NULL,
    "spell_list_id" TEXT NOT NULL,
    "list_kind" TEXT NOT NULL,
    "list_name" TEXT NOT NULL,
    "spell_level" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "raw" TEXT,

    PRIMARY KEY ("spell_id", "spell_list_id"),
    CONSTRAINT "spell_levels_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "spell_levels_spell_list_id_fkey" FOREIGN KEY ("spell_list_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spell_components" (
    "spell_id" TEXT NOT NULL,
    "component_scope" TEXT NOT NULL,
    "component_index" INTEGER NOT NULL,
    "component_type" TEXT NOT NULL,
    "details" TEXT,
    "cost_gp" REAL,
    "raw" TEXT,
    "condition_raw" TEXT,
    "condition_search_text" TEXT,

    PRIMARY KEY ("spell_id", "component_scope", "component_index"),
    CONSTRAINT "spell_components_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spell_delivery_fields" (
    "spell_id" TEXT NOT NULL,
    "field_index" INTEGER NOT NULL,
    "label_raw" TEXT NOT NULL,
    "value_raw" TEXT,
    "kinds" JSONB NOT NULL,

    PRIMARY KEY ("spell_id", "field_index"),
    CONSTRAINT "spell_delivery_fields_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spell_description_sections" (
    "spell_id" TEXT NOT NULL,
    "section_index" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    PRIMARY KEY ("spell_id", "section_index"),
    CONSTRAINT "spell_description_sections_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spell_inheritance" (
    "spell_id" TEXT NOT NULL,
    "inheritance_index" INTEGER NOT NULL,
    "from_spell_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "inherited_paths" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "resolution_status" TEXT NOT NULL,
    "note" TEXT,

    PRIMARY KEY ("spell_id", "inheritance_index"),
    CONSTRAINT "spell_inheritance_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "spell_inheritance_from_spell_id_fkey" FOREIGN KEY ("from_spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mythic_spell_variants" (
    "mythic_spell_variant_id" TEXT NOT NULL PRIMARY KEY,
    "base_spell_id" TEXT NOT NULL,
    "ruleset" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rules_combination" TEXT NOT NULL,
    "rules_raw" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "publication_book" TEXT NOT NULL,
    "publication_page" INTEGER,
    "first_party_status" TEXT NOT NULL,
    "normalization_status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    CONSTRAINT "mythic_spell_variants_mythic_spell_variant_id_fkey" FOREIGN KEY ("mythic_spell_variant_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mythic_spell_variants_base_spell_id_fkey" FOREIGN KEY ("base_spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mythic_augmentations" (
    "augmentation_id" TEXT NOT NULL PRIMARY KEY,
    "mythic_spell_variant_id" TEXT NOT NULL,
    "augmentation_index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minimum_tier" INTEGER,
    "total_mythic_power_uses" INTEGER,
    "raw" TEXT NOT NULL,
    CONSTRAINT "mythic_augmentations_mythic_spell_variant_id_fkey" FOREIGN KEY ("mythic_spell_variant_id") REFERENCES "mythic_spell_variants" ("mythic_spell_variant_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "relationships" (
    "relationship_id" TEXT NOT NULL PRIMARY KEY,
    "owner_entity_id" TEXT NOT NULL,
    "owner_kind" TEXT NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "target_entity_type" TEXT NOT NULL,
    "target_entity_id" TEXT,
    "target_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "relationships_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities" ("entity_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "relationship_evidence" (
    "relationship_id" TEXT NOT NULL,
    "evidence_index" INTEGER NOT NULL,
    "observation_id" TEXT NOT NULL,
    "source_field" TEXT NOT NULL,
    "evidence_kind" TEXT NOT NULL,
    "anchor_text_raw" TEXT,
    "source_href" TEXT,

    PRIMARY KEY ("relationship_id", "evidence_index"),
    CONSTRAINT "relationship_evidence_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships" ("relationship_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "relationship_evidence_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_observations" (
    "observation_id" TEXT NOT NULL PRIMARY KEY,
    "entity_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "first_party_status" TEXT,
    "retrieved_at" DATETIME NOT NULL,
    "http_status" INTEGER NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "raw_artifact_path" TEXT NOT NULL,
    "parser_name" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL,
    "page_title_raw" TEXT,
    "name_raw" TEXT NOT NULL,
    "school_raw" TEXT,
    "levels_raw" TEXT,
    "domains_raw" TEXT,
    "casting_time_raw" TEXT,
    "components_raw" TEXT,
    "range_raw" TEXT,
    "duration_raw" TEXT,
    "saving_throw_raw" TEXT,
    "spell_resistance_raw" TEXT,
    "description_raw" TEXT NOT NULL,
    "mythic_text_raw" TEXT,
    "source_book_raw" TEXT,
    "source_page_raw" TEXT,
    "pfs_status_raw" TEXT,
    "payload" JSONB NOT NULL,
    CONSTRAINT "source_observations_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_links" (
    "observation_id" TEXT NOT NULL,
    "occurrence_index" INTEGER NOT NULL,
    "anchor_text_raw" TEXT NOT NULL,
    "href_raw" TEXT,
    "href_resolved" TEXT,
    "source_field" TEXT NOT NULL,
    "context_raw" TEXT,
    "role_hint" TEXT,
    "target_entity_type_hint" TEXT,
    "target_entity_id_hint" TEXT,

    PRIMARY KEY ("observation_id", "occurrence_index"),
    CONSTRAINT "source_links_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "source_links_target_entity_id_hint_fkey" FOREIGN KEY ("target_entity_id_hint") REFERENCES "entities" ("entity_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_references" (
    "observation_id" TEXT NOT NULL,
    "occurrence_index" INTEGER NOT NULL,
    "anchor_text_raw" TEXT NOT NULL,
    "href_raw" TEXT,
    "evidence_kind" TEXT NOT NULL,
    "source_field" TEXT NOT NULL,
    "context_raw" TEXT,
    "target_entity_type" TEXT,
    "target_name_hint" TEXT,
    "relationship_hint" TEXT,

    PRIMARY KEY ("observation_id", "occurrence_index"),
    CONSTRAINT "source_references_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_sections" (
    "observation_id" TEXT NOT NULL,
    "section_index" INTEGER NOT NULL,
    "heading_raw" TEXT NOT NULL,
    "body_raw" TEXT NOT NULL,

    PRIMARY KEY ("observation_id", "section_index"),
    CONSTRAINT "source_sections_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_delivery_fields" (
    "observation_id" TEXT NOT NULL,
    "field_index" INTEGER NOT NULL,
    "label_raw" TEXT NOT NULL,
    "value_raw" TEXT,
    "kinds" JSONB NOT NULL,

    PRIMARY KEY ("observation_id", "field_index"),
    CONSTRAINT "source_delivery_fields_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "entity_evidence" (
    "entity_id" TEXT NOT NULL,
    "evidence_index" INTEGER NOT NULL,
    "observation_id" TEXT NOT NULL,
    "source_field" TEXT NOT NULL,
    "anchor_text_raw" TEXT,
    "source_href" TEXT,

    PRIMARY KEY ("entity_id", "evidence_index"),
    CONSTRAINT "entity_evidence_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("entity_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entity_evidence_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "coverage_checks" (
    "coverage_check_id" TEXT NOT NULL PRIMARY KEY,
    "entity_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "retrieved_at" DATETIME NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "raw_artifact_path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "case_sensitive" BOOLEAN NOT NULL,
    "scope_raw" TEXT NOT NULL,
    "result_status" TEXT NOT NULL,
    "match_count" INTEGER NOT NULL,
    "note" TEXT,
    "payload" JSONB NOT NULL,
    CONSTRAINT "coverage_checks_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "record_provenance" (
    "owner_entity_id" TEXT NOT NULL,
    "provenance_index" INTEGER NOT NULL,
    "field_path" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "source_field" TEXT NOT NULL,
    "raw_value_sha256" TEXT,
    "decision" TEXT NOT NULL,
    "note" TEXT,

    PRIMARY KEY ("owner_entity_id", "provenance_index"),
    CONSTRAINT "record_provenance_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "normalization_warnings" (
    "owner_entity_id" TEXT NOT NULL,
    "warning_index" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "field_path" TEXT,
    "message" TEXT NOT NULL,

    PRIMARY KEY ("owner_entity_id", "warning_index")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "import_run_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "started_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "status" TEXT NOT NULL,
    "package_root" TEXT NOT NULL,
    "importer_version" TEXT NOT NULL,
    "statistics" JSONB,
    "error_message" TEXT
);

-- CreateTable
CREATE TABLE "canonical_decisions" (
    "decision_id" TEXT NOT NULL PRIMARY KEY,
    "entity_id" TEXT NOT NULL,
    "canonical_record_path" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "baseline_observation_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "unresolved_questions" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    CONSTRAINT "canonical_decisions_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "canonical_decisions_baseline_observation_id_fkey" FOREIGN KEY ("baseline_observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "decision_field_items" (
    "decision_id" TEXT NOT NULL,
    "item_index" INTEGER NOT NULL,
    "canonical_path" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "selected_evidence" JSONB NOT NULL,
    "considered_observation_ids" JSONB NOT NULL,

    PRIMARY KEY ("decision_id", "item_index"),
    CONSTRAINT "decision_field_items_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "canonical_decisions" ("decision_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "decision_relationship_items" (
    "decision_id" TEXT NOT NULL,
    "item_index" INTEGER NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "considered_observation_ids" JSONB NOT NULL,

    PRIMARY KEY ("decision_id", "item_index"),
    CONSTRAINT "decision_relationship_items_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "canonical_decisions" ("decision_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ingestion_queue" (
    "queue_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entity_id" TEXT,
    "entity_name" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "source_url" TEXT,
    "status" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "entities_entity_type_name_idx" ON "entities"("entity_type", "name");

-- CreateIndex
CREATE INDEX "canonical_spells_school_name_idx" ON "canonical_spells"("school", "name");

-- CreateIndex
CREATE INDEX "canonical_spells_publication_book_publication_page_idx" ON "canonical_spells"("publication_book", "publication_page");

-- CreateIndex
CREATE INDEX "spell_descriptors_descriptor_spell_id_idx" ON "spell_descriptors"("descriptor", "spell_id");

-- CreateIndex
CREATE INDEX "spell_levels_spell_list_id_spell_level_spell_id_idx" ON "spell_levels"("spell_list_id", "spell_level", "spell_id");

-- CreateIndex
CREATE INDEX "spell_levels_list_kind_spell_level_spell_id_idx" ON "spell_levels"("list_kind", "spell_level", "spell_id");

-- CreateIndex
CREATE INDEX "spell_components_component_type_cost_gp_component_scope_idx" ON "spell_components"("component_type", "cost_gp", "component_scope");

-- CreateIndex
CREATE UNIQUE INDEX "mythic_spell_variants_base_spell_id_key" ON "mythic_spell_variants"("base_spell_id");

-- CreateIndex
CREATE UNIQUE INDEX "mythic_augmentations_mythic_spell_variant_id_augmentation_index_key" ON "mythic_augmentations"("mythic_spell_variant_id", "augmentation_index");

-- CreateIndex
CREATE INDEX "relationships_owner_entity_id_relationship_type_idx" ON "relationships"("owner_entity_id", "relationship_type");

-- CreateIndex
CREATE INDEX "relationships_target_entity_id_relationship_type_idx" ON "relationships"("target_entity_id", "relationship_type");

-- CreateIndex
CREATE INDEX "source_observations_entity_id_site_id_idx" ON "source_observations"("entity_id", "site_id");

-- CreateIndex
CREATE INDEX "source_observations_content_sha256_idx" ON "source_observations"("content_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "source_observations_site_id_entity_id_content_sha256_key" ON "source_observations"("site_id", "entity_id", "content_sha256");

-- CreateIndex
CREATE INDEX "source_links_target_entity_id_hint_idx" ON "source_links"("target_entity_id_hint");

-- CreateIndex
CREATE INDEX "source_links_href_resolved_idx" ON "source_links"("href_resolved");

-- CreateIndex
CREATE INDEX "coverage_checks_entity_id_site_id_idx" ON "coverage_checks"("entity_id", "site_id");

-- CreateIndex
CREATE INDEX "record_provenance_observation_id_idx" ON "record_provenance"("observation_id");

-- CreateIndex
CREATE INDEX "normalization_warnings_code_owner_entity_id_idx" ON "normalization_warnings"("code", "owner_entity_id");

-- CreateIndex
CREATE INDEX "ingestion_queue_status_priority_entity_name_idx" ON "ingestion_queue"("status", "priority", "entity_name");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_queue_entity_name_site_id_key" ON "ingestion_queue"("entity_name", "site_id");
