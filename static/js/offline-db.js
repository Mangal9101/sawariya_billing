/* =========================================================
SAWARIYA OFFLINE DATABASE
IndexedDB
Version 2

Stores:
products
customers
bills
bill_items
stock_movements
sync_queue
settings
staff
khatabook
khatabook_entries
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


    dbPromise = new Promise(
        (resolve, reject) => {

            const request =
                indexedDB.open(
                    SAWARIYA_DB_NAME,
                    SAWARIYA_DB_VERSION
                );


            /* =================================================
               DATABASE UPGRADE
               ================================================= */

            request.onupgradeneeded =
                event => {

                    const db =
                        event.target.result;


                    /* =========================================
                       PRODUCTS
                       ========================================= */

                    if (
                        !db.objectStoreNames.contains(
                            "products"
                        )
                    ) {

                        const store =
                            db.createObjectStore(
                                "products",
                                {
                                    keyPath: "id"
                                }
                            );


                        store.createIndex(
                            "name",
                            "name",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "sku",
                            "sku",
                            {
                                unique: false
                            }
                        );

                    }



                    /* =========================================
                       CUSTOMERS
                       ========================================= */

                    if (
                        !db.objectStoreNames.contains(
                            "customers"
                        )
                    ) {

                        const store =
                            db.createObjectStore(
                                "customers",
                                {
                                    keyPath: "id"
                                }
                            );


                        store.createIndex(
                            "name",
                            "name",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "phone",
                            "phone",
                            {
                                unique: false
                            }
                        );

                    }



                    /* =========================================
                       BILLS
                       ========================================= */

                    if (
                        !db.objectStoreNames.contains(
                            "bills"
                        )
                    ) {

                        const store =
                            db.createObjectStore(
                                "bills",
                                {
                                    keyPath: "local_id"
                                }
                            );


                        store.createIndex(
                            "date",
                            "date",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "server_id",
                            "server_id",
                            {
                                unique: false
                            }
                        );

                    }



                    /* =========================================
                       BILL ITEMS
                       ========================================= */

                    if (
                        !db.objectStoreNames.contains(
                            "bill_items"
                        )
                    ) {

                        db.createObjectStore(
                            "bill_items",
                            {
                                keyPath: "local_id"
                            }
                        );

                    }



                    /* =========================================
                       STOCK MOVEMENTS
                       ========================================= */

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
                            {
                                unique: false
                            }
                        );

                    }



                    /* =========================================
                       SYNC QUEUE
                       ========================================= */

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
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "created_at",
                            "created_at",
                            {
                                unique: false
                            }
                        );

                    }



                    /* =========================================
                       SETTINGS
                       ========================================= */

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



                    /* =========================================
                       STAFF
                       ========================================= */

                    if (
                        !db.objectStoreNames.contains(
                            "staff"
                        )
                    ) {

                        const store =
                            db.createObjectStore(
                                "staff",
                                {
                                    keyPath: "id"
                                }
                            );


                        store.createIndex(
                            "name",
                            "name",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "phone",
                            "phone",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "role",
                            "role",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "status",
                            "status",
                            {
                                unique: false
                            }
                        );

                    }



                    /* =========================================
                       KHATABOOK CUSTOMERS
                       ========================================= */

                    if (
                        !db.objectStoreNames.contains(
                            "khatabook"
                        )
                    ) {

                        const store =
                            db.createObjectStore(
                                "khatabook",
                                {
                                    keyPath: "id"
                                }
                            );


                        store.createIndex(
                            "name",
                            "name",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "phone",
                            "phone",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "customer_id",
                            "customer_id",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "updated_at",
                            "updated_at",
                            {
                                unique: false
                            }
                        );

                    }



                    /* =========================================
                       KHATABOOK ENTRIES
                       ========================================= */

                    if (
                        !db.objectStoreNames.contains(
                            "khatabook_entries"
                        )
                    ) {

                        const store =
                            db.createObjectStore(
                                "khatabook_entries",
                                {
                                    keyPath: "id"
                                }
                            );


                        store.createIndex(
                            "khatabook_id",
                            "khatabook_id",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "customer_id",
                            "customer_id",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "type",
                            "type",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "date",
                            "date",
                            {
                                unique: false
                            }
                        );


                        store.createIndex(
                            "sync_status",
                            "sync_status",
                            {
                                unique: false
                            }
                        );

                    }



                    console.log(
                        "✅ SawariyaDB stores ready"
                    );

                };



            /* =================================================
               SUCCESS
               ================================================= */

            request.onsuccess = () => {

                const db =
                    request.result;


                /*
                 * If another tab upgrades the DB,
                 * close this connection so the next
                 * open can reconnect safely.
                 */

                db.onversionchange =
                    () => {

                        db.close();

                        dbPromise = null;

                    };


                console.log(
                    "✅ SawariyaDB connected - Version " +
                    SAWARIYA_DB_VERSION
                );


                resolve(db);

            };



            /* =================================================
               ERROR
               ================================================= */

            request.onerror = () => {

                console.error(
                    "❌ SawariyaDB error:",
                    request.error
                );


                dbPromise = null;


                reject(
                    request.error
                );

            };



            /* =================================================
               BLOCKED
               ================================================= */

            request.onblocked = () => {

                console.warn(
                    "⚠️ SawariyaDB upgrade blocked. " +
                    "Please close other Sawariya tabs."
                );

            };

        }
    );


    return dbPromise;

}



