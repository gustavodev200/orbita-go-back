import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  DIRECT_URL: z.string().optional(),
  SUPABASE_URL: z.string().url('SUPABASE_URL inválida'),
  // Opcional: segredo legado HS256. Sem ele, só JWKS (chaves assimétricas).
  SUPABASE_JWT_SECRET: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  FRONTEND_URL: z.string().min(1).default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3333),
  // Web Push (VAPID) — mesmo par de chaves publicado pelo front como
  // NEXT_PUBLIC_VAPID_PUBLIC_KEY. Gerar com `npx web-push generate-vapid-keys`.
  VAPID_PUBLIC_KEY: z.string().min(1, 'VAPID_PUBLIC_KEY é obrigatória'),
  VAPID_PRIVATE_KEY: z.string().min(1, 'VAPID_PRIVATE_KEY é obrigatória'),
  VAPID_SUBJECT: z.string().min(1, 'VAPID_SUBJECT é obrigatória'),
  // Segredo compartilhado com o GitHub Actions do cron (header X-Cron-Secret
  // em POST /internal/dispatch-reminders) — nunca um JWT de usuário.
  CRON_SECRET: z.string().min(1, 'CRON_SECRET é obrigatória'),
  // z.coerce.boolean() transformaria a string "false" em true.
  SWAGGER_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((value) => value.toLowerCase() !== 'false'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Env vars inválidas: ${issues}`);
  }
  return result.data;
}
