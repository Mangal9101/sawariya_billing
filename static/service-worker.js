/* =========================================================
   SAWARIYA BILLING SYSTEM
   SERVICE WORKER
   STABLE OFFLINE + ONLINE
   ========================================================= */


const CACHE_NAME = "sawariya-v20";


/* =========================================================
   STATIC FILES
   ========================================================= */

const STATIC_FILES = [

    "/static/css/style.css",

    "/static/js/offline-db.js",

    "/static/js/billing.js",

    "/manifest.json",

    "/static/icons/icon-192.png",

    "/static/icons/icon-512.png"

];


/* =========================================================
   APP PAGES
   ========================================================= */

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

                 Individual fetch use kar rahe hain
                 taaki ek missing file se
                 poora installation fail na ho.
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
                                        "no-store"
                                }
                            );


                        if (
                            response &&
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
                                caches.delete(
                                    key
                                )
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
        const path of APP_PAGES
    ) {

        try {

            const response =
                await fetch(
                    path,
                    {
                        method:
                            "GET",

                        credentials:
                            "same-origin",

                        cache:
                            "no-store",

                        redirect:
                            "follow"
                    }
                );


            /*
             Redirected login page ko
             galti se protected page ke naam
             par cache nahi karna.
            */

            if (
                !response ||
                !response.ok
            ) {

                continue;

            }


            const contentType =
                response.headers.get(
                    "content-type"
                ) || "";


            if (
                !contentType.includes(
                    "text/html"
                )
            ) {

                continue;

            }


            /*
             Final URL check.
             Agar login par redirect hua
             to usko cache nahi karenge.
            */

            const finalUrl =
                new URL(
                    response.url
                );


            if (
                finalUrl.pathname ===
                "/login"
            ) {

                console.warn(
                    "Not logged in, skipped:",
                    path
                );

                continue;

            }


            /*
             EXACT PATH CACHE
            */

            await cache.put(
                path,
                response.clone()
            );


            console.log(
                "Cached page:",
                path
            );

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
   MESSAGE
   ========================================================= */

self.addEventListener(
    "message",
    event => {

        if (

            event.data &&
            event.data.type ===
            "CACHE_APP_PAGES"

        ) {

            event.waitUntil(
                cacheAppPages()
            );

        }


        /*
         FORCE SKIP WAITING
        */

        if (

            event.data &&
            event.data.type ===
            "SKIP_WAITING"

        ) {

            self.skipWaiting();

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
         ONLY SAME ORIGIN
        */

        if (

            url.origin !==
            self.location.origin

        ) {

            return;

        }


        /*
         API NEVER CACHE
        */

        if (
            url.pathname.startsWith(
                "/api/"
            )
        ) {

            return;

        }


        /*
         LOGOUT NEVER CACHE
        */

        if (
            url.pathname ===
            "/logout"
        ) {

            return;

        }


        /* =================================================
           NAVIGATION / HTML PAGE
           NETWORK FIRST
           CACHE FALLBACK
           ================================================= */

        if (
            request.mode ===
            "navigate"
        ) {

            event.respondWith(

                (async () => {

                    try {

                        /*
                         ONLINE REQUEST
                        */

                        const response =
                            await fetch(
                                request
                            );


                        /*
                         SUCCESSFUL HTML CACHE UPDATE
                        */

                        if (

                            response &&
                            response.ok

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

                                const cache =
                                    await caches.open(
                                        CACHE_NAME
                                    );


                                await cache.put(
                                    url.pathname,
                                    response.clone()
                                );

                            }

                        }


                        return response;

                    }

                    catch (error) {

                        /*
                         OFFLINE
                        */

                        const cache =
                            await caches.open(
                                CACHE_NAME
                            );


                        /*
                         FIRST:
                         EXACT PAGE
                        */

                        let cached =
                            await cache.match(
                                url.pathname
                            );


                        if (
                            cached
                        ) {

                            return cached;

                        }


                        /*
                         SECOND:
                         ROOT
                        */

                        cached =
                            await cache.match(
                                "/"
                            );


                        if (
                            cached
                        ) {

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
content="width=device-width,initial-scale=1"
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

}

h1 {

    color:
        #7b3f18;

}

</style>

</head>

<body>

<h1>
Sawariya Billing
</h1>

<p>
Offline mode is active.
</p>

<p>
This page is not available
in the offline cache yet.
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
                                status:
                                    503
                            }
                        );

                    }

                })()

            );


            return;

        }

    }
);