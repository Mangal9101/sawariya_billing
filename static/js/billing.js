/* =========================================================
   SAWARIYA BILLING SYSTEM
   BILLING JAVASCRIPT
   - Draft persistence
   - Product search
   - Stock-safe cart
   - Save + Print
   ========================================================= */

const BILL_DRAFT_KEY = "sawariya_billing_draft";

let cart = [];

const OFFLINE_BILLS_KEY = "sawariya_offline_bills_v1";
const LOCAL_PRODUCTS_KEY = "sawariya_products_v1";

function getLocalProducts() {
    try {
        const embedded = Array.isArray(window.SAWARIYA_PRODUCTS)
            ? window.SAWARIYA_PRODUCTS : [];
        if (embedded.length) {
            localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(embedded));
            return embedded;
        }
        return JSON.parse(localStorage.getItem(LOCAL_PRODUCTS_KEY) || "[]");
    } catch (_) {
        return [];
    }
}

function getOfflineBills() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_BILLS_KEY) || "[]"); }
    catch (_) { return []; }
}

function setOfflineBills(items) {
    localStorage.setItem(OFFLINE_BILLS_KEY, JSON.stringify(items));
}

function makeOfflineInvoiceNo() {
    return "OFF-" + new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 17) + "-" + Math.floor(Math.random() * 1000);
}

