const CACHE_NAME = 'pullup-coach-v1';
const ASSETS = ['./index.html', './manifest.json', './icon.svg'];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// Notification scheduling via message from main thread
const scheduledTimers = {};

self.addEventListener('message', event => {
  const { type, id, delay, title, body, tag } = event.data;

  if (type === 'SCHEDULE_NOTIFICATION') {
    // Cancel any existing timer with the same id
    if (scheduledTimers[id]) {
      clearTimeout(scheduledTimers[id]);
      delete scheduledTimers[id];
    }
    scheduledTimers[id] = setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: './icon.svg',
        badge: './icon.svg',
        tag: tag || 'pullup-timer',
        renotify: true,
        vibrate: [200, 100, 200, 100, 200],
        actions: [
          { action: 'open', title: '▶ Open App' }
        ]
      });
      delete scheduledTimers[id];
    }, delay * 1000);
  }

  if (type === 'CANCEL_NOTIFICATION') {
    if (scheduledTimers[id]) {
      clearTimeout(scheduledTimers[id]);
      delete scheduledTimers[id];
    }
  }
});

// Tap on notification → open / focus the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
      if (existing) return existing.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
