/* =========================================================
   SAWARIYA BILLING SYSTEM
   OFFLINE DATABASE
   IndexedDB + Offline Sync Foundation
   ========================================================= */

const SAWARIYA_DB_NAME = "SawariyaOfflineDB";
const SAWARIYA_DB_VERSION = 2;

const SawariyaDB = (() => {

    let dbPromise = null;


    /* =====================================================
       OPEN DATABASE
       ===================================================== */

    function open() {

        if (dbPromise) {
            return dbPromise;
        }

        dbPromise = new Promise((resolve, reject) => {

            const request = indexedDB.open(
                SAWARIYA_DB_NAME,
                SAWARIYA_DB_VERSION
            );


            request.onupgradeneeded = event => {

                const db = event.target.result;


                /* =================================================
                   PRODUCTS
                   ================================================= */

                if (!db.objectStoreNames.contains("products")) {

                    const store = db.createObjectStore(
                        "products",
                        {
                            keyPath: "id"
                        }
                    );

                    store.createIndex(
                        "name",
                        "name",
                        { unique: false }
                    );

                    store.createIndex(
                        "sku",
                        "sku",
                        { unique: false }
                    );

                    store.createIndex(
                        "updated_at",
                        "updated_at",
                        { unique: false }
                    );

                }


                /* =================================================
                   CUSTOMERS
                   ================================================= */

                if (!db.objectStoreNames.contains("customers")) {

                    const store = db.createObjectStore(
                        "customers",
                        {
                            keyPath: "id"
                        }
                    );

                    store.createIndex(
                        "name",
                        "name",
                        { unique: false }
                    );

                    store.createIndex(
                        "phone",
                        "phone",
                        { unique: false }
                    );

                    store.createIndex(
                        "updated_at",
                        "updated_at",
                        { unique: false }
                    );

                }


                /* =================================================
                   BILLS
                   ================================================= */

                if (!db.objectStoreNames.contains("bills")) {

                    const store = db.createObjectStore(
                        "bills",
                        {
                            keyPath: "local_id"
                        }
                    );

                    store.createIndex(
                        "date",
                        "date",
                        { unique: false }
                    );

                    store.createIndex(
                        "server_id",
                        "server_id",
                        { unique: false }
                    );

                    store.createIndex(
                        "client_bill_id",
                        "client_bill_id",
                        { unique: true }
                    );

                    store.createIndex(
                        "sync_status",
                        "sync_status",
                        { unique: false }
                    );

                } else {

                    const store =
                        event.target.transaction
                            .objectStore("bills");

                    if (
                        !store.indexNames.contains(
                            "client_bill_id"
                        )
                    ) {

                        store.createIndex(
                            "client_bill_id",
                            "client_bill_id",
                            { unique: true }
                        );

                    }

                    if (
                        !store.indexNames.contains(
                            "sync_status"
                        )
                    ) {

                        store.createIndex(
                            "sync_status",
                            "sync_status",
                            { unique: false }
                        );

                    }

                }


                /* =================================================
                   BILL ITEMS
                   ================================================= */

                if (!db.objectStoreNames.contains("bill_items")) {

                    const store =
                        db.createObjectStore(
                            "bill_items",
                            {
                                keyPath: "local_id"
                            }
                        );

                    store.createIndex(
                        "bill_local_id",
                        "bill_local_id",
                        { unique: false }
                    );

                    store.createIndex(
                        "bill_server_id",
                        "bill_server_id",
                        { unique: false }
                    );

                }


                /* =================================================
                   STOCK MOVEMENTS
                   ================================================= */

                if (
                    !db.objectStoreNames.contains(
                        "stock_movements"
                    )
                ) {

                    const store =
                        db.createObjectStore(
                            "stock_movements",
                            {
                                keyPath: "local_id"
                            }
                        );

                    store.createIndex(
                        "product_id",
                        "product_id",
                        { unique: false }
                    );

                    store.createIndex(
                        "sync_status",
                        "sync_status",
                        { unique: false }
                    );

                }


                /* =================================================
                   SYNC QUEUE
                   ================================================= */

                if (
                    !db.objectStoreNames.contains(
                        "sync_queue"
                    )
                ) {

                    const store =
                        db.createObjectStore(
                            "sync_queue",
                            {
                                keyPath: "local_id"
                            }
                        );

                    store.createIndex(
                        "status",
                        "status",
                        { unique: false }
                    );

                    store.createIndex(
                        "entity",
                        "entity",
                        { unique: false }
                    );

                    store.createIndex(
                        "created_at",
                        "created_at",
                        { unique: false }
                    );

                }


                /* =================================================
                   SETTINGS
                   ================================================= */

                if (
                    !db.objectStoreNames.contains(
                        "settings"
                    )
                ) {

                    db.createObjectStore(
                        "settings",
                        {
                            keyPath: "key"
                        }
                    );

                }

            };


            request.onsuccess = () => {

                const db = request.result;

                db.onversionchange = () => {
                    db.close();
                    dbPromise = null;
                };

                resolve(db);

            };


            request.onerror = () => {

                dbPromise = null;

                reject(
                    request.error ||
                    new Error(
                        "Could not open IndexedDB"
                    )
                );

            };


            request.onblocked = () => {

                console.warn(
                    "Sawariya IndexedDB upgrade blocked."
                );

            };

        });

        return dbPromise;

    }


    /* =====================================================
       GENERATE LOCAL ID
       ===================================================== */

    function localId(prefix = "local") {

        return (
            prefix +
            "_" +
            Date.now() +
            "_" +
            Math.random()
                .toString(36)
                .slice(2, 10)
        );

    }


    /* =====================================================
       CURRENT TIME
       ===================================================== */

    function now() {

        return new Date().toISOString();

    }


    /* =====================================================
       PUT
       ===================================================== */

    function put(storeName, value) {

        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        storeName,
                        "readwrite"
                    );

                const request =
                    tx.objectStore(
                        storeName
                    ).put(value);


                request.onerror = () => {
                    reject(request.error);
                };


                tx.oncomplete = () => {
                    resolve(value);
                };


                tx.onerror = () => {
                    reject(tx.error);
                };

            });

        });

    }


    /* =====================================================
       PUT MANY
       ===================================================== */

    function putMany(storeName, values) {

        if (!Array.isArray(values)) {
            return Promise.reject(
                new Error("values must be an array")
            );
        }

        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        storeName,
                        "readwrite"
                    );

                const store =
                    tx.objectStore(storeName);


                values.forEach(value => {
                    store.put(value);
                });


                tx.oncomplete = () => {
                    resolve(values);
                };


                tx.onerror = () => {
                    reject(tx.error);
                };

            });

        });

    }


    /* =====================================================
       GET
       ===================================================== */

    function get(storeName, key) {

        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        storeName,
                        "readonly"
                    );

                const request =
                    tx.objectStore(
                        storeName
                    ).get(key);


                request.onsuccess = () => {
                    resolve(request.result);
                };


                request.onerror = () => {
                    reject(request.error);
                };

            });

        });

    }


    /* =====================================================
       GET ALL
       ===================================================== */

    function getAll(storeName) {

        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        storeName,
                        "readonly"
                    );

                const request =
                    tx.objectStore(
                        storeName
                    ).getAll();


                request.onsuccess = () => {

                    resolve(
                        request.result || []
                    );

                };


                request.onerror = () => {
                    reject(request.error);
                };

            });

        });

    }


    /* =====================================================
       DELETE
       ===================================================== */

    function remove(storeName, key) {

        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        storeName,
                        "readwrite"
                    );

                tx.objectStore(
                    storeName
                ).delete(key);


                tx.oncomplete = () => {
                    resolve(true);
                };


                tx.onerror = () => {
                    reject(tx.error);
                };

            });

        });

    }


    /* =====================================================
       CLEAR
       ===================================================== */

    function clear(storeName) {

        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        storeName,
                        "readwrite"
                    );

                tx.objectStore(
                    storeName
                ).clear();


                tx.oncomplete = () => {
                    resolve(true);
                };


                tx.onerror = () => {
                    reject(tx.error);
                };

            });

        });

    }


    /* =====================================================
       GET BY INDEX
       ===================================================== */

    function getByIndex(
        storeName,
        indexName,
        value
    ) {

        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        storeName,
                        "readonly"
                    );

                const store =
                    tx.objectStore(
                        storeName
                    );

                const index =
                    store.index(indexName);

                const request =
                    index.get(value);


                request.onsuccess = () => {
                    resolve(request.result);
                };


                request.onerror = () => {
                    reject(request.error);
                };

            });

        });

    }


    /* =====================================================
       GET ALL BY INDEX
       ===================================================== */

    function getAllByIndex(
        storeName,
        indexName,
        value
    ) {

        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        storeName,
                        "readonly"
                    );

                const index =
                    tx.objectStore(
                        storeName
                    ).index(indexName);

                const request =
                    index.getAll(value);


                request.onsuccess = () => {

                    resolve(
                        request.result || []
                    );

                };


                request.onerror = () => {
                    reject(request.error);
                };

            });

        });

    }


    /* =====================================================
       SEARCH PRODUCTS LOCALLY
       ===================================================== */

    async function searchProducts(query = "") {

        const products =
            await getAll("products");

        const q =
            String(query)
                .trim()
                .toLowerCase();


        if (!q) {
            return products;
        }


        return products.filter(product => {

            const name =
                String(
                    product.name || ""
                ).toLowerCase();

            const sku =
                String(
                    product.sku || ""
                ).toLowerCase();


            return (
                name.includes(q) ||
                sku.includes(q)
            );

        });

    }


    /* =====================================================
       FIND PRODUCT
       ===================================================== */

    async function findProduct(id) {

        const numericId =
            Number(id);


        let product =
            await get(
                "products",
                numericId
            );


        if (!product) {

            product =
                await get(
                    "products",
                    String(id)
                );

        }


        return product || null;

    }


    /* =====================================================
       SAVE PRODUCT LOCALLY
       ===================================================== */

    async function saveProduct(product) {

        const item = {
            ...product,

            id:
                product.id ??
                localId("product"),

            quantity:
                Number(product.quantity || 0),

            min_stock:
                Number(product.min_stock || 0),

            purchase_price:
                Number(
                    product.purchase_price || 0
                ),

            wholesale_price:
                Number(
                    product.wholesale_price || 0
                ),

            retailer_price:
                Number(
                    product.retailer_price || 0
                ),

            updated_at:
                product.updated_at ||
                now(),

            sync_status:
                product.sync_status ||
                "pending"

        };


        await put(
            "products",
            item
        );


        return item;

    }


    /* =====================================================
       SAVE CUSTOMER LOCALLY
       ===================================================== */

    async function saveCustomer(customer) {

        const item = {
            ...customer,

            id:
                customer.id ??
                localId("customer"),

            name:
                String(
                    customer.name || ""
                ).trim(),

            phone:
                String(
                    customer.phone || ""
                ).trim(),

            address:
                String(
                    customer.address || ""
                ).trim(),

            updated_at:
                customer.updated_at ||
                now(),

            sync_status:
                customer.sync_status ||
                "pending"

        };


        await put(
            "customers",
            item
        );


        return item;

    }


    /* =====================================================
       SAVE BILL + ITEMS
       SINGLE TRANSACTION
       ===================================================== */

    async function saveBill(
        bill,
        items = []
    ) {

        const localBillId =
            bill.local_id ||
            localId("bill");


        const clientBillId =
            bill.client_bill_id ||
            (
                "CB-" +
                Date.now() +
                "-" +
                Math.random()
                    .toString(36)
                    .slice(2, 10)
                    .toUpperCase()
            );


        const billRecord = {

            ...bill,

            local_id:
                localBillId,

            client_bill_id:
                clientBillId,

            date:
                bill.date ||
                now(),

            sync_status:
                bill.sync_status ||
                "pending"

        };


        const billItems =
            items.map(item => ({

                ...item,

                local_id:
                    item.local_id ||
                    localId("billitem"),

                bill_local_id:
                    localBillId,

                client_bill_id:
                    clientBillId

            }));


        return open().then(db => {

            return new Promise((resolve, reject) => {

                const tx =
                    db.transaction(
                        [
                            "bills",
                            "bill_items"
                        ],
                        "readwrite"
                    );


                tx.objectStore(
                    "bills"
                ).put(billRecord);


                const itemStore =
                    tx.objectStore(
                        "bill_items"
                    );


                billItems.forEach(item => {
                    itemStore.put(item);
                });


                tx.oncomplete = () => {

                    resolve({
                        bill:
                            billRecord,

                        items:
                            billItems
                    });

                };


                tx.onerror = () => {
                    reject(tx.error);
                };

            });

        });

    }


    /* =====================================================
       GET BILL ITEMS
       ===================================================== */

    async function getBillItems(
        billLocalId
    ) {

        return getAllByIndex(
            "bill_items",
            "bill_local_id",
            billLocalId
        );

    }


    /* =====================================================
       SAVE STOCK MOVEMENT
       ===================================================== */

    async function saveStockMovement(
        movement
    ) {

        const item = {

            ...movement,

            local_id:
                movement.local_id ||
                localId("stock"),

            created_at:
                movement.created_at ||
                now(),

            sync_status:
                movement.sync_status ||
                "pending"

        };


        await put(
            "stock_movements",
            item
        );


        return item;

    }


    /* =====================================================
       ADD SYNC QUEUE ITEM
       ===================================================== */

    async function queueSync(
        entity,
        action,
        payload,
        options = {}
    ) {

        const item = {

            local_id:
                options.local_id ||
                localId("sync"),

            entity:
                String(entity),

            action:
                String(action),

            payload:
                payload || {},

            status:
                options.status ||
                "pending",

            attempts:
                Number(
                    options.attempts || 0
                ),

            created_at:
                options.created_at ||
                now(),

            updated_at:
                now(),

            last_error:
                options.last_error ||
                null

        };


        await put(
            "sync_queue",
            item
        );


        return item;

    }


    /* =====================================================
       GET PENDING SYNC ITEMS
       ===================================================== */

