// ============================================================
// SAWARIYA SERVICE WORKER
// PWA - Offline support
// ============================================================

const CACHE_NAME = 'sawariya-v3';
const ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/js/offline-db.js',
    '/static/js/sync-manager.js',
    '/static/js/billing.js',
    '/static/manifest.json',
    '/static/icons/icon-192.png',
    '/static/icons/icon-512.png'
];

// ============================================================
// INSTALL
// ============================================================

self.addEventListener('install', event => {
    console.log('📦 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Caching assets...');
                return cache.addAll(ASSETS);
            })
            .then(() => {
                console.log('✅ Assets cached');
                return self.skipWaiting();
            })
    );
});

// ============================================================
// ACTIVATE
// ============================================================

self.addEventListener('activate', event => {
    console.log('⚡ Service Worker activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('🗑️ Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => {
            console.log('✅ Service Worker activated');
            return self.clients.claim();
        })
    );
});

// ============================================================
// FETCH
// ============================================================

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // ========== API Calls - Network Only ==========
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Return offline error
                return new Response(JSON.stringify({
                    error: 'Offline',
                    message: 'You are offline. Please connect to the internet.'
                }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }
    
    // ========== Static Assets - Cache First ==========
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                // Not in cache - fetch from network
                return fetch(event.request).catch(() => {
                    // Fallback for offline
                    if (event.request.mode === 'navigate') {
                        return caches.match('/');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// ============================================================
// BACKGROUND SYNC
// ============================================================

self.addEventListener('sync', event => {
    console.log('🔄 Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-sawariya') {
        event.waitUntil(handleBackgroundSync());
    }
});

async function handleBackgroundSync() {
    try {
        console.log('📤 Background sync started...');
        
        // Get clients
        const clients = await self.clients.matchAll();
        
        for (const client of clients) {
            client.postMessage({
                type: 'BACKGROUND_SYNC',
                action: 'syncAll'
            });
        }
        
        console.log('✅ Background sync completed');
    } catch (error) {
        console.error('❌ Background sync failed:', error);
    }
});

// ============================================================
// MESSAGE HANDLING
// ============================================================

self.addEventListener('message', event => {
    console.log('📨 Service Worker received message:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});