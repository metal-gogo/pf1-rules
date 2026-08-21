-- Spell-list membership is an ordered canonical entry, not a unique
-- spell/list pair. This permits separate qualified access paths at different
-- levels without encoding the qualification into a synthetic spell-list ID.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_spell_levels" (
    "spell_id" TEXT NOT NULL,
    "level_index" INTEGER NOT NULL,
    "spell_list_id" TEXT NOT NULL,
    "list_kind" TEXT NOT NULL,
    "list_name" TEXT NOT NULL,
    "spell_level" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "raw" TEXT,

    PRIMARY KEY ("spell_id", "level_index"),
    CONSTRAINT "spell_levels_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "spell_levels_spell_list_id_fkey" FOREIGN KEY ("spell_list_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_spell_levels" (
    "spell_id",
    "level_index",
    "spell_list_id",
    "list_kind",
    "list_name",
    "spell_level",
    "scope",
    "raw"
)
SELECT
    "spell_id",
    ROW_NUMBER() OVER (
        PARTITION BY "spell_id"
        ORDER BY "spell_list_id"
    ) - 1,
    "spell_list_id",
    "list_kind",
    "list_name",
    "spell_level",
    "scope",
    "raw"
FROM "spell_levels";

DROP TABLE "spell_levels";
ALTER TABLE "new_spell_levels" RENAME TO "spell_levels";

CREATE INDEX "spell_levels_spell_id_spell_list_id_idx" ON "spell_levels"("spell_id", "spell_list_id");
CREATE INDEX "spell_levels_spell_list_id_spell_level_spell_id_idx" ON "spell_levels"("spell_list_id", "spell_level", "spell_id");
CREATE INDEX "spell_levels_list_kind_spell_level_spell_id_idx" ON "spell_levels"("list_kind", "spell_level", "spell_id");

CREATE TABLE "spell_list_qualifications" (
    "spell_id" TEXT NOT NULL,
    "level_index" INTEGER NOT NULL,
    "qualification_index" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("spell_id", "level_index", "qualification_index"),
    CONSTRAINT "spell_list_qualifications_spell_id_level_index_fkey" FOREIGN KEY ("spell_id", "level_index") REFERENCES "spell_levels" ("spell_id", "level_index") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "spell_list_qualifications_kind_spell_id_idx" ON "spell_list_qualifications"("kind", "spell_id");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
