import { showToast, formatDate, genId, appendAuditLog } from './admin-utils.js';

let cycles = [];
let session = null;

export async function renderSuperuserCycles() {
    const sessionRaw = localStorage.getItem('endurSession');
    session = sessionRaw ? JSON.parse(sessionRaw) : null;

    const res = await fetch('../../js/mock-data/feedbackCycles.json');
    cycles = await res.json();

    renderCycleTable();
    bindCycleForm();
    updateCycleCount();
}

function renderCycleTable(filter = '') {
    const tbody = document.getElementById('cyclesTableBody');
    if (!tbody) return;

    const list = filter
        ? cycles.filter(c => c.cycleName.toLowerCase().includes(filter) || c.cycleId.toLowerCase().includes(filter))
        : cycles;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No cycles found.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(c => `
        <tr>
            <td><code style="background:rgba(59,130,246,0.1);padding:2px 8px;border-radius:4px;font-size:0.85rem">${c.cycleId}</code></td>
            <td><strong>${c.cycleName}</strong></td>
            <td><span class="badge neutral">${c.type}</span></td>
            <td>${formatDate(c.startTimestamp)} → ${formatDate(c.endTimestamp)}</td>
            <td><span class="badge ${c.status === 'active' ? 'success' : 'neutral'}">${c.status}</span></td>
            <td>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn-small" onclick="suEditCycle('${c.cycleId}')">Edit</button>
                    ${c.status === 'active'
                        ? `<button class="btn-small" style="color:var(--warning)" onclick="suCloseCycle('${c.cycleId}')">Close</button>`
                        : `<button class="btn-small" style="color:var(--accent)" onclick="suReopenCycle('${c.cycleId}')">Reopen</button>`
                    }
                    <button class="btn-small btn-danger-soft" onclick="suDeleteCycle('${c.cycleId}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function bindCycleForm() {
    const form = document.getElementById('cycleForm');
    if (!form) return;

    // Search
    const search = document.getElementById('cycleSearch');
    search?.addEventListener('input', () => renderCycleTable(search.value.toLowerCase()));

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Validate
        const errs = [];
        const name = form.cycleName.value.trim();
        const type = form.cycleType.value;
        const start = form.startDate.value;
        const end = form.endDate.value;
        const refDl = form.reflectionDeadline.value;
        const actDl = form.actionReportDeadline.value;

        if (!name) errs.push('Cycle name is required.');
        if (!start) errs.push('Start date is required.');
        if (!end) errs.push('End date is required.');
        if (start && end && start > end) errs.push('End date must be after start date.');

        if (errs.length) { showToast(errs[0], 'error'); return; }

        const editId = form.dataset.editId;
        const entry = {
            cycleId: editId || genId('CYCLE'),
            cycleName: name,
            type,
            startTimestamp: new Date(start).toISOString(),
            endTimestamp: new Date(end).toISOString(),
            reflectionDeadline: refDl ? new Date(refDl).toISOString() : null,
            actionReportDeadline: actDl ? new Date(actDl).toISOString() : null,
            status: editId ? (cycles.find(c => c.cycleId === editId)?.status || 'active') : 'active'
        };

        if (editId) {
            const idx = cycles.findIndex(c => c.cycleId === editId);
            if (idx > -1) cycles[idx] = entry;
            appendAuditLog(session, 'superuser', 'UPDATE', 'Feedback Cycles', `${entry.cycleId} — ${name}`, 'Cycle details updated.');
            showToast('Cycle updated.', 'success');
        } else {
            cycles.unshift(entry);
            appendAuditLog(session, 'superuser', 'CREATE', 'Feedback Cycles', `${entry.cycleId} — ${name}`, 'New feedback cycle created.');
            showToast('Cycle created.', 'success');
        }

        renderCycleTable();
        updateCycleCount();
        suCloseCycleModal();
    });
}

function updateCycleCount() {
    const el = document.getElementById('statTotalCycles');
    if (el) el.textContent = cycles.length;
    const el2 = document.getElementById('statActiveCycles');
    if (el2) el2.textContent = cycles.filter(c => c.status === 'active').length;
}

function suCloseCycleModal() {
    document.getElementById('cycleModal')?.classList.remove('active');
    const form = document.getElementById('cycleForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    const title = document.getElementById('cycleModalTitle');
    if (title) title.textContent = 'Create Feedback Cycle';
}

window.suOpenAddCycle = () => {
    const form = document.getElementById('cycleForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    const title = document.getElementById('cycleModalTitle');
    if (title) title.textContent = 'Create Feedback Cycle';
    document.getElementById('cycleModal')?.classList.add('active');
};

window.suEditCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (!c) return;
    const form = document.getElementById('cycleForm');
    if (!form) return;
    form.cycleName.value = c.cycleName;
    form.cycleType.value = c.type;
    form.startDate.value = c.startTimestamp?.slice(0, 10) || '';
    form.endDate.value = c.endTimestamp?.slice(0, 10) || '';
    form.reflectionDeadline.value = c.reflectionDeadline?.slice(0, 10) || '';
    form.actionReportDeadline.value = c.actionReportDeadline?.slice(0, 10) || '';
    form.dataset.editId = id;
    const title = document.getElementById('cycleModalTitle');
    if (title) title.textContent = 'Edit Feedback Cycle';
    document.getElementById('cycleModal')?.classList.add('active');
};

window.suCloseCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (c) { c.status = 'closed'; renderCycleTable(); showToast('Cycle closed.', 'info'); }
};

window.suReopenCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (c) { c.status = 'active'; renderCycleTable(); showToast('Cycle re-opened.', 'success'); }
};

window.suDeleteCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (!c) return;
    document.getElementById('deleteItemName').textContent = c.cycleName;
    document.getElementById('confirmDeleteBtn').onclick = () => {
        cycles = cycles.filter(c => c.cycleId !== id);
        appendAuditLog(session, 'superuser', 'DELETE', 'Feedback Cycles', `${id} — ${c.cycleName}`, 'Cycle permanently deleted.');
        showToast(`Cycle "${c.cycleName}" deleted.`, 'info');
        renderCycleTable();
        updateCycleCount();
        document.getElementById('deleteModal')?.classList.remove('active');
    };
    document.getElementById('deleteModal')?.classList.add('active');
};

window.suCloseCycleModal = suCloseCycleModal;
window.closeDeleteModal = () => document.getElementById('deleteModal')?.classList.remove('active');
