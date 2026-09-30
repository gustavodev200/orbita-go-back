-- notificationsEnabled agora começa desligado: o switch só deve mostrar "on"
-- depois que o navegador de fato concedeu permissão e criou uma
-- PushSubscription (senão o usuário acha que já está recebendo push sem
-- nunca ter passado pelo prompt de permissão do navegador).
ALTER TABLE "users" ALTER COLUMN "notifications_enabled" SET DEFAULT false;

-- Usuários existentes sem nenhuma subscription real: reflete o estado real.
UPDATE "users" u
SET "notifications_enabled" = false
WHERE NOT EXISTS (
  SELECT 1 FROM "push_subscriptions" ps WHERE ps.user_id = u.id
);
