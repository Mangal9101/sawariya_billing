/* =========================================================
   SAWARIYA BILLING SYSTEM
   BILLING JAVASCRIPT
   OFFLINE + ONLINE
   - Draft persistence
   - Product search
   - IndexedDB offline product search
   - Online product refresh
   - Stock-safe cart
   - Save + Print
   ========================================================= */

const BILL_DRAFT_KEY = "sawariya_billing_draft";

let cart = [];
let productSearchTimer = null;

/* =========================================================
   ELEMENTS
   ========================================================= */

const ps = document.getElementById("productSearch");
const sug = document.getElementById("suggestions");

const customerName = document.getElementById("customerName");
const customerPhone = document.getElementById("customerPhone");
const customerAddress = document.getElementById("customerAddress");

const discountInput = document.getElementById("discount");
const paymentInput = document.getElementById("payment");
const paidInput = document.getElementById("paid");


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[ch]));
}


/* =========================================================
   NUMBER HELPERS
   ========================================================= */

function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}


/* =========================================================
   PRODUCT NORMALIZER
   Handles different product field names
   ========================================================= */

function normalizeProduct(p) {

    if (!p) return null;

    const id = num(
        p.id ??
        p.product_id,
        0
    );

    if (id <= 0) return null;

    const name = String(
        p.name ??
        p.product_name ??
        "Product"
    );

    const sku = String(
        p.sku ??
        ""
    );

    const stock = num(
        p.stock ??
        p.quantity ??
        p.qty ??
        0
    );

    const wholesale = num(
        p.wholesale ??
        p.wholesale_price ??
        p.price ??
        0
    );

    return {
        id,
        name,
        sku,
        stock,
        wholesale
    };
}


/* =========================================================
   SAVE BILLING DRAFT
   ========================================================= */

function saveDraft() {

    try {

        localStorage.setItem(
            BILL_DRAFT_KEY,
            JSON.stringify({

                cart,

                customer: {
                    name: customerName?.value || "",
                    phone: customerPhone?.value || "",
                    address: customerAddress?.value || ""
                },

                discount: discountInput?.value || "0",

                payment:
                    paymentInput?.value ||
                    "Cash",

                paid:
                    paidInput?.value ||
                    "0"
            })
        );

    } catch (error) {

        console.warn(
            "Could not save billing draft:",
            error
        );
    }
}


/* =========================================================
   LOAD BILLING DRAFT
   ========================================================= */

function loadDraft() {

    try {

        const raw =
            localStorage.getItem(
                BILL_DRAFT_KEY
            );

        if (!raw) return;

        const draft =
            JSON.parse(raw);

        if (Array.isArray(draft.cart)) {

            cart =
                draft.cart.filter(
                    x =>
                        x &&
                        Number(x.product_id) > 0 &&
                        Number(x.quantity) > 0
                );
        }

        if (draft.customer) {

            if (customerName)
                customerName.value =
                    draft.customer.name || "";

            if (customerPhone)
                customerPhone.value =
                    draft.customer.phone || "";

            if (customerAddress)
                customerAddress.value =
                    draft.customer.address || "";
        }

        if (
            discountInput &&
            draft.discount !== undefined
        ) {
            discountInput.value =
                draft.discount;
        }

        if (
            paymentInput &&
            draft.payment
        ) {
            paymentInput.value =
                draft.payment;
        }

        if (
            paidInput &&
            draft.paid !== undefined
        ) {
            paidInput.value =
                draft.paid;
        }

        render();

    } catch (error) {

        console.warn(
            "Could not load billing draft:",
            error
        );

        localStorage.removeItem(
            BILL_DRAFT_KEY
        );
    }
}


/* =========================================================
   CLEAR DRAFT
   ========================================================= */

function clearDraft() {

    try {

        localStorage.removeItem(
            BILL_DRAFT_KEY
        );

    } catch (error) {

        console.warn(
            "Could not clear billing draft:",
            error
        );
    }
}


/* =========================================================
   GET PRODUCTS FROM INDEXEDDB
   ========================================================= */

