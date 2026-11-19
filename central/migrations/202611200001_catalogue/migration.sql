-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('Draft', 'Published', 'Archived', 'Superseded');

-- CreateTable
CREATE TABLE "Revision" (
    "id" SERIAL NOT NULL,
    "series" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'Draft',
    "snapshot" JSONB NOT NULL,
    "edit" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationEvent" (
    "id" SERIAL NOT NULL,
    "revisionId" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Revision_series_version_key" ON "Revision"("series", "version");

-- AddForeignKey
ALTER TABLE "PublicationEvent" ADD CONSTRAINT "PublicationEvent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "one_published_per_series" ON "Revision" ("series") WHERE "status" = 'Published';
CREATE FUNCTION guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Archive historical revisions'; END IF;
  IF OLD."series" <> NEW."series" OR OLD."version" <> NEW."version" OR
    (OLD."publishedAt" IS NOT NULL AND
     (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" OR NEW.status = 'Draft'))
  THEN RAISE EXCEPTION 'Immutable revision'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER revision_history BEFORE UPDATE OR DELETE ON "Revision" FOR EACH ROW EXECUTE FUNCTION guard_revision();
