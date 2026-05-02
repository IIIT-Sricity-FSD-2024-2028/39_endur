// ===== SHARED UTILITIES FOR ADMIN/SUPERUSER =====

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(60px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Open a modal overlay by ID
 */
export function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

/**
 * Close a modal overlay by ID
 */
export function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

/**
 * Validate a form and mark field errors.
 * @param {HTMLFormElement} form
 * @param {Object} rules - { fieldId: 'Required field label' }
 * @returns {boolean} isValid
 */
export function validateForm(form, rules) {
    let valid = true;
    Object.entries(rules).forEach(([id, label]) => {
        const el = form.querySelector(`#${id}`);
        const group = el?.closest('.form-group');
        if (!el || !group) return;
        group.classList.remove('has-error');
        if (!el.value.trim()) {
            group.classList.add('has-error');
            const errorEl = group.querySelector('.field-error');
            if (errorEl) errorEl.textContent = `${label} is required.`;
            valid = false;
        }
    });
    return valid;
}

/**
 * Format ISO timestamp to a readable date string
 */
export function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format ISO timestamp to date + time
 */
export function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Generate a simple unique ID
 */
export function genId(prefix = 'ID') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Log an action to the backend audit-logs endpoint (fire-and-forget)
 */
export function appendAuditLog(actor, actorRole, action, module, target, details) {
    import('../core/api.js').then(({ POST }) => {
        POST('/audit-logs', { actor, actorRole, action, module, target, details }).catch(() => {});
    });
    console.log(`[Audit] ${action} in ${module}: ${target} - ${details}`);
}

export function exportToCSV(filename, rows) {
    if (!rows || !rows.length) return;
    const separator = ",";
    const keys = Object.keys(rows[0]);
    
    // Header
    const csvContent = [
        keys.join(separator),
        ...rows.map(row => 
            keys.map(k => {
                let cell = row[k] === null || row[k] === undefined ? "" : row[k];
                cell = cell instanceof Date ? cell.toLocaleString() : cell.toString().replace(/"/g, "\"\"");
                return `"${cell}"`;
            }).join(separator)
        )
    ].join("\n");

    // Download blob
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

