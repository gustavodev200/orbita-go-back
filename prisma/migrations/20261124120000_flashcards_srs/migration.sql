-- AlterTable: repetição espaçada dos flashcards
ALTER TABLE "flashcards"
  ADD COLUMN "srs_state" TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN "srs_step" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  ADD COLUMN "interval_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lapses" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "due_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "flashcards_user_id_due_at_idx" ON "flashcards"("user_id", "due_at");