function openOfflineInvoice(payload) {
    const subtotal = payload.items.reduce((sum, x) => sum + Number(x.price || 0) * Number(x.quantity || 0), 0);
    const discount = Math.min(Number(payload.discount || 0), subtotal);
    const total = Math.max(0, subtotal - discount);
    const paid = Math.min(Math.max(0, Number(payload.paid || 0)), total);
    const due = total - paid;
    const rows = payload.items.map(x => `<tr><td>${esc(x.name)}</td><td>${x.quantity}</td><td>₹${Number(x.price).toFixed(2)}</td><td>₹${(Number(x.price)*Number(x.quantity)).toFixed(2)}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to print the offline bill."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(payload.invoice_no)}</title><style>body{font-family:Arial,sans-serif;padding:20px;max-width:760px;margin:auto}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.right{text-align:right}.total{font-size:20px;font-weight:bold;margin-top:15px}</style></head><body><h1>🍬 SAWARIYA CONFECTIONARY</h1><p><b>Invoice:</b> ${esc(payload.invoice_no)}<br><b>Date:</b> ${new Date().toLocaleString()}</p><p><b>Customer:</b> ${esc(payload.customer?.name || "Walk-in Customer")}<br><b>Mobile:</b> ${esc(payload.customer?.phone || "-")}</p><table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><p class="right">Subtotal: ₹${subtotal.toFixed(2)}<br>Discount: ₹${discount.toFixed(2)}<br><span class="total">Total: ₹${total.toFixed(2)}</span><br>Paid: ₹${paid.toFixed(2)}<br>Due: ₹${due.toFixed(2)}</p><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
}

async function syncOfflineBills() {
    const pending = getOfflineBills();
    if (!pending.length || !navigator.onLine) return;
    const remaining = [];
    for (const bill of pending) {
        try {
            const r = await fetch("/billing/save", {method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"}, body:JSON.stringify(bill)});
            if (!r.ok) { remaining.push(bill); continue; }
            const data = await r.json();
            console.log("Offline bill synced:", data.invoice_no);
        } catch (_) {
            remaining.push(bill);
        }
    }
    setOfflineBills(remaining);
    if (remaining.length === 0 && pending.length) {
        console.log("All offline bills synced.");
    }
}

const ps = document.getElementById("productSearch");
const sug = document.getElementById("suggestions");
const customerName = document.getElementById("customerName");
const customerPhone = document.getElementById("customerPhone");
const customerAddress = document.getElementById("customerAddress");
const discountInput = document.getElementById("discount");
const paymentInput = document.getElementById("payment");
const paidInput = document.getElementById("paid");

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[ch]));
}

function saveDraft() {
    try {
        localStorage.setItem(BILL_DRAFT_KEY, JSON.stringify({
            cart,
            customer: {
                name: customerName?.value || "",
                phone: customerPhone?.value || "",
                address: customerAddress?.value || ""
            },
            discount: discountInput?.value || "0",
            payment: paymentInput?.value || "Cash",
            paid: paidInput?.value || "0"
        }));
    } catch (error) {
        console.warn("Could not save billing draft:", error);
    }
}

function loadDraft() {
    try {
        const raw = localStorage.getItem(BILL_DRAFT_KEY);
        if (!raw) return;

        const draft = JSON.parse(raw);

        if (Array.isArray(draft.cart)) {
            cart = draft.cart.filter(x =>
                x &&
                Number(x.product_id) > 0 &&
                Number(x.quantity) > 0
            );
        }

        if (draft.customer) {
            if (customerName) customerName.value = draft.customer.name || "";
            if (customerPhone) customerPhone.value = draft.customer.phone || "";
            if (customerAddress) customerAddress.value = draft.customer.address || "";
        }

        if (discountInput && draft.discount !== undefined) {
            discountInput.value = draft.discount;
        }

        if (paymentInput && draft.payment) {
            paymentInput.value = draft.payment;
        }

        if (paidInput && draft.paid !== undefined) {
            paidInput.value = draft.paid;
        }

        render();
    } catch (error) {
        console.warn("Could not load billing draft:", error);
        localStorage.removeItem(BILL_DRAFT_KEY);
    }
}

function clearDraft() {
    localStorage.removeItem(BILL_DRAFT_KEY);
}

async function searchProducts() {
    if (!ps || !sug) return;
    const q = ps.value.trim().toLowerCase();
    if (!q) { sug.innerHTML = ""; return; }

    // Offline-first: use the last online product catalog immediately.
    let data = getLocalProducts().filter(p => String(p.name || "").toLowerCase().includes(q));

    if (navigator.onLine) {
        try {
            const r = await fetch("/api/products?q=" + encodeURIComponent(ps.value.trim()), { headers: {"Accept":"application/json"} });
            if (r.ok) {
                data = await r.json();
                localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(
                    getLocalProducts().map(p => data.find(x => Number(x.id) === Number(p.id)) || p)
                        .concat(data.filter(x => !getLocalProducts().some(p => Number(p.id) === Number(x.id))))
                ));
            }
        } catch (_) {}
    }

    sug.innerHTML = data.length ? data.map(p => {
        const stock = Number(p.stock) || 0;
        return `<button type="button" ${stock <= 0 ? "disabled" : ""} onclick='addProduct(${JSON.stringify(p).replace(/'/g, "&#039;")})'>${esc(p.name)} — Stock ${stock} — Wholesale ₹${Number(p.wholesale || 0).toFixed(2)}${stock <= 0 ? " — OUT OF STOCK" : ""}</button>`;
    }).join("") : `<div class="muted">No product found</div>`;
}
if (ps) {
    ps.addEventListener("input", searchProducts);
}

function addProduct(p) {
    const stock = Number(p.stock) || 0;

    if (stock <= 0) {
        alert("This product is out of stock.");
        return;
    }

    const id = Number(p.id);
    let x = cart.find(i => Number(i.product_id) === id);

    if (x) {
        x.stock = stock;
        x.price = Number(p.wholesale || 0);
        x.quantity = Math.min(Number(x.quantity || 1) + 1, stock);
    } else {
        cart.push({
            product_id: id,
            name: String(p.name || "Product"),
            quantity: 1,
            price: Number(p.wholesale || 0),
            stock
        });
    }

    if (ps) ps.value = "";
    if (sug) sug.innerHTML = "";

    render();
    saveDraft();
}

function render() {
    const body = document.getElementById("cart");
    if (!body) return;

    body.innerHTML = cart.map((x, i) => {
        const qty = Math.max(1, Number(x.quantity) || 1);
        const price = Number(x.price) || 0;
        return `
            <tr>
                <td>${esc(x.name)}</td>
                <td>
                    <input class="qty"
                        type="number"
                        min="1"
                        max="${Number(x.stock) || 1}"
                        value="${qty}"
                        onchange="setQty(${i}, this.value)">
                </td>
                <td>₹${price.toFixed(2)}</td>
                <td>₹${(price * qty).toFixed(2)}</td>
                <td class="delete-cell">
                    <button type="button"
                        class="delete-btn"
                        onclick="removeItem(${i})">✕</button>
                </td>
            </tr>`;
    }).join("");

    calc();
}

