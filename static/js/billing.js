/* =========================================================
   SAWARIYA BILLING SYSTEM
   BILLING JAVASCRIPT
   OFFLINE + ONLINE BILLING
   LOCAL PRODUCT SEARCH
   LOCAL BILL STORAGE
   SYNC QUEUE
   DRAFT PERSISTENCE
   ========================================================= */

const BILL_DRAFT_KEY = "sawariya_billing_draft";

let cart = [];


/* =========================================================
   ELEMENTS
   ========================================================= */

const ps =
    document.getElementById("productSearch");

const sug =
    document.getElementById("suggestions");

const customerName =
    document.getElementById("customerName");

const customerPhone =
    document.getElementById("customerPhone");

const customerAddress =
    document.getElementById("customerAddress");

const discountInput =
    document.getElementById("discount");

const paymentInput =
    document.getElementById("payment");

const paidInput =
    document.getElementById("paid");


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function esc(value) {

    return String(value ?? "")
        .replace(/[&<>"']/g, ch => ({

            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"

        }[ch]));

}


/* =========================================================
   NUMBER HELPER
   ========================================================= */

function num(value) {

    const n =
        Number(value);

    return Number.isFinite(n)
        ? n
        : 0;

}


/* =========================================================
   ONLINE STATUS
   ========================================================= */

function isOnline() {

    return navigator.onLine;

}


/* =========================================================
   CLIENT BILL ID
   ========================================================= */

function createClientBillId() {

    if (
        window.SawariyaDB &&
        typeof SawariyaDB.localId === "function"
    ) {

        return SawariyaDB.localId(
            "clientbill"
        );

    }


    return (
        "CB-" +
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .slice(2, 10)
            .toUpperCase()
    );

}


/* =========================================================
   DRAFT
   ========================================================= */

function saveDraft() {

    try {

        localStorage.setItem(

            BILL_DRAFT_KEY,

            JSON.stringify({

                cart,

                customer: {

                    name:
                        customerName?.value || "",

                    phone:
                        customerPhone?.value || "",

                    address:
                        customerAddress?.value || ""

                },

                discount:
                    discountInput?.value || "0",

                payment:
                    paymentInput?.value || "Cash",

                paid:
                    paidInput?.value || "0"

            })

        );

    }

    catch (error) {

        console.warn(
            "Could not save billing draft:",
            error
        );

    }

}


/* =========================================================
   LOAD DRAFT
   ========================================================= */

