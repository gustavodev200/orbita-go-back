-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('urgent', 'important', 'info');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notification_digest_time" TEXT NOT NULL DEFAULT '08:00';

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "entity_id" UUID,
    "wants_push" BOOLEAN NOT NULL DEFAULT false,
    "pushed_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "dismissed_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_key_key" ON "notifications"("user_id", "key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS sem policies (defesa em profundidade: bloqueia PostgREST com anon/authenticated).
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