/* =========================================================
   PUT / UPDATE
   ========================================================= */

function put(
    storeName,
    value
) {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    try {

                        const tx =
                            db.transaction(
                                storeName,
                                "readwrite"
                            );


                        const store =
                            tx.objectStore(
                                storeName
                            );


                        store.put(value);


                        tx.oncomplete =
                            () => {

                                resolve(
                                    value
                                );

                            };


                        tx.onerror =
                            () => {

                                reject(
                                    tx.error
                                );

                            };

                    } catch (error) {

                        reject(error);

                    }

                }
            );

        }
    );

}



/* =========================================================
   ADD
   ========================================================= */

function add(
    storeName,
    value
) {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    try {

                        const tx =
                            db.transaction(
                                storeName,
                                "readwrite"
                            );


                        const store =
                            tx.objectStore(
                                storeName
                            );


                        store.add(value);


                        tx.oncomplete =
                            () => {

                                resolve(
                                    value
                                );

                            };


                        tx.onerror =
                            () => {

                                reject(
                                    tx.error
                                );

                            };

                    } catch (error) {

                        reject(error);

                    }

                }
            );

        }
    );

}



/* =========================================================
   PUT MANY
   ========================================================= */

function putMany(
    storeName,
    values
) {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    try {

                        const tx =
                            db.transaction(
                                storeName,
                                "readwrite"
                            );


                        const store =
                            tx.objectStore(
                                storeName
                            );


                        values.forEach(
                            value => {

                                store.put(
                                    value
                                );

                            }
                        );


                        tx.oncomplete =
                            () => {

                                resolve(
                                    values
                                );

                            };


                        tx.onerror =
                            () => {

                                reject(
                                    tx.error
                                );

                            };

                    } catch (error) {

                        reject(error);

                    }

                }
            );

        }
    );

}



/* =========================================================
   GET
   ========================================================= */

function get(
    storeName,
    key
) {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    const tx =
                        db.transaction(
                            storeName,
                            "readonly"
                        );


                    const request =
                        tx.objectStore(
                            storeName
                        ).get(key);


                    request.onsuccess =
                        () => {

                            resolve(
                                request.result
                            );

                        };


                    request.onerror =
                        () => {

                            reject(
                                request.error
                            );

                        };

                }
            );

        }
    );

}



/* =========================================================
   GET ALL
   ========================================================= */

function getAll(
    storeName
) {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    const tx =
                        db.transaction(
                            storeName,
                            "readonly"
                        );


                    const request =
                        tx.objectStore(
                            storeName
                        ).getAll();


                    request.onsuccess =
                        () => {

                            resolve(
                                request.result || []
                            );

                        };


                    request.onerror =
                        () => {

                            reject(
                                request.error
                            );

                        };

                }
            );

        }
    );

}



/* =========================================================
   GET BY INDEX
   ========================================================= */