async function getOfflineProducts() {

    try {

        if (
            !window.SawariyaDB ||
            typeof SawariyaDB.getAll !== "function"
        ) {
            console.warn(
                "SawariyaDB is not available."
            );

            return [];
        }

        const products =
            await SawariyaDB.getAll(
                "products"
            );

        return products
            .map(normalizeProduct)
            .filter(Boolean);

    } catch (error) {

        console.error(
            "Offline product database error:",
            error
        );

        return [];
    }
}


/* =========================================================
   SEARCH PRODUCTS IN INDEXEDDB
   ========================================================= */

async function searchOfflineProducts(query) {

    const products =
        await getOfflineProducts();

    const q =
        String(query || "")
            .trim()
            .toLowerCase();

    if (!q) return products;

    return products.filter(product => {

        const name =
            product.name.toLowerCase();

        const sku =
            product.sku.toLowerCase();

        return (
            name.includes(q) ||
            sku.includes(q)
        );
    });
}


/* =========================================================
   SAVE ONLINE PRODUCTS INTO INDEXEDDB
   ========================================================= */

async function cacheOnlineProducts(products) {

    try {

        if (
            !window.SawariyaDB ||
            typeof SawariyaDB.putMany !== "function"
        ) {
            return;
        }

        const normalized =
            products
                .map(normalizeProduct)
                .filter(Boolean);

        if (!normalized.length) return;

        await SawariyaDB.putMany(
            "products",
            normalized.map(p => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                quantity: p.stock,
                stock: p.stock,
                wholesale: p.wholesale,
                wholesale_price: p.wholesale
            }))
        );

    } catch (error) {

        console.error(
            "Could not cache products:",
            error
        );
    }
}


/* =========================================================
   FETCH ONLINE PRODUCTS
   ========================================================= */

async function searchOnlineProducts(query) {

    const response =
        await fetch(
            "/api/products?q=" +
            encodeURIComponent(query),
            {
                method: "GET",

                headers: {
                    "Accept":
                        "application/json"
                },

                cache: "no-store"
            }
        );

    if (!response.ok) {

        if (
            response.status === 401
        ) {
            window.location.href =
                "/login";

            return [];
        }

        throw new Error(
            "Product search failed: " +
            response.status
        );
    }

    const data =
        await response.json();

    if (!Array.isArray(data))
        return [];

    const products =
        data
            .map(normalizeProduct)
            .filter(Boolean);

    /* Store latest products locally */
    await cacheOnlineProducts(
        products
    );

    return products;
}


/* =========================================================
   RENDER PRODUCT SUGGESTIONS
   ========================================================= */

