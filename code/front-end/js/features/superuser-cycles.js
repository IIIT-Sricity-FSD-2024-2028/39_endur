import { GET, POST, PATCH, DELETE, getSession } from '../core/api.js';
import { showToast, formatDate, appendAuditLog } from './admin-utils.js';

let cycles = [];
let session = null;

export async function renderSuperuserCycles() {
    session = getSession();
    try {
        cycles = await GET('/feedback-cycles');
    } catch (e) {
        showToast('Failed to load cycles from server.', 'error');
        cycles = [];
    }
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
            <td><span class="badge neutral">${c.type || 'weekly'}</span></td>
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

    const search = document.getElementById('cycleSearch');
    search?.addEventListener('input', () => renderCycleTable(search.value.toLowerCase()));

    form.onsubmit = async (e) => {
        e.preventDefault();
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

        const payload = {
            cycleName: name,
            type,
            startTimestamp: new Date(start).toISOString(),
            endTimestamp: new Date(end).toISOString(),
            reflectionDeadline: refDl ? new Date(refDl).toISOString() : undefined,
            actionReportDeadline: actDl ? new Date(actDl).toISOString() : undefined,
        };

        const editId = form.dataset.editId;
        try {
            if (editId) {
                const updated = await PATCH(`/feedback-cycles/${editId}`, payload);
                const idx = cycles.findIndex(c => c.cycleId === editId);
                if (idx > -1) cycles[idx] = updated;
                showToast('Cycle updated.', 'success');
            } else {
                const created = await POST('/feedback-cycles', payload);
                cycles.unshift(created);
                showToast('Cycle created.', 'success');
            }
        } catch (err) {
            showToast(err.message || 'Failed to save cycle.', 'error');
            return;
        }

        renderCycleTable();
        updateCycleCount();
        suCloseCycleModal();
    };
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
    document.getElementById('cycleModalTitle').textContent = 'Create Feedback Cycle';
    document.getElementById('cycleModal')?.classList.add('active');
};

window.suEditCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (!c) return;
    const form = document.getElementById('cycleForm');
    if (!form) return;
    form.cycleName.value = c.cycleName;
    form.cycleType.value = c.type || 'weekly';
    form.startDate.value = c.startTimestamp?.slice(0, 10) || '';
    form.endDate.value = c.endTimestamp?.slice(0, 10) || '';
    form.reflectionDeadline.value = c.reflectionDeadline?.slice(0, 10) || '';
    form.actionReportDeadline.value = c.actionReportDeadline?.slice(0, 10) || '';
    form.dataset.editId = id;
    document.getElementById('cycleModalTitle').textContent = 'Edit Feedback Cycle';
    document.getElementById('cycleModal')?.classList.add('active');
};

window.suCloseCycle = async (id) => {
    try {
        const updated = await PATCH(`/feedback-cycles/${id}/status`, { status: 'closed', phase: 'COMPLETED' });
        const idx = cycles.findIndex(c => c.cycleId === id);
        if (idx > -1) cycles[idx] = updated;
        renderCycleTable();
        showToast('Cycle closed.', 'info');
    } catch (err) { showToast(err.message, 'error'); }
};

window.suReopenCycle = async (id) => {
    try {
        const updated = await PATCH(`/feedback-cycles/${id}/status`, { status: 'active' });
        const idx = cycles.findIndex(c => c.cycleId === id);
        if (idx > -1) cycles[idx] = updated;
        renderCycleTable();
        showToast('Cycle re-opened.', 'success');
    } catch (err) { showToast(err.message, 'error'); }
};

window.suDeleteCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (!c) return;
    document.getElementById('deleteItemName').textContent = c.cycleName;
    document.getElementById('confirmDeleteBtn').onclick = async () => {
        try {
            await DELETE(`/feedback-cycles/${id}`);
            cycles = cycles.filter(c => c.cycleId !== id);
            showToast(`Cycle "${c.cycleName}" deleted.`, 'info');
            renderCycleTable();
            updateCycleCount();
        } catch (err) { showToast(err.message, 'error'); }
        document.getElementById('deleteModal')?.classList.remove('active');
    };
    document.getElementById('deleteModal')?.classList.add('active');
};

window.suCloseCycleModal = suCloseCycleModal;
window.closeDeleteModal = () => document.getElementById('deleteModal')?.classList.remove('active');
