ALTER TABLE "spell_levels"
ADD COLUMN "access_basis" TEXT NOT NULL DEFAULT 'printed';

ALTER TABLE "spell_levels"
ADD COLUMN "derivation" JSONB;
