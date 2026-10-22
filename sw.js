// Service worker: zapisuje pliki w pamięci podręcznej, żeby gra działała offline.
const CACHE = 'odejmowanko-v7';
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
  './gifs/corgi.gif',
  './gifs/fenki.gif',
  './gifs/foczka.gif',
  './gifs/jezyk.gif',
  './gifs/kaczuszka.gif',
  './gifs/kapibara-kapitan.gif',
  './gifs/kapibara-mandarynka.gif',
  './gifs/kapibara-prysznic.gif',
  './gifs/kapibara-relaks.gif',
  './gifs/kapibara.gif',
  './gifs/koala.gif',
  './gifs/kot.gif',
  './gifs/kotek-psotek.gif',
  './gifs/kotek.gif',
  './gifs/kotka.gif',
  './gifs/kotki-blizniaki.gif',
  './gifs/kozka.gif',
  './gifs/krolik.gif',
  './gifs/leniwiec.gif',
  './gifs/lis.gif',
  './gifs/panda.gif',
  './gifs/pandka.gif',
  './gifs/papuga.gif',
  './gifs/piesek-na-zolwiu.gif',
  './gifs/piesek.gif',
  './gifs/pingwiny.gif',
  './gifs/piskle.gif',
  './gifs/slonik.gif',
  './gifs/swinka.gif',
  './gifs/szczeniak.gif',
  './gifs/szynszyle.gif',
  './gifs/wiewiorka.gif',
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
