/* =========================================================
   SAWARIYA OFFLINE DATABASE
   IndexedDB foundation
   ========================================================= */

const SAWARIYA_DB_NAME = "SawariyaOfflineDB";
const SAWARIYA_DB_VERSION = 1;

const SawariyaDB = (() => {
    let dbPromise = null;
    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(SAWARIYA_DB_NAME, SAWARIYA_DB_VERSION);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("products")) {
                    const store = db.createObjectStore("products", { keyPath: "id" });
                    store.createIndex("name", "name", { unique: false });
                    store.createIndex("sku", "sku", { unique: false });
                }
                if (!db.objectStoreNames.contains("customers")) {
                    const store = db.createObjectStore("customers", { keyPath: "id" });
                    store.createIndex("name", "name", { unique: false });
                    store.createIndex("phone", "phone", { unique: false });
                }
                if (!db.objectStoreNames.contains("bills")) {
                    const store = db.createObjectStore("bills", { keyPath: "local_id" });
                    store.createIndex("date", "date", { unique: false });
                    store.createIndex("server_id", "server_id", { unique: false });
                }
                if (!db.objectStoreNames.contains("bill_items")) db.createObjectStore("bill_items", { keyPath: "local_id" });
                if (!db.objectStoreNames.contains("stock_movements")) {
                    const store = db.createObjectStore("stock_movements", { keyPath: "local_id" });
                    store.createIndex("product_id", "product_id", { unique: false });
                }
                if (!db.objectStoreNames.contains("sync_queue")) {
                    const store = db.createObjectStore("sync_queue", { keyPath: "local_id" });
                    store.createIndex("status", "status", { unique: false });
                    store.createIndex("created_at", "created_at", { unique: false });
                }
                if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return dbPromise;
    }
    function put(storeName, value) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).put(value);
            tx.oncomplete = () => resolve(value);
            tx.onerror = () => reject(tx.error);
        }));
    }
    function putMany(storeName, values) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            values.forEach(value => store.put(value));
            tx.oncomplete = () => resolve(values);
            tx.onerror = () => reject(tx.error);
        }));
    }
    function get(storeName, key) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }));
    }
    function getAll(storeName) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        }));
    }
    function remove(storeName, key) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        }));
    }
    function clear(storeName) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        }));
    }
    return { open, put, putMany, get, getAll, remove, clear };
})();
window.SawariyaDB = SawariyaDB;
