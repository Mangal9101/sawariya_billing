/* =========================================================
   SAWARIYA BILLING SYSTEM
   FULL APP OFFLINE SERVICE WORKER
   ========================================================= */


const CACHE_NAME = "sawariya-offline-v10";


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

self.addEventListener(

    "install",

    event => {

        event.waitUntil(

            (async () => {

                const cache =
                    await caches.open(
                        CACHE_NAME
                    );


                /*
                 STATIC FILES CACHE
                */

                for (
                    const path of STATIC_FILES
                ) {

                    try {

                        const response =
                            await fetch(
                                path,
                                {
                                    cache:
                                        "reload"
                                }
                            );


                        if (
                            response.ok
                        ) {

                            await cache.put(
                                path,
                                response.clone()
                            );

                        }

                    }

                    catch (error) {

                        console.warn(
                            "Static cache failed:",
                            path,
                            error
                        );

                    }

                }


                await self.skipWaiting();

            })()

        );

    }

);



/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener(

    "activate",

    event => {

        event.waitUntil(

            (async () => {

                const keys =
                    await caches.keys();


                await Promise.all(

                    keys
                        .filter(
                            key =>
                                key !== CACHE_NAME
                        )
                        .map(
                            key =>
                                caches.delete(key)
                        )

                );


                await self.clients.claim();

            })()

        );

    }

);



/* =========================================================
   CACHE ALL APP PAGES
   ========================================================= */

async function cacheAppPages() {


    const cache =
        await caches.open(
            CACHE_NAME
        );


    for (
        const path of APP_ROUTES
    ) {

        try {

            console.log(
                "Caching page:",
                path
            );


            const response =
                await fetch(
                    path,
                    {
                        credentials:
                            "include",

                        cache:
                            "reload"
                    }
                );


            /*
             LOGIN REDIRECT KO CACHE NAHI KARNA
            */

            const finalUrl =
                new URL(
                    response.url
                );


            if (

                response.ok &&

                response.type ===
                    "basic" &&

                finalUrl.pathname ===
                    path

            ) {

                await cache.put(
                    path,
                    response.clone()
                );


                console.log(
                    "Cached:",
                    path
                );

            }

            else {

                console.warn(
                    "Page not cached:",
                    path,

                    "Final URL:",

                    finalUrl.pathname
                );

            }

        }

        catch (error) {

            console.warn(

                "Could not cache:",

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
         SINGLE PAGE CACHE
        */

        if (

            event.data?.type ===
            "CACHE_CURRENT_PAGE"

        ) {

            event.waitUntil(

                (async () => {

                    try {

                        const path =
                            event.data.path;


                        if (!path) {

                            return;

                        }


                        const cache =
                            await caches.open(
                                CACHE_NAME
                            );


                        const response =
                            await fetch(
                                path,
                                {
                                    credentials:
                                        "include",

                                    cache:
                                        "reload"
                                }
                            );


                        if (
                            response.ok
                        ) {

                            await cache.put(
                                path,
                                response.clone()
                            );

                        }

                    }

                    catch (error) {

                        console.warn(
                            error
                        );

                    }

                })()

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
         ONLY GET
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
         API REQUESTS

         API ko service worker cache nahi karega.

         Offline API functionality
         JavaScript + IndexedDB se handle hogi.
        */

        if (

            url.pathname.startsWith(
                "/api/"
            )

        ) {

            return;

        }


        /*
         LOGOUT OFFLINE CACHE NAHI
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

                (async () => {

                    const cached =
                        await caches.match(
                            request
                        );


                    if (
                        cached
                    ) {

                        return cached;

                    }


                    try {

                        const response =
                            await fetch(
                                request
                            );


                        if (
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

                    }

                    catch (error) {


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

                (async () => {


                    /*
                     ONLINE TRY
                    */

                    try {

                        const response =
                            await fetch(
                                request
                            );


                        if (

                            response.ok

                            &&

                            response.type ===
                                "basic"

                        ) {

                            const cache =
                                await caches.open(
                                    CACHE_NAME
                                );


                            /*
                             EXACT PATH CACHE
                            */

                            await cache.put(

                                url.pathname,

                                response.clone()

                            );

                        }


                        return response;

                    }


                    catch (error) {


                        /*
                         OFFLINE:
                         EXACT PATH SEARCH
                        */

                        const cache =
                            await caches.open(
                                CACHE_NAME
                            );


                        let cached =
                            await cache.match(
                                url.pathname
                            );


                        /*
                         REQUEST MATCH
                        */

                        if (
                            !cached
                        ) {

                            cached =
                                await caches.match(
                                    request,
                                    {
                                        ignoreSearch:
                                            true
                                    }
                                );

                        }


                        if (
                            cached
                        ) {

                            return cached;

                        }


                        /*
                         DASHBOARD FALLBACK
                        */

                        const dashboard =
                            await cache.match(
                                "/dashboard"
                            );


                        if (
                            dashboard
                        ) {

                            return dashboard;

                        }


                        /*
                         LAST FALLBACK
                        */

                        return new Response(

                            `
                            <!doctype html>

                            <html>

                            <head>

                                <meta charset="utf-8">

                                <meta
                                    name="viewport"
                                    content="
                                        width=device-width,
                                        initial-scale=1
                                    "
                                >

                                <title>
                                    Sawariya Offline
                                </title>

                            </head>


                            <body
                                style="
                                    font-family:Arial;
                                    padding:30px;
                                "
                            >

                                <h2>
                                    Sawariya Billing
                                </h2>


                                <p>
                                    Offline mode is active.
                                </p>


                                <p>
                                    This page has not been
                                    cached yet.
                                </p>


                                <p>
                                    Connect to the internet,
                                    login once, and reload
                                    the application.
                                </p>

                            </body>

                            </html>
                            `,

                            {

                                status:
                                    200,

                                headers: {

                                    "Content-Type":
                                        "text/html; charset=utf-8"

                                }

                            }

                        );

                    }

                })()

            );


            return;

        }


    }

);