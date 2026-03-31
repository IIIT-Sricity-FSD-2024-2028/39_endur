import { showToast, formatDate, genId, appendAuditLog } from './admin-utils.js';

let params = [];
let session = null;

export async function renderSuperuserParameters() {
    const sessionRaw = localStorage.getItem('endurSession');
    session = sessionRaw ? JSON.parse(sessionRaw) : null;

    const res = await fetch('../../js/mock-data/evaluationParameters.json');
    params = await res.json();

    renderParamsTable();
    bindParamForm();
    bindSearch();
    updateParamCount();
}

function renderParamsTable(filter = '') {
    const tbody = document.getElementById('paramsTableBody');
    if (!tbody) return;

    const list = filter
        ? params.filter(p =>
            p.name.toLowerCase().includes(filter) ||
            p.status.toLowerCase().includes(filter))
        : params;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No parameters found.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(p => `
        <tr>
            <td><strong>${p.name}</strong><br><small style="color:var(--text-muted);font-size:0.8rem">${p.description}</small></td>
            <td><span class="badge neutral">${p.type}</span></td>
            <td>${p.weight > 0 ? `<strong>${p.weight}%</strong>` : '—'}</td>
            <td><span class="badge ${p.status === 'active' ? 'success' : 'warning'}">${p.status}</span></td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="openEditParam('${p.id}')">Edit</button>
                    <button class="btn-small btn-danger-soft" onclick="confirmDeleteParam('${p.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function bindSearch() {
    const search = document.getElementById('paramSearch');
    search?.addEventListener('input', () => renderParamsTable(search.value.toLowerCase()));
}

function bindParamForm() {
    const form = document.getElementById('paramForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = form.paramName.value.trim();
        const description = form.paramDesc.value.trim();
        const type = form.paramType.value;
        const weight = parseInt(form.paramWeight.value) || 0;
        const status = form.paramStatus.value;
        const depts = form.paramDepts.value.split(',').map(d => d.trim()).filter(Boolean);
        const editId = form.dataset.editId;

        const errs = [];
        if (!name) errs.push('Parameter name is required.');

        if (errs.length) { showToast(errs[0], 'error'); return; }

        const entry = {
            id: editId || genId('EP'),
            name, description, type, weight, status,
            departments: depts,
            createdBy: session?.id || 'SU001',
            createdAt: editId ? (params.find(p => p.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
        };

        if (editId) {
            const idx = params.findIndex(p => p.id === editId);
            if (idx > -1) params[idx] = entry;
            appendAuditLog(session, 'superuser', 'UPDATE', 'Evaluation Parameters', `${entry.id} — ${name}`, 'Parameter details updated.');
            showToast('Parameter updated.', 'success');
        } else {
            params.unshift(entry);
            appendAuditLog(session, 'superuser', 'CREATE', 'Evaluation Parameters', `${entry.id} — ${name}`, `New ${type} parameter created.`);
            showToast('Parameter created.', 'success');
        }
        localStorage.setItem("systemEvalParams", JSON.stringify(params));

        renderParamsTable();
        updateParamCount();
        closeParamModal();
    });
}

function updateParamCount() {
    const el = document.getElementById('statTotalParams');
    if (el) el.textContent = params.length;
    const el2 = document.getElementById('statActiveParams');
    if (el2) el2.textContent = params.filter(p => p.status === 'active').length;
}

function closeParamModal() {
    document.getElementById('paramModal')?.classList.remove('active');
    const form = document.getElementById('paramForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    const title = document.getElementById('paramModalTitle');
    if (title) title.textContent = 'Add Evaluation Parameter';
}

window.openAddParam = () => {
    const form = document.getElementById('paramForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    document.getElementById('paramModal')?.classList.add('active');
};

window.openEditParam = (id) => {
    const p = params.find(p => p.id === id);
    if (!p) return;
    const form = document.getElementById('paramForm');
    if (!form) return;
    form.paramName.value = p.name;
    form.paramDesc.value = p.description || '';
    form.paramType.value = p.type;
    form.paramWeight.value = p.weight;
    form.paramStatus.value = p.status;
    form.paramDepts.value = (p.departments || []).join(', ');
    form.dataset.editId = id;
    const title = document.getElementById('paramModalTitle');
    if (title) title.textContent = 'Edit Evaluation Parameter';
    document.getElementById('paramModal')?.classList.add('active');
};

window.confirmDeleteParam = (id) => {
    const p = params.find(p => p.id === id);
    if (!p) return;
    document.getElementById('deleteItemName').textContent = p.name;
    document.getElementById('confirmDeleteBtn').onclick = () => {
        params = params.filter(p => p.id !== id);
        localStorage.setItem("systemEvalParams", JSON.stringify(params));
        appendAuditLog(session, 'superuser', 'DELETE', 'Evaluation Parameters', `${id} — ${p.name}`, 'Parameter removed.');
        showToast(`Parameter "${p.name}" deleted.`, 'info');
        renderParamsTable();
        updateParamCount();
        document.getElementById('deleteModal')?.classList.remove('active');
    };
    document.getElementById('deleteModal')?.classList.add('active');
};

window.closeParamModal = closeParamModal;
window.closeDeleteModal = () => document.getElementById('deleteModal')?.classList.remove('active');
