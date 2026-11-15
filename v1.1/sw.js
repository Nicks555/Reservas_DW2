const CACHE_NAME = 'cyberzone-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://code.jquery.com/jquery-3.7.1.min.js',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@500;600;700&display=swap',
  'https://cdn-icons-png.flaticon.com/512/2933/2933253.png'
];

// Instalar el Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Interceptar peticiones (funcionamiento offline)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
  );
});
