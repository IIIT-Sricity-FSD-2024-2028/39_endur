import { GET, POST, PATCH, DELETE, getSession } from '../core/api.js';
import { showToast, genId, appendAuditLog } from './admin-utils.js';

let deptConfigs = {};
let statuses = {};
let session = null;
let allDepts = [];

export async function renderSuperuserParameters() {
    session = getSession();
    try {
        const flatParams = await GET('/evaluation-parameters');
        statuses = await GET('/evaluation-parameters/status');

        // Rebuild deptConfigs from flat list
        deptConfigs = {};
        flatParams.forEach(p => {
            if (!deptConfigs[p.department]) deptConfigs[p.department] = [];
            deptConfigs[p.department].push(p);
        });
        allDepts = Object.keys(deptConfigs).sort();
    } catch (e) {
        showToast('Failed to load parameters from server.', 'error');
        deptConfigs = {};
        statuses = {};
    }

    renderParamsTable();
    populateDeptDropdown(allDepts);
    bindParamForm();
    bindSearch();
    updateParamCount();
}

function populateDeptDropdown(depts) {
    const select = document.getElementById('paramDepts');
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Select a department...</option>';
    depts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
    });
}

function renderParamsTable(filter = '') {
    const tbody = document.getElementById('paramsTableBody');
    if (!tbody) return;

    let flatList = [];
    Object.entries(deptConfigs).forEach(([dept, params]) => {
        params.forEach(p => {
            flatList.push({ ...p, department: dept, status: statuses[dept] || 'DRAFT' });
        });
    });

    const list = filter
        ? flatList.filter(p => p.name.toLowerCase().includes(filter) || p.department.toLowerCase().includes(filter))
        : flatList;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">No parameters found.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(p => {
        const displayStatus = p.status === 'SUBMITTED' ? 'IN REVIEW' : (p.status === 'APPROVED' ? 'APPROVED' : 'DRAFT');
        const badgeClass = p.status === 'APPROVED' ? 'success' : (p.status === 'SUBMITTED' ? 'warning' : 'neutral');
        const deptParams = deptConfigs[p.department] || [];
        const totalWeight = deptParams.reduce((sum, item) => sum + (item.weight || 0), 0);
        const weightStatus = totalWeight === 100 ? '✅ 100%' : `⚠️ ${totalWeight}%`;
        const weightColor = totalWeight === 100 ? 'var(--success)' : 'var(--danger)';

        return `
        <tr>
            <td>
                <strong>${p.name}</strong><br>
                <small style="color:var(--text-muted);font-size:0.8rem">${p.description || ''}</small><br>
                <span style="font-size:0.7rem;color:var(--primary);font-weight:600;">${p.department}</span>
                <span style="font-size:0.7rem;color:${weightColor};font-weight:700;margin-left:8px;">(${weightStatus})</span>
            </td>
            <td>${p.weight > 0 ? `<strong>${p.weight}%</strong>` : '—'}</td>
            <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="openEditParam('${p.id}', '${p.department}')">Edit</button>
                    <button class="btn-small btn-danger-soft" onclick="openDeleteParam('${p.id}', '${p.department}')">Delete</button>
                    ${p.status === 'SUBMITTED' ? `<button class="btn-small btn-primary" style="padding:4px 8px;font-size:11px;" onclick="approveDeptParams('${p.department}')">Approve</button>` : ''}
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

function bindSearch() {
    const search = document.getElementById('paramSearch');
    if (search) search.oninput = () => renderParamsTable(search.value.toLowerCase());
}

function bindParamForm() {
    const form = document.getElementById('paramForm');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const name = form.paramName.value.trim();
        const desc = form.paramDesc.value.trim();
        const weight = parseInt(form.paramWeight.value) || 0;
        const deptStr = form.paramDepts.value.trim();
        const editId = form.dataset.editId;
        const editDept = form.dataset.editDept;

        if (!name || !deptStr) { showToast('Name and Department are required.', 'error'); return; }

        try {
            if (editId) {
                await PATCH(`/evaluation-parameters/${editId}/dept/${encodeURIComponent(editDept)}`, { name, description: desc, weight });
                showToast('Parameter updated.', 'success');
            } else {
                await POST('/evaluation-parameters', { name, description: desc, weight, department: deptStr });
                showToast('Parameter saved.', 'success');
            }
        } catch (err) {
            showToast(err.message || 'Failed to save parameter.', 'error');
            return;
        }

        await renderSuperuserParameters();
        closeParamModal();
    };
}

function updateParamCount() {
    let total = 0;
    let active = 0;
    Object.values(deptConfigs).forEach(ps => total += ps.length);
    Object.entries(statuses).forEach(([d, s]) => { if (s === 'APPROVED') active += (deptConfigs[d]?.length || 0); });
    if (document.getElementById('statTotalParams')) document.getElementById('statTotalParams').textContent = total;
    if (document.getElementById('statActiveParams')) document.getElementById('statActiveParams').textContent = active;
}

window.openAddParam = () => {
    const form = document.getElementById('paramForm');
    if (form) { form.reset(); delete form.dataset.editId; delete form.dataset.editDept; form.paramDepts.value = ''; }
    document.getElementById('paramModalTitle').textContent = 'Add Evaluation Parameter';
    document.getElementById('paramModal')?.classList.add('active');
};

window.openEditParam = (id, dept) => {
    const p = (deptConfigs[dept] || []).find(p => p.id === id);
    if (!p) return;
    const form = document.getElementById('paramForm');
    if (!form) return;
    form.paramName.value = p.name;
    form.paramDesc.value = p.description || '';
    form.paramWeight.value = p.weight;
    form.paramDepts.value = dept;
    form.dataset.editId = id;
    form.dataset.editDept = dept;
    document.getElementById('paramModalTitle').textContent = 'Edit Parameter';
    document.getElementById('paramModal')?.classList.add('active');
};

window.openDeleteParam = (id, dept) => {
    const p = (deptConfigs[dept] || []).find(p => p.id === id);
    if (!p) return;
    document.getElementById('deleteItemName').textContent = p.name;
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.onclick = async () => {
        try {
            await DELETE(`/evaluation-parameters/${id}/dept/${encodeURIComponent(dept)}`);
            showToast('Parameter deleted.', 'success');
            await renderSuperuserParameters();
        } catch (err) { showToast(err.message, 'error'); }
        closeDeleteModal();
    };
    document.getElementById('deleteModal')?.classList.add('active');
};

window.approveDeptParams = async (dept) => {
    try {
        await POST(`/evaluation-parameters/dept/${encodeURIComponent(dept)}/approve`, {});
        showToast(`${dept} parameters approved!`, 'success');
        await renderSuperuserParameters();
    } catch (err) { showToast(err.message, 'error'); }
};

window.closeParamModal = () => document.getElementById('paramModal')?.classList.remove('active');
window.closeDeleteModal = () => document.getElementById('deleteModal')?.classList.remove('active');