function getByIndex(
    storeName,
    indexName,
    value
) {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    try {

                        const tx =
                            db.transaction(
                                storeName,
                                "readonly"
                            );


                        const index =
                            tx.objectStore(
                                storeName
                            ).index(
                                indexName
                            );


                        const request =
                            index.getAll(
                                value
                            );


                        request.onsuccess =
                            () => {

                                resolve(
                                    request.result || []
                                );

                            };


                        request.onerror =
                            () => {

                                reject(
                                    request.error
                                );

                            };

                    } catch (error) {

                        reject(error);

                    }

                }
            );

        }
    );

}



/* =========================================================
   REMOVE
   ========================================================= */

function remove(
    storeName,
    key
) {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    const tx =
                        db.transaction(
                            storeName,
                            "readwrite"
                        );


                    tx.objectStore(
                        storeName
                    ).delete(key);


                    tx.oncomplete =
                        () => {

                            resolve(true);

                        };


                    tx.onerror =
                        () => {

                            reject(
                                tx.error
                            );

                        };

                }
            );

        }
    );

}



/* =========================================================
   CLEAR
   ========================================================= */

function clear(
    storeName
) {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    const tx =
                        db.transaction(
                            storeName,
                            "readwrite"
                        );


                    tx.objectStore(
                        storeName
                    ).clear();


                    tx.oncomplete =
                        () => {

                            resolve(true);

                        };


                    tx.onerror =
                        () => {

                            reject(
                                tx.error
                            );

                        };

                }
            );

        }
    );

}



/* =========================================================
   UPDATE
   ========================================================= */

function update(
    storeName,
    value
) {

    return put(
        storeName,
        value
    );

}



/* =========================================================
   SETTINGS
   ========================================================= */

function setSetting(
    key,
    value
) {

    return put(
        "settings",
        {
            key: key,
            value: value,
            updated_at:
                new Date().toISOString()
        }
    );

}



function getSetting(
    key
) {

    return get(
        "settings",
        key
    ).then(
        result => {

            return result
                ? result.value
                : null;

        }
    );

}



function removeSetting(
    key
) {

    return remove(
        "settings",
        key
    );

}



/* =========================================================
   STAFF
   ========================================================= */

function saveStaff(
    staff
) {

    return put(
        "staff",
        staff
    );

}



function getStaff(
    id
) {

    return get(
        "staff",
        id
    );

}



function getAllStaff() {

    return getAll(
        "staff"
    );

}



function deleteStaff(
    id
) {

    return remove(
        "staff",
        id
    );

}



/* =========================================================
   KHATABOOK CUSTOMER
   ========================================================= */

function saveKhatabookCustomer(
    customer
) {

    return put(
        "khatabook",
        customer
    );

}



function getKhatabookCustomer(
    id
) {

    return get(
        "khatabook",
        id
    );

}



function getAllKhatabookCustomers() {

    return getAll(
        "khatabook"
    );

}



function deleteKhatabookCustomer(
    id
) {

    return remove(
        "khatabook",
        id
    );

}



/* =========================================================
   KHATABOOK ENTRIES
   ========================================================= */

function saveKhatabookEntry(
    entry
) {

    return put(
        "khatabook_entries",
        entry
    );

}



function getKhatabookEntry(
    id
) {

    return get(
        "khatabook_entries",
        id
    );

}



function getAllKhatabookEntries() {

    return getAll(
        "khatabook_entries"
    );

}



function getKhatabookEntries(
    khatabookId
) {

    return getByIndex(
        "khatabook_entries",
        "khatabook_id",
        khatabookId
    );

}



function getCustomerKhatabookEntries(
    customerId
) {

    return getByIndex(
        "khatabook_entries",
        "customer_id",
        customerId
    );

}



function deleteKhatabookEntry(
    id
) {

    return remove(
        "khatabook_entries",
        id
    );

}



/* =========================================================
   SYNC QUEUE
   ========================================================= */

function addToSync(
    type,
    data
) {

    const localId =
        "sync_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .substring(2, 8);


    return put(
        "sync_queue",
        {

            local_id:
                localId,

            type:
                type,

            data:
                data,

            status:
                "pending",

            attempts:
                0,

            created_at:
                new Date().toISOString(),

            updated_at:
                new Date().toISOString()

        }
    );

}



/* =========================================================
   GET PENDING SYNC
   ========================================================= */