function loadDraft() {

    try {

        const raw =
            localStorage.getItem(
                BILL_DRAFT_KEY
            );


        if (!raw) {

            render();

            return;

        }


        const draft =
            JSON.parse(raw);


        if (
            Array.isArray(
                draft.cart
            )
        ) {

            cart =
                draft.cart.filter(
                    item =>

                        item &&

                        Number(
                            item.product_id
                        ) > 0 &&

                        Number(
                            item.quantity
                        ) > 0

                );

        }


        if (draft.customer) {

            if (customerName) {

                customerName.value =
                    draft.customer.name || "";

            }


            if (customerPhone) {

                customerPhone.value =
                    draft.customer.phone || "";

            }


            if (customerAddress) {

                customerAddress.value =
                    draft.customer.address || "";

            }

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

    }

    catch (error) {

        console.warn(
            "Could not load billing draft:",
            error
        );

        localStorage.removeItem(
            BILL_DRAFT_KEY
        );

        cart = [];

        render();

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

    }

    catch (_) {}

}


/* =========================================================
   LOCAL PRODUCT SEARCH
   ========================================================= */

async function searchLocalProducts(query) {

    if (
        !window.SawariyaDB
    ) {

        return [];

    }


    try {

        return await SawariyaDB
            .searchProducts(query);

    }

    catch (error) {

        console.warn(
            "Local product search failed:",
            error
        );

        return [];

    }

}


/* =========================================================
   SERVER PRODUCT SEARCH
   ========================================================= */

async function searchServerProducts(query) {

    const response =
        await fetch(
            "/api/products?q=" +
            encodeURIComponent(query),
            {
                headers: {
                    "Accept":
                        "application/json"
                }
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
            "Product search failed"
        );

    }


    return await response.json();

}


/* =========================================================
   MERGE PRODUCTS
   ========================================================= */

function mergeProducts(
    localProducts,
    serverProducts
) {

    const map =
        new Map();


    [
        ...(localProducts || []),
        ...(serverProducts || [])
    ]
    .forEach(product => {

        if (!product) {
            return;
        }


        const id =
            String(
                product.id ??
                product.product_id ??
                ""
            );


        if (!id) {
            return;
        }


        map.set(
            id,
            {
                ...map.get(id),
                ...product
            }
        );

    });


    return Array.from(
        map.values()
    );

}


/* =========================================================
   PRODUCT SEARCH
   ========================================================= */

async function searchProducts() {

    if (!ps || !sug) {
        return;
    }


    const q =
        ps.value
            .trim();


    if (!q) {

        sug.innerHTML = "";

        return;

    }


    let products = [];


    try {

        const localProducts =
            await searchLocalProducts(q);


        /*
         OFFLINE:
         IndexedDB hi source hai.
        */

        if (!isOnline()) {

            products =
                localProducts;

        }

        else {

            /*
             ONLINE:
             Server + local data combine.
            */

            try {

                const serverProducts =
                    await searchServerProducts(q);


                products =
                    mergeProducts(
                        localProducts,
                        serverProducts
                    );

            }

            catch (serverError) {

                console.warn(
                    "Server product search failed. Using local data.",
                    serverError
                );

                products =
                    localProducts;

            }

        }


        /*
         NORMALIZE
        */

        products =
            products.map(product => ({

                ...product,

                id:
                    Number(
                        product.id ??
                        product.product_id
                    ),

                name:
                    product.name ||
                    "Product",

                stock:
                    num(
                        product.stock ??
                        product.quantity
                    ),

                wholesale:
                    num(
                        product.wholesale ??
                        product.wholesale_price
                    )

            }))
            .filter(
                product =>
                    Number(product.id) > 0
            );


        /*
         RENDER SUGGESTIONS
        */

        if (!products.length) {

            sug.innerHTML =
                `<div class="muted">
                    No product found
                </div>`;

            return;

        }


        sug.innerHTML =
            products
                .map(product => {

                    const stock =
                        num(product.stock);


                    const safeProduct =
                        JSON.stringify(
                            product
                        )
                        .replace(
                            /'/g,
                            "&#039;"
                        );


                    return `

                        <button
                            type="button"
                            ${stock <= 0
                                ? "disabled"
                                : ""}
                            onclick='addProduct(${safeProduct})'
                        >

                            ${esc(
                                product.name
                            )}

                            — Stock ${stock}

                            — Wholesale ₹${num(
                                product.wholesale
                            ).toFixed(2)}

                            ${
                                stock <= 0
                                    ? " — OUT OF STOCK"
                                    : ""
                            }

                        </button>

                    `;

                })
                .join("");

    }

    catch (error) {

        console.error(
            "Product search error:",
            error
        );


        sug.innerHTML =
            `<div class="muted">
                No product available offline.
            </div>`;

    }

}


/* =========================================================
   SEARCH EVENT
   ========================================================= */

if (ps) {

    ps.addEventListener(
        "input",
        searchProducts
    );

}


/* =========================================================
   ADD PRODUCT
   ========================================================= */

function addProduct(product) {

    if (!product) {
        return;
    }


    const stock =
        num(
            product.stock ??
            product.quantity
        );


    if (stock <= 0) {

        alert(
            "This product is out of stock."
        );

        return;

    }


    const id =
        Number(
            product.id ??
            product.product_id
        );


    if (!id) {

        alert(
            "Invalid product."
        );

        return;

    }


    const price =
        num(
            product.wholesale ??
            product.wholesale_price
        );


    let existing =
        cart.find(
            item =>
                Number(
                    item.product_id
                ) === id
        );


    if (existing) {

        existing.stock =
            stock;

        existing.price =
            price;


        existing.quantity =
            Math.min(

                num(
                    existing.quantity
                ) + 1,

                stock

            );

    }

    else {

        cart.push({

            product_id:
                id,

            name:
                String(
                    product.name ||
                    "Product"
                ),

            quantity:
                1,

            price,

            stock

        });

    }


    if (ps) {
        ps.value = "";
    }


    if (sug) {
        sug.innerHTML = "";
    }


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


    if (!body) {
        return;
    }


    if (!cart.length) {

        body.innerHTML = "";

        calc();

        return;

    }


    body.innerHTML =
        cart.map(
            (item, index) => {

                const qty =
                    Math.max(
                        1,
                        parseInt(
                            item.quantity,
                            10
                        ) || 1
                    );


                const price =
                    num(item.price);


                const stock =
                    Math.max(
                        0,
                        num(item.stock)
                    );


                return `

                    <tr>

                        <td>
                            ${esc(
                                item.name
                            )}
                        </td>

                        <td>

                            <input
                                class="qty"
                                type="number"
                                min="1"
                                max="${stock || 1}"
                                value="${qty}"
                                onchange="setQty(${index}, this.value)"
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
                                onclick="removeItem(${index})"
                            >
                                ✕
                            </button>

                        </td>

                    </tr>

                `;

            }
        )
        .join("");


    calc();

}


/* =========================================================
   SET QUANTITY
   ========================================================= */

function setQty(
    index,
    value
) {

    if (!cart[index]) {
        return;
    }


    const stock =
        Math.max(
            0,
            num(
                cart[index].stock
            )
        );


    let quantity =
        parseInt(
            value,
            10
        );


    if (!Number.isFinite(quantity)) {
        quantity = 1;
    }


    quantity =
        Math.max(
            1,
            quantity
        );


    if (stock <= 0) {

        cart.splice(
            index,
            1
        );

    }

    else {

        cart[index].quantity =
            Math.min(
                quantity,
                stock
            );

    }


    render();

    saveDraft();

}


/* =========================================================
   REMOVE ITEM
   ========================================================= */

function removeItem(index) {

    if (
        index < 0 ||
        index >= cart.length
    ) {

        return;

    }


    cart.splice(
        index,
        1
    );


    render();

    saveDraft();

}


/* =========================================================
   CALCULATE
   ========================================================= */

function calc() {

    const subtotal =
        cart.reduce(
            (sum, item) =>

                sum +
                (
                    num(item.price) *
                    num(item.quantity)
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


    const appliedDiscount =
        Math.min(
            discount,
            subtotal
        );


    const total =
        Math.max(
            0,
            subtotal -
            appliedDiscount
        );


    const totalElement =
        document.getElementById(
            "total"
        );


    if (totalElement) {

        totalElement.textContent =
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
]
.forEach(element => {

    if (element) {

        element.addEventListener(
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
   CREATE LOCAL BILL
   ========================================================= */

async function saveOfflineBill(
    payload
) {

    if (!window.SawariyaDB) {

        throw new Error(
            "Offline database is not available."
        );

    }


    const clientBillId =
        createClientBillId();


    /*
     Calculate totals locally.
    */

    const subtotal =
        cart.reduce(
            (sum, item) =>

                sum +
                (
                    num(item.price) *
                    num(item.quantity)
                ),

            0
        );


    const discount =
        Math.max(
            0,
            Math.min(
                num(payload.discount),
                subtotal
            )
        );


    const total =
        Math.max(
            0,
            subtotal -
            discount
        );


    const paid =
        Math.min(
            Math.max(
                0,
                num(payload.paid)
            ),
            total
        );


    const due =
        Math.max(
            0,
            total -
            paid
        );


    /*
     LOCAL BILL
    */

    const bill = {

        local_id:
            SawariyaDB.localId(
                "bill"
            ),

        client_bill_id:
            clientBillId,

        invoice_no:
            "LOCAL-" +
            Date.now(),

        customer:
            payload.customer,

        customer_name:
            payload.customer.name,

        customer_phone:
            payload.customer.phone,

        customer_address:
            payload.customer.address,

        subtotal,

        discount,

        total,

        payment_mode:
            payload.payment_mode,

        paid,

        due,

        date:
            SawariyaDB.now(),

        created_at:
            SawariyaDB.now(),

        server_id:
            null,

        sync_status:
            "pending"

    };


    /*
     LOCAL BILL ITEMS
    */

    const items =
        cart.map(item => ({

            product_id:
                Number(
                    item.product_id
                ),

            product_name:
                String(
                    item.name
                ),

            quantity:
                num(
                    item.quantity
                ),

            price:
                num(
                    item.price
                ),

            amount:
                num(
                    item.price
                ) *
                num(
                    item.quantity
                )

        }));


    /*
     SAVE BILL
    */

    const result =
        await SawariyaDB.saveBill(
            bill,
            items
        );


    /*
     REDUCE LOCAL STOCK
    */

    for (
        const item of cart
    ) {

        const product =
            await SawariyaDB.findProduct(
                item.product_id
            );


        if (!product) {
            continue;
        }


        const currentStock =
            Math.max(
                0,
                num(
                    product.quantity
                )
            );


        product.quantity =
            Math.max(
                0,
                currentStock -
                num(item.quantity)
            );


        product.updated_at =
            SawariyaDB.now();


        product.sync_status =
            "pending";


        await SawariyaDB.put(
            "products",
            product
        );

    }


    /*
     ADD BILL TO SYNC QUEUE
    */

    await SawariyaDB.queueSync(

        "bill",

        "create",

        {

            client_bill_id:
                clientBillId,

            local_id:
                bill.local_id,

            customer:
                payload.customer,

            items,

            discount,

            payment_mode:
                payload.payment_mode,

            paid

        }

    );


    /*
     Store a local invoice marker.
    */

    return {

        ...result,

        bill:
            result.bill,

        items:
            result.items

    };

}


/* =========================================================
   SAVE BILL ONLINE
   ========================================================= */

async function saveBillOnline(
    payload
) {

    const response =
        await fetch(
            "/billing/save",
            {

                method:
                    "POST",

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
            await response.json();

    }

    catch (_) {}


    if (!response.ok) {

        if (
            response.status === 401
        ) {

            window.location.href =
                "/login";

            return null;

        }


        throw new Error(
            data.error ||
            "Could not save bill."
        );

    }


    return data;

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

        client_bill_id:
            createClientBillId(),

        customer: {

            name:
                customerName?.value
                    .trim() || "",

            phone:
                customerPhone?.value
                    .trim() || "",

            address:
                customerAddress?.value
                    .trim() || ""

        },

        items:

            cart.map(item => ({

                product_id:
                    Number(
                        item.product_id
                    ),

                quantity:
                    Number(
                        item.quantity
                    )

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


    /*
     BUTTON LOCK
    */

    const buttons =
        document.querySelectorAll(
            "button"
        );


    buttons.forEach(button => {

        if (
            button.getAttribute(
                "onclick"
            ) === "saveBill()"
        ) {

            button.disabled = true;

        }

    });


    try {

        /*
         ==============================================
         OFFLINE
         ==============================================
        */

        if (!isOnline()) {

            /*
             saveOfflineBill internally
             creates its own client ID.
            */

            const offlineResult =
                await saveOfflineBill(
                    payload
                );


            clearDraft();


            cart = [];


            render();


            /*
             Open local invoice.
            */

            openLocalInvoice(
                offlineResult.bill.local_id
            );


            return;

        }


        /*
         ==============================================
         ONLINE
         ==============================================
        */

        try {

            const data =
                await saveBillOnline(
                    payload
                );


            if (data) {

                clearDraft();

                cart = [];

                render();


                if (
                    data.invoice_id
                ) {

                    window.location.href =
                        `/invoice/${data.invoice_id}`;

                    return;

                }


                alert(

                    `Bill ${
                        data.invoice_no || ""
                    } saved.\n\n` +

                    `Total ₹${
                        num(
                            data.total
                        ).toFixed(2)
                    }\n` +

                    `Due ₹${
                        num(
                            data.due
                        ).toFixed(2)
                    }`

                );

            }

        }

        catch (onlineError) {

            /*
             Internet flag online ho sakta hai,
             lekin actual server unavailable ho.
             Isliye local save fallback.
            */

            console.warn(
                "Online save failed. Saving locally.",
                onlineError
            );


            const offlineResult =
                await saveOfflineBill(
                    payload
                );


            clearDraft();

            cart = [];

            render();


            alert(
                "Server unavailable.\n\n" +
                "Bill local device me save ho gaya hai.\n" +
                "Internet aate hi sync ho jayega."
            );


            openLocalInvoice(
                offlineResult.bill.local_id
            );

        }

    }

    catch (error) {

        console.error(
            "Save bill error:",
            error
        );


        alert(
            error?.message ||
            "Could not save bill."
        );

    }

    finally {

        buttons.forEach(button => {

            if (
                button.getAttribute(
                    "onclick"
                ) === "saveBill()"
            ) {

                button.disabled = false;

            }

        });

    }

}


/* =========================================================
   LOCAL INVOICE
   ========================================================= */

async function openLocalInvoice(
    localBillId
) {

    try {

        const bill =
            await SawariyaDB.get(
                "bills",
                localBillId
            );


        if (!bill) {

            alert(
                "Local invoice not found."
            );

            return;

        }


        const items =
            await SawariyaDB.getBillItems(
                localBillId
            );


        renderLocalInvoice(
            bill,
            items
        );

    }

    catch (error) {

        console.error(
            "Local invoice error:",
            error
        );

        alert(
            "Could not open local invoice."
        );

    }

}


/* =========================================================
   LOCAL INVOICE HTML
   ========================================================= */

function renderLocalInvoice(
    bill,
    items
) {

    const itemRows =
        items.map(item => `

            <tr>

                <td>
                    ${esc(
                        item.product_name
                    )}
                </td>

                <td>
                    ${num(
                        item.quantity
                    )}
                </td>

                <td>
                    ₹${num(
                        item.price
                    ).toFixed(2)}
                </td>

                <td>
                    ₹${num(
                        item.amount
                    ).toFixed(2)}
                </td>

            </tr>

        `).join("");


    const customer =
        bill.customer_name ||
        "Walk-in Customer";


    const html = `

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
                ${esc(
                    bill.invoice_no
                )}
            </title>

            <style>

                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background: #fff;
                    color: #222;
                }

                .invoice {
                    max-width: 800px;
                    margin: auto;
                }

                .head {
                    display: flex;
                    justify-content: space-between;
                    gap: 20px;
                    border-bottom: 2px solid #222;
                    padding-bottom: 15px;
                }

                .head h1 {
                    margin: 0 0 5px;
                }

                .meta {
                    text-align: right;
                }

                .customer {
                    padding: 15px 0;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                }

                th,
                td {
                    padding: 10px;
                    border-bottom: 1px solid #ddd;
                    text-align: left;
                }

                th:nth-child(n+2),
                td:nth-child(n+2) {
                    text-align: right;
                }

                .totals {
                    max-width: 320px;
                    margin: 20px 0 0 auto;
                    text-align: right;
                }

                .totals div {
                    padding: 4px;
                }

                .grand {
                    border-top: 2px solid #222;
                    margin-top: 5px;
                    padding-top: 8px !important;
                    font-size: 20px;
                }

                .thanks {
                    text-align: center;
                    margin-top: 30px;
                    font-weight: bold;
                }

                .actions {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    margin-top: 25px;
                }

                button,
                a {
                    padding: 11px 18px;
                    border: 0;
                    border-radius: 8px;
                    background: #7b3f18;
                    color: white;
                    text-decoration: none;
                    cursor: pointer;
                }

                @media print {

                    .actions {
                        display: none;
                    }

                    body {
                        padding: 0;
                    }

                }

                @media (max-width: 600px) {

                    body {
                        padding: 10px;
                    }

                    .head {
                        flex-direction: column;
                    }

                    .meta {
                        text-align: left;
                    }

                    table {
                        font-size: 13px;
                    }

                    th,
                    td {
                        padding: 7px 5px;
                    }

                }

            </style>

        </head>

        <body>

            <div class="invoice">

                <div class="head">

                    <div>

                        <h1>
                            SAWARIYA CONFECTIONARY
                        </h1>

                        <div>
                            Invoice / Bill
                        </div>

                    </div>

                    <div class="meta">

                        <b>
                            ${esc(
                                bill.invoice_no
                            )}
                        </b>

                        <br>

                        ${new Date(
                            bill.created_at ||
                            bill.date
                        ).toLocaleString(
                            "en-IN"
                        )}

                    </div>

                </div>


                <div class="customer">

                    <b>Customer:</b>
                    ${esc(customer)}

                    ${
                        bill.customer_phone
                            ? `
                                &nbsp; | &nbsp;
                                <b>Mobile:</b>
                                ${esc(
                                    bill.customer_phone
                                )}
                              `
                            : ""
                    }

                    ${
                        bill.customer_address
                            ? `
                                <br>
                                <b>Address:</b>
                                ${esc(
                                    bill.customer_address
                                )}
                              `
                            : ""
                    }

                </div>


                <table>

                    <thead>

                        <tr>

                            <th>Product</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th>Amount</th>

                        </tr>

                    </thead>

                    <tbody>

                        ${itemRows}

                    </tbody>

                </table>


                <div class="totals">

                    <div>
                        Subtotal:
                        <b>
                            ₹${num(
                                bill.subtotal
                            ).toFixed(2)}
                        </b>
                    </div>

                    <div>
                        Discount:
                        <b>
                            ₹${num(
                                bill.discount
                            ).toFixed(2)}
                        </b>
                    </div>

                    <div class="grand">
                        Total:
                        <b>
                            ₹${num(
                                bill.total
                            ).toFixed(2)}
                        </b>
                    </div>

                    <div>
                        Paid:
                        <b>
                            ₹${num(
                                bill.paid
                            ).toFixed(2)}
                        </b>
                    </div>

                    <div>
                        Due:
                        <b>
                            ₹${num(
                                bill.due
                            ).toFixed(2)}
                        </b>
                    </div>

                    <div>
                        Payment:
                        <b>
                            ${esc(
                                bill.payment_mode
                            )}
                        </b>
                    </div>

                </div>


                <p class="thanks">
                    Thank you! 🙏
                </p>


                <div class="actions">

                    <button
                        onclick="window.print()"
                    >
                        🖨️ Print Bill
                    </button>

                    <button
                        onclick="window.close()"
                    >
                        Close
                    </button>

                </div>

            </div>

        </body>

        </html>

    `;


    const invoiceWindow =
        window.open(
            "",
            "_blank"
        );


    if (!invoiceWindow) {

        alert(
            "Please allow pop-ups to print the invoice."
        );

        return;

    }


    invoiceWindow.document.open();

    invoiceWindow.document.write(
        html
    );

    invoiceWindow.document.close();

}


/* =========================================================
   EXPOSE FUNCTIONS
   ========================================================= */

window.saveBill =
    saveBill;

window.addProduct =
    addProduct;

window.setQty =
    setQty;

window.removeItem =
    removeItem;

window.calc =
    calc;


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadDraft();

        calc();

    }
);


/* =========================================================
   ONLINE EVENT
   ========================================================= */

window.addEventListener(
    "online",
    () => {

        console.log(
            "SAWARIYA: Internet connected."
        );


        /*
         Sync engine next layer handle karega.
         Agar sync.js available hai to trigger karo.
        */

        if (
            window.SawariyaSync &&
            typeof
                window.SawariyaSync.syncNow ===
                "function"
        ) {

            window.SawariyaSync
                .syncNow();

        }

    }
);