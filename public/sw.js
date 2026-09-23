/* Pixelgram service worker.
 *
 * Handles Web Push and incoming notifications with interactive actions (calls, messages).
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Pixelgram', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Pixelgram';
  const isCall =
    data.isCall ||
    data.tag?.includes('call') ||
    title.includes('Call') ||
    title.includes('📞') ||
    data.data?.isCall;

  const options = {
    body: data.body || '',
    icon: data.icon || data.data?.icon || '/images/logo/logo-icon.svg',
    badge: '/images/logo/logo-icon.svg',
    tag: data.tag || 'pixelgram_notif',
    data: {
      url: data.url || data.data?.url || '/',
      joinUrl: data.url || data.data?.url || '/',
    },
    vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500] : [200, 100, 200],
  };

  if (data.image || data.data?.image) {
    options.image = data.image || data.data?.image;
  }

  if (isCall) {
    options.actions = [
      { action: 'join_call', title: '📞 Receive' },
      { action: 'decline_call', title: '❌ End' },
    ];
  } else if (data.actions) {
    options.actions = data.actions;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // If user tapped 'End' or 'Decline', dismiss without opening app
  if (event.action === 'decline_call' || event.action === 'end_call') {
    return;
  }

  const data = event.notification.data || {};
  let url = data.url || '/';

  if (event.action === 'join_call' || event.action === 'receive_call') {
    url = data.joinUrl || data.url || '/';
  }

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
