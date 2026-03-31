import { showToast, genId, appendAuditLog } from './admin-utils.js';
import { get, set } from '../core/storage.js';

let deptConfigs = {}; // { deptName: [params] }
let statuses = {};    // { deptName: 'DRAFT'|'SUBMITTED'|'APPROVED' }
let session = null;

export async function renderSuperuserParameters() {
    const sessionRaw = localStorage.getItem('endurSession');
    session = sessionRaw ? JSON.parse(sessionRaw) : null;

    // Load from HOD source of truth
    const drafts = get("draftParameters") || {};
    const finals = get("activeParameters") || {};
    statuses = get("departmentConfigStatus") || {};

    // Merge for SU view (favor draft if submitted)
    deptConfigs = {};
    const allDepts = new Set([...Object.keys(drafts), ...Object.keys(finals)]);
    allDepts.forEach(d => {
        deptConfigs[d] = drafts[d] || finals[d] || [];
    });

    renderParamsTable();
    bindParamForm();
    bindSearch();
    updateParamCount();
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
        ? flatList.filter(p =>
            p.name.toLowerCase().includes(filter) ||
            p.department.toLowerCase().includes(filter))
        : flatList;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">No parameters found.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(p => {
        const displayStatus = p.status === 'SUBMITTED' ? 'IN REVIEW' : (p.status === 'APPROVED' ? 'APPROVED' : 'DRAFT');
        const badgeClass = p.status === 'APPROVED' ? 'success' : (p.status === 'SUBMITTED' ? 'warning' : 'neutral');

        return `
        <tr>
            <td>
                <strong>${p.name}</strong><br>
                <small style="color:var(--text-muted);font-size:0.8rem">${p.desc || p.description || ''}</small><br>
                <span style="font-size:0.7rem; color:var(--primary); font-weight:600;">${p.department}</span>
            </td>
            <td>${p.weight > 0 ? `<strong>${p.weight}%</strong>` : '—'}</td>
            <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="openEditParam('${p.id}', '${p.department}')">Edit</button>
                    ${p.status === 'SUBMITTED' ? `<button class="btn-small btn-primary" style="padding:4px 8px; font-size:11px;" onclick="approveDeptParams('${p.department}')">Approve Dept</button>` : ''}
                </div>
            </td>
        </tr>
    `}).join('');
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
        const desc = form.paramDesc.value.trim();
        const weight = parseInt(form.paramWeight.value) || 0;
        const deptStr = form.paramDepts.value.trim();
        const editId = form.dataset.editId;
        const editDept = form.dataset.editDept;

        if (!name || !deptStr) { showToast('Name and Department are required.', 'error'); return; }

        const entry = {
            id: editId || genId('p'),
            name, desc, weight
        };

        let allDrafts = get("draftParameters") || {};
        if (!allDrafts[deptStr]) allDrafts[deptStr] = [];

        if (editId && editDept === deptStr) {
            const idx = allDrafts[deptStr].findIndex(p => p.id === editId);
            if (idx > -1) allDrafts[deptStr][idx] = entry;
        } else {
            allDrafts[deptStr].unshift(entry);
        }

        set("draftParameters", allDrafts);
        appendAuditLog(session, 'superuser', 'UPDATE', 'Parameters', `${deptStr} — ${name}`, 'Parameter details modified by Superuser.');
        showToast('Parameter saved to drafts.', 'success');
        
        renderSuperuserParameters();
        closeParamModal();
    });
}

function updateParamCount() {
    let total = 0;
    let active = 0;
    Object.values(deptConfigs).forEach(ps => total += ps.length);
    Object.entries(statuses).forEach(([d, s]) => { if(s === 'APPROVED') active += (deptConfigs[d]?.length || 0); });

    if (document.getElementById('statTotalParams')) document.getElementById('statTotalParams').textContent = total;
    if (document.getElementById('statActiveParams')) document.getElementById('statActiveParams').textContent = active;
}

window.openAddParam = () => {
    const form = document.getElementById('paramForm');
    if (form) { form.reset(); delete form.dataset.editId; delete form.dataset.editDept; }
    document.getElementById('paramModal')?.classList.add('active');
};

window.openEditParam = (id, dept) => {
    const p = (deptConfigs[dept] || []).find(p => p.id === id);
    if (!p) return;
    const form = document.getElementById('paramForm');
    if (!form) return;
    form.paramName.value = p.name;
    form.paramDesc.value = p.desc || p.description || '';
    form.paramWeight.value = p.weight;
    form.paramDepts.value = dept;
    form.dataset.editId = id;
    form.dataset.editDept = dept;
    document.getElementById('paramModalTitle').textContent = 'Edit Parameter';
    document.getElementById('paramModal')?.classList.add('active');
};

window.approveDeptParams = (dept) => {
    let allStatuses = get("departmentConfigStatus") || {};
    let allDrafts = get("draftParameters") || {};
    let allActive = get("activeParameters") || {};

    allActive[dept] = allDrafts[dept];
    allStatuses[dept] = 'APPROVED';

    set("activeParameters", allActive);
    set("departmentConfigStatus", allStatuses);

    appendAuditLog(session, 'superuser', 'APPROVE', 'Parameters', `${dept} Configuration`, 'Department evaluation parameters approved.');
    showToast(`${dept} parameters approved!`, 'success');
    renderSuperuserParameters();
};

window.closeParamModal = () => {
    document.getElementById('paramModal')?.classList.remove('active');
};
window.closeDeleteModal = () => document.getElementById('deleteModal')?.classList.remove('active');
