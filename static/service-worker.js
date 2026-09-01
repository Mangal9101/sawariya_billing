const CACHE_NAME = "sawariya-offline-v4";

const STATIC_FILES = [
    "/static/css/style.css",
    "/static/js/billing.js",
    "/static/js/offline-db.js",
    "/manifest.json",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];

const APP_ROUTES = [
    "/dashboard",
    "/billing",
    "/products",
    "/stock",
    "/customers",
    "/reports"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(key => key !== CACHE_NAME)
                        .map(key => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("message", event => {
    if (event.data?.type !== "CACHE_APP_PAGES") return;

    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            for (const path of APP_ROUTES) {
                try {
                    const response = await fetch(path, {
                        credentials: "include",
                        cache: "no-store"
                    });

                    if (response.ok && response.type === "basic") {
                        await cache.put(path, response.clone());
                    }
                } catch (error) {
                    console.warn("Could not cache", path, error);
                }
            }
        })
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) return;

    if (url.pathname === "/logout") return;

    if (
        url.pathname.startsWith("/static/") ||
        url.pathname === "/manifest.json"
    ) {
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

    if (
        request.mode === "navigate" ||
        request.headers.get("accept")?.includes("text/html")
    ) {
        event.respondWith(
            fetch(request)
                .then(response => {

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
                .catch(() =>
                    caches.match(request).then(cached => {

                        if (cached) {
                            return cached;
                        }

                        return new Response(
                            `
                            <!doctype html>
                            <html lang="en">
                            <head>
                                <meta charset="utf-8">
                                <meta name="viewport"
                                    content="width=device-width,initial-scale=1">
                                <meta name="theme-color"
                                    content="#7b3f18">
                                <title>Sawariya Offline</title>
                            </head>

                            <body>
                                <h2>Sawariya Offline</h2>

                                <p>
                                    This section has not been cached yet.
                                </p>

                                <p>
                                    Connect to the internet once and
                                    open this section.
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
                    })
                )
        );

        return;
    }
});
