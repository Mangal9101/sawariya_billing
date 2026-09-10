/* =========================================================
   SAWARIYA KHATABOOK
   Offline + IndexedDB + Sync Queue
   ========================================================= */

(() => {
    "use strict";

    let customers = [];
    let entries = [];

    let currentCustomer = null;
    let editingEntryId = null;

    /* =========================================================
       HELPERS
       ========================================================= */

    const $ = (id) => document.getElementById(id);

    function generateId(prefix = "khata") {
        return (
            prefix +
            "_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substring(2, 9)
        );
    }

    function money(value) {
        const amount = Number(value || 0);

        return "₹" + amount.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getInitials(name) {
        const words = String(name || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!words.length) return "C";

        if (words.length === 1) {
            return words[0]
                .substring(0, 2)
                .toUpperCase();
        }

        return (
            words[0][0] +
            words[words.length - 1][0]
        ).toUpperCase();
    }

    function formatDate(value) {
        if (!value) return "-";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    }

    function formatDateTime(value) {
        if (!value) return "-";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function toast(message, type = "success") {
        let element = $("khatabookToast");

        if (!element) {
            element = document.createElement("div");
            element.id = "khatabookToast";
            element.className = "khatabook-toast";
            document.body.appendChild(element);
        }

        element.textContent = message;
        element.className =
            "khatabook-toast " +
            type +
            " show";

        clearTimeout(element._timer);

        element._timer = setTimeout(() => {
            element.classList.remove("show");
        }, 2500);
    }

    /* =========================================================
       LOAD DATA
       ========================================================= */

    async function loadData() {
        try {
            if (
                !window.SawariyaDB ||
                typeof window.SawariyaDB
                    .getAllKhatabookCustomers !==
                    "function"
            ) {
                console.error(
                    "SawariyaDB Khatabook functions not found."
                );

                toast(
                    "Offline database available nahi hai",
                    "error"
                );

                return;
            }

            customers =
                await window.SawariyaDB
                    .getAllKhatabookCustomers();

            entries =
                await window.SawariyaDB
                    .getAllKhatabookEntries();

            if (!Array.isArray(customers)) {
                customers = [];
            }

            if (!Array.isArray(entries)) {
                entries = [];
            }

            customers.sort((a, b) =>
                String(a.name || "")
                    .localeCompare(
                        String(b.name || "")
                    )
            );

            renderCustomers();
            updateSummary();

        } catch (error) {
            console.error(
                "Khatabook load error:",
                error
            );

            toast(
                "Khatabook data load nahi hua",
                "error"
            );
        }
    }

    /* =========================================================
       CUSTOMER BALANCE
       ========================================================= */

    function getCustomerEntries(customerId) {
        return entries.filter(
            entry =>
                entry.khatabook_id === customerId ||
                entry.customer_id === customerId
        );
    }

    function calculateBalance(customerId) {
        const customerEntries =
            getCustomerEntries(customerId);

        let youWillGet = 0;
        let youWillGive = 0;

        customerEntries.forEach(entry => {
            const amount =
                Number(entry.amount || 0);

            /*
             * credit = customer se paisa lena hai
             * debit  = customer ko paisa dena hai
             */

            if (entry.type === "credit") {
                youWillGet += amount;
            }

            if (entry.type === "debit") {
                youWillGive += amount;
            }
        });

        return {
            get: youWillGet,
            give: youWillGive,
            balance:
                youWillGet - youWillGive
        };
    }

    /* =========================================================
       SUMMARY
       ========================================================= */

    function updateSummary() {
        let totalGet = 0;
        let totalGive = 0;

        customers.forEach(customer => {
            const balance =
                calculateBalance(customer.id);

            totalGet += balance.get;
            totalGive += balance.give;
        });

        const totalCustomers =
            $("totalKhataCustomers");

        const youGet =
            $("totalYouWillGet");

        const youGive =
            $("totalYouWillGive");

        const balance =
            $("totalKhataBalance");

        if (totalCustomers) {
            totalCustomers.textContent =
                customers.length;
        }

        if (youGet) {
            youGet.textContent =
                money(totalGet);
        }

        if (youGive) {
            youGive.textContent =
                money(totalGive);
        }

        if (balance) {
            balance.textContent =
                money(totalGet - totalGive);
        }
    }

    /* =========================================================
       RENDER CUSTOMER LIST
       ========================================================= */

    function renderCustomers() {
        const container =
            $("khatabookList") ||
            $("khataCustomerList");

        if (!container) {
            return;
        }

        const search =
            String(
                $("khatabookSearch")?.value ||
                ""
            )
                .trim()
                .toLowerCase();

        const filtered =
            customers.filter(customer => {
                const text = [
                    customer.name,
                    customer.phone
                ]
                    .join(" ")
                    .toLowerCase();

                return text.includes(search);
            });

        if (!filtered.length) {
            container.innerHTML = `
                <div class="khata-empty">
                    <div class="khata-empty-icon">
                        📒
                    </div>

                    <h3>No Khata Found</h3>

                    <p>
                        ${
                            search
                                ? "Search ke according customer nahi mila."
                                : "Abhi koi khata entry nahi hai."
                        }
                    </p>
                </div>
            `;

            return;
        }

        container.innerHTML =
            filtered.map(customer => {

                const balance =
                    calculateBalance(
                        customer.id
                    );

                let amount = Math.abs(
                    balance.balance
                );

                let balanceClass =
                    "settled";

                let balanceText =
                    "Settled";

                if (balance.balance > 0) {
                    balanceClass = "get";

                    balanceText =
                        "You will get " +
                        money(amount);
                }

                if (balance.balance < 0) {
                    balanceClass = "give";

                    balanceText =
                        "You will give " +
                        money(amount);
                }

                const customerEntries =
                    getCustomerEntries(
                        customer.id
                    );

                const lastEntry =
                    customerEntries
                        .sort(
                            (a, b) =>
                                new Date(
                                    b.date ||
                                    b.created_at
                                ) -
                                new Date(
                                    a.date ||
                                    a.created_at
                                )
                        )[0];

                return `
                    <div
                        class="khata-customer-card"
                        data-id="${escapeHTML(
                            customer.id
                        )}"
                    >

                        <div
                            class="khata-customer-main"
                            onclick="window.openKhata(
                                '${escapeHTML(
                                    customer.id
                                )}'
                            )"
                        >

                            <div class="khata-avatar">
                                ${getInitials(
                                    customer.name
                                )}
                            </div>

                            <div class="khata-customer-info">

                                <h3>
                                    ${escapeHTML(
                                        customer.name
                                    )}
                                </h3>

                                ${
                                    customer.phone
                                        ? `
                                        <p>
                                            📱
                                            ${escapeHTML(
                                                customer.phone
                                            )}
                                        </p>
                                        `
                                        : ""
                                }

                                <small>
                                    ${
                                        customerEntries.length
                                    }
                                    ${
                                        customerEntries.length === 1
                                            ? "entry"
                                            : "entries"
                                    }

                                    ${
                                        lastEntry
                                            ? `
                                            • Last:
                                            ${formatDate(
                                                lastEntry.date ||
                                                lastEntry.created_at
                                            )}
                                            `
                                            : ""
                                    }
                                </small>

                            </div>

                            <div
                                class="
                                    khata-balance
                                    ${balanceClass}
                                "
                            >
                                <strong>
                                    ${balanceText}
                                </strong>
                            </div>

                        </div>

                        <div class="khata-card-actions">

                            <button
                                type="button"
                                onclick="
                                    window.addKhataEntry(
                                        '${escapeHTML(
                                            customer.id
                                        )}'
                                    )
                                "
                            >
                                ➕ Entry
                            </button>

                            <button
                                type="button"
                                onclick="
                                    window.openKhata(
                                        '${escapeHTML(
                                            customer.id
                                        )}'
                                    )
                                "
                            >
                                📖 View
                            </button>

                            <button
                                type="button"
                                class="danger"
                                onclick="
                                    window.deleteKhataCustomer(
                                        '${escapeHTML(
                                            customer.id
                                        )}'
                                    )
                                "
                            >
                                🗑️
                            </button>

                        </div>

                    </div>
                `;
            }).join("");
    }

    /* =========================================================
       ADD CUSTOMER
       ========================================================= */

    async function addCustomerFromForm() {
        const name =
            String(
                $("khataCustomerName")?.value ||
                ""
            ).trim();

        const phone =
            String(
                $("khataCustomerPhone")?.value ||
                ""
            ).trim();

        if (!name) {
            toast(
                "Customer name enter karo",
                "error"
            );

            $("khataCustomerName")?.focus();

            return;
        }

        const existing =
            customers.find(customer => {

                if (
                    phone &&
                    customer.phone
                ) {
                    return (
                        customer.phone === phone
                    );
                }

                return (
                    String(
                        customer.name || ""
                    ).toLowerCase() ===
                    name.toLowerCase()
                );
            });

        if (existing) {
            toast(
                "Ye customer already khata me hai",
                "error"
            );

            openKhata(existing.id);

            return;
        }

        const customer = {
            id: generateId("khata_customer"),
            name,
            phone,
            address:
                String(
                    $("khataCustomerAddress")
                        ?.value || ""
                ).trim(),

            created_at:
                new Date().toISOString(),

            updated_at:
                new Date().toISOString(),

            sync_status: "pending"
        };

        try {
            await window.SawariyaDB
                .saveKhatabookCustomer(
                    customer
                );

            await queueSync(
                "khatabook_customer",
                "create",
                customer.id,
                customer
            );

            toast(
                "Customer added successfully"
            );

            closeModal(
                "khataCustomerModal"
            );

            clearCustomerForm();

            await loadData();

        } catch (error) {
            console.error(
                "Customer add error:",
                error
            );

            toast(
                "Customer add nahi hua",
                "error"
            );
        }
    }

    /* =========================================================
       ADD ENTRY
       ========================================================= */

    function addKhataEntry(customerId) {
        currentCustomer =
            customers.find(
                customer =>
                    customer.id === customerId
            );

        if (!currentCustomer) {
            toast(
                "Customer nahi mila",
                "error"
            );

            return;
        }

        editingEntryId = null;

        clearEntryForm();

        const title =
            $("khataEntryModalTitle");

        if (title) {
            title.textContent =
                "Add Khata Entry";
        }

        const customerName =
            $("entryCustomerName");

        if (customerName) {
            customerName.value =
                currentCustomer.name;
        }

        const entryDate =
            $("khataEntryDate");

        if (entryDate) {
            entryDate.value =
                new Date()
                    .toISOString()
                    .slice(0, 16);
        }

        openModal(
            "khataEntryModal"
        );
    }

    /* =========================================================
       SAVE ENTRY
       ========================================================= */

    async function saveKhataEntry(event) {
        if (event) {
            event.preventDefault();
        }

        if (!currentCustomer) {
            toast(
                "Customer select nahi hai",
                "error"
            );

            return;
        }

        const type =
            $("khataEntryType")?.value ||
            "credit";

        const amount =
            Number(
                $("khataEntryAmount")?.value ||
                0
            );

        const note =
            String(
                $("khataEntryNote")?.value ||
                ""
            ).trim();

        const dateInput =
            $("khataEntryDate")?.value;

        if (!amount || amount <= 0) {
            toast(
                "Valid amount enter karo",
                "error"
            );

            $("khataEntryAmount")?.focus();

            return;
        }

        const existing =
            editingEntryId
                ? entries.find(
                    entry =>
                        entry.id ===
                        editingEntryId
                )
                : null;

        const entry = {
            ...(existing || {}),

            id:
                editingEntryId ||
                generateId("entry"),

            khatabook_id:
                currentCustomer.id,

            customer_id:
                currentCustomer.id,

            customer_name:
                currentCustomer.name,

            customer_phone:
                currentCustomer.phone || "",

            type,

            amount,

            note,

            date:
                dateInput
                    ? new Date(
                        dateInput
                    ).toISOString()
                    : new Date().toISOString(),

            created_at:
                existing?.created_at ||
                new Date().toISOString(),

            updated_at:
                new Date().toISOString(),

            sync_status: "pending"
        };

        try {
            await window.SawariyaDB
                .saveKhatabookEntry(
                    entry
                );

            await queueSync(
                "khatabook_entry",
                existing
                    ? "update"
                    : "create",
                entry.id,
                entry
            );

            toast(
                existing
                    ? "Entry updated"
                    : "Entry added"
            );

            closeModal(
                "khataEntryModal"
            );

            editingEntryId = null;

            await loadData();

            if (
                currentCustomer
            ) {
                openKhata(
                    currentCustomer.id
                );
            }

        } catch (error) {
            console.error(
                "Save entry error:",
                error
            );

            toast(
                "Entry save nahi hui",
                "error"
            );
        }
    }

    /* =========================================================
       OPEN CUSTOMER KHATA
       ========================================================= */

    function openKhata(customerId) {
        currentCustomer =
            customers.find(
                customer =>
                    customer.id ===
                    customerId
            );

        if (!currentCustomer) {
            toast(
                "Customer nahi mila",
                "error"
            );

            return;
        }

        renderCustomerLedger();

        openModal(
            "khataDetailModal"
        );
    }

    /* =========================================================
       CUSTOMER LEDGER
       ========================================================= */

    function renderCustomerLedger() {
        if (!currentCustomer) {
            return;
        }

        const customerName =
            $("detailCustomerName");

        const customerPhone =
            $("detailCustomerPhone");

        if (customerName) {
            customerName.textContent =
                currentCustomer.name;
        }

        if (customerPhone) {
            customerPhone.textContent =
                currentCustomer.phone
                    ? "📱 " +
                      currentCustomer.phone
                    : "";
        }

        const balance =
            calculateBalance(
                currentCustomer.id
            );

        const getEl =
            $("detailYouWillGet");

        const giveEl =
            $("detailYouWillGive");

        const balanceEl =
            $("detailBalance");

        if (getEl) {
            getEl.textContent =
                money(balance.get);
        }

        if (giveEl) {
            giveEl.textContent =
                money(balance.give);
        }

        if (balanceEl) {
            balanceEl.textContent =
                money(
                    Math.abs(
                        balance.balance
                    )
                );

            balanceEl.className =
                balance.balance > 0
                    ? "get"
                    : balance.balance < 0
                    ? "give"
                    : "settled";
        }

        const container =
            $("khataLedger");

        if (!container) {
            return;
        }

        const customerEntries =
            getCustomerEntries(
                currentCustomer.id
            ).sort(
                (a, b) =>
                    new Date(
                        b.date ||
                        b.created_at
                    ) -
                    new Date(
                        a.date ||
                        a.created_at
                    )
            );

        if (!customerEntries.length) {
            container.innerHTML = `
                <div class="ledger-empty">
                    📒 No entries yet
                </div>
            `;

            return;
        }

        container.innerHTML =
            customerEntries.map(entry => {

                const isGet =
                    entry.type === "credit";

                return `
                    <div
                        class="
                            ledger-entry
                            ${
                                isGet
                                    ? "credit"
                                    : "debit"
                            }
                        "
                    >

                        <div class="ledger-entry-icon">
                            ${
                                isGet
                                    ? "⬆️"
                                    : "⬇️"
                            }
                        </div>

                        <div class="ledger-entry-info">

                            <strong>
                                ${
                                    isGet
                                        ? "You Will Get"
                                        : "You Will Give"
                                }
                            </strong>

                            <span>
                                ${escapeHTML(
                                    entry.note ||
                                    "No note"
                                )}
                            </span>

                            <small>
                                ${formatDateTime(
                                    entry.date ||
                                    entry.created_at
                                )}
                            </small>

                        </div>

                        <div class="ledger-entry-amount">

                            <strong>
                                ${
                                    isGet
                                        ? "+"
                                        : "-"
                                }
                                ${money(
                                    entry.amount
                                )}
                            </strong>

                            <div>

                                <button
                                    type="button"
                                    onclick="
                                        window.editKhataEntry(
                                            '${escapeHTML(
                                                entry.id
                                            )}'
                                        )
                                    "
                                >
                                    ✏️
                                </button>

                                <button
                                    type="button"
                                    onclick="
                                        window.deleteKhataEntry(
                                            '${escapeHTML(
                                                entry.id
                                            )}'
                                        )
                                    "
                                >
                                    🗑️
                                </button>

                            </div>

                        </div>

                    </div>
                `;
            }).join("");
    }

    /* =========================================================
       EDIT ENTRY
       ========================================================= */

    function editKhataEntry(entryId) {
        const entry =
            entries.find(
                item =>
                    item.id === entryId
            );

        if (!entry) {
            toast(
                "Entry nahi mili",
                "error"
            );

            return;
        }

        currentCustomer =
            customers.find(
                customer =>
                    customer.id ===
                    entry.khatabook_id ||
                    customer.id ===
                    entry.customer_id
            );

        if (!currentCustomer) {
            toast(
                "Customer nahi mila",
                "error"
            );

            return;
        }

        editingEntryId = entryId;

        setValue(
            "entryCustomerName",
            currentCustomer.name
        );

        setValue(
            "khataEntryType",
            entry.type
        );

        setValue(
            "khataEntryAmount",
            entry.amount
        );

        setValue(
            "khataEntryNote",
            entry.note
        );

        const date =
            entry.date ||
            entry.created_at;

        if (date) {
            const d =
                new Date(date);

            if (
                !Number.isNaN(
                    d.getTime()
                )
            ) {
                const local =
                    new Date(
                        d.getTime() -
                        d.getTimezoneOffset() *
                        60000
                    )
                        .toISOString()
                        .slice(0, 16);

                setValue(
                    "khataEntryDate",
                    local
                );
            }
        }

        const title =
            $("khataEntryModalTitle");

        if (title) {
            title.textContent =
                "Edit Khata Entry";
        }

        openModal(
            "khataEntryModal"
        );
    }

    /* =========================================================
       DELETE ENTRY
       ========================================================= */

    async function deleteKhataEntry(
        entryId
    ) {
        const entry =
            entries.find(
                item =>
                    item.id === entryId
            );

        if (!entry) {
            return;
        }

        if (
            !confirm(
                "Ye khata entry delete karni hai?"
            )
        ) {
            return;
        }

        try {
            await window.SawariyaDB
                .deleteKhatabookEntry(
                    entryId
                );

            await queueSync(
                "khatabook_entry",
                "delete",
                entryId,
                {
                    id: entryId,
                    customer_id:
                        entry.customer_id,
                    khatabook_id:
                        entry.khatabook_id
                }
            );

            toast(
                "Entry deleted"
            );

            await loadData();

            if (
                currentCustomer
            ) {
                openKhata(
                    currentCustomer.id
                );
            }

        } catch (error) {
            console.error(
                "Delete entry error:",
                error
            );

            toast(
                "Entry delete nahi hui",
                "error"
            );
        }
    }

    /* =========================================================
       DELETE CUSTOMER
       ========================================================= */

    async function deleteKhataCustomer(
        customerId
    ) {
        const customer =
            customers.find(
                item =>
                    item.id ===
                    customerId
            );

        if (!customer) {
            return;
        }

        const customerEntries =
            getCustomerEntries(
                customerId
            );

        const message =
            customerEntries.length
                ? `"${customer.name}" ke ${customerEntries.length} khata entries bhi delete hongi. Continue?`
                : `"${customer.name}" ko khata se delete karna hai?`;

        if (!confirm(message)) {
            return;
        }

        try {
            /*
             * Pehle entries delete.
             */
            for (
                const entry
                of customerEntries
            ) {
                await window.SawariyaDB
                    .deleteKhatabookEntry(
                        entry.id
                    );

                await queueSync(
                    "khatabook_entry",
                    "delete",
                    entry.id,
                    {
                        id: entry.id,
                        customer_id:
                            customerId,
                        khatabook_id:
                            customerId
                    }
                );
            }

            await window.SawariyaDB
                .deleteKhatabookCustomer(
                    customerId
                );

            await queueSync(
                "khatabook_customer",
                "delete",
                customerId,
                {
                    id: customerId
                }
            );

            toast(
                "Customer khata se delete ho gaya"
            );

            currentCustomer = null;

            await loadData();

        } catch (error) {
            console.error(
                "Delete customer error:",
                error
            );

            toast(
                "Customer delete nahi hua",
                "error"
            );
        }
    }

    /* =========================================================
       SYNC QUEUE
       ========================================================= */

    async function queueSync(
        entity,
        action,
        localId,
        data
    ) {
        try {
            if (
                !window.SawariyaDB ||
                typeof window.SawariyaDB
                    .addToSync !==
                    "function"
            ) {
                return;
            }

            await window.SawariyaDB
                .addToSync({
                    entity,
                    action,
                    local_id: localId,
                    data,
                    created_at:
                        new Date().toISOString()
                });

        } catch (error) {
            /*
             * Local data save successful hona
             * sync queue failure se block nahi hona chahiye.
             */
            console.warn(
                "Khatabook sync queue error:",
                error
            );
        }
    }

    /* =========================================================
       CUSTOMER MODAL
       ========================================================= */

    function openCustomerModal() {
        clearCustomerForm();

        openModal(
            "khataCustomerModal"
        );
    }

    function clearCustomerForm() {
        setValue(
            "khataCustomerName",
            ""
        );

        setValue(
            "khataCustomerPhone",
            ""
        );

        setValue(
            "khataCustomerAddress",
            ""
        );
    }

    /* =========================================================
       ENTRY FORM
       ========================================================= */

    function clearEntryForm() {
        setValue(
            "khataEntryAmount",
            ""
        );

        setValue(
            "khataEntryNote",
            ""
        );

        setValue(
            "khataEntryType",
            "credit"
        );

        const date =
            $("khataEntryDate");

        if (date) {
            date.value =
                new Date()
                    .toISOString()
                    .slice(0, 16);
        }
    }

    /* =========================================================
       MODALS
       ========================================================= */

    function openModal(id) {
        const modal = $(id);

        if (!modal) {
            return;
        }

        modal.classList.add("show");

        document.body.classList.add(
            "modal-open"
        );
    }

    function closeModal(id) {
        const modal = $(id);

        if (!modal) {
            return;
        }

        modal.classList.remove(
            "show"
        );

        document.body.classList.remove(
            "modal-open"
        );
    }

    /* =========================================================
       FORM HELPERS
       ========================================================= */

    function setValue(id, value) {
        const element = $(id);

        if (element) {
            element.value =
                value ?? "";
        }
    }

    /* =========================================================
       SEARCH
       ========================================================= */

    function setupSearch() {
        const search =
            $("khatabookSearch");

        if (!search) {
            return;
        }

        search.addEventListener(
            "input",
            renderCustomers
        );
    }

    /* =========================================================
       MODAL EVENTS
       ========================================================= */

    function setupModalEvents() {
        document.addEventListener(
            "click",
            event => {
                const modal =
                    event.target.closest(
                        ".khatabook-modal"
                    );

                if (
                    modal &&
                    event.target === modal
                ) {
                    modal.classList.remove(
                        "show"
                    );

                    document.body.classList.remove(
                        "modal-open"
                    );
                }
            }
        );

        document.addEventListener(
            "keydown",
            event => {
                if (
                    event.key !==
                    "Escape"
                ) {
                    return;
                }

                document
                    .querySelectorAll(
                        ".khatabook-modal.show"
                    )
                    .forEach(modal => {
                        modal.classList.remove(
                            "show"
                        );
                    });

                document.body.classList.remove(
                    "modal-open"
                );
            }
        );
    }

    /* =========================================================
       FORMS
       ========================================================= */

    function setupForms() {
        const customerForm =
            $("khataCustomerForm");

        if (customerForm) {
            customerForm.addEventListener(
                "submit",
                event => {
                    event.preventDefault();

                    addCustomerFromForm();
                }
            );
        }

        const entryForm =
            $("khataEntryForm");

        if (entryForm) {
            entryForm.addEventListener(
                "submit",
                saveKhataEntry
            );
        }
    }

    /* =========================================================
       REFRESH WHEN PAGE BECOMES VISIBLE
       ========================================================= */

    document.addEventListener(
        "visibilitychange",
        () => {
            if (
                document.visibilityState ===
                "visible"
            ) {
                loadData();
            }
        }
    );

    /* =========================================================
       ONLINE EVENT
       ========================================================= */

    window.addEventListener(
        "online",
        () => {
            loadData();
        }
    );

    /* =========================================================
       PUBLIC API
       ========================================================= */

    window.openCustomerModal =
        openCustomerModal;

    window.addKhataEntry =
        addKhataEntry;

    window.openKhata =
        openKhata;

    window.editKhataEntry =
        editKhataEntry;

    window.deleteKhataEntry =
        deleteKhataEntry;

    window.deleteKhataCustomer =
        deleteKhataCustomer;

    window.closeKhatabookModal =
        closeModal;

    window.loadKhatabook =
        loadData;

    /* =========================================================
       INIT
       ========================================================= */

    async function init() {
        setupSearch();
        setupModalEvents();
        setupForms();

        await loadData();
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
    } else {
        init();
    }

})();