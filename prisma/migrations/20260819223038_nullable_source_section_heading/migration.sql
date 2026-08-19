-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_source_sections" (
    "observation_id" TEXT NOT NULL,
    "section_index" INTEGER NOT NULL,
    "heading_raw" TEXT,
    "body_raw" TEXT NOT NULL,

    PRIMARY KEY ("observation_id", "section_index"),
    CONSTRAINT "source_sections_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "source_observations" ("observation_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_source_sections" ("body_raw", "heading_raw", "observation_id", "section_index") SELECT "body_raw", "heading_raw", "observation_id", "section_index" FROM "source_sections";
DROP TABLE "source_sections";
ALTER TABLE "new_source_sections" RENAME TO "source_sections";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