function setQty(i, value) {
    if (!cart[i]) return;

    const stock = Math.max(0, Number(cart[i].stock) || 0);
    let q = Math.max(1, parseInt(value, 10) || 1);

    if (stock <= 0) {
        cart.splice(i, 1);
    } else {
        cart[i].quantity = Math.min(q, stock);
    }

    render();
    saveDraft();
}

function removeItem(i) {
    cart.splice(i, 1);
    render();
    saveDraft();
}

function calc() {
    const sub = cart.reduce(
        (sum, x) => sum + (Number(x.price) || 0) * (Number(x.quantity) || 0),
        0
    );

    const dis = Math.max(0, parseFloat(discountInput?.value) || 0);
    const total = Math.max(0, sub - Math.min(dis, sub));

    const totalEl = document.getElementById("total");
    if (totalEl) totalEl.textContent = total.toFixed(2);

    return total;
}

if (discountInput) {
    discountInput.addEventListener("input", () => {
        calc();
        saveDraft();
    });
}

[customerName, customerPhone, customerAddress].forEach(el => {
    if (el) el.addEventListener("input", saveDraft);
});

if (paymentInput) {
    paymentInput.addEventListener("change", saveDraft);
}

if (paidInput) {
    paidInput.addEventListener("input", saveDraft);
}

async function saveBill() {
    if (!cart.length) {
        alert("Add at least one product.");
        return;
    }

    const total = calc();

    let paid = Math.max(0, parseFloat(paidInput?.value) || 0);
    if (paid > total) {
        paid = total;
        if (paidInput) paidInput.value = paid.toFixed(2);
    }

    const payload = {
        customer: {
            name: customerName?.value.trim() || "",
            phone: customerPhone?.value.trim() || "",
            address: customerAddress?.value.trim() || ""
        },
        items: cart.map(x => ({
            product_id: Number(x.product_id),
            quantity: Number(x.quantity),
            name: String(x.name || "Product"),
            price: Number(x.price || 0)
        })) ,
        discount: Math.max(0, parseFloat(discountInput?.value) || 0),
        payment_mode: paymentInput?.value || "Cash",
        paid
    };

    try {
        const r = await fetch("/billing/save", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(payload)
        });

        let data = {};
        try {
            data = await r.json();
        } catch (_) {}

        if (!r.ok) {
            if (r.status === 401) {
                window.location.href = "/login";
                return;
            }
            alert(data.error || "Could not save bill.");
            return;
        }

        clearDraft();

        // Save first, then open the printable invoice.
        if (data.invoice_id) {
            window.location.href = `/invoice/${data.invoice_id}`;
            return;
        }

        alert(
            `Bill ${data.invoice_no || ""} saved.\n\n` +
            `Total ₹${Number(data.total || 0).toFixed(2)}\n` +
            `Due ₹${Number(data.due || 0).toFixed(2)}`
        );

        cart = [];
        render();

    } catch (error) {
        console.warn("Offline billing mode:", error);
        const offlineBill = { ...payload, invoice_no: makeOfflineInvoiceNo() };
        const products = getLocalProducts();
        offlineBill.items.forEach(item => {
            const p = products.find(x => Number(x.id) === Number(item.product_id));
            if (p) p.stock = Math.max(0, Number(p.stock || 0) - Number(item.quantity || 0));
        });
        localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
        const pending = getOfflineBills();
        pending.push(offlineBill);
        setOfflineBills(pending);
        clearDraft();
        openOfflineInvoice(offlineBill);
        cart = [];
        render();
        alert("Bill offline save ho gaya hai. Internet aate hi server par sync ho jayega.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadDraft();
    getLocalProducts();
    syncOfflineBills();
});
window.addEventListener("online", syncOfflineBills);
