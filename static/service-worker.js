/* =========================================================
   SAWARIYA BILLING SYSTEM
   SERVICE WORKER
   FULL OFFLINE + ONLINE SUPPORT
   ========================================================= */

const CACHE_NAME = "sawariya-offline-v6";


/* =========================================================
   STATIC FILES
   ========================================================= */

const STATIC_FILES = [
    "/static/css/style.css",

    "/static/js/billing.js",
    "/static/js/offline-db.js",

    "/manifest.json",

    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];


/* =========================================================
   APP PAGES
   ========================================================= */

const APP_ROUTES = [
    "/",
    "/dashboard",
    "/billing",
    "/products",
    "/stock",
    "/customers",
    "/reports"
];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener("install", event => {

    event.waitUntil(

        caches
            .open(CACHE_NAME)

            .then(async cache => {

                /*
                 Static files cache karo.
                 Agar ek file missing ho to
                 poora service worker fail na ho.
                */

                await Promise.all(
                    STATIC_FILES.map(async path => {

                        try {

                            const response = await fetch(path);

                            if (response.ok) {

                                await cache.put(
                                    path,
                                    response.clone()
                                );

                            }

                        } catch (error) {

                            console.warn(
                                "Static cache failed:",
                                path,
                                error
                            );

                        }

                    })
                );

            })

            .then(() => self.skipWaiting())

    );

});


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener("activate", event => {

    event.waitUntil(

        caches
            .keys()

            .then(keys => {

                return Promise.all(

                    keys
                        .filter(
                            key => key !== CACHE_NAME
                        )

                        .map(
                            key => caches.delete(key)
                        )

                );

            })

            .then(() => self.clients.claim())

    );

});


/* =========================================================
   CACHE ALL APP PAGES
   ========================================================= */

async function cacheAppPages() {

    const cache = await caches.open(CACHE_NAME);


    for (const path of APP_ROUTES) {

        try {

            const response = await fetch(path, {

                method: "GET",

                credentials: "include",

                cache: "no-store",

                redirect: "follow"

            });


            /*
             Sirf successful HTML page cache karo
            */

            if (
                response.ok &&
                response.type === "basic"
            ) {

                const contentType =
                    response.headers.get(
                        "content-type"
                    ) || "";


                if (
                    contentType.includes(
                        "text/html"
                    )
                ) {

                    await cache.put(
                        path,
                        response.clone()
                    );


                    console.log(
                        "Cached page:",
                        path
                    );

                }

            }

        } catch (error) {

            console.warn(
                "Could not cache page:",
                path,
                error
            );

        }

    }

}


/* =========================================================
   MESSAGE FROM APP
   ========================================================= */

