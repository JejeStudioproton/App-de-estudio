/* FORMA · shell offline. Las rutas son relativas a la ubicación del service worker
   para que funcione tanto en la raíz del dominio como en una subcarpeta de GitHub Pages. */
const CACHE = "forma-shell-v4";
const CACHE_PREFIX = "forma-";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        // Solo las cachés de FORMA: en github.io se comparte origen con otros proyectos.
        keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => undefined);
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // Navegación: red primero (para recibir despliegues nuevos) y shell cacheado sin conexión.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => putInCache(request, response))
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match("./index.html")) || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        })
    );
    return;
  }

  // Recursos: caché primero. Los nombres con hash cambian en cada compilación.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(response => putInCache(request, response))
        .catch(() => new Response("", { status: 504 }));
    })
  );
});
