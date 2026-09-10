/* =========================================================
   SAWARIYA STAFF JS
   Offline + IndexedDB
   ========================================================= */

(() => {
    "use strict";

    const STAFF_STORE = "staff";

    let staffList = [];
    let editingStaffId = null;

    /* =========================================================
       HELPERS
       ========================================================= */

    function $(id) {
        return document.getElementById(id);
    }

    function showToast(message, type = "success") {
        let toast = $("staffToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "staffToast";
            toast.className = "staff-toast";
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.className = `staff-toast ${type} show`;

        clearTimeout(toast._timer);

        toast._timer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2500);
    }

    function generateId() {
        return (
            "staff_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substring(2, 10)
        );
    }

    function normalizeStaff(staff) {
        return {
            id: staff.id || generateId(),
            name: String(staff.name || "").trim(),
            phone: String(staff.phone || "").trim(),
            role: String(staff.role || "Staff").trim(),
            status: staff.status || "active",

            permissions: Array.isArray(staff.permissions)
                ? staff.permissions
                : [],

            username: String(staff.username || "").trim(),

            created_at:
                staff.created_at ||
                new Date().toISOString(),

            updated_at:
                new Date().toISOString(),

            sync_status:
                staff.sync_status || "pending"
        };
    }

    /* =========================================================
       LOAD STAFF
       ========================================================= */

    async function loadStaff() {
        try {
            if (
                typeof window.SawariyaDB === "undefined" ||
                typeof window.SawariyaDB.getAllStaff !== "function"
            ) {
                console.error("SawariyaDB / Staff functions not found.");
                showToast("Offline database load nahi hua", "error");
                return;
            }

            staffList = await window.SawariyaDB.getAllStaff();

            if (!Array.isArray(staffList)) {
                staffList = [];
            }

            staffList.sort((a, b) =>
                String(a.name || "").localeCompare(
                    String(b.name || "")
                )
            );

            renderStaff();

        } catch (error) {
            console.error("Staff load error:", error);
            showToast("Staff load nahi ho paya", "error");
        }
    }

    /* =========================================================
       RENDER
       ========================================================= */

    function renderStaff() {
        const container =
            $("staffList") ||
            $("staffTableBody") ||
            $("staffContainer");

        if (!container) {
            console.warn("Staff container not found.");
            return;
        }

        const search =
            String($("staffSearch")?.value || "")
                .trim()
                .toLowerCase();

        const filtered = staffList.filter(staff => {
            const text = [
                staff.name,
                staff.phone,
                staff.role,
                staff.username,
                staff.status
            ]
                .join(" ")
                .toLowerCase();

            return text.includes(search);
        });

        if (!filtered.length) {
            container.innerHTML = `
                <div class="staff-empty">
                    <div class="staff-empty-icon">👥</div>
                    <h3>No Staff Found</h3>
                    <p>Abhi koi staff member add nahi hai.</p>
                </div>
            `;
            updateStats();
            return;
        }

        /*
         * Agar HTML me table body use ho raha hai
         */
        if (
            container.tagName === "TBODY" ||
            container.classList.contains("staff-table-body")
        ) {
            container.innerHTML = filtered.map(staff => `
                <tr>
                    <td>${escapeHTML(staff.name)}</td>

                    <td>${escapeHTML(staff.phone || "-")}</td>

                    <td>
                        <span class="staff-role">
                            ${escapeHTML(staff.role)}
                        </span>
                    </td>

                    <td>
                        <span class="staff-status ${staff.status}">
                            ${
                                staff.status === "active"
                                    ? "Active"
                                    : "Inactive"
                            }
                        </span>
                    </td>

                    <td>
                        <div class="staff-actions">
                            <button
                                type="button"
                                onclick="window.editStaff('${staff.id}')"
                                title="Edit"
                            >
                                ✏️
                            </button>

                            <button
                                type="button"
                                onclick="window.toggleStaffStatus('${staff.id}')"
                                title="Change Status"
                            >
                                ${
                                    staff.status === "active"
                                        ? "⏸️"
                                        : "▶️"
                                }
                            </button>

                            <button
                                type="button"
                                onclick="window.deleteStaff('${staff.id}')"
                                title="Delete"
                            >
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `).join("");

        } else {
            /*
             * Card layout
             */
            container.innerHTML = filtered.map(staff => `
                <div class="staff-card">

                    <div class="staff-card-head">

                        <div class="staff-avatar">
                            ${getInitials(staff.name)}
                        </div>

                        <div class="staff-card-info">
                            <h3>
                                ${escapeHTML(staff.name)}
                            </h3>

                            <span class="staff-role">
                                ${escapeHTML(staff.role)}
                            </span>
                        </div>

                        <span class="staff-status ${staff.status}">
                            ${
                                staff.status === "active"
                                    ? "Active"
                                    : "Inactive"
                            }
                        </span>

                    </div>

                    <div class="staff-card-details">

                        ${
                            staff.phone
                                ? `
                                <div>
                                    <span>📱</span>
                                    ${escapeHTML(staff.phone)}
                                </div>
                                `
                                : ""
                        }

                        ${
                            staff.username
                                ? `
                                <div>
                                    <span>👤</span>
                                    ${escapeHTML(staff.username)}
                                </div>
                                `
                                : ""
                        }

                        <div>
                            <span>🔐</span>
                            ${
                                Array.isArray(staff.permissions)
                                    ? staff.permissions.length
                                    : 0
                            }
                            permissions
                        </div>

                    </div>

                    <div class="staff-card-actions">

                        <button
                            type="button"
                            onclick="window.editStaff('${staff.id}')"
                        >
                            ✏️ Edit
                        </button>

                        <button
                            type="button"
                            onclick="window.toggleStaffStatus('${staff.id}')"
                        >
                            ${
                                staff.status === "active"
                                    ? "⏸️ Disable"
                                    : "▶️ Enable"
                            }
                        </button>

                        <button
                            type="button"
                            class="danger"
                            onclick="window.deleteStaff('${staff.id}')"
                        >
                            🗑️ Delete
                        </button>

                    </div>

                </div>
            `).join("");
        }

        updateStats();
    }

    /* =========================================================
       STATS
       ========================================================= */

    function updateStats() {
        const total = staffList.length;

        const active = staffList.filter(
            staff => staff.status === "active"
        ).length;

        const inactive = staffList.filter(
            staff => staff.status !== "active"
        ).length;

        const totalEl = $("totalStaff");
        const activeEl = $("activeStaff");
        const inactiveEl = $("inactiveStaff");

        if (totalEl) totalEl.textContent = total;
        if (activeEl) activeEl.textContent = active;
        if (inactiveEl) inactiveEl.textContent = inactive;
    }

    /* =========================================================
       OPEN ADD MODAL
       ========================================================= */

    function openAddStaff() {
        editingStaffId = null;

        const form = $("staffForm");

        if (form) {
            form.reset();
        }

        const idField = $("staffId");

        if (idField) {
            idField.value = "";
        }

        const title = $("staffModalTitle");

        if (title) {
            title.textContent = "Add Staff";
        }

        setDefaultPermissions();

        openModal("staffModal");
    }

    /* =========================================================
       EDIT STAFF
       ========================================================= */

    async function editStaff(id) {
        try {
            const staff = await window.SawariyaDB.getStaff(id);

            if (!staff) {
                showToast("Staff member nahi mila", "error");
                return;
            }

            editingStaffId = id;

            setField("staffId", staff.id);
            setField("staffName", staff.name);
            setField("staffPhone", staff.phone);
            setField("staffRole", staff.role);
            setField("staffUsername", staff.username);

            const status = $("staffStatus");

            if (status) {
                status.value = staff.status || "active";
            }

            setPermissions(
                Array.isArray(staff.permissions)
                    ? staff.permissions
                    : []
            );

            const title = $("staffModalTitle");

            if (title) {
                title.textContent = "Edit Staff";
            }

            openModal("staffModal");

        } catch (error) {
            console.error("Edit staff error:", error);
            showToast("Staff edit nahi ho paya", "error");
        }
    }

    /* =========================================================
       SAVE STAFF
       ========================================================= */

    async function saveStaff(event) {
        if (event) {
            event.preventDefault();
        }

        const name =
            String($("staffName")?.value || "").trim();

        const phone =
            String($("staffPhone")?.value || "").trim();

        const role =
            String($("staffRole")?.value || "Staff").trim();

        const username =
            String($("staffUsername")?.value || "").trim();

        const status =
            $("staffStatus")?.value || "active";

        if (!name) {
            showToast("Staff name enter karo", "error");
            $("staffName")?.focus();
            return;
        }

        const permissions = getSelectedPermissions();

        const existing =
            editingStaffId
                ? await window.SawariyaDB.getStaff(editingStaffId)
                : null;

        const staff = normalizeStaff({
            ...(existing || {}),

            id:
                editingStaffId ||
                generateId(),

            name,
            phone,
            role,
            username,
            status,
            permissions,

            sync_status: "pending"
        });

        try {
            await window.SawariyaDB.saveStaff(staff);

            /*
             * Online server sync ke liye queue me add.
             * Sync engine available na ho to error ignore.
             */
            try {
                if (
                    typeof window.SawariyaDB.addToSync ===
                    "function"
                ) {
                    await window.SawariyaDB.addToSync({
                        entity: "staff",
                        action: existing
                            ? "update"
                            : "create",
                        local_id: staff.id,
                        data: staff,
                        created_at:
                            new Date().toISOString()
                    });
                }
            } catch (syncError) {
                console.warn(
                    "Staff sync queue error:",
                    syncError
                );
            }

            showToast(
                existing
                    ? "Staff updated successfully"
                    : "Staff added successfully"
            );

            closeModal("staffModal");

            editingStaffId = null;

            await loadStaff();

        } catch (error) {
            console.error("Save staff error:", error);
            showToast("Staff save nahi ho paya", "error");
        }
    }

    /* =========================================================
       DELETE STAFF
       ========================================================= */

    async function deleteStaff(id) {
        const staff = staffList.find(
            item => item.id === id
        );

        if (!staff) {
            return;
        }

        const confirmed = confirm(
            `"${staff.name}" ko delete karna hai?`
        );

        if (!confirmed) {
            return;
        }

        try {
            await window.SawariyaDB.deleteStaff(id);

            try {
                if (
                    typeof window.SawariyaDB.addToSync ===
                    "function"
                ) {
                    await window.SawariyaDB.addToSync({
                        entity: "staff",
                        action: "delete",
                        local_id: id,
                        data: {
                            id: id
                        },
                        created_at:
                            new Date().toISOString()
                    });
                }
            } catch (syncError) {
                console.warn(
                    "Staff delete sync queue error:",
                    syncError
                );
            }

            showToast("Staff deleted");

            await loadStaff();

        } catch (error) {
            console.error("Delete staff error:", error);
            showToast("Staff delete nahi ho paya", "error");
        }
    }

    /* =========================================================
       TOGGLE STATUS
       ========================================================= */

    async function toggleStaffStatus(id) {
        const staff = staffList.find(
            item => item.id === id
        );

        if (!staff) {
            return;
        }

        const newStatus =
            staff.status === "active"
                ? "inactive"
                : "active";

        try {
            staff.status = newStatus;
            staff.updated_at =
                new Date().toISOString();
            staff.sync_status = "pending";

            await window.SawariyaDB.saveStaff(staff);

            try {
                if (
                    typeof window.SawariyaDB.addToSync ===
                    "function"
                ) {
                    await window.SawariyaDB.addToSync({
                        entity: "staff",
                        action: "update",
                        local_id: staff.id,
                        data: staff,
                        created_at:
                            new Date().toISOString()
                    });
                }
            } catch (syncError) {
                console.warn(
                    "Status sync queue error:",
                    syncError
                );
            }

            showToast(
                newStatus === "active"
                    ? "Staff enabled"
                    : "Staff disabled"
            );

            await loadStaff();

        } catch (error) {
            console.error(
                "Toggle staff status error:",
                error
            );

            showToast(
                "Status change nahi ho paya",
                "error"
            );
        }
    }

    /* =========================================================
       PERMISSIONS
       ========================================================= */

    const PERMISSIONS = [
        {
            key: "dashboard",
            label: "Dashboard",
            icon: "📊"
        },
        {
            key: "billing",
            label: "Billing",
            icon: "🧾"
        },
        {
            key: "products",
            label: "Products",
            icon: "📦"
        },
        {
            key: "stock",
            label: "Stock",
            icon: "🏷️"
        },
        {
            key: "customers",
            label: "Customers",
            icon: "👥"
        },
        {
            key: "khatabook",
            label: "Khatabook",
            icon: "📒"
        },
        {
            key: "reports",
            label: "Reports",
            icon: "📈"
        },
        {
            key: "staff",
            label: "Staff",
            icon: "👨‍💼"
        }
    ];

    function renderPermissions() {
        const container =
            $("staffPermissions");

        if (!container) {
            return;
        }

        container.innerHTML =
            PERMISSIONS.map(permission => `
                <label class="permission-item">

                    <input
                        type="checkbox"
                        name="permissions"
                        value="${permission.key}"
                    >

                    <span class="permission-icon">
                        ${permission.icon}
                    </span>

                    <span>
                        ${permission.label}
                    </span>

                </label>
            `).join("");
    }

    function getSelectedPermissions() {
        return Array.from(
            document.querySelectorAll(
                'input[name="permissions"]:checked'
            )
        ).map(input => input.value);
    }

    function setPermissions(permissions) {
        document
            .querySelectorAll(
                'input[name="permissions"]'
            )
            .forEach(input => {
                input.checked =
                    permissions.includes(input.value);
            });
    }

    function setDefaultPermissions() {
        setPermissions([
            "dashboard",
            "billing",
            "customers"
        ]);
    }

    /* =========================================================
       MODAL
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

        modal.classList.remove("show");

        document.body.classList.remove(
            "modal-open"
        );
    }

    /* =========================================================
       FIELD HELPERS
       ========================================================= */

    function setField(id, value) {
        const element = $(id);

        if (element) {
            element.value = value ?? "";
        }
    }

    /* =========================================================
       SEARCH
       ========================================================= */

    function setupSearch() {
        const search = $("staffSearch");

        if (!search) {
            return;
        }

        search.addEventListener(
            "input",
            renderStaff
        );
    }

    /* =========================================================
       ESCAPE HTML
       ========================================================= */

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /* =========================================================
       INITIALS
       ========================================================= */

    function getInitials(name) {
        const words =
            String(name || "")
                .trim()
                .split(/\s+/)
                .filter(Boolean);

        if (!words.length) {
            return "S";
        }

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

    /* =========================================================
       CLOSE MODAL ON OUTSIDE CLICK
       ========================================================= */

    function setupModalEvents() {
        document.addEventListener(
            "click",
            event => {
                const modal =
                    event.target.closest(
                        ".staff-modal"
                    );

                if (!modal) {
                    return;
                }

                if (
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
                if (event.key !== "Escape") {
                    return;
                }

                document
                    .querySelectorAll(
                        ".staff-modal.show"
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
       FORM EVENT
       ========================================================= */

    function setupForm() {
        const form = $("staffForm");

        if (!form) {
            return;
        }

        form.addEventListener(
            "submit",
            saveStaff
        );
    }

    /* =========================================================
       PUBLIC FUNCTIONS
       ========================================================= */

    window.openAddStaff = openAddStaff;
    window.editStaff = editStaff;
    window.saveStaff = saveStaff;
    window.deleteStaff = deleteStaff;
    window.toggleStaffStatus =
        toggleStaffStatus;

    window.closeStaffModal = () =>
        closeModal("staffModal");

    window.loadStaff = loadStaff;

    /* =========================================================
       INIT
       ========================================================= */

    async function initStaff() {
        renderPermissions();
        setupSearch();
        setupForm();
        setupModalEvents();

        await loadStaff();
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initStaff
        );
    } else {
        initStaff();
    }

})();