async function getPendingSync() {

        const all =
            await getAll(
                "sync_queue"
            );


        return all
            .filter(item =>
                item.status === "pending" ||
                item.status === "retry"
            )
            .sort(
                (a, b) =>
                    String(
                        a.created_at
                    ).localeCompare(
                        String(
                            b.created_at
                        )
                    )
            );

    }


    /* =====================================================
       UPDATE SYNC ITEM
       ===================================================== */

    async function updateSyncItem(
        localIdValue,
        changes
    ) {

        const item =
            await get(
                "sync_queue",
                localIdValue
            );


        if (!item) {
            return null;
        }


        const updated = {

            ...item,

            ...changes,

            updated_at:
                now()

        };


        await put(
            "sync_queue",
            updated
        );


        return updated;

    }


    /* =====================================================
       MARK SYNC SUCCESS
       ===================================================== */

    async function markSynced(
        queueId
    ) {

        return updateSyncItem(
            queueId,
            {
                status: "synced",
                last_error: null
            }
        );

    }


    /* =====================================================
       MARK SYNC RETRY
       ===================================================== */

    async function markRetry(
        queueId,
        error
    ) {

        const item =
            await get(
                "sync_queue",
                queueId
            );


        const attempts =
            Number(
                item?.attempts || 0
            ) + 1;


        return updateSyncItem(
            queueId,
            {
                status: "retry",
                attempts,
                last_error:
                    String(
                        error?.message ||
                        error ||
                        "Sync failed"
                    )
            }
        );

    }


    /* =====================================================
       SETTINGS
       ===================================================== */

    async function setSetting(
        key,
        value
    ) {

        await put(
            "settings",
            {
                key,
                value,
                updated_at: now()
            }
        );


        return value;

    }


    async function getSetting(
        key,
        defaultValue = null
    ) {

        const item =
            await get(
                "settings",
                key
            );


        return item
            ? item.value
            : defaultValue;

    }


    /* =====================================================
       DELETE SYNCED QUEUE ITEM
       ===================================================== */

    async function removeSyncItem(
        queueId
    ) {

        return remove(
            "sync_queue",
            queueId
        );

    }


    /* =====================================================
       LOCAL BILL LOOKUP
       ===================================================== */

    async function getBillByClientId(
        clientBillId
    ) {

        if (!clientBillId) {
            return null;
        }


        return getByIndex(
            "bills",
            "client_bill_id",
            clientBillId
        );

    }


    /* =====================================================
       GET ALL LOCAL BILLS
       ===================================================== */

    async function getBills() {

        return getAll("bills");

    }


    /* =====================================================
       GET LOCAL CUSTOMERS
       ===================================================== */

    async function getCustomers() {

        return getAll("customers");

    }


    /* =====================================================
       GET LOCAL PRODUCTS
       ===================================================== */

    async function getProducts() {

        return getAll("products");

    }


    /* =====================================================
       PUBLIC API
       ===================================================== */

    return {

        open,

        put,
        putMany,

        get,
        getAll,

        remove,
        clear,

        getByIndex,
        getAllByIndex,

        localId,
        now,

        searchProducts,
        findProduct,

        saveProduct,
        saveCustomer,

        saveBill,
        getBillItems,

        saveStockMovement,

        queueSync,
        getPendingSync,

        updateSyncItem,
        markSynced,
        markRetry,
        removeSyncItem,

        getBillByClientId,
        getBills,
        getCustomers,
        getProducts,

        setSetting,
        getSetting

    };

})();


/* =========================================================
   GLOBAL
   ========================================================= */

window.SawariyaDB = SawariyaDB;


/* =========================================================
   DATABASE INITIALIZATION
   ========================================================= */

window.addEventListener(
    "load",
    () => {

        SawariyaDB.open()
            .then(() => {

                console.log(
                    "SAWARIYA OFFLINE DATABASE READY"
                );

            })
            .catch(error => {

                console.error(
                    "SAWARIYA OFFLINE DATABASE ERROR:",
                    error
                );

            });

    }
);