self.addEventListener(
    "message",
    event => {

        if (
            event.data?.type ===
            "CACHE_APP_PAGES"
        ) {

            event.waitUntil(
                cacheAppPages()
            );

        }


        /*
         Single page cache
        */

        if (
            event.data?.type ===
            "CACHE_PAGE"
        ) {

            const path =
                event.data?.path;


            if (!path) return;


            event.waitUntil(

                caches
                    .open(CACHE_NAME)

                    .then(async cache => {

                        try {

                            const response =
                                await fetch(
                                    path,
                                    {
                                        credentials:
                                            "include",

                                        cache:
                                            "no-store"
                                    }
                                );


                            if (
                                response.ok &&
                                response.type ===
                                "basic"
                            ) {

                                await cache.put(
                                    path,
                                    response.clone()
                                );

                            }

                        } catch (error) {

                            console.warn(
                                "Could not cache:",
                                path
                            );

                        }

                    })

            );

        }

    }
);


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener(
    "fetch",
    event => {

        const request =
            event.request;


        /*
         POST / PUT / DELETE
         Service worker me intercept nahi
        */

        if (
            request.method !== "GET"
        ) {

            return;

        }


        const url =
            new URL(
                request.url
            );


        /*
         Sirf same origin handle karo
        */

        if (
            url.origin !==
            self.location.origin
        ) {

            return;

        }


        /*
         API ko service worker cache nahi karega.
         Offline API ka kaam IndexedDB karega.
        */

        if (
            url.pathname.startsWith(
                "/api/"
            )
        ) {

            return;

        }


        /*
         Logout kabhi cache nahi hona chahiye
        */

        if (
            url.pathname ===
            "/logout"
        ) {

            return;

        }


        /* =================================================
           STATIC FILES
           CACHE FIRST
           ================================================= */

        if (

            url.pathname.startsWith(
                "/static/"
            )

            ||

            url.pathname ===
            "/manifest.json"

        ) {

            event.respondWith(

                caches
                    .match(request)

                    .then(cached => {

                        if (cached) {

                            return cached;

                        }


                        return fetch(request)

                            .then(response => {

                                if (
                                    response &&
                                    response.ok
                                ) {

                                    const copy =
                                        response.clone();


                                    caches
                                        .open(
                                            CACHE_NAME
                                        )

                                        .then(cache => {

                                            cache.put(
                                                request,
                                                copy
                                            );

                                        });

                                }


                                return response;

                            })

                            .catch(() => {

                                return caches.match(
                                    url.pathname
                                );

                            });

                    })

            );


            return;

        }


        /* =================================================
           HTML / APP PAGES
           NETWORK FIRST
           OFFLINE = CACHE
           ================================================= */

        if (

            request.mode ===
            "navigate"

            ||

            request.headers
                .get("accept")
                ?.includes(
                    "text/html"
                )

        ) {

            event.respondWith(

                fetch(request, {

                    credentials:
                        "include"

                })

                    .then(async response => {

                        /*
                         Online response ko cache karo
                        */

                        if (

                            response &&
                            response.ok &&
                            response.type ===
                            "basic"

                        ) {

                            const contentType =
                                response.headers.get(
                                    "content-type"
                                ) || "";


                            /*
                             Sirf HTML cache karo
                            */

                            if (

                                contentType.includes(
                                    "text/html"
                                )

                            ) {

                                const cache =
                                    await caches.open(
                                        CACHE_NAME
                                    );


                                /*
                                 Actual request cache
                                */

                                await cache.put(
                                    request,
                                    response.clone()
                                );


                                /*
                                 Path bhi cache karo.
                                 Isse query string
                                 ki problem nahi hogi.
                                */

                                await cache.put(
                                    url.pathname,
                                    response.clone()
                                );

                            }

                        }


                        return response;

                    })


                    .catch(async () => {

                        const cache =
                            await caches.open(
                                CACHE_NAME
                            );


                        /*
                         1. Exact request
                        */

                        let cached =
                            await cache.match(
                                request
                            );


                        if (cached) {

                            return cached;

                        }


                        /*
                         2. Clean path
                        */

                        cached =
                            await cache.match(
                                url.pathname
                            );


                        if (cached) {

                            return cached;

                        }


                        /*
                         3. Ignore search parameters
                        */

                        cached =
                            await caches.match(
                                request,
                                {
                                    ignoreSearch:
                                        true
                                }
                            );


                        if (cached) {

                            return cached;

                        }


                        /*
                         4. Billing fallback
                        */

                        cached =
                            await cache.match(
                                "/billing"
                            );


                        if (cached) {

                            return cached;

                        }


                        /*
                         FINAL OFFLINE PAGE
                        */

                        return new Response(

                            `
                            <!doctype html>

                            <html lang="en">

                            <head>

                                <meta charset="utf-8">

                                <meta
                                    name="viewport"
                                    content="width=device-width, initial-scale=1"
                                >

                                <meta
                                    name="theme-color"
                                    content="#7b3f18"
                                >

                                <title>
                                    Sawariya Offline
                                </title>


                                <style>

                                    body {

                                        margin: 0;

                                        padding: 30px;

                                        font-family:
                                            Arial,
                                            sans-serif;

                                        background:
                                            #f5f5f5;

                                        color:
                                            #222;

                                    }


                                    h2 {

                                        color:
                                            #7b3f18;

                                    }

                                </style>

                            </head>


                            <body>

                                <h2>
                                    Sawariya Offline
                                </h2>


                                <p>

                                    This page has not been
                                    cached yet.

                                </p>


                                <p>

                                    Connect to the internet,
                                    login once, and open this
                                    section once.

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

            );


            return;

        }

    }
);