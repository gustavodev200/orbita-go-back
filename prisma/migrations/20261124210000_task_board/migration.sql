-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('backlog', 'todo', 'doing', 'done');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'todo';

-- Backfill: concluídas vão para a coluna "done"; ordem inicial = ordem de criação.
UPDATE "tasks" SET "status" = 'done' WHERE "done" = true;
UPDATE "tasks" AS t
SET "position" = s.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "user_id", "status" ORDER BY "created_at") AS rn
  FROM "tasks"
) AS s
WHERE t."id" = s."id";
