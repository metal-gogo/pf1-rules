/*
  Warnings:

  - Added the required column `batch_number` to the `ingestion_queue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `catalog_id` to the `ingestion_queue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `catalog_level` to the `ingestion_queue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `catalog_memberships` to the `ingestion_queue` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ingestion_queue" (
    "queue_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entity_id" TEXT,
    "entity_name" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "source_url" TEXT,
    "catalog_id" TEXT NOT NULL,
    "catalog_level" INTEGER NOT NULL,
    "batch_number" INTEGER NOT NULL,
    "catalog_memberships" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "issue_kind" TEXT,
    "last_error" TEXT,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_ingestion_queue" ("attempts", "entity_id", "entity_name", "last_error", "priority", "queue_id", "site_id", "source_url", "status", "updated_at") SELECT "attempts", "entity_id", "entity_name", "last_error", "priority", "queue_id", "site_id", "source_url", "status", "updated_at" FROM "ingestion_queue";
DROP TABLE "ingestion_queue";
ALTER TABLE "new_ingestion_queue" RENAME TO "ingestion_queue";
CREATE INDEX "ingestion_queue_catalog_id_catalog_level_batch_number_priority_idx" ON "ingestion_queue"("catalog_id", "catalog_level", "batch_number", "priority");
CREATE INDEX "ingestion_queue_status_priority_entity_name_idx" ON "ingestion_queue"("status", "priority", "entity_name");
CREATE UNIQUE INDEX "ingestion_queue_entity_name_site_id_key" ON "ingestion_queue"("entity_name", "site_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
