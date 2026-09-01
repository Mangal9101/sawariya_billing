const CACHE_NAME = "sawariya-pwa-v3";

const STATIC_CACHE = [
    "/static/css/style.css",
    "/static/js/billing.js",
    "/manifest.json",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // API ko abhi cache nahi karna.
    // IndexedDB hum next step me add karenge.
    if (
        url.pathname.startsWith("/api/") ||
        url.pathname === "/logout"
    ) {
        return;
    }

    // Static files
    if (url.pathname.startsWith("/static/")) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;

                return fetch(request).then(response => {
                    if (response.ok) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, copy));
                    }

                    return response;
                });
            })
        );

        return;
    }

    // HTML pages
    if (
        request.mode === "navigate" ||
        request.headers.get("accept")?.includes("text/html")
    ) {
        event.respondWith(
            fetch(request)
                .then(response => {

                    // Online page successfully open hua,
                    // to uska copy cache me save karo.
                    if (
                        response.ok &&
                        response.type === "basic"
                    ) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, copy));
                    }

                    return response;
                })
                .catch(() => {

                    // Internet OFF:
                    // pehle exact page ka cached version.
                    return caches.match(request)
                        .then(cached => {

                            if (cached) {
                                return cached;
                            }

                            // Exact page cache nahi hai to login
                            // cached page try karo.
                            return caches.match("/login")
                                .then(loginPage => {

                                    if (loginPage) {
                                        return loginPage;
                                    }

                                    return new Response(
                                        `
                                        <!doctype html>
                                        <html>
                                        <head>
                                            <meta charset="utf-8">
                                            <meta name="viewport"
                                                content="width=device-width,initial-scale=1">
                                            <title>Sawariya Offline</title>
                                        </head>

                                        <body>
                                            <h2>Sawariya is offline</h2>

                                            <p>
                                                Please open this page once
                                                while online.
                                            </p>
                                        </body>
                                        </html>
                                        `,
                                        {
                                            status: 200,
                                            headers: {
                                                "Content-Type":
                                                    "text/html; charset=utf-8"
                                            }
                                        }
                                    );
                                });
                        });
                })
        );

        return;
    }
});
