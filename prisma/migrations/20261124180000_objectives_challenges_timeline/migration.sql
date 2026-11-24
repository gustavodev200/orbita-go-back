-- CreateEnum
CREATE TYPE "ObjectiveHorizon" AS ENUM ('short', 'medium', 'long');

-- CreateEnum
CREATE TYPE "LifeEventKind" AS ENUM ('achievement', 'project', 'milestone');

-- AlterTable
ALTER TABLE "habits" ADD COLUMN     "objective_id" UUID;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "objective_id" UUID;

-- CreateTable
CREATE TABLE "objectives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT,
    "expected_result" TEXT,
    "horizon" "ObjectiveHorizon" NOT NULL,
    "deadline" DATE,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objective_milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "objective_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ(6),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objective_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT,
    "duration_days" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "abandoned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "challenge_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "life_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "kind" "LifeEventKind" NOT NULL,
    "icon" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "objectives_user_id_idx" ON "objectives"("user_id");

-- CreateIndex
CREATE INDEX "objective_milestones_objective_id_idx" ON "objective_milestones"("objective_id");

-- CreateIndex
CREATE INDEX "challenges_user_id_idx" ON "challenges"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_checks_challenge_id_day_key" ON "challenge_checks"("challenge_id", "day");

-- CreateIndex
CREATE INDEX "life_events_user_id_date_idx" ON "life_events"("user_id", "date");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective_milestones" ADD CONSTRAINT "objective_milestones_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_checks" ADD CONSTRAINT "challenge_checks_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "life_events" ADD CONSTRAINT "life_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Defesa em profundidade: RLS ligada SEM policies, igual às demais tabelas.
ALTER TABLE "objectives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "objective_milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "challenge_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "life_events" ENABLE ROW LEVEL SECURITY;