function getPendingSync() {

    return open().then(
        db => {

            return new Promise(
                (resolve, reject) => {

                    const tx =
                        db.transaction(
                            "sync_queue",
                            "readonly"
                        );


                    const index =
                        tx.objectStore(
                            "sync_queue"
                        ).index(
                            "status"
                        );


                    const request =
                        index.getAll(
                            "pending"
                        );


                    request.onsuccess =
                        () => {

                            const result =
                                request.result || [];


                            result.sort(
                                (
                                    a,
                                    b
                                ) => {

                                    return (
                                        new Date(
                                            a.created_at
                                        ) -
                                        new Date(
                                            b.created_at
                                        )
                                    );

                                }
                            );


                            resolve(
                                result
                            );

                        };


                    request.onerror =
                        () => {

                            reject(
                                request.error
                            );

                        };

                }
            );

        }
    );

}



/* =========================================================
   MARK SYNC PROCESSING
   ========================================================= */

function markSyncProcessing(
    localId
) {

    return get(
        "sync_queue",
        localId
    ).then(
        item => {

            if (!item) {
                return null;
            }


            item.status =
                "processing";


            item.attempts =
                Number(
                    item.attempts || 0
                ) + 1;


            item.updated_at =
                new Date().toISOString();


            return put(
                "sync_queue",
                item
            );

        }
    );

}



/* =========================================================
   MARK SYNC FAILED
   ========================================================= */

function markSyncFailed(
    localId,
    errorMessage
) {

    return get(
        "sync_queue",
        localId
    ).then(
        item => {

            if (!item) {
                return null;
            }


            item.status =
                "pending";


            item.last_error =
                String(
                    errorMessage || ""
                );


            item.updated_at =
                new Date().toISOString();


            return put(
                "sync_queue",
                item
            );

        }
    );

}



/* =========================================================
   REMOVE FROM SYNC
   ========================================================= */

function removeFromSync(
    localId
) {

    return remove(
        "sync_queue",
        localId
    );

}



/* =========================================================
   RESET PROCESSING ITEMS
   ========================================================= */

function resetProcessingSync() {

    return getByIndex(
        "sync_queue",
        "status",
        "processing"
    ).then(
        items => {

            if (!items.length) {
                return [];
            }


            items.forEach(
                item => {

                    item.status =
                        "pending";

                    item.updated_at =
                        new Date().toISOString();

                }
            );


            return putMany(
                "sync_queue",
                items
            );

        }
    );

}



/* =========================================================
   DATABASE STATUS
   ========================================================= */

function getDatabaseInfo() {

    return open().then(
        db => {

            return {

                name:
                    SAWARIYA_DB_NAME,

                version:
                    db.version,

                stores:
                    Array.from(
                        db.objectStoreNames
                    )

            };

        }
    );

}



/* =========================================================
   RETURN API
   ========================================================= */

return {

    /* Database */

    open,
    getDatabaseInfo,


    /* Basic */

    add,
    put,
    putMany,
    get,
    getAll,
    getByIndex,
    remove,
    clear,
    update,


    /* Settings */

    setSetting,
    getSetting,
    removeSetting,


    /* Staff */

    saveStaff,
    getStaff,
    getAllStaff,
    deleteStaff,


    /* Khatabook */

    saveKhatabookCustomer,
    getKhatabookCustomer,
    getAllKhatabookCustomers,
    deleteKhatabookCustomer,

    saveKhatabookEntry,
    getKhatabookEntry,
    getAllKhatabookEntries,
    getKhatabookEntries,
    getCustomerKhatabookEntries,
    deleteKhatabookEntry,


    /* Sync */

    addToSync,
    getPendingSync,
    markSyncProcessing,
    markSyncFailed,
    removeFromSync,
    resetProcessingSync

};

})();

/* =========================================================
GLOBAL
========================================================= */

window.SawariyaDB =
SawariyaDB;

/* =========================================================
DATABASE STARTUP
========================================================= */

SawariyaDB.open()
.then(
() => {

        console.log(
            "✅ Sawariya Offline Database ready"
        );

    }
)
.catch(
    error => {

        console.error(
            "❌ Sawariya Offline Database failed:",
            error
        );

    }
);