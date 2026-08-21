-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_spell_inheritance" (
    "spell_id" TEXT NOT NULL,
    "inheritance_index" INTEGER NOT NULL,
    "from_spell_id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "basis" JSONB NOT NULL,
    "inherited_paths" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "resolution_status" TEXT NOT NULL,
    "note" TEXT,

    PRIMARY KEY ("spell_id", "inheritance_index"),
    CONSTRAINT "spell_inheritance_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "canonical_spells" ("spell_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "spell_inheritance_from_spell_id_fkey" FOREIGN KEY ("from_spell_id") REFERENCES "entities" ("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_spell_inheritance" ("basis", "from_spell_id", "inheritance_index", "inherited_paths", "note", "overrides", "relationship", "resolution_status", "spell_id") SELECT "basis", "from_spell_id", "inheritance_index", "inherited_paths", "note", "overrides", "relationship", "resolution_status", "spell_id" FROM "spell_inheritance";
DROP TABLE "spell_inheritance";
ALTER TABLE "new_spell_inheritance" RENAME TO "spell_inheritance";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
