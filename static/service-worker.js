/* =========================================================
   SAWARIYA BILLING SYSTEM
   FULL OFFLINE SERVICE WORKER
   ========================================================= */
const CACHE_NAME = "sawariya-offline-v11";
const STATIC_FILES = ["/static/css/style.css","/static/js/billing.js","/static/js/offline-db.js","/manifest.json","/static/icons/icon-192.png","/static/icons/icon-512.png"];
const APP_ROUTES = ["/","/dashboard","/billing","/products","/stock","/customers","/reports"];

async function cacheAppPages() {
    const cache = await caches.open(CACHE_NAME);
    for (const path of APP_ROUTES) {
        try {
            const response = await fetch(path, { credentials:"include", cache:"reload" });
            if (response && response.ok && response.type === "basic") {
                const finalUrl = new URL(response.url);
                if (finalUrl.pathname === path) await cache.put(path, response.clone());
            }
        } catch (error) { console.warn("PAGE CACHE FAILED:", path, error); }
    }
}

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        for (const path of STATIC_FILES) {
            try {
                const response = await fetch(path, { cache:"reload" });
                if (response.ok) await cache.put(path, response.clone());
            } catch (error) { console.warn("STATIC CACHE FAILED:", path, error); }
        }
        await cacheAppPages();
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
        await self.clients.claim();
        try { await cacheAppPages(); } catch (error) { console.warn("APP CACHE ERROR:", error); }
    })());
});

self.addEventListener("message", event => {
    if (event.data?.type === "CACHE_APP_PAGES") event.waitUntil(cacheAppPages());
    if (event.data?.type === "CACHE_CURRENT_PAGE") {
        event.waitUntil((async () => {
            try {
                const path = event.data.path;
                if (!path) return;
                const cache = await caches.open(CACHE_NAME);
                const response = await fetch(path, { credentials:"include", cache:"reload" });
                if (response.ok && response.type === "basic") await cache.put(path, response.clone());
            } catch (error) { console.warn("CURRENT PAGE CACHE ERROR:", error); }
        })());
    }
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return;
    if (url.pathname === "/logout") return;

    if (url.pathname.startsWith("/static/") || url.pathname === "/manifest.json") {
        event.respondWith((async () => {
            const cached = await caches.match(request);
            if (cached) return cached;
            try {
                const response = await fetch(request);
                if (response?.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, response.clone());
                }
                return response;
            } catch (_) { return new Response("", {status:503}); }
        })());
        return;
    }

    if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response?.ok && response.type === "basic") {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(url.pathname, response.clone());
                }
                return response;
            } catch (_) {
                const cache = await caches.open(CACHE_NAME);
                let cached = await cache.match(url.pathname);
                if (!cached) cached = await caches.match(request, {ignoreSearch:true});
                if (cached) return cached;
                if (url.pathname === "/reports") {
                    const reportsPage = await cache.match("/reports");
                    if (reportsPage) return reportsPage;
                }
                const home = await cache.match("/");
                if (home) return home;
                const dashboard = await cache.match("/dashboard");
                if (dashboard) return dashboard;
                return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sawariya Offline</title></head><body style="font-family:Arial;padding:30px"><h2>Sawariya Billing</h2><p>Offline mode is active.</p><p>Please connect internet once and open all pages.</p></body></html>`, {status:200,headers:{"Content-Type":"text/html; charset=utf-8"}});
            }
        })());
    }
});
