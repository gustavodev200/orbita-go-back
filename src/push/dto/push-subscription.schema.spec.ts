import { subscribeSchema, unsubscribeSchema } from './push-subscription.schema';

const keys = { p256dh: 'BKey', auth: 'auth' };

describe('push subscription endpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/abc',
  ])('aceita serviço de push conhecido: %s', (endpoint) => {
    expect(subscribeSchema.safeParse({ endpoint, keys }).success).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost:3333/internal',
    'https://evil.com/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evilnotify.windows.com/x',
    'https://user@evil.com',
  ])('recusa endpoint fora da allowlist (SSRF): %s', (endpoint) => {
    expect(subscribeSchema.safeParse({ endpoint, keys }).success).toBe(false);
    expect(unsubscribeSchema.safeParse({ endpoint }).success).toBe(false);
  });
});
