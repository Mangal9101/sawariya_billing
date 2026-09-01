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

    const q = ps.value.trim();

    if (!q) {
        sug.innerHTML = "";
        return;
    }

    try {
        const r = await fetch(
            "/api/products?q=" + encodeURIComponent(q),
            { headers: { "Accept": "application/json" } }
        );

        if (!r.ok) {
            if (r.status === 401) {
                window.location.href = "/login";
                return;
            }
            throw new Error("Product search failed");
        }

        const data = await r.json();

        sug.innerHTML = data.length
            ? data.map(p => {
                const stock = Number(p.stock) || 0;
                return `
                    <button type="button"
                        ${stock <= 0 ? "disabled" : ""}
                        onclick='addProduct(${JSON.stringify(p).replace(/'/g, "&#039;")})'>
                        ${esc(p.name)}
                        — Stock ${stock}
                        — Wholesale ₹${Number(p.wholesale || 0).toFixed(2)}
                        ${stock <= 0 ? " — OUT OF STOCK" : ""}
                    </button>`;
            }).join("")
            : `<div class="muted">No product found</div>`;
    } catch (error) {
        console.error("Product search error:", error);
        sug.innerHTML = `<div class="muted">Unable to search products. Is the local server running?</div>`;
    }
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
            quantity: Number(x.quantity)
        })),
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
        console.error("Save bill error:", error);
        alert(
            "Could not connect to the billing server.\n\n" +
            "For offline/local use, start the Sawariya server first."
        );
    }
}

document.addEventListener("DOMContentLoaded", loadDraft);
