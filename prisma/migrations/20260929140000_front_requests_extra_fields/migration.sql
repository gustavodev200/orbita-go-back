-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notifications_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#9A8C7E';

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "deadline" TEXT;

-- AlterTable
ALTER TABLE "boss_states" ADD COLUMN     "recurring_id" UUID;

-- AddForeignKey
ALTER TABLE "boss_states" ADD CONSTRAINT "boss_states_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "recurrings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

