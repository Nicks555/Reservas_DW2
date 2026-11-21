// CyberZone Café - Service Worker v2
// Si cambias archivos de la app, sube VERSION para renovar las cachés.
const VERSION = 'v2';
const CACHE_SHELL = `cyberzone-shell-${VERSION}`;   // index, manifest, íconos
const CACHE_CDN = `cyberzone-cdn-${VERSION}`;       // jQuery, DOMPurify, fuentes
const CACHE_IMG = `cyberzone-img-${VERSION}`;       // fotos de máquinas y catálogo
const CACHES_ACTUALES = [CACHE_SHELL, CACHE_CDN, CACHE_IMG];

const MAX_IMAGENES = 80;        // tope de imágenes guardadas (las más viejas se borran)
const NAV_TIMEOUT_MS = 4000;    // con red lenta, a los 4 s se usa la copia guardada

const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

// Librerías que la app necesita para arrancar sin internet
const CDN_PRECACHE = [
  'https://code.jquery.com/jquery-3.7.1.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@500;600;700&display=swap'
];
const CDN_HOSTS = ['code.jquery.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const IMG_HOSTS = ['images.unsplash.com', 'cdn.cloudflare.steamstatic.com', 'cdn-icons-png.flaticon.com'];

// ---------------------------------------------------------------
// INSTALL: el shell es obligatorio; las librerías externas no deben romper la instalación
// ---------------------------------------------------------------
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(CACHE_SHELL);
    await shell.addAll(APP_SHELL);

    const cdn = await caches.open(CACHE_CDN);
    await Promise.allSettled(CDN_PRECACHE.map(async (url) => {
      const res = await fetch(new Request(url, { mode: 'no-cors' }));
      await cdn.put(url, res);
    }));

    await self.skipWaiting();
  })());
});

// ---------------------------------------------------------------
// ACTIVATE: borra cachés de versiones anteriores (v1 y sueltas)
// ---------------------------------------------------------------
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !CACHES_ACTUALES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------
// FETCH
// ---------------------------------------------------------------
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // 1) Páginas: red primero (con tiempo límite), si falla la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(manejarNavegacion(req, e));
    return;
  }

  // 2) Archivos propios: devuelve lo guardado al instante y lo renueva en segundo plano
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req, CACHE_SHELL, e));
    return;
  }

  // 3) Librerías y fuentes
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req, CACHE_CDN, e));
    return;
  }

  // 4) Imágenes de máquinas y catálogo: guardadas con límite y con imagen de reemplazo offline
  if (IMG_HOSTS.includes(url.hostname) || req.destination === 'image') {
    e.respondWith(manejarImagen(req, e));
    return;
  }
  // Todo lo demás pasa directo a la red
});

async function manejarNavegacion(req, e) {
  const cache = await caches.open(CACHE_SHELL);
  const red = fetch(req).then((res) => {
    if (res.ok) cache.put('./index.html', res.clone());
    return res;
  });
  const limite = new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), NAV_TIMEOUT_MS));

  try {
    return await Promise.race([red, limite]);
  } catch (_) {
    const guardada = (await cache.match('./index.html')) || (await cache.match('./'));
    if (guardada) {
      e.waitUntil(red.catch(() => {}));      // si la red responde tarde, igual renueva la copia
      return guardada;
    }
    try { return await red; } catch (__) { return respuestaSinConexion(); }
  }
}

async function staleWhileRevalidate(req, nombreCache, e) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(req);
  const red = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);

  if (guardada) { e.waitUntil(red); return guardada; }
  return (await red) || Response.error();
}

async function manejarImagen(req, e) {
  const cache = await caches.open(CACHE_IMG);
  const guardada = await cache.match(req.url, { ignoreVary: true });
  if (guardada) return guardada;

  try {
    // Se pide en modo CORS para guardar respuestas reales (las "opaque" ocupan mucha cuota)
    const res = await fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' }));
    if (res.ok) {
      cache.put(req.url, res.clone());
      e.waitUntil(recortarCache(cache, MAX_IMAGENES));
    }
    return res;
  } catch (_) {
    try { return await fetch(req); }          // el servidor no permite CORS: se muestra pero no se guarda
    catch (__) { return imagenSinConexion(); }
  }
}

async function recortarCache(cache, maximo) {
  const claves = await cache.keys();
  if (claves.length > maximo) {
    await Promise.all(claves.slice(0, claves.length - maximo).map((k) => cache.delete(k)));
  }
}

function imagenSinConexion() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
    '<rect width="400" height="300" fill="#131625"/>' +
    '<text x="200" y="155" fill="#8b8e9f" font-family="sans-serif" font-size="18" text-anchor="middle">Sin conexión</text></svg>';
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}

function respuestaSinConexion() {
  return new Response('Sin conexión. Abre la app una vez con internet para usarla offline.', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}