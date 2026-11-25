// Diet & Training — service worker: app offline, aggiornamenti automatici, notifiche di Guilly
const CACHE = 'diet-training-v2';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
const TIPS = [
  'Le proteine sono il nutriente che sazia di più: mettine in ogni pasto.',
  'Bevi un bicchiere d\'acqua adesso. Sì, proprio adesso. 💧',
  'Non serve essere perfetti, serve essere costanti. Anche oggi conta.',
  'Peso salito? È acqua. Guarda la media della settimana, non il numero di oggi.',
  'Porta lo spuntino da casa: al distributore ti aspettano 300 kcal di snack.',
  'Un cucchiaio d\'olio sono 90 kcal: misurarlo è il trucco più semplice.',
  'Una pizza non rovina niente. Rovina mollare dopo la pizza. 🍕',
  'Tra 12 settimane ringrazierai il Mat di oggi. 💪',
  'La camminata veloce brucia grassi senza stressare le ginocchia.',
  'Dormire poco fa venire fame di dolci: il riposo è parte del piano.'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('turni.xlsx')) return; // turni sempre dalla rete (l'app tiene già una copia)
  if (url.origin === self.location.origin) {
    // rete prima: aggiornamenti subito visibili; offline usa la copia salvata
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
  } else {
    // librerie e font: cache prima
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; })));
  }
});

// ---- Notifiche di Guilly ----
function show(title, body, tag, url) {
  return self.registration.showNotification(title || 'Guilly 💪', {
    body: body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: tag || 'guilly',
    renotify: true, vibrate: [120, 60, 120], data: { url: url || './' }
  });
}
// push inviati dall'azione GitHub "Guilly notifiche"
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(show(d.title, d.body, d.tag, d.url));
});
// consiglio del giorno senza server (Android, app installata)
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'guilly-daily') return;
  const n = Math.floor(Date.now() / 86400000);
  e.waitUntil(show('Guilly 💡', TIPS[n % TIPS.length], 'guilly-tip'));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
