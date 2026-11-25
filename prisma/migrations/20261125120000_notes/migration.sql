-- AlterEnum
ALTER TYPE "ReminderKind" ADD VALUE 'note';

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'default',
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checklist" BOOLEAN NOT NULL DEFAULT false,
    "items" JSONB NOT NULL DEFAULT '[]',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "reminder_at" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "note_id" UUID;

-- CreateIndex
CREATE INDEX "notes_user_id_idx" ON "notes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_note_id_key" ON "reminders"("note_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS sem policies (defesa em profundidade: bloqueia PostgREST com anon/authenticated).
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;