function renderSuggestions(products) {

    if (!sug) return;

    if (!products.length) {

        sug.innerHTML =
            `<div class="muted">
                No product found
            </div>`;

        return;
    }

    sug.innerHTML =
        products
            .slice(0, 30)
            .map(product => {

                const stock =
                    num(product.stock);

                const price =
                    num(product.wholesale);

                const safeProduct =
                    JSON.stringify({
                        id: product.id,
                        name: product.name,
                        sku: product.sku,
                        stock,
                        wholesale: price
                    })
                    .replace(/'/g, "&#039;");

                return `
                    <button
                        type="button"
                        class="product-suggestion"
                        ${stock <= 0 ? "disabled" : ""}
                        onclick='addProduct(${safeProduct})'
                    >
                        <span>
                            <strong>
                                ${esc(product.name)}
                            </strong>

                            ${
                                product.sku
                                ? `<small>
                                    SKU: ${esc(product.sku)}
                                   </small>`
                                : ""
                            }
                        </span>

                        <span>
                            Stock ${stock}
                            — Wholesale ₹${price.toFixed(2)}

                            ${
                                stock <= 0
                                ? " — OUT OF STOCK"
                                : ""
                            }
                        </span>
                    </button>
                `;
            })
            .join("");
}


/* =========================================================
   PRODUCT SEARCH
   OFFLINE FIRST
   ONLINE REFRESH
   ========================================================= */

async function searchProducts() {

    if (!ps || !sug)
        return;

    const q =
        ps.value.trim();

    if (!q) {

        sug.innerHTML = "";

        return;
    }

    /*
     * IMPORTANT:
     * First search IndexedDB.
     * This makes product search work
     * even when completely offline.
     */

    try {

        const offlineResults =
            await searchOfflineProducts(q);

        if (offlineResults.length) {

            renderSuggestions(
                offlineResults
            );
        }

    } catch (error) {

        console.warn(
            "Offline search failed:",
            error
        );
    }


    /*
     * Then try server.
     * If internet is available,
     * latest stock/product information
     * will replace the local result.
     */

    try {

        const onlineResults =
            await searchOnlineProducts(q);

        if (onlineResults.length) {

            renderSuggestions(
                onlineResults
            );

        } else {

            /*
             * Only show "No product found"
             * if offline search also found nothing.
             */

            const localResults =
                await searchOfflineProducts(q);

            if (!localResults.length) {

                renderSuggestions([]);
            }
        }

    } catch (error) {

        /*
         * Internet unavailable.
         * Keep IndexedDB results visible.
         */

        console.log(
            "Offline mode: using local products."
        );

        const localResults =
            await searchOfflineProducts(q);

        renderSuggestions(
            localResults
        );
    }
}


/* =========================================================
   SEARCH EVENT
   Debounced to avoid excessive requests
   ========================================================= */

if (ps) {

    ps.addEventListener(
        "input",
        () => {

            clearTimeout(
                productSearchTimer
            );

            productSearchTimer =
                setTimeout(
                    searchProducts,
                    120
                );
        }
    );

    /*
     * Enter key:
     * prevent form submission while
     * selecting a product.
     */

    ps.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
            ) {
                event.preventDefault();
            }
        }
    );
}


/* =========================================================
   ADD PRODUCT
   ========================================================= */

function addProduct(p) {

    const product =
        normalizeProduct(p);

    if (!product) {

        alert(
            "Invalid product."
        );

        return;
    }

    const stock =
        num(product.stock);

    if (stock <= 0) {

        alert(
            "This product is out of stock."
        );

        return;
    }

    const id =
        num(product.id);

    let existing =
        cart.find(
            item =>
                num(item.product_id) === id
        );


    if (existing) {

        existing.stock =
            stock;

        existing.price =
            num(product.wholesale);

        existing.quantity =
            Math.min(
                num(existing.quantity, 1) + 1,
                stock
            );

    } else {

        cart.push({

            product_id: id,

            name:
                String(
                    product.name ||
                    "Product"
                ),

            quantity: 1,

            price:
                num(product.wholesale),

            stock
        });
    }


    if (ps)
        ps.value = "";

    if (sug)
        sug.innerHTML = "";


    render();

    saveDraft();
}


/* =========================================================
   RENDER CART
   ========================================================= */

function render() {

    const body =
        document.getElementById(
            "cart"
        );

    if (!body)
        return;


    body.innerHTML =
        cart.map((x, i) => {

            const qty =
                Math.max(
                    1,
                    num(x.quantity, 1)
                );

            const price =
                num(x.price);

            const stock =
                Math.max(
                    1,
                    num(x.stock)
                );


            return `
                <tr>

                    <td>
                        ${esc(x.name)}
                    </td>

                    <td>
                        <input
                            class="qty"
                            type="number"
                            min="1"
                            max="${stock}"
                            value="${qty}"
                            onchange="setQty(${i}, this.value)"
                        >
                    </td>

                    <td>
                        ₹${price.toFixed(2)}
                    </td>

                    <td>
                        ₹${(
                            price * qty
                        ).toFixed(2)}
                    </td>

                    <td class="delete-cell">

                        <button
                            type="button"
                            class="delete-btn"
                            onclick="removeItem(${i})"
                        >
                            ✕
                        </button>

                    </td>

                </tr>
            `;

        }).join("");


    calc();
}


/* =========================================================
   SET QUANTITY
   ========================================================= */

