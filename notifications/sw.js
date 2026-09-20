/* Dedicated push worker: does not intercept or cache authenticated pages. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = typeof data.title === 'string' ? data.title : 'Gather notification';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : 'Open Homepage to view your notification.',
    icon: __GATHER_ICON__,
    tag: typeof data.id === 'string' ? data.id : 'gather-notification',
    data: {messageId: typeof data.id === 'string' ? data.id : ''},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL('/?notifications=open', self.location.origin);
  const id = event.notification.data?.messageId || event.notification.tag;
  if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) && id !== 'gather-notification') url.searchParams.set('notification', id);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        // A running Home Screen app may resume without reloading its page.
        // Let the page open the message directly; navigate only if it cannot acknowledge.
        if (url.searchParams.has('notification') && typeof client.postMessage === 'function') {
          const channel = new MessageChannel();
          const acknowledged = new Promise(resolve => {
            const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 1500);
            channel.port1.onmessage = event => {
              clearTimeout(timer); channel.port1.close(); resolve(event.data?.opened === true);
            };
          });
          await client.focus();
          client.postMessage({type:'GATHER_OPEN_NOTIFICATION', messageId:id}, [channel.port2]);
          if (await acknowledged) return;
        }
        try {
          const opened = await client.navigate(url.href);
          if (opened) return opened.focus();
        } catch { /* A closing client must not prevent opening a fresh window. */ }
      }
    }
    return self.clients.openWindow(url.href);
  })());
});
