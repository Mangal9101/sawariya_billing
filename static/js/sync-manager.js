// ============================================================
// SAWARIYA BILLING - SYNC MANAGER
// Complete Online + Offline Sync Manager
// ============================================================

(function () {
    "use strict";

    console.log("🔄 Sawariya Sync Manager loading...");

    // ============================================================
    // CONFIG
    // ============================================================

    const SYNC_INTERVAL = 15000;
    const MAX_RETRIES = 5;

    let syncRunning = false;
    let syncTimer = null;

    // ============================================================
    // COMMON HELPERS
    // ============================================================

    function isOnline() {
        return navigator.onLine === true;
    }

    function nowISO() {
        return new Date().toISOString();
    }

    function generateId(prefix) {
        return (
            prefix +
            "_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substring(2, 8)
        );
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return "";

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function number(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function showNotification(message) {
        const notification = document.getElementById("notification");

        if (notification) {
            notification.textContent = message;
            notification.style.display = "block";
            notification.className = "alert alert-info m-2";

            clearTimeout(notification._hideTimer);

            notification._hideTimer = setTimeout(() => {
                notification.style.display = "none";
            }, 4000);

            return;
        }

        console.log("🔔", message);

        const toast = document.createElement("div");

        toast.textContent = message;

        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 99999;
            font-size: 14px;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,.25);
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4000);
    }

    // ============================================================
    // DATABASE READY
    // ============================================================

    async function databaseReady() {
        if (!window.SawariyaDB) {
            console.error("❌ SawariyaDB not found");
            return false;
        }

        try {
            await SawariyaDB.open();
            return true;
        } catch (error) {
            console.error("❌ IndexedDB error:", error);
            return false;
        }
    }

    // ============================================================
    // SYNC QUEUE
    // ============================================================

    async function queueSync(type, action, data) {
        try {
            const payload = {
                type: type,
                action: action,
                data: data,
                created_at: nowISO(),
                status: "pending",
                retries: 0
            };

            await SawariyaDB.addToSync(payload);

            console.log("📦 Added to sync queue:", payload);

            return true;
        } catch (error) {
            console.error("❌ Failed to add sync queue:", error);
            return false;
        }
    }

    // ============================================================
    // SAFE FETCH
    // ============================================================

    async function apiFetch(url, options = {}) {
        if (!isOnline()) {
            throw new Error("OFFLINE");
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                ...(options.headers || {}),
                "Content-Type":
                    options.body && typeof options.body !== "string"
                        ? "application/json"
                        : (options.headers || {})["Content-Type"]
            }
        });

        return response;
    }

    // ============================================================
    // 1. PRODUCTS
    // ============================================================

    async function loadProducts() {
        await databaseReady();

        try {
            const response = await apiFetch("/api/products");

            if (response.ok) {
                const products = await response.json();

                if (Array.isArray(products)) {
                    for (const product of products) {
                        await SawariyaDB.put("products", product);
                    }

                    renderProductList(products);

                    return products;
                }
            }
        } catch (error) {
            console.log("📴 Offline - Loading products from IndexedDB");
        }

        const products = await SawariyaDB.getAll("products");

        renderProductList(products);

        return products;
    }

    async function addProduct(productData) {
        await databaseReady();

        try {
            const response = await apiFetch("/api/products", {
                method: "POST",
                body: JSON.stringify(productData)
            });

            if (response.ok) {
                const result = await response.json();

                await SawariyaDB.put("products", result);

                showNotification("✅ Product added online");

                await loadProducts();

                return result;
            }
        } catch (error) {
            console.log("📴 Offline - Saving product locally");
        }

        const localId = generateId("product");

        const offlineProduct = {
            ...productData,
            id: localId,
            local_id: localId,
            _offline: true,
            synced: false,
            created_at: nowISO(),
            updated_at: nowISO()
        };

        await SawariyaDB.put("products", offlineProduct);

        await queueSync(
            "product",
            "create",
            offlineProduct
        );

        showNotification("📴 Product saved offline");

        await loadProducts();

        return offlineProduct;
    }

    async function editProduct(id, productData) {
        await databaseReady();

        try {
            const response = await apiFetch(`/api/products/${id}`, {
                method: "PUT",
                body: JSON.stringify(productData)
            });

            if (response.ok) {
                const result = await response.json();

                await SawariyaDB.put("products", result);

                showNotification("✅ Product updated");

                await loadProducts();

                return result;
            }
        } catch (error) {
            console.log("📴 Offline - Updating product locally");
        }

        const existing = await SawariyaDB.get("products", id);

        if (!existing) {
            showNotification("❌ Product not found");
            return null;
        }

        const updated = {
            ...existing,
            ...productData,
            id: existing.id,
            local_id: existing.local_id || existing.id,
            _offline: true,
            synced: false,
            updated_at: nowISO()
        };

        await SawariyaDB.put("products", updated);

        await queueSync(
            "product",
            "update",
            updated
        );

        showNotification("📴 Product updated offline");

        await loadProducts();

        return updated;
    }

    async function deleteProduct(id) {
        await databaseReady();

        try {
            const response = await apiFetch(`/api/products/${id}`, {
                method: "DELETE"
            });

            if (response.ok) {
                await SawariyaDB.remove("products", id);

                showNotification("✅ Product deleted");

                await loadProducts();

                return true;
            }
        } catch (error) {
            console.log("📴 Offline - Deleting product locally");
        }

        const existing = await SawariyaDB.get("products", id);

        await SawariyaDB.remove("products", id);

        await queueSync(
            "product",
            "delete",
            {
                id: id,
                local_id: existing?.local_id || id,
                _delete: true
            }
        );

        showNotification("📴 Product deletion queued");

        await loadProducts();

        return true;
    }

    async function searchProducts(query) {
        await databaseReady();

        query = String(query || "").trim();

        if (!query) {
            return await SawariyaDB.getAll("products");
        }

        const lowerQuery = query.toLowerCase();

        /*
         * First use IndexedDB.
         * This is important for offline billing search.
         */

        const localProducts = await SawariyaDB.getAll("products");

        const localResults = localProducts.filter(product => {
            const name = String(product.name || "").toLowerCase();
            const sku = String(product.sku || "").toLowerCase();
            const barcode = String(product.barcode || "").toLowerCase();
            const id = String(product.id || "").toLowerCase();

            return (
                name.includes(lowerQuery) ||
                sku.includes(lowerQuery) ||
                barcode.includes(lowerQuery) ||
                id.includes(lowerQuery)
            );
        });

        /*
         * If local results exist, return them immediately.
         * This makes billing search fast and works offline.
         */

        if (localResults.length > 0 || !isOnline()) {
            return localResults;
        }

        /*
         * Online fallback.
         */

        try {
            const response = await apiFetch(
                `/api/products/search?q=${encodeURIComponent(query)}`
            );

            if (response.ok) {
                const products = await response.json();

                if (Array.isArray(products)) {
                    for (const product of products) {
                        await SawariyaDB.put("products", product);
                    }

                    return products;
                }
            }
        } catch (error) {
            console.log("📴 Product API search unavailable");
        }

        return [];
    }

    function renderProductList(products) {
        const tbody = document.getElementById("productTableBody");

        if (!tbody) return;

        if (!products || products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        No products found
                    </td>
                </tr>
            `;

            return;
        }

        tbody.innerHTML = "";

        products.forEach(product => {
            const tr = document.createElement("tr");

            const id = product.id || product.local_id || "";
            const name = escapeHtml(product.name || "");
            const price = number(
                product.wholesale_price ??
                product.price ??
                0
            );

            const stock = number(
                product.quantity ??
                product.stock ??
                0
            );

            const sku = escapeHtml(
                product.sku ||
                product.barcode ||
                ""
            );

            tr.innerHTML = `
                <td>${escapeHtml(id)}</td>
                <td>${name}</td>
                <td>₹${price.toFixed(2)}</td>
                <td>${stock}</td>
                <td>${sku}</td>
                <td>
                    <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        onclick="window.location.href='/products/edit/${encodeURIComponent(id)}'"
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        class="btn btn-sm btn-danger"
                        onclick="if(confirm('Delete product?')) window.deleteProduct('${String(id).replace(/'/g, "\\'")}')"
                    >
                        Delete
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });
    }

    // ============================================================
    // 2. CUSTOMERS
    // ============================================================

    async function loadCustomers() {
        await databaseReady();

        try {
            const response = await apiFetch("/api/customers");

            if (response.ok) {
                const customers = await response.json();

                if (Array.isArray(customers)) {
                    for (const customer of customers) {
                        await SawariyaDB.put("customers", customer);
                    }

                    renderCustomerList(customers);

                    return customers;
                }
            }
        } catch (error) {
            console.log("📴 Offline - Loading customers from IndexedDB");
        }

        const customers = await SawariyaDB.getAll("customers");

        renderCustomerList(customers);

        return customers;
    }

    async function addCustomer(customerData) {
        await databaseReady();

        try {
            const response = await apiFetch("/api/customers", {
                method: "POST",
                body: JSON.stringify(customerData)
            });

            if (response.ok) {
                const result = await response.json();

                await SawariyaDB.put("customers", result);

                showNotification("✅ Customer added");

                await loadCustomers();

                return result;
            }
        } catch (error) {
            console.log("📴 Offline - Saving customer locally");
        }

        const localId = generateId("customer");

        const offlineCustomer = {
            ...customerData,
            id: localId,
            local_id: localId,
            _offline: true,
            synced: false,
            created_at: nowISO(),
            updated_at: nowISO()
        };

        await SawariyaDB.put(
            "customers",
            offlineCustomer
        );

        await queueSync(
            "customer",
            "create",
            offlineCustomer
        );

        showNotification("📴 Customer saved offline");

        await loadCustomers();

        return offlineCustomer;
    }

    async function editCustomer(id, customerData) {
        await databaseReady();

        try {
            const response = await apiFetch(`/api/customers/${id}`, {
                method: "PUT",
                body: JSON.stringify(customerData)
            });

            if (response.ok) {
                const result = await response.json();

                await SawariyaDB.put(
                    "customers",
                    result
                );

                showNotification("✅ Customer updated");

                await loadCustomers();

                return result;
            }
        } catch (error) {
            console.log("📴 Offline - Updating customer locally");
        }

        const existing = await SawariyaDB.get(
            "customers",
            id
        );

        if (!existing) {
            showNotification("❌ Customer not found");
            return null;
        }

        const updated = {
            ...existing,
            ...customerData,
            id: existing.id,
            local_id: existing.local_id || existing.id,
            _offline: true,
            synced: false,
            updated_at: nowISO()
        };

        await SawariyaDB.put(
            "customers",
            updated
        );

        await queueSync(
            "customer",
            "update",
            updated
        );

        showNotification("📴 Customer updated offline");

        await loadCustomers();

        return updated;
    }

    async function deleteCustomer(id) {
        await databaseReady();

        try {
            const response = await apiFetch(
                `/api/customers/${id}`,
                {
                    method: "DELETE"
                }
            );

            if (response.ok) {
                await SawariyaDB.remove(
                    "customers",
                    id
                );

                showNotification("✅ Customer deleted");

                await loadCustomers();

                return true;
            }
        } catch (error) {
            console.log("📴 Offline - Deleting customer");
        }

        const existing = await SawariyaDB.get(
            "customers",
            id
        );

        await SawariyaDB.remove(
            "customers",
            id
        );

        await queueSync(
            "customer",
            "delete",
            {
                id: id,
                local_id: existing?.local_id || id,
                _delete: true
            }
        );

        showNotification("📴 Customer deletion queued");

        await loadCustomers();

        return true;
    }

    function renderCustomerList(customers) {
        const tbody = document.getElementById(
            "customerTableBody"
        );

        if (!tbody) return;

        if (!customers || customers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">
                        No customers found
                    </td>
                </tr>
            `;

            return;
        }

        tbody.innerHTML = "";

        customers.forEach(customer => {
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>${escapeHtml(customer.id || customer.local_id || "")}</td>
                <td>${escapeHtml(customer.name || "")}</td>
                <td>${escapeHtml(customer.phone || "")}</td>
                <td>${escapeHtml(customer.address || "")}</td>
                <td>${escapeHtml(customer.email || "")}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    // ============================================================
    // 3. BILLING
    // ============================================================

    async function updateLocalStock(items) {
        for (const item of items || []) {
            const productId =
                item.productId ??
                item.product_id ??
                item.id;

            const quantity =
                number(
                    item.quantity ??
                    item.qty ??
                    0
                );

            if (!productId || quantity <= 0) {
                continue;
            }

            const product = await SawariyaDB.get(
                "products",
                productId
            );

            if (!product) {
                continue;
            }

            if (product.quantity !== undefined) {
                product.quantity =
                    number(product.quantity) -
                    quantity;
            }

            if (product.stock !== undefined) {
                product.stock =
                    number(product.stock) -
                    quantity;
            }

            product.updated_at = nowISO();

            await SawariyaDB.put(
                "products",
                product
            );
        }
    }

    async function saveBill(billData) {
        await databaseReady();

        /*
         * Online save
         */

        try {
            const response = await apiFetch("/api/bills", {
                method: "POST",
                body: JSON.stringify(billData)
            });

            if (response.ok) {
                const result = await response.json();

                const localBill = {
                    ...result,
                    local_id:
                        result.local_id ||
                        generateId("bill"),

                    server_id:
                        result.id ||
                        result.server_id,

                    synced: true,
                    _offline: false
                };

                await SawariyaDB.put(
                    "bills",
                    localBill
                );

                await updateLocalStock(
                    billData.items || []
                );

                showNotification(
                    "✅ Bill saved online"
                );

                if (
                    typeof window.showInvoice ===
                    "function"
                ) {
                    window.showInvoice(result);
                }

                if (
                    typeof window.updateDashboard ===
                    "function"
                ) {
                    await window.updateDashboard();
                }

                return result;
            }
        } catch (error) {
            console.log(
                "📴 Offline - Saving bill locally"
            );
        }

        /*
         * Offline save
         */

        const localId = generateId("bill");

        const offlineBill = {
            ...billData,

            local_id: localId,

            server_id: null,

            _offline: true,

            synced: false,

            offlineDate: nowISO(),

            date:
                billData.date ||
                nowISO(),

            created_at:
                billData.created_at ||
                nowISO()
        };

        await SawariyaDB.put(
            "bills",
            offlineBill
        );

        await updateLocalStock(
            billData.items || []
        );

        await queueSync(
            "bill",
            "create",
            offlineBill
        );

        showNotification(
            "📴 Bill saved offline"
        );

        if (
            typeof window.showInvoice ===
            "function"
        ) {
            window.showInvoice(
                offlineBill
            );
        }

        if (
            typeof window.updateDashboard ===
            "function"
        ) {
            await window.updateDashboard();
        }

        return offlineBill;
    }

    // ============================================================
    // 4. DASHBOARD
    // ============================================================

    async function updateDashboard() {
        await databaseReady();

        try {
            const response =
                await apiFetch("/api/dashboard");

            if (response.ok) {
                const data =
                    await response.json();

                renderDashboard(data);

                return data;
            }
        } catch (error) {
            console.log(
                "📴 Offline - Dashboard from IndexedDB"
            );
        }

        const bills =
            await SawariyaDB.getAll("bills");

        const products =
            await SawariyaDB.getAll("products");

        const today =
            new Date()
                .toISOString()
                .split("T")[0];

        const todayBills =
            bills.filter(bill => {
                const date =
                    bill.date ||
                    bill.offlineDate ||
                    bill.created_at ||
                    "";

                return String(date)
                    .startsWith(today);
            });

        const todaySales =
            todayBills.reduce(
                (sum, bill) =>
                    sum +
                    number(
                        bill.total ??
                        bill.amount ??
                        0
                    ),
                0
            );

        const totalSales =
            bills.reduce(
                (sum, bill) =>
                    sum +
                    number(
                        bill.total ??
                        bill.amount ??
                        0
                    ),
                0
            );

        const lowStockProducts =
            products.filter(product => {
                const stock =
                    number(
                        product.quantity ??
                        product.stock ??
                        0
                    );

                const minimum =
                    number(
                        product.min_stock ??
                        product.minStock ??
                        5
                    );

                return stock <= minimum;
            });

        renderDashboard({
            total_bills: bills.length,
            total_sales: totalSales,
            today_sales: todaySales,
            today_bills: todayBills.length,
            low_stock:
                lowStockProducts.length,
            low_stock_products:
                lowStockProducts,
            total_products:
                products.length,
            total_stock:
                products.reduce(
                    (sum, product) =>
                        sum +
                        number(
                            product.quantity ??
                            product.stock ??
                            0
                        ),
                    0
                ),
            _offline: true
        });

        return null;
    }

    function renderDashboard(data) {
        const values = {
            totalBills:
                data.total_bills ??
                data.today_bills ??
                0,

            totalSales:
                "₹" +
                number(
                    data.total_sales
                ).toFixed(2),

            todaySales:
                "₹" +
                number(
                    data.today_sales
                ).toFixed(2),

            lowStock:
                data.low_stock ?? 0,

            totalProducts:
                data.total_products ?? 0,

            totalStock:
                data.total_stock ?? 0
        };

        Object.entries(values).forEach(
            ([id, value]) => {
                const element =
                    document.getElementById(id);

                if (element) {
                    element.textContent = value;
                }
            }
        );

        const offlineIndicator =
            document.getElementById(
                "offlineIndicator"
            );

        if (offlineIndicator) {
            if (data._offline) {
                offlineIndicator.textContent =
                    "📴 Offline Mode";

                offlineIndicator.style.display =
                    "block";
            } else {
                offlineIndicator.style.display =
                    "none";
            }
        }
    }

    // ============================================================
    // 5. REPORTS
    // ============================================================

    async function loadReports(date) {
        await databaseReady();

        if (!date) {
            const current =
                new Date();

            date =
                current
                    .toISOString()
                    .split("T")[0];
        }

        try {
            const response =
                await apiFetch(
                    `/api/reports?date=${encodeURIComponent(date)}`
                );

            if (response.ok) {
                const data =
                    await response.json();

                renderReports(data);

                return data;
            }
        } catch (error) {
            console.log(
                "📴 Offline - Reports from IndexedDB"
            );
        }

        const bills =
            await SawariyaDB.getAll("bills");

        const filtered =
            bills.filter(bill => {
                const billDate =
                    bill.date ||
                    bill.offlineDate ||
                    bill.created_at ||
                    "";

                return String(
                    billDate
                ).startsWith(date);
            });

        /*
         * Newest bills first.
         */

        filtered.sort(
            (a, b) => {
                const da = new Date(
                    a.date ||
                    a.offlineDate ||
                    a.created_at ||
                    0
                );

                const db = new Date(
                    b.date ||
                    b.offlineDate ||
                    b.created_at ||
                    0
                );

                return db - da;
            }
        );

        const total =
            filtered.reduce(
                (sum, bill) =>
                    sum +
                    number(
                        bill.total ??
                        bill.amount ??
                        0
                    ),
                0
            );

        renderReports({
            bills: filtered,
            total: total,
            count: filtered.length,
            _offline: true
        });

        return {
            bills: filtered,
            total: total,
            count: filtered.length,
            _offline: true
        };
    }

    function formatReportDate(value) {
        if (!value) return "";

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return String(value);
        }

        /*
         * Display local browser time.
         */

        const day =
            String(
                date.getDate()
            ).padStart(2, "0");

        const month =
            String(
                date.getMonth() + 1
            ).padStart(2, "0");

        const year =
            date.getFullYear();

        const hours =
            String(
                date.getHours()
            ).padStart(2, "0");

        const minutes =
            String(
                date.getMinutes()
            ).padStart(2, "0");

        return `${day}-${month}-${year} ${hours}:${minutes}`;
    }

    function renderReports(data) {
        const container =
            document.getElementById(
                "reportsContainer"
            );

        if (!container) return;

        const bills =
            Array.isArray(data.bills)
                ? data.bills
                : [];

        container.innerHTML = `
            <div class="card">

                <div class="card-header">
                    <h5>
                        ${
                            data._offline
                                ? "📴 Offline"
                                : "📊 Online"
                        }
                        Reports
                    </h5>
                </div>

                <div class="card-body">

                    ${
                        data._offline
                            ? `
                                <div class="alert alert-warning">
                                    ⚠️ Showing locally stored records
                                </div>
                              `
                            : ""
                    }

                    <p>
                        <strong>Total Bills:</strong>
                        ${number(data.count)}
                    </p>

                    <p>
                        <strong>Total Amount:</strong>
                        ₹${number(data.total).toFixed(2)}
                    </p>

                    <hr>

                    ${
                        bills.length
                            ? bills
                                  .map(bill => {
                                      const billId =
                                          bill.invoice_no ||
                                          bill.server_id ||
                                          bill.id ||
                                          bill.local_id ||
                                          "N/A";

                                      const amount =
                                          number(
                                              bill.total ??
                                              bill.amount ??
                                              0
                                          );

                                      const billDate =
                                          bill.created_at ||
                                          bill.date ||
                                          bill.offlineDate ||
                                          "";

                                      return `
                                        <div
                                            class="border-bottom p-2 d-flex justify-content-between align-items-center"
                                        >
                                            <span>
                                                <strong>
                                                    Bill #${escapeHtml(billId)}
                                                </strong>
                                            </span>

                                            <span>
                                                ₹${amount.toFixed(2)}
                                            </span>

                                            <small>
                                                ${escapeHtml(
                                                    formatReportDate(
                                                        billDate
                                                    )
                                                )}
                                            </small>
                                        </div>
                                      `;
                                  })
                                  .join("")
                            : `
                                <div class="text-center p-3">
                                    No bills found for this date.
                                </div>
                              `
                    }

                </div>
            </div>
        `;
    }

    // ============================================================
    // 6. STAFF
    // ============================================================

    async function loadStaff() {
        await databaseReady();

        /*
         * Always load local first.
         * This makes Staff page usable offline.
         */

        let localStaff =
            await SawariyaDB.getAll("staff");

        renderStaffList(localStaff);

        if (!isOnline()) {
            return localStaff;
        }

        try {
            const response =
                await apiFetch("/api/staff");

            if (response.ok) {
                const staff =
                    await response.json();

                if (Array.isArray(staff)) {
                    for (const member of staff) {
                        await SawariyaDB.saveStaff(
                            member
                        );
                    }

                    renderStaffList(staff);

                    return staff;
                }
            }
        } catch (error) {
            console.log(
                "📴 Staff API unavailable"
            );
        }

        return localStaff;
    }

    async function saveStaffMember(staffData) {
        await databaseReady();

        const existingId =
            staffData.id &&
            !String(
                staffData.id
            ).startsWith("staff_");

        /*
         * Do not try PUT with an offline temporary ID.
         */

        if (isOnline() && existingId) {
            try {
                const response =
                    await apiFetch(
                        `/api/staff/${encodeURIComponent(
                            staffData.id
                        )}`,
                        {
                            method: "PUT",
                            body: JSON.stringify(
                                staffData
                            )
                        }
                    );

                if (response.ok) {
                    const result =
                        await response.json();

                    await SawariyaDB.saveStaff(
                        result
                    );

                    showNotification(
                        "✅ Staff saved online"
                    );

                    return result;
                }
            } catch (error) {
                console.log(
                    "📴 Staff save failed - local save"
                );
            }
        }

        if (
            isOnline() &&
            !existingId
        ) {
            try {
                const response =
                    await apiFetch(
                        "/api/staff",
                        {
                            method: "POST",
                            body: JSON.stringify(
                                staffData
                            )
                        }
                    );

                if (response.ok) {
                    const result =
                        await response.json();

                    await SawariyaDB.saveStaff(
                        result
                    );

                    showNotification(
                        "✅ Staff added online"
                    );

                    return result;
                }
            } catch (error) {
                console.log(
                    "📴 Staff API unavailable"
                );
            }
        }

        const localId =
            staffData.id ||
            generateId("staff");

        const offlineStaff = {
            ...staffData,
            id: localId,
            local_id:
                staffData.local_id ||
                localId,
            _offline: true,
            synced: false,
            updated_at: nowISO()
        };

        await SawariyaDB.saveStaff(
            offlineStaff
        );

        await queueSync(
            "staff",
            existingId
                ? "update"
                : "create",
            offlineStaff
        );

        showNotification(
            "📴 Staff saved offline"
        );

        return offlineStaff;
    }

    async function deleteStaffMember(id) {
        await databaseReady();

        try {
            if (isOnline()) {
                const response =
                    await apiFetch(
                        `/api/staff/${encodeURIComponent(
                            id
                        )}`,
                        {
                            method: "DELETE"
                        }
                    );

                if (response.ok) {
                    await SawariyaDB.deleteStaff(
                        id
                    );

                    showNotification(
                        "✅ Staff deleted"
                    );

                    return true;
                }
            }
        } catch (error) {
            console.log(
                "📴 Staff delete offline"
            );
        }

        await SawariyaDB.deleteStaff(id);

        await queueSync(
            "staff",
            "delete",
            {
                id: id,
                _delete: true
            }
        );

        showNotification(
            "📴 Staff deletion queued"
        );

        return true;
    }

    function renderStaffList(staff) {
        const list =
            document.getElementById(
                "staffList"
            );

        const tbody =
            document.getElementById(
                "staffTableBody"
            );

        if (!list && !tbody) return;

        const target =
            tbody || list;

        if (!staff || staff.length === 0) {
            target.innerHTML = `
                <div class="text-center p-3">
                    No staff found
                </div>
            `;

            return;
        }

        if (tbody) {
            tbody.innerHTML = "";

            staff.forEach(member => {
                const tr =
                    document.createElement(
                        "tr"
                    );

                tr.innerHTML = `
                    <td>
                        ${escapeHtml(
                            member.name || ""
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            member.phone || ""
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            member.role || ""
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            member.status || "Active"
                        )}
                    </td>
                `;

                tbody.appendChild(tr);
            });

            return;
        }

        target.innerHTML =
            staff
                .map(member => `
                    <div class="border-bottom p-2">
                        <strong>
                            ${escapeHtml(
                                member.name || ""
                            )}
                        </strong>

                        <br>

                        <small>
                            ${escapeHtml(
                                member.phone || ""
                            )}
                        </small>

                        <br>

                        <small>
                            ${escapeHtml(
                                member.role || ""
                            )}
                        </small>
                    </div>
                `)
                .join("");
    }

    // ============================================================
    // 7. KHATABOOK
    // ============================================================

    async function loadKhatabook() {
        await databaseReady();

        let customers =
            await SawariyaDB
                .getAllKhatabookCustomers();

        renderKhatabookList(
            customers
        );

        if (!isOnline()) {
            return customers;
        }

        try {
            const response =
                await apiFetch(
                    "/api/khatabook"
                );

            if (response.ok) {
                const data =
                    await response.json();

                if (Array.isArray(data)) {
                    for (const customer of data) {
                        await SawariyaDB
                            .saveKhatabookCustomer(
                                customer
                            );
                    }

                    renderKhatabookList(
                        data
                    );

                    return data;
                }
            }
        } catch (error) {
            console.log(
                "📴 Khatabook API unavailable"
            );
        }

        return customers;
    }

    async function saveKhatabookCustomer(
        customerData
    ) {
        await databaseReady();

        const isRealId =
            customerData.id &&
            !String(
                customerData.id
            ).startsWith("khata_");

        if (isOnline()) {
            try {
                const url =
                    isRealId
                        ? `/api/khatabook/${encodeURIComponent(
                              customerData.id
                          )}`
                        : "/api/khatabook";

                const response =
                    await apiFetch(
                        url,
                        {
                            method:
                                isRealId
                                    ? "PUT"
                                    : "POST",

                            body: JSON.stringify(
                                customerData
                            )
                        }
                    );

                if (response.ok) {
                    const result =
                        await response.json();

                    await SawariyaDB
                        .saveKhatabookCustomer(
                            result
                        );

                    showNotification(
                        "✅ Khata customer saved"
                    );

                    return result;
                }
            } catch (error) {
                console.log(
                    "📴 Khata customer API unavailable"
                );
            }
        }

        const localId =
            customerData.id ||
            generateId("khata");

        const offlineCustomer = {
            ...customerData,

            id: localId,

            local_id:
                customerData.local_id ||
                localId,

            _offline: true,

            synced: false,

            updated_at: nowISO()
        };

        await SawariyaDB
            .saveKhatabookCustomer(
                offlineCustomer
            );

        await queueSync(
            "khatabook_customer",
            isRealId
                ? "update"
                : "create",
            offlineCustomer
        );

        showNotification(
            "📴 Khata customer saved offline"
        );

        return offlineCustomer;
    }

    async function deleteKhatabookCustomer(
        id
    ) {
        await databaseReady();

        try {
            if (isOnline()) {
                const response =
                    await apiFetch(
                        `/api/khatabook/${encodeURIComponent(
                            id
                        )}`,
                        {
                            method: "DELETE"
                        }
                    );

                if (response.ok) {
                    await SawariyaDB
                        .deleteKhatabookCustomer(
                            id
                        );

                    showNotification(
                        "✅ Khata customer deleted"
                    );

                    return true;
                }
            }
        } catch (error) {
            console.log(
                "📴 Khata delete offline"
            );
        }

        await SawariyaDB
            .deleteKhatabookCustomer(
                id
            );

        await queueSync(
            "khatabook_customer",
            "delete",
            {
                id: id,
                _delete: true
            }
        );

        showNotification(
            "📴 Khata deletion queued"
        );

        return true;
    }

    async function addKhatabookEntry(
        entryData
    ) {
        await databaseReady();

        const localId =
            entryData.id ||
            generateId("khata_entry");

        const entry = {
            ...entryData,

            id: localId,

            local_id:
                entryData.local_id ||
                localId,

            date:
                entryData.date ||
                nowISO(),

            created_at:
                entryData.created_at ||
                nowISO(),

            _offline: !isOnline(),

            synced: false,

            sync_status:
                "pending"
        };

        /*
         * Try online first.
         */

        if (isOnline()) {
            try {
                const response =
                    await apiFetch(
                        "/api/khatabook/entries",
                        {
                            method: "POST",
                            body: JSON.stringify(
                                entryData
                            )
                        }
                    );

                if (response.ok) {
                    const result =
                        await response.json();

                    result.sync_status =
                        "synced";

                    result.synced = true;

                    await SawariyaDB
                        .saveKhatabookEntry(
                            result
                        );

                    showNotification(
                        "✅ Khata entry saved"
                    );

                    return result;
                }
            } catch (error) {
                console.log(
                    "📴 Khata entry API unavailable"
                );
            }
        }

        /*
         * Offline save.
         */

        await SawariyaDB
            .saveKhatabookEntry(
                entry
            );

        await queueSync(
            "khatabook_entry",
            "create",
            entry
        );

        showNotification(
            "📴 Khata entry saved offline"
        );

        return entry;
    }

    async function loadKhatabookEntries(
        customerId
    ) {
        await databaseReady();

        let entries =
            await SawariyaDB
                .getCustomerKhatabookEntries(
                    customerId
                );

        if (
            !isOnline()
        ) {
            return entries;
        }

        try {
            const response =
                await apiFetch(
                    `/api/khatabook/entries/${encodeURIComponent(
                        customerId
                    )}`
                );

            if (response.ok) {
                const onlineEntries =
                    await response.json();

                if (
                    Array.isArray(
                        onlineEntries
                    )
                ) {
                    for (
                        const entry
                        of onlineEntries
                    ) {
                        await SawariyaDB
                            .saveKhatabookEntry(
                                entry
                            );
                    }

                    entries =
                        onlineEntries;
                }
            }
        } catch (error) {
            console.log(
                "📴 Loading local khata entries"
            );
        }

        return entries;
    }

    function renderKhatabookList(
        customers
    ) {
        const list =
            document.getElementById(
                "khatabookList"
            ) ||
            document.getElementById(
                "khataCustomerList"
            );

        if (!list) return;

        if (
            !customers ||
            customers.length === 0
        ) {
            list.innerHTML = `
                <div class="text-center p-3">
                    No customers found
                </div>
            `;

            return;
        }

        list.innerHTML =
            customers
                .map(customer => `
                    <div
                        class="khatabook-customer-item border-bottom p-3"
                        data-id="${escapeHtml(
                            customer.id || ""
                        )}"
                    >
                        <strong>
                            ${escapeHtml(
                                customer.name || ""
                            )}
                        </strong>

                        <div>
                            ${escapeHtml(
                                customer.phone || ""
                            )}
                        </div>

                        ${
                            customer.address
                                ? `
                                    <small>
                                        ${escapeHtml(
                                            customer.address
                                        )}
                                    </small>
                                  `
                                : ""
                        }
                    </div>
                `)
                .join("");
    }

    // ============================================================
    // 8. SYNC ONE QUEUE ITEM
    // ============================================================

    async function syncQueueItem(item) {
        if (!item) return true;

        const type =
            item.type ||
            item.entity ||
            item.data?.type;

        const action =
            item.action ||
            item.operation ||
            item.data?.action;

        const data =
            item.data ||
            item.payload ||
            item;

        /*
         * Product
         */

        if (type === "product") {
            let response;

            if (action === "create") {
                response =
                    await apiFetch(
                        "/api/products",
                        {
                            method: "POST",
                            body: JSON.stringify(
                                cleanSyncData(
                                    data
                                )
                            )
                        }
                    );
            }

            if (action === "update") {
                /*
                 * Offline temporary products cannot be PUT.
                 * Create them instead.
                 */

                const isTemporary =
                    String(
                        data.id || ""
                    ).startsWith(
                        "product_"
                    ) ||
                    String(
                        data.local_id || ""
                    ).startsWith(
                        "product_"
                    );

                if (isTemporary) {
                    response =
                        await apiFetch(
                            "/api/products",
                            {
                                method: "POST",
                                body: JSON.stringify(
                                    cleanSyncData(
                                        data
                                    )
                                )
                            }
                        );
                } else {
                    response =
                        await apiFetch(
                            `/api/products/${encodeURIComponent(
                                data.id
                            )}`,
                            {
                                method: "PUT",
                                body: JSON.stringify(
                                    cleanSyncData(
                                        data
                                    )
                                )
                            }
                        );
                }
            }

            if (action === "delete") {
                response =
                    await apiFetch(
                        `/api/products/${encodeURIComponent(
                            data.id
                        )}`,
                        {
                            method: "DELETE"
                        }
                    );
            }

            if (!response) {
                return true;
            }

            if (!response.ok) {
                throw new Error(
                    `Product sync failed: ${response.status}`
                );
            }

            if (
                action !== "delete"
            ) {
                const result =
                    await response.json();

                /*
                 * Remove local temporary record
                 */

                if (
                    data.local_id &&
                    data.local_id !== result.id
                ) {
                    try {
                        await SawariyaDB.remove(
                            "products",
                            data.local_id
                        );
                    } catch (e) {}
                }

                await SawariyaDB.put(
                    "products",
                    {
                        ...result,
                        synced: true,
                        _offline: false
                    }
                );
            } else {
                await SawariyaDB.remove(
                    "products",
                    data.id
                );
            }

            return true;
        }

        /*
         * Customer
         */

        if (type === "customer") {
            let response;

            if (action === "create") {
                response =
                    await apiFetch(
                        "/api/customers",
                        {
                            method: "POST",
                            body: JSON.stringify(
                                cleanSyncData(
                                    data
                                )
                            )
                        }
                    );
            }

            if (action === "update") {
                const isTemporary =
                    String(
                        data.id || ""
                    ).startsWith(
                        "customer_"
                    );

                response =
                    await apiFetch(
                        isTemporary
                            ? "/api/customers"
                            : `/api/customers/${encodeURIComponent(
                                  data.id
                              )}`,
                        {
                            method:
                                isTemporary
                                    ? "POST"
                                    : "PUT",

                            body: JSON.stringify(
                                cleanSyncData(
                                    data
                                )
                            )
                        }
                    );
            }

            if (action === "delete") {
                response =
                    await apiFetch(
                        `/api/customers/${encodeURIComponent(
                            data.id
                        )}`,
                        {
                            method: "DELETE"
                        }
                    );
            }

            if (!response) {
                return true;
            }

            if (!response.ok) {
                throw new Error(
                    `Customer sync failed: ${response.status}`
                );
            }

            if (
                action !== "delete"
            ) {
                const result =
                    await response.json();

                if (
                    data.local_id &&
                    data.local_id !== result.id
                ) {
                    try {
                        await SawariyaDB.remove(
                            "customers",
                            data.local_id
                        );
                    } catch (e) {}
                }

                await SawariyaDB.put(
                    "customers",
                    {
                        ...result,
                        synced: true,
                        _offline: false
                    }
                );
            } else {
                await SawariyaDB.remove(
                    "customers",
                    data.id
                );
            }

            return true;
        }

        /*
         * Bill
         */

        if (type === "bill") {
            if (
                action !== "create"
            ) {
                return true;
            }

            const response =
                await apiFetch(
                    "/api/bills",
                    {
                        method: "POST",
                        body: JSON.stringify(
                            cleanSyncData(
                                data
                            )
                        )
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `Bill sync failed: ${response.status}`
                );
            }

            const result =
                await response.json();

            /*
             * Keep server ID and local ID.
             */

            const syncedBill = {
                ...result,

                local_id:
                    data.local_id ||
                    data.id,

                server_id:
                    result.id ||
                    result.server_id,

                synced: true,

                _offline: false
            };

            /*
             * Delete old temporary IndexedDB bill
             * if the key was local_id.
             */

            if (
                data.local_id
            ) {
                try {
                    await SawariyaDB.remove(
                        "bills",
                        data.local_id
                    );
                } catch (e) {}
            }

            await SawariyaDB.put(
                "bills",
                syncedBill
            );

            return true;
        }

        /*
         * Staff
         */

        if (type === "staff") {
            let response;

            const temporary =
                String(
                    data.id || ""
                ).startsWith(
                    "staff_"
                );

            if (
                action === "create"
            ) {
                response =
                    await apiFetch(
                        "/api/staff",
                        {
                            method: "POST",
                            body: JSON.stringify(
                                cleanSyncData(
                                    data
                                )
                            )
                        }
                    );
            }

            if (
                action === "update"
            ) {
                response =
                    await apiFetch(
                        temporary
                            ? "/api/staff"
                            : `/api/staff/${encodeURIComponent(
                                  data.id
                              )}`,
                        {
                            method:
                                temporary
                                    ? "POST"
                                    : "PUT",

                            body: JSON.stringify(
                                cleanSyncData(
                                    data
                                )
                            )
                        }
                    );
            }

            if (
                action === "delete"
            ) {
                response =
                    await apiFetch(
                        `/api/staff/${encodeURIComponent(
                            data.id
                        )}`,
                        {
                            method: "DELETE"
                        }
                    );
            }

            if (!response) {
                return true;
            }

            if (!response.ok) {
                throw new Error(
                    `Staff sync failed: ${response.status}`
                );
            }

            if (
                action !== "delete"
            ) {
                const result =
                    await response.json();

                if (
                    data.local_id &&
                    data.local_id !== result.id
                ) {
                    try {
                        await SawariyaDB.deleteStaff(
                            data.local_id
                        );
                    } catch (e) {}
                }

                await SawariyaDB.saveStaff(
                    {
                        ...result,
                        synced: true,
                        _offline: false
                    }
                );
            } else {
                await SawariyaDB.deleteStaff(
                    data.id
                );
            }

            return true;
        }

        /*
         * Khatabook customer
         */

        if (
            type === "khatabook_customer"
        ) {
            let response;

            const temporary =
                String(
                    data.id || ""
                ).startsWith(
                    "khata_"
                );

            if (
                action === "create"
            ) {
                response =
                    await apiFetch(
                        "/api/khatabook",
                        {
                            method: "POST",
                            body: JSON.stringify(
                                cleanSyncData(
                                    data
                                )
                            )
                        }
                    );
            }

            if (
                action === "update"
            ) {
                response =
                    await apiFetch(
                        temporary
                            ? "/api/khatabook"
                            : `/api/khatabook/${encodeURIComponent(
                                  data.id
                              )}`,
                        {
                            method:
                                temporary
                                    ? "POST"
                                    : "PUT",

                            body: JSON.stringify(
                                cleanSyncData(
                                    data
                                )
                            )
                        }
                    );
            }

            if (
                action === "delete"
            ) {
                response =
                    await apiFetch(
                        `/api/khatabook/${encodeURIComponent(
                            data.id
                        )}`,
                        {
                            method: "DELETE"
                        }
                    );
            }

            if (!response) {
                return true;
            }

            if (!response.ok) {
                throw new Error(
                    `Khatabook sync failed: ${response.status}`
                );
            }

            if (
                action !== "delete"
            ) {
                const result =
                    await response.json();

                if (
                    data.local_id &&
                    data.local_id !== result.id
                ) {
                    try {
                        await SawariyaDB
                            .deleteKhatabookCustomer(
                                data.local_id
                            );
                    } catch (e) {}
                }

                await SawariyaDB
                    .saveKhatabookCustomer(
                        {
                            ...result,
                            synced: true,
                            _offline: false
                        }
                    );
            } else {
                await SawariyaDB
                    .deleteKhatabookCustomer(
                        data.id
                    );
            }

            return true;
        }

        /*
         * Khatabook Entry
         */

        if (
            type === "khatabook_entry"
        ) {
            if (
                action !== "create"
            ) {
                return true;
            }

            const response =
                await apiFetch(
                    "/api/khatabook/entries",
                    {
                        method: "POST",
                        body: JSON.stringify(
                            cleanSyncData(
                                data
                            )
                        )
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `Khatabook entry sync failed: ${response.status}`
                );
            }

            const result =
                await response.json();

            if (
                data.local_id &&
                data.local_id !== result.id
            ) {
                try {
                    await SawariyaDB
                        .deleteKhatabookEntry(
                            data.local_id
                        );
                } catch (e) {}
            }

            await SawariyaDB
                .saveKhatabookEntry(
                    {
                        ...result,
                        synced: true,
                        _offline: false,
                        sync_status: "synced"
                    }
                );

            return true;
        }

        /*
         * Unknown item:
         * don't keep retrying forever.
         */

        console.warn(
            "⚠️ Unknown sync type:",
            type
        );

        return true;
    }

    // ============================================================
    // REMOVE INTERNAL SYNC FIELDS BEFORE API REQUEST
    // ============================================================

    function cleanSyncData(data) {
        const clean = {
            ...(data || {})
        };

        delete clean._offline;
        delete clean.synced;
        delete clean.sync_status;
        delete clean.retries;
        delete clean.created_at;
        delete clean.updated_at;

        /*
         * local_id is useful only inside IndexedDB.
         */

        delete clean.local_id;

        return clean;
    }

    // ============================================================
    // PROCESS SYNC QUEUE
    // ============================================================

    async function syncPendingData() {
        if (!isOnline()) {
            return;
        }

        if (syncRunning) {
            return;
        }

        syncRunning = true;

        try {
            await databaseReady();

            const pending =
                await SawariyaDB
                    .getPendingSync();

            if (
                !pending ||
                pending.length === 0
            ) {
                return;
            }

            console.log(
                `🔄 Syncing ${pending.length} pending item(s)...`
            );

            for (
                const item
                of pending
            ) {
                if (!isOnline()) {
                    break;
                }

                try {
                    if (
                        SawariyaDB.markSyncProcessing
                    ) {
                        await SawariyaDB
                            .markSyncProcessing(
                                item.id
                            );
                    }

                    await syncQueueItem(
                        item
                    );

                    if (
                        SawariyaDB.removeFromSync
                    ) {
                        await SawariyaDB
                            .removeFromSync(
                                item.id
                            );
                    }

                    console.log(
                        "✅ Synced:",
                        item
                    );
                } catch (error) {
                    console.error(
                        "❌ Sync failed:",
                        error
                    );

                    const retries =
                        number(
                            item.retries
                        ) + 1;

                    if (
                        retries >=
                        MAX_RETRIES
                    ) {
                        console.error(
                            "❌ Maximum retries reached:",
                            item
                        );

                        if (
                            SawariyaDB.markSyncFailed
                        ) {
                            await SawariyaDB
                                .markSyncFailed(
                                    item.id,
                                    error.message
                                );
                        }
                    } else {
                        /*
                         * Put it back into pending state.
                         */

                        try {
                            await SawariyaDB.put(
                                "sync_queue",
                                {
                                    ...item,
                                    status:
                                        "pending",
                                    retries:
                                        retries,
                                    last_error:
                                        error.message,
                                    updated_at:
                                        nowISO()
                                }
                            );
                        } catch (e) {
                            console.error(
                                "Unable to retry sync item",
                                e
                            );
                        }
                    }
                }
            }

            /*
             * Refresh UI after successful sync.
             */

            await refreshCurrentPage();

            showNotification(
                "☁️ Offline data sync completed"
            );
        } finally {
            syncRunning = false;
        }
    }

    // ============================================================
    // REFRESH CURRENT PAGE
    // ============================================================

    async function refreshCurrentPage() {
        const path =
            window.location.pathname;

        try {
            if (
                path === "/products" ||
                path.startsWith(
                    "/products/"
                )
            ) {
                await loadProducts();
            }

            if (
                path === "/customers" ||
                path.startsWith(
                    "/customers"
                )
            ) {
                await loadCustomers();
            }

            if (
                path === "/dashboard" ||
                path === "/"
            ) {
                await updateDashboard();
            }

            if (
                path === "/reports"
            ) {
                const input =
                    document.querySelector(
                        'input[name="date"]'
                    );

                if (input?.value) {
                    await loadReports(
                        input.value
                    );
                }
            }

            if (
                path === "/staff"
            ) {
                await loadStaff();
            }

            if (
                path === "/khatabook"
            ) {
                await loadKhatabook();
            }
        } catch (error) {
            console.log(
                "Page refresh skipped:",
                error
            );
        }
    }

    // ============================================================
    // AUTO SYNC
    // ============================================================

    function startAutoSync() {
        if (syncTimer) {
            clearInterval(
                syncTimer
            );
        }

        syncTimer =
            setInterval(
                () => {
                    if (isOnline()) {
                        syncPendingData();
                    }
                },
                SYNC_INTERVAL
            );
    }

    // ============================================================
    // ONLINE / OFFLINE EVENTS
    // ============================================================

    window.addEventListener(
        "online",
        async () => {
            console.log(
                "🌐 Internet connected"
            );

            showNotification(
                "🌐 Internet connected - syncing..."
            );

            /*
             * Small delay gives browser/network
             * time to become fully available.
             */

            setTimeout(
                async () => {
                    await syncPendingData();

                    await refreshCurrentPage();
                },
                1000
            );
        }
    );

    window.addEventListener(
        "offline",
        () => {
            console.log(
                "📴 Internet disconnected"
            );

            showNotification(
                "📴 Offline Mode"
            );
        }
    );

    // ============================================================
    // WHATSAPP
    // ============================================================

    function openWhatsApp(
        phone,
        message
    ) {
        if (!phone) {
            showNotification(
                "❌ No phone number available"
            );

            return;
        }

        const cleanPhone =
            String(phone).replace(
                /\D/g,
                ""
            );

        if (!cleanPhone) {
            showNotification(
                "❌ Invalid phone number"
            );

            return;
        }

        /*
         * WhatsApp requires internet.
         */

        if (!isOnline()) {
            showNotification(
                "📴 Connect internet to open WhatsApp"
            );

            return;
        }

        const url =
            `https://wa.me/${cleanPhone}` +
            `?text=${encodeURIComponent(
                message || ""
            )}`;

        window.open(
            url,
            "_blank"
        );
    }

    // ============================================================
    // OFFLINE STATUS
    // ============================================================

    function getOfflineStatus() {
        return {
            isOnline:
                navigator.onLine,

            hasDB:
                !!window.SawariyaDB,

            syncRunning:
                syncRunning
        };
    }

    // ============================================================
    // INIT
    // ============================================================

    document.addEventListener(
        "DOMContentLoaded",
        async () => {
            console.log(
                "🚀 Sawariya Sync Manager initialized"
            );

            const ready =
                await databaseReady();

            if (!ready) {
                console.error(
                    "❌ Database not ready"
                );

                return;
            }

            /*
             * Page-specific loading only.
             */

            const path =
                window.location.pathname;

            try {
                if (
                    path === "/dashboard" ||
                    path === "/"
                ) {
                    await updateDashboard();
                }

                if (
                    path === "/products"
                ) {
                    await loadProducts();
                }

                if (
                    path === "/customers"
                ) {
                    await loadCustomers();
                }

                if (
                    path === "/reports"
                ) {
                    const input =
                        document.querySelector(
                            'input[name="date"]'
                        );

                    if (input?.value) {
                        await loadReports(
                            input.value
                        );
                    }
                }

                if (
                    path === "/staff"
                ) {
                    await loadStaff();
                }

                if (
                    path === "/khatabook"
                ) {
                    await loadKhatabook();
                }
            } catch (error) {
                console.error(
                    "Page initialization error:",
                    error
                );
            }

            /*
             * If online, process pending
             * offline changes.
             */

            if (isOnline()) {
                setTimeout(
                    () => {
                        syncPendingData();
                    },
                    1500
                );
            }

            startAutoSync();

            console.log(
                "✅ Sawariya Sync Manager ready"
            );
        }
    );

    // ============================================================
    // GLOBAL EXPORTS
    // ============================================================

    window.loadProducts =
        loadProducts;

    window.addProduct =
        addProduct;

    window.editProduct =
        editProduct;

    window.deleteProduct =
        deleteProduct;

    window.searchProducts =
        searchProducts;

    window.loadCustomers =
        loadCustomers;

    window.addCustomer =
        addCustomer;

    window.editCustomer =
        editCustomer;

    window.deleteCustomer =
        deleteCustomer;

    window.saveBill =
        saveBill;

    window.updateDashboard =
        updateDashboard;

    window.loadReports =
        loadReports;

    window.loadStaff =
        loadStaff;

    window.saveStaffMember =
        saveStaffMember;

    window.deleteStaffMember =
        deleteStaffMember;

    window.loadKhatabook =
        loadKhatabook;

    window.saveKhatabookCustomer =
        saveKhatabookCustomer;

    window.deleteKhatabookCustomer =
        deleteKhatabookCustomer;

    window.addKhatabookEntry =
        addKhatabookEntry;

    window.loadKhatabookEntries =
        loadKhatabookEntries;

    window.syncPendingData =
        syncPendingData;

    window.openWhatsApp =
        openWhatsApp;

    window.showNotification =
        showNotification;

    window.getOfflineStatus =
        getOfflineStatus;

    window.renderProductList =
        renderProductList;

    window.renderCustomerList =
        renderCustomerList;

    window.renderDashboard =
        renderDashboard;

    window.renderReports =
        renderReports;

    window.renderStaffList =
        renderStaffList;

    window.renderKhatabookList =
        renderKhatabookList;

    console.log(
        "🌐 Sawariya Sync Manager functions exposed globally"
    );
})();