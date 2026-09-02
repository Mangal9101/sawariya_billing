/* Sawariya PWA - offline-first shell */
const CACHE_NAME = "sawariya-pwa-v4";
const OFFLINE_URL = "/login";
const APP_SHELL = [
    "/login",
    "/billing",
    "/dashboard",
    "/products",
    "/stock",
    "/customers",
    "/reports",
    "/static/css/style.css",
    "/static/js/billing.js",
    "/manifest.json",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll([
                "/login",
                "/static/css/style.css",
                "/static/js/billing.js",
                "/manifest.json",
                "/static/icons/icon-192.png",
                "/static/icons/icon-512.png"
            ]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

async function cacheResponse(request, response) {
    if (response && response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Never cache API responses. Billing uses its embedded/local catalog when
    // offline, while online API calls remain fresh.
    if (url.pathname.startsWith("/api/")) return;

    // Static assets: cache first, then update from network.
    if (url.pathname.startsWith("/static/")) {
        event.respondWith((async () => {
            const cached = await caches.match(request);
            try {
                const fresh = await fetch(request);
                if (fresh.ok) await cacheResponse(request, fresh);
                return fresh;
            } catch (_) {
                return cached || new Response("Offline", {status: 503});
            }
        })());
        return;
    }

    // Navigation: network first. Every successful page visited while online
    // is cached, so the installed PWA can reopen it without a network.
    if (request.mode === "navigate") {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                await cacheResponse(request, response);
                return response;
            } catch (_) {
                const cached = await caches.match(request);
                if (cached) return cached;

                // / is commonly the PWA start_url. Prefer the last cached
                // dashboard, then billing, then login.
                if (url.pathname === "/") {
                    return (await caches.match("/dashboard")) ||
                           (await caches.match("/billing")) ||
                           (await caches.match(OFFLINE_URL));
                }
                return (await caches.match(OFFLINE_URL)) ||
                       new Response("<h2>Sawariya is offline</h2><p>Open the app once while online to prepare offline pages.</p>", {
                           headers: {"Content-Type": "text/html; charset=utf-8"}
                       });
            }
        })());
        return;
    }

    // Other GET requests: network first with cache fallback.
    event.respondWith((async () => {
        try {
            const response = await fetch(request);
            await cacheResponse(request, response);
            return response;
        } catch (_) {
            return (await caches.match(request)) || caches.match(OFFLINE_URL);
        }
    })());
});

