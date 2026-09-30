-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "task_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "reminders_task_id_key" ON "reminders"("task_id");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
