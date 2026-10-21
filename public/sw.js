// يخلّي نسخة الويب تشتغل من غير نت، ويجيب التحديث أول ما يكون متاح
const CACHE = 'masareef-v1'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  const isPage = req.mode === 'navigate' || req.destination === 'document'
  if (isPage) {
    // الصفحة: من النت الأول علشان التحديثات، ولو مفيش نت من الكاش
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return r }).catch(() => caches.match(req).then((r) => r || caches.match('./'))))
  } else {
    // الملفات (بأسماء فيها hash): من الكاش الأول
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return r })))
  }
})
