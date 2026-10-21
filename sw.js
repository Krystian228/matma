// Service worker: zapisuje pliki w pamięci podręcznej, żeby gra działała offline.
const CACHE = 'odejmowanko-v6';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './gifs/chomik.gif',
  './gifs/kapibara-relaks.gif',
  './gifs/kapibara.gif',
  './gifs/kot.gif',
  './gifs/kotek.gif',
  './gifs/kotka.gif',
  './gifs/kozka.gif',
  './gifs/krolik.gif',
  './gifs/leniwiec.gif',
  './gifs/panda.gif',
  './gifs/pandka.gif',
  './gifs/piesek.gif',
  './gifs/pingwiny.gif',
  './gifs/wydra.gif',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Najpierw sieć (świeże pliki), a gdy brak internetu – pamięć podręczna.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
