import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  filter: z.enum(['all', 'unread', 'important']).default('all'),
});
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
