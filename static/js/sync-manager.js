// ============================================================
// SAWARIYA BILLING - Complete Offline Support
// ============================================================

// ============================================================
// 1. PRODUCTS
// ============================================================

async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        if (response.ok) {
            const products = await response.json();
            // Cache in IndexedDB
            for (const p of products) {
                await SawariyaDB.put('products', p);
            }
            renderProductList(products);
            return products;
        }
    } catch (error) {
        console.log('📴 Offline - Loading products from cache');
    }
    
    // Offline - load from IndexedDB
    const products = await SawariyaDB.getAll('products');
    renderProductList(products);
    return products;
}

async function addProduct(productData) {
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        
        if (response.ok) {
            const result = await response.json();
            await SawariyaDB.put('products', result);
            showNotification('✅ Product added online');
            await loadProducts();
            return result;
        }
    } catch (error) {
        console.log('📴 Offline - Saving product locally');
    }
    
    // Offline save
    const tempId = 'temp_' + Date.now();
    const offlineData = { ...productData, id: tempId, _offline: true };
    await SawariyaDB.put('products', offlineData);
    await SawariyaDB.addToSync('products', offlineData);
    showNotification('📴 Product saved offline');
    await loadProducts();
    return offlineData;
}

async function editProduct(id, productData) {
    try {
        const response = await fetch(`/api/products/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        
        if (response.ok) {
            const result = await response.json();
            await SawariyaDB.put('products', result);
            showNotification('✅ Product updated');
            await loadProducts();
            return result;
        }
    } catch (error) {
        console.log('📴 Offline - Updating locally');
    }
    
    // Offline update
    const existing = await SawariyaDB.get('products', id);
    if (existing) {
        const updated = { ...existing, ...productData, _offline: true };
        await SawariyaDB.put('products', updated);
        await SawariyaDB.addToSync('products', updated);
        showNotification('📴 Product updated offline');
        await loadProducts();
        return updated;
    }
}

async function deleteProduct(id) {
    try {
        await fetch(`/api/products/${id}`, { method: 'DELETE' });
        await SawariyaDB.remove('products', id);
        showNotification('✅ Product deleted');
        await loadProducts();
    } catch (error) {
        console.log('📴 Offline - Marking for deletion');
        await SawariyaDB.remove('products', id);
        await SawariyaDB.addToSync('products', { id, _delete: true });
        showNotification('📴 Product marked for deletion');
        await loadProducts();
    }
}

async function searchProducts(query) {
    if (!query || query.length < 2) return [];
    
    try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.log('📴 Offline - Searching locally');
    }
    
    const products = await SawariyaDB.getAll('products');
    return products.filter(p => 
        p.name?.toLowerCase().includes(query.toLowerCase()) ||
        p.id?.toString().includes(query) ||
        p.sku?.includes(query)
    );
}

function renderProductList(products) {
    const tbody = document.getElementById('productTableBody');
    if (!tbody) return;
    
    if (!products || products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">No products found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    products.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.id}</td>
            <td>${p.name || ''}</td>
            <td>₹${p.price || 0}</td>
            <td>${p.stock || 0}</td>
            <td>${p.sku || p.barcode || ''}</td>
            <td>
                <button onclick="editProduct('${p.id}', prompt('Edit name:', '${p.name}'))" 
                        class="btn btn-sm btn-primary">Edit</button>
                <button onclick="if(confirm('Delete?')) deleteProduct('${p.id}')" 
                        class="btn btn-sm btn-danger">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================
// 2. CUSTOMERS
// ============================================================

async function loadCustomers() {
    try {
        const response = await fetch('/api/customers');
        if (response.ok) {
            const customers = await response.json();
            for (const c of customers) {
                await SawariyaDB.put('customers', c);
            }
            renderCustomerList(customers);
            return customers;
        }
    } catch (error) {
        console.log('📴 Offline - Loading customers from cache');
    }
    
    const customers = await SawariyaDB.getAll('customers');
    renderCustomerList(customers);
    return customers;
}

async function addCustomer(customerData) {
    try {
        const response = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customerData)
        });
        
        if (response.ok) {
            const result = await response.json();
            await SawariyaDB.put('customers', result);
            showNotification('✅ Customer added');
            await loadCustomers();
            return result;
        }
    } catch (error) {
        console.log('📴 Offline - Saving customer locally');
    }
    
    const tempId = 'temp_' + Date.now();
    const offlineData = { ...customerData, id: tempId, _offline: true };
    await SawariyaDB.put('customers', offlineData);
    await SawariyaDB.addToSync('customers', offlineData);
    showNotification('📴 Customer saved offline');
    await loadCustomers();
    return offlineData;
}

function renderCustomerList(customers) {
    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;
    
    if (!customers || customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">No customers found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    customers.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.id}</td>
            <td>${c.name || ''}</td>
            <td>${c.phone || ''}</td>
            <td>${c.address || ''}</td>
            <td>${c.email || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================
// 3. BILLING
// ============================================================

async function saveBill(billData) {
    try {
        const response = await fetch('/api/bills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(billData)
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Save bill locally
            await SawariyaDB.put('bills', {
                local_id: 'bill_' + Date.now(),
                server_id: result.id,
                ...result,
                synced: true
            });
            
            // Update stock locally
            for (const item of billData.items || []) {
                const product = await SawariyaDB.get('products', item.productId);
                if (product) {
                    product.stock -= item.quantity;
                    await SawariyaDB.put('products', product);
                }
            }
            
            showNotification('✅ Bill saved online');
            if (typeof showInvoice === 'function') showInvoice(result);
            if (typeof updateDashboard === 'function') updateDashboard();
            return result;
        }
    } catch (error) {
        console.log('📴 Offline - Saving bill locally');
    }
    
    // Offline save
    const localId = 'bill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const offlineBill = {
        local_id: localId,
        ...billData,
        _offline: true,
        offlineDate: new Date().toISOString(),
        synced: false
    };
    
    await SawariyaDB.put('bills', offlineBill);
    await SawariyaDB.addToSync('bills', offlineBill);
    
    // Update stock locally
    for (const item of billData.items || []) {
        const product = await SawariyaDB.get('products', item.productId);
        if (product) {
            product.stock -= item.quantity;
            await SawariyaDB.put('products', product);
        }
    }
    
    showNotification('📴 Bill saved offline');
    if (typeof showInvoice === 'function') showInvoice(offlineBill);
    if (typeof updateDashboard === 'function') updateDashboard();
    return offlineBill;
}

function showInvoice(bill) {
    // Your existing invoice logic
    console.log('📄 Invoice:', bill);
    
    // Example - show modal or print
    const container = document.getElementById('invoiceContainer');
    if (container) {
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h5>Invoice #${bill.server_id || bill.local_id || 'N/A'}</h5>
                    <small>${bill._offline ? '📴 Offline' : '📊 Online'}</small>
                </div>
                <div class="card-body">
                    <p><strong>Date:</strong> ${bill.date || bill.offlineDate || new Date().toISOString()}</p>
                    <p><strong>Customer:</strong> ${bill.customer_name || 'Walk-in'}</p>
                    <hr>
                    <table class="table table-sm">
                        <thead>
                            <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
                        </thead>
                        <tbody>
                            ${(bill.items || []).map(item => `
                                <tr>
                                    <td>${item.name || item.productId}</td>
                                    <td>${item.quantity}</td>
                                    <td>₹${item.price || 0}</td>
                                    <td>₹${(item.quantity * item.price) || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr><th colspan="3">Total</th><th>₹${bill.total || 0}</th></tr>
                        </tfoot>
                    </table>
                    ${bill._offline ? '<div class="alert alert-warning">⚠️ This bill was saved offline</div>' : ''}
                    <button onclick="window.print()" class="btn btn-primary">🖨️ Print</button>
                </div>
            </div>
        `;
        container.style.display = 'block';
    }
}

// ============================================================
// 4. DASHBOARD
// ============================================================

async function updateDashboard() {
    try {
        const response = await fetch('/api/dashboard');
        if (response.ok) {
            const data = await response.json();
            renderDashboard(data);
            return;
        }
    } catch (error) {
        console.log('📴 Offline - Dashboard from local data');
    }
    
    // Offline - Calculate from IndexedDB
    const bills = await SawariyaDB.getAll('bills');
    const products = await SawariyaDB.getAll('products');
    const today = new Date().toISOString().split('T')[0];
    
    const todayBills = bills.filter(b => {
        const date = b.date || b.offlineDate || '';
        return date.startsWith(today);
    });
    
    const totalSales = bills.reduce((sum, b) => sum + (b.total || 0), 0);
    const todaySales = todayBills.reduce((sum, b) => sum + (b.total || 0), 0);
    const lowStock = products.filter(p => (p.stock || 0) < 10);
    
    renderDashboard({
        total_bills: bills.length,
        total_sales: totalSales,
        today_sales: todaySales,
        low_stock: lowStock.length,
        total_products: products.length,
        _offline: true
    });
}

function renderDashboard(data) {
    const elements = {
        'totalBills': data.total_bills || 0,
        'totalSales': '₹' + (data.total_sales || 0).toFixed(2),
        'todaySales': '₹' + (data.today_sales || 0).toFixed(2),
        'lowStock': data.low_stock || 0,
        'totalProducts': data.total_products || 0
    };
    
    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
    
    // Offline indicator
    const offlineIndicator = document.getElementById('offlineIndicator');
    if (offlineIndicator && data._offline) {
        offlineIndicator.textContent = '📴 Offline Mode';
        offlineIndicator.style.display = 'block';
    }
}

// ============================================================
// 5. REPORTS
// ============================================================

async function loadReports(date) {
    try {
        const response = await fetch(`/api/reports?date=${date}`);
        if (response.ok) {
            const data = await response.json();
            renderReports(data);
            return;
        }
    } catch (error) {
        console.log('📴 Offline - Reports from local');
    }
    
    const bills = await SawariyaDB.getAll('bills');
    const filtered = bills.filter(b => {
        const billDate = b.date || b.offlineDate || '';
        return billDate.startsWith(date);
    });
    
    const total = filtered.reduce((sum, b) => sum + (b.total || 0), 0);
    renderReports({
        bills: filtered,
        total: total,
        count: filtered.length,
        _offline: true
    });
}

function renderReports(data) {
    const container = document.getElementById('reportsContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h5>${data._offline ? '📴 Offline' : '📊 Online'} Reports</h5>
            </div>
            <div class="card-body">
                ${data._offline ? '<div class="alert alert-warning">⚠️ Offline data may not be complete</div>' : ''}
                <p><strong>Total Bills:</strong> ${data.count || 0}</p>
                <p><strong>Total Amount:</strong> ₹${(data.total || 0).toFixed(2)}</p>
                <hr>
                ${(data.bills || []).slice(0, 20).map(b => `
                    <div class="border-bottom p-2 d-flex justify-content-between">
                        <span>Bill #${b.server_id || b.local_id || 'N/A'}</span>
                        <span>₹${(b.total || 0).toFixed(2)}</span>
                        <small>${b.date || b.offlineDate || ''}</small>
                    </div>
                `).join('')}
                ${(data.bills || []).length > 20 ? `<p class="text-muted">... and ${(data.bills || []).length - 20} more</p>` : ''}
            </div>
        </div>
    `;
}

// ============================================================
// 6. WHATSAPP INTEGRATION
// ============================================================

function openWhatsApp(phone, message) {
    if (!phone) {
        showNotification('❌ No phone number available');
        return;
    }
    
    // Remove any non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Check if offline
    if (!navigator.onLine) {
        showNotification('📴 Offline - Please connect to internet for WhatsApp');
        return;
    }
    
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message || '')}`;
    window.open(url, '_blank');
}

// ============================================================
// 7. UTILITY FUNCTIONS
// ============================================================

function showNotification(message) {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.style.display = 'block';
        notification.className = 'alert alert-info m-2';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 4000);
    } else {
        console.log('🔔', message);
        // Fallback - toast notification
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #333; color: white; padding: 12px 24px; border-radius: 8px;
            z-index: 9999; font-size: 14px;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
}

function getOfflineStatus() {
    return {
        isOnline: navigator.onLine,
        hasDB: !!window.SawariyaDB
    };
}

// ============================================================
// 8. INIT - Load data on page load
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Sawariya Billing initializing...');
    
    // Initialize database
    await SawariyaDB.open();
    console.log('✅ Database ready');
    
    // Load data
    await loadProducts();
    await loadCustomers();
    await updateDashboard();
    
    console.log('✅ App ready!');
});

// Expose functions globally
window.loadProducts = loadProducts;
window.addProduct = addProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.searchProducts = searchProducts;
window.loadCustomers = loadCustomers;
window.addCustomer = addCustomer;
window.saveBill = saveBill;
window.updateDashboard = updateDashboard;
window.loadReports = loadReports;
window.openWhatsApp = openWhatsApp;
window.showNotification = showNotification;
window.getOfflineStatus = getOfflineStatus;
window.showInvoice = showInvoice;