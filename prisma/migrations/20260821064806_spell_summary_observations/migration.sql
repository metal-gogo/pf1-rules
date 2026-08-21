-- CreateTable
CREATE TABLE "spell_summary_observations" (
    "summary_observation_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "catalog_id" TEXT NOT NULL,
    "spell_id" TEXT NOT NULL,
    "spell_name" TEXT NOT NULL,
    "spell_list_id" TEXT NOT NULL,
    "spell_list_name" TEXT NOT NULL,
    "spell_level" INTEGER NOT NULL,
    "site_id" TEXT NOT NULL,
    "summary_raw" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "retrieved_at" DATETIME NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "raw_artifact_path" TEXT NOT NULL,
    "parser_name" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_canonical_spells" (
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
    "short_description" TEXT,
    "short_description_source_id" INTEGER,
    "search_text" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "publication_book" TEXT NOT NULL,
    "publication_page" INTEGER,
    "first_party_status" TEXT NOT NULL,
    "pfs_status" TEXT NOT NULL,
    "normalization_status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    CONSTRAINT "canonical_spells_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "canonical_spells_short_description_source_id_fkey" FOREIGN KEY ("short_description_source_id") REFERENCES "spell_summary_observations" ("summary_observation_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_canonical_spells" ("area", "casting_time_amount", "casting_time_kind", "casting_time_raw", "casting_time_unit", "classification_raw", "components_raw", "delivery_resolution", "description_raw", "duration_formula", "duration_kind", "duration_raw", "first_party_status", "name", "normalization_status", "payload", "pfs_status", "publication_book", "publication_page", "publisher", "range_category", "range_formula", "range_raw", "ruleset", "saving_throw", "school", "search_text", "spell_id", "spell_resistance", "subschool", "targeting") SELECT "area", "casting_time_amount", "casting_time_kind", "casting_time_raw", "casting_time_unit", "classification_raw", "components_raw", "delivery_resolution", "description_raw", "duration_formula", "duration_kind", "duration_raw", "first_party_status", "name", "normalization_status", "payload", "pfs_status", "publication_book", "publication_page", "publisher", "range_category", "range_formula", "range_raw", "ruleset", "saving_throw", "school", "search_text", "spell_id", "spell_resistance", "subschool", "targeting" FROM "canonical_spells";
DROP TABLE "canonical_spells";
ALTER TABLE "new_canonical_spells" RENAME TO "canonical_spells";
CREATE UNIQUE INDEX "canonical_spells_short_description_source_id_key" ON "canonical_spells"("short_description_source_id");
CREATE INDEX "canonical_spells_school_name_idx" ON "canonical_spells"("school", "name");
CREATE INDEX "canonical_spells_publication_book_publication_page_idx" ON "canonical_spells"("publication_book", "publication_page");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "spell_summary_observations_spell_id_site_id_idx" ON "spell_summary_observations"("spell_id", "site_id");

-- CreateIndex
CREATE INDEX "spell_summary_observations_spell_list_id_spell_level_idx" ON "spell_summary_observations"("spell_list_id", "spell_level");

-- CreateIndex
CREATE UNIQUE INDEX "spell_summary_observations_catalog_id_spell_id_spell_list_id_key" ON "spell_summary_observations"("catalog_id", "spell_id", "spell_list_id");
