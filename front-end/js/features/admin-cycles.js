import { showToast, formatDate, genId, appendAuditLog } from './admin-utils.js';

let cycles = [];

async function loadCycles() {
    if (cycles.length) return cycles;
    const res = await fetch('../../js/mock-data/feedbackCycles.json');
    cycles = await res.json();
    return cycles;
}

// ===== ADMIN DASHBOARD =====
export async function renderAdminDashboard() {
    const [cycleData, params] = await Promise.all([
        fetch('../../js/mock-data/feedbackCycles.json').then(r => r.json()),
        fetch('../../js/mock-data/evaluationParameters.json').then(r => r.json())
    ]);

    const activeCycle = cycleData.find(c => c.status === 'active');
    const totalCycles = cycleData.length;
    const activeParams = params.filter(p => p.status === 'active').length;

    safeSet('statActiveCycle', activeCycle ? activeCycle.cycleName : 'None');
    safeSet('statTotalCycles', totalCycles);
    safeSet('statActiveParams', activeParams);

    // Recent cycles table
    const tbody = document.getElementById('recentCyclesBody');
    if (tbody) {
        tbody.innerHTML = cycleData.slice(0, 5).map(c => `
            <tr>
                <td><strong>${c.cycleId}</strong></td>
                <td>${c.cycleName}</td>
                <td>${formatDate(c.startTimestamp)}</td>
                <td>${formatDate(c.endTimestamp)}</td>
                <td><span class="badge ${c.status === 'active' ? 'success' : 'neutral'}">${c.status}</span></td>
            </tr>
        `).join('');
    }
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ===== CYCLE MANAGEMENT (Admin) =====
export async function renderAdminCycles() {
    await loadCycles();
    renderCycleTable();
    bindCycleForms();
}

function renderCycleTable() {
    const tbody = document.getElementById('cyclesTableBody');
    if (!tbody) return;
    if (!cycles.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No cycles found.</td></tr>';
        return;
    }
    tbody.innerHTML = cycles.map(c => `
        <tr>
            <td><strong>${c.cycleId}</strong></td>
            <td>${c.cycleName}</td>
            <td>${c.type}</td>
            <td>${formatDate(c.startTimestamp)} → ${formatDate(c.endTimestamp)}</td>
            <td><span class="badge ${c.status === 'active' ? 'success' : 'neutral'}">${c.status}</span></td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="editCycle('${c.cycleId}')">Edit</button>
                    ${c.status === 'active'
                        ? `<button class="btn-small" onclick="closeCycle('${c.cycleId}')" style="color:var(--warning)">Close</button>`
                        : `<button class="btn-small" onclick="reopenCycle('${c.cycleId}')" style="color:var(--accent)">Reopen</button>`
                    }
                </div>
            </td>
        </tr>
    `).join('');
}

function bindCycleForms() {
    const form = document.getElementById('cycleForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const errors = validateCycleForm(form);
        if (errors.length) { showToast(errors[0], 'error'); return; }

        const editId = form.dataset.editId;
        const entry = {
            cycleId: editId || genId('CYCLE'),
            cycleName: form.cycleName.value.trim(),
            type: form.cycleType.value,
            startTimestamp: new Date(form.startDate.value).toISOString(),
            endTimestamp: new Date(form.endDate.value).toISOString(),
            reflectionDeadline: new Date(form.reflectionDeadline.value).toISOString(),
            actionReportDeadline: new Date(form.actionReportDeadline.value).toISOString(),
            status: form.dataset.editId ? (cycles.find(c => c.cycleId === editId)?.status || 'active') : 'active'
        };

        if (editId) {
            const idx = cycles.findIndex(c => c.cycleId === editId);
            if (idx > -1) cycles[idx] = entry;
            showToast('Cycle updated successfully.', 'success');
        } else {
            cycles.unshift(entry);
            showToast('Cycle created successfully.', 'success');
        }

        renderCycleTable();
        closeCycleModal();
    });
}

function validateCycleForm(form) {
    const errs = [];
    if (!form.cycleName.value.trim()) errs.push('Cycle name is required.');
    if (!form.startDate.value) errs.push('Start date is required.');
    if (!form.endDate.value) errs.push('End date is required.');
    if (form.startDate.value && form.endDate.value && form.startDate.value > form.endDate.value) {
        errs.push('End date must be after start date.');
    }
    return errs;
}

function closeCycleModal() {
    const overlay = document.getElementById('cycleModal');
    if (overlay) overlay.classList.remove('active');
    const form = document.getElementById('cycleForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    const title = document.getElementById('cycleModalTitle');
    if (title) title.textContent = 'Create Feedback Cycle';
}

// Global handlers
window.editCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (!c) return;
    const form = document.getElementById('cycleForm');
    if (!form) return;
    form.cycleName.value = c.cycleName;
    form.cycleType.value = c.type;
    form.startDate.value = c.startTimestamp ? c.startTimestamp.slice(0, 10) : '';
    form.endDate.value = c.endTimestamp ? c.endTimestamp.slice(0, 10) : '';
    form.reflectionDeadline.value = c.reflectionDeadline ? c.reflectionDeadline.slice(0, 10) : '';
    form.actionReportDeadline.value = c.actionReportDeadline ? c.actionReportDeadline.slice(0, 10) : '';
    form.dataset.editId = id;
    const title = document.getElementById('cycleModalTitle');
    if (title) title.textContent = 'Edit Feedback Cycle';
    document.getElementById('cycleModal')?.classList.add('active');
};

window.closeCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (c) { c.status = 'closed'; renderCycleTable(); showToast('Cycle closed.', 'info'); }
};

window.reopenCycle = (id) => {
    const c = cycles.find(c => c.cycleId === id);
    if (c) { c.status = 'active'; renderCycleTable(); showToast('Cycle re-opened.', 'success'); }
};

window.closeCycleModal = closeCycleModal;
window.openCycleModal = () => {
    const form = document.getElementById('cycleForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    const title = document.getElementById('cycleModalTitle');
    if (title) title.textContent = 'Create Feedback Cycle';
    document.getElementById('cycleModal')?.classList.add('active');
};