function setQty(i, value) {

    if (!cart[i])
        return;

    const stock =
        Math.max(
            0,
            num(cart[i].stock)
        );

    const q =
        Math.max(
            1,
            parseInt(value, 10) || 1
        );


    if (stock <= 0) {

        cart.splice(i, 1);

    } else {

        cart[i].quantity =
            Math.min(
                q,
                stock
            );
    }


    render();

    saveDraft();
}


/* =========================================================
   REMOVE ITEM
   ========================================================= */

function removeItem(i) {

    cart.splice(i, 1);

    render();

    saveDraft();
}


/* =========================================================
   CALCULATE TOTAL
   ========================================================= */

function calc() {

    const subtotal =
        cart.reduce(
            (sum, x) =>
                sum +
                (
                    num(x.price) *
                    num(x.quantity)
                ),
            0
        );


    const discount =
        Math.max(
            0,
            parseFloat(
                discountInput?.value
            ) || 0
        );


    const total =
        Math.max(
            0,
            subtotal -
            Math.min(
                discount,
                subtotal
            )
        );


    const totalEl =
        document.getElementById(
            "total"
        );

    if (totalEl) {

        totalEl.textContent =
            total.toFixed(2);
    }


    return total;
}


/* =========================================================
   INPUT EVENTS
   ========================================================= */

if (discountInput) {

    discountInput.addEventListener(
        "input",
        () => {

            calc();

            saveDraft();
        }
    );
}


[
    customerName,
    customerPhone,
    customerAddress
].forEach(el => {

    if (el) {

        el.addEventListener(
            "input",
            saveDraft
        );
    }
});


if (paymentInput) {

    paymentInput.addEventListener(
        "change",
        saveDraft
    );
}


if (paidInput) {

    paidInput.addEventListener(
        "input",
        saveDraft
    );
}


/* =========================================================
   SAVE BILL
   ========================================================= */

async function saveBill() {

    if (!cart.length) {

        alert(
            "Add at least one product."
        );

        return;
    }


    const total =
        calc();


    let paid =
        Math.max(
            0,
            parseFloat(
                paidInput?.value
            ) || 0
        );


    if (paid > total) {

        paid = total;

        if (paidInput) {

            paidInput.value =
                paid.toFixed(2);
        }
    }


    const payload = {

        customer: {

            name:
                customerName?.value.trim() ||
                "",

            phone:
                customerPhone?.value.trim() ||
                "",

            address:
                customerAddress?.value.trim() ||
                ""
        },

        items:
            cart.map(x => ({
                product_id:
                    num(x.product_id),

                quantity:
                    num(x.quantity)
            })),

        discount:
            Math.max(
                0,
                parseFloat(
                    discountInput?.value
                ) || 0
            ),

        payment_mode:
            paymentInput?.value ||
            "Cash",

        paid
    };


    try {

        const r =
            await fetch(
                "/billing/save",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );


        let data = {};

        try {

            data =
                await r.json();

        } catch (_) {}


        if (!r.ok) {

            if (
                r.status === 401
            ) {

                window.location.href =
                    "/login";

                return;
            }


            alert(
                data.error ||
                "Could not save bill."
            );

            return;
        }


        clearDraft();


        if (data.invoice_id) {

            window.location.href =
                `/invoice/${data.invoice_id}`;

            return;
        }


        alert(
            `Bill ${
                data.invoice_no || ""
            } saved.\n\n` +

            `Total ₹${
                num(data.total).toFixed(2)
            }\n` +

            `Due ₹${
                num(data.due).toFixed(2)
            }`
        );


        cart = [];

        render();

    } catch (error) {

        console.error(
            "Save bill error:",
            error
        );

        alert(
            "Could not connect to the billing server."
        );
    }
}


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        loadDraft();

        /*
         * Warm up IndexedDB.
         * This ensures database connection is
         * ready before the user starts searching.
         */

        try {

            if (
                window.SawariyaDB &&
                typeof SawariyaDB.open ===
                    "function"
            ) {

                await SawariyaDB.open();

                console.log(
                    "✅ Billing: offline database ready"
                );
            }

        } catch (error) {

            console.warn(
                "Billing offline database unavailable:",
                error
            );
        }
    }
);