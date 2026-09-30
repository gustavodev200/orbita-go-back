import { z } from 'zod';

export const subscribeSchema = z
  .object({
    endpoint: z.string().url().max(2048),
    keys: z
      .object({
        p256dh: z.string().trim().min(1).max(500),
        auth: z.string().trim().min(1).max(500),
      })
      .strict(),
  })
  .strict();
export type SubscribeInput = z.infer<typeof subscribeSchema>;

export const unsubscribeSchema = z
  .object({ endpoint: z.string().url().max(2048) })
  .strict();
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
