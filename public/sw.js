self.addEventListener('push', (event) => {
  const payload = event.data?.json?.() || {};
  const title = payload.title || 'Muwoyo';
  const body = payload.body || '';
  const icon = payload.icon || '/favicon.ico';
  const url = payload.url || '/dashboard';

  const notificationOptions = {
    body,
    icon,
    badge: icon,
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }

      clients.openWindow(url);
    }),
  );
});
