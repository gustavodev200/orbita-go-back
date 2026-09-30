-- CreateEnum
CREATE TYPE "GoalFrequency" AS ENUM ('weekly', 'biweekly', 'monthly');

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "frequency" "GoalFrequency",
ADD COLUMN     "trail_start_date" TEXT;
