import { z } from 'zod';

// O back faz POST no endpoint ao disparar push — aceitar qualquer URL abriria
// SSRF (ex.: rede interna). Só HTTPS dos serviços de push dos navegadores.
const PUSH_HOSTS = new Set([
  'fcm.googleapis.com', // Chrome, Opera, Brave, Android
  'updates.push.services.mozilla.com', // Firefox
]);
const PUSH_HOST_SUFFIXES = [
  '.notify.windows.com', // Edge (WNS)
  '.push.apple.com', // Safari (web.push.apple.com)
];

export function isPushServiceUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    PUSH_HOSTS.has(host) ||
    PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

const endpointSchema = z
  .string()
  .max(2048)
  .refine(isPushServiceUrl, 'endpoint de push não suportado');

export const subscribeSchema = z
  .object({
    endpoint: endpointSchema,
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
  .object({ endpoint: endpointSchema })
  .strict();
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
