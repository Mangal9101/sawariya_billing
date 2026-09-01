const CACHE_NAME = "sawariya-v2";
const APP_SHELL = [
    "/static/css/style.css",
    "/static/js/billing.js",
    "/static/manifest.json",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Never cache authenticated/API responses. They can contain user-specific
    // data and must always come from the current local/online server.
    if (
        url.pathname.startsWith("/api/") ||
        url.pathname === "/login" ||
        url.pathname === "/logout"
    ) {
        return;
    }

    // Static assets: cache first.
    if (
        url.pathname.startsWith("/static/")
    ) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;

                return fetch(request).then(response => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // Pages: network first, cached fallback. This keeps online data fresh
    // while allowing already visited pages to open when the network drops.
    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok && response.type === "basic") {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(() =>
                caches.match(request).then(cached =>
                    cached || new Response(
                        "<h2>Offline</h2><p>Please start the local Sawariya server to use billing offline.</p>",
                        { headers: { "Content-Type": "text/html; charset=utf-8" } }
                    )
                )
            )
    );
});
