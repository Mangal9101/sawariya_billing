/* =========================================================
   SAWARIYA BILLING SYSTEM
   SIMPLE OFFLINE SERVICE WORKER
   ========================================================= */

const CACHE_NAME = "sawariya-v10";


/* =========================================================
   FILES
   ========================================================= */

const STATIC_FILES = [
    "/static/css/style.css",
    "/static/js/billing.js",
    "/static/js/offline-db.js",
    "/manifest.json",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];


const APP_PAGES = [
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

        (async () => {

            const cache = await caches.open(CACHE_NAME);


            /* STATIC FILES */

            for (const url of STATIC_FILES) {

                try {

                    const response = await fetch(url);

                    if (response && response.ok) {

                        await cache.put(
                            url,
                            response.clone()
                        );

                    }

                } catch (error) {

                    console.log(
                        "Static cache failed:",
                        url,
                        error
                    );

                }

            }


            /*
             APP PAGES CACHE
            */

            for (const url of APP_PAGES) {

                try {

                    const response = await fetch(url, {
                        credentials: "same-origin"
                    });


                    if (response && response.ok) {

                        await cache.put(
                            url,
                            response.clone()
                        );

                    }

                } catch (error) {

                    console.log(
                        "Page cache failed:",
                        url,
                        error
                    );

                }

            }


            await self.skipWaiting();

        })()

    );

});


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener("activate", event => {

    event.waitUntil(

        (async () => {

            const keys = await caches.keys();


            await Promise.all(

                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))

            );


            await self.clients.claim();

        })()

    );

});


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener("fetch", event => {

    const request = event.request;


    /*
     ONLY GET
    */

    if (request.method !== "GET") {

        return;

    }


    const url = new URL(request.url);


    /*
     ONLY SAME ORIGIN
    */

    if (
        url.origin !== self.location.origin
    ) {

        return;

    }


    /*
     API REQUESTS SKIP
    */

    if (
        url.pathname.startsWith("/api/")
    ) {

        return;

    }


    /*
     LOGOUT SKIP
    */

    if (
        url.pathname === "/logout"
    ) {

        return;

    }


    /* =====================================================
       HTML PAGES
       NETWORK FIRST
       CACHE FALLBACK
       ===================================================== */

    if (request.mode === "navigate") {

        event.respondWith(

            (async () => {

                try {

                    const response = await fetch(request);


                    /*
                     ONLINE PAGE CACHE UPDATE
                    */

                    if (
                        response &&
                        response.ok
                    ) {

                        const cache =
                            await caches.open(
                                CACHE_NAME
                            );


                        await cache.put(
                            url.pathname,
                            response.clone()
                        );

                    }


                    return response;

                } catch (error) {

                    /*
                     OFFLINE CACHE
                    */

                    const cache =
                        await caches.open(
                            CACHE_NAME
                        );


                    const cached =
                        await cache.match(
                            url.pathname
                        );


                    if (cached) {

                        return cached;

                    }


                    /*
                     HOME FALLBACK
                    */

                    const home =
                        await cache.match("/");


                    if (home) {

                        return home;

                    }


                    /*
                     FINAL FALLBACK
                    */

                    return new Response(

                        `
                        <!DOCTYPE html>

                        <html>

                        <head>

                            <meta charset="UTF-8">

                            <meta
                                name="viewport"
                                content="width=device-width, initial-scale=1"
                            >

                            <title>
                                Sawariya Offline
                            </title>

                        </head>

                        <body>

                            <h1>
                                Sawariya Billing
                            </h1>

                            <h3>
                                You are offline
                            </h3>

                            <p>
                                Please connect once to
                                the internet and open
                                the app.
                            </p>

                        </body>

                        </html>
                        `,

                        {
                            status: 200,

                            headers: {

                                "Content-Type":
                                    "text/html"

                            }

                        }

                    );

                }

            })()

        );


        return;

    }


    /* =====================================================
       STATIC FILES
       CACHE FIRST
       ===================================================== */

    if (

        url.pathname.startsWith("/static/")

        ||

        url.pathname === "/manifest.json"

    ) {

        event.respondWith(

            (async () => {

                const cached =
                    await caches.match(request);


                if (cached) {

                    return cached;

                }


                try {

                    const response =
                        await fetch(request);


                    if (
                        response &&
                        response.ok
                    ) {

                        const cache =
                            await caches.open(
                                CACHE_NAME
                            );


                        await cache.put(
                            request,
                            response.clone()
                        );

                    }


                    return response;

                } catch (error) {

                    return new Response(
                        "",
                        {
                            status: 503
                        }
                    );

                }

            })()

        );


        return;

    }

});