/* =========================================================
   SAWARIYA BILLING SYSTEM
   FULL OFFLINE SERVICE WORKER
   ========================================================= */

const CACHE_NAME = "sawariya-offline-v11";


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
   MAIN APP PAGES
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

            const response =
                await fetch(
                    path,
                    {
                        credentials: "include",

                        cache: "reload"
                    }
                );


            /*
             PAGE SUCCESSFULLY LOAD HUI
            */

            if (
                response &&
                response.ok &&
                response.type === "basic"
            ) {

                const finalUrl =
                    new URL(
                        response.url
                    );


                /*
                 Redirected login page cache mat karo
                */

                if (
                    finalUrl.pathname === path
                ) {

                    await cache.put(
                        path,
                        response.clone()
                    );


                    console.log(
                        "OFFLINE PAGE CACHED:",
                        path
                    );

                }

            }

        }

        catch (error) {

            console.warn(
                "PAGE CACHE FAILED:",
                path,
                error
            );

        }

    }

}



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
                 CACHE STATIC FILES
                */

                for (
                    const path of STATIC_FILES
                ) {

                    try {

                        const response =
                            await fetch(
                                path,
                                {
                                    cache: "reload"
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
                            "STATIC CACHE FAILED:",
                            path,
                            error
                        );

                    }

                }


                /*
                 TRY TO CACHE APP PAGES
                */

                await cacheAppPages();


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
                                key !==
                                CACHE_NAME

                        )
                        .map(

                            key =>
                                caches.delete(
                                    key
                                )

                        )

                );


                await self.clients.claim();


                /*
                 ACTIVATION KE BAAD
                 APP PAGES CACHE KARO
                */

                try {

                    await cacheAppPages();

                }

                catch (error) {

                    console.warn(
                        "APP CACHE ERROR:",
                        error
                    );

                }

            })()

        );

    }

);



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
         CURRENT PAGE CACHE
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


                        if (
                            !path
                        ) {

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

                            response.ok &&
                            response.type ===
                            "basic"

                        ) {

                            await cache.put(

                                path,

                                response.clone()

                            );

                        }

                    }

                    catch (error) {

                        console.warn(

                            "CURRENT PAGE CACHE ERROR:",

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
         ONLY GET REQUEST
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

         API offline handling
         JavaScript + IndexedDB karega.
        */

        if (

            url.pathname.startsWith(
                "/api/"
            )

        ) {

            return;

        }


        /*
         LOGOUT CACHE NAHI KARNA
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
           APP HTML PAGES
           NETWORK FIRST
           OFFLINE = CACHE
           ================================================= */

        if (

            request.mode ===
            "navigate"

            ||

            request.headers
                .get(
                    "accept"
                )
                ?.includes(
                    "text/html"
                )

        ) {


            event.respondWith(

                (async () => {


                    /*
                     ONLINE:
                     NETWORK SE LOAD KARO
                     AUR CACHE UPDATE KARO
                    */

                    try {

                        const response =
                            await fetch(
                                request
                            );


                        if (

                            response &&
                            response.ok &&
                            response.type ===
                            "basic"

                        ) {

                            const cache =
                                await caches.open(
                                    CACHE_NAME
                                );


                            /*
                             EXACT PAGE PATH CACHE
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
                         EXACT PAGE CACHE
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
                         SEARCH IGNORE QUERY
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


                      /*
 PAGE MIL GAYA
*/

if (
    cached
) {

    return cached;

}


/*
 REPORTS SPECIAL FALLBACK

 Reports URL me date query ho sakti hai:

 /reports?date=2026-09-01

 Offline me cached /reports page use karo.
*/

if (
    url.pathname === "/reports"
) {

    const reportsPage =
        await cache.match(
            "/reports"
        );

    if (
        reportsPage
    ) {

        return reportsPage;

    }

}


                        /*
                         HOME FALLBACK
                        */

                        const home =
                            await cache.match(
                                "/"
                            );


                        if (
                            home
                        ) {

                            return home;

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
                         FINAL OFFLINE FALLBACK
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
                                    Please connect internet once
                                    and open all pages.
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

                    }

                })()

            );


            return;

        }

    }

);