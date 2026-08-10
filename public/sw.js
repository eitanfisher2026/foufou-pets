// Network-first: always try the network first, cache only used as an
// offline fallback - so a signed-in user always sees the latest deployed
// version when they have a connection, matching the same strategy used in
// FouFou/Buli. Bump CACHE_NAME on every deploy that changes this file.
const CACHE_NAME = 'foufou-pets-v2';

// Android's share sheet POSTs shared photos/text here (registered via
// manifest.json's share_target). A static host can't receive a POST, so the
// service worker intercepts it, stashes the shared content in IndexedDB, and
// bounces the browser to a GET page that reads it back out - the standard
// pattern for share targets on a backend-less static site.
const SHARE_DB_NAME = 'foufou-pets-share';
const SHARE_STORE_NAME = 'pending';
const SHARE_KEY = 'latest';

function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SHARE_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeSharedContent(data) {
  const db = await openShareDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
    tx.objectStore(SHARE_STORE_NAME).put(data, SHARE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function handleShareTarget(request) {
  const formData = await request.formData();
  const photos = formData.getAll('photos').filter((f) => f instanceof File && f.size > 0);
  await storeSharedContent({
    photos,
    text: formData.get('text') || '',
    url: formData.get('url') || '',
    title: formData.get('title') || '',
    ts: Date.now(),
  });
  return Response.redirect('/share-target', 303);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add('/').catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'POST' && new URL(event.request.url).pathname === '/share-target') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }
  if (event.request.method !== 'GET') return;

  // Firebase/Google API calls always go straight to the network - never
  // served from cache, and never worth caching.
  const url = event.request.url;
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});
