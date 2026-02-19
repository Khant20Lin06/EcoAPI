-- Add bilingual name columns for categories (keep legacy "name")
ALTER TABLE "Category"
ADD COLUMN IF NOT EXISTS "en_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "mm_name" TEXT NOT NULL DEFAULT '';

UPDATE "Category"
SET
  "en_name" = COALESCE(NULLIF("en_name", ''), "name"),
  "mm_name" = COALESCE(NULLIF("mm_name", ''), "name");

-- Add bilingual name columns for sustainability tags (keep legacy "name")
ALTER TABLE "SustainabilityTag"
ADD COLUMN IF NOT EXISTS "en_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "mm_name" TEXT NOT NULL DEFAULT '';

UPDATE "SustainabilityTag"
SET
  "en_name" = COALESCE(NULLIF("en_name", ''), "name"),
  "mm_name" = COALESCE(NULLIF("mm_name", ''), "name");
