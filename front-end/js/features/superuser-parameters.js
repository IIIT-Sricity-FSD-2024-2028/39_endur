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

    // Get all unique departments from system users
    const users = get("systemUsers") || [];
    const allDepts = [...new Set(users.map(u => u.department || u.dept).filter(Boolean))].sort();

    // Merge for SU view
    deptConfigs = {};
    allDepts.forEach(d => {
        deptConfigs[d] = drafts[d] || finals[d] || [];
    });

    renderParamsTable();
    populateDeptDropdown(allDepts);

    // FIX: Call these bindings safely. By using .onsubmit, we prevent the "quadrupling" listener duplication bug.
    bindParamForm();
    bindSearch();

    updateParamCount();
}

function populateDeptDropdown(depts) {
    const select = document.getElementById('paramDepts');
    if (!select) return;

    // Preserve the original disabled option
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

        const deptParams = p.department ? (deptConfigs[p.department] || []) : [];
        const totalWeight = deptParams.reduce((sum, item) => sum + (item.weight || 0), 0);
        const weightStatus = totalWeight === 100 ? '✅ 100%' : `⚠️ ${totalWeight}%`;
        const weightColor = totalWeight === 100 ? 'var(--success)' : 'var(--danger)';

        return `
        <tr>
            <td>
                <strong>${p.name}</strong><br>
                <small style="color:var(--text-muted);font-size:0.8rem">${p.desc || p.description || ''}</small><br>
                <span style="font-size:0.7rem; color:var(--primary); font-weight:600;">${p.department}</span>
                <span style="font-size:0.7rem; color:${weightColor}; font-weight:700; margin-left:8px;">(${weightStatus})</span>
            </td>
            <td>${p.weight > 0 ? `<strong>${p.weight}%</strong>` : '—'}</td>
            <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="openEditParam('${p.id}', '${p.department}')">Edit</button>
                    <button class="btn-small btn-danger-soft" onclick="openDeleteParam('${p.id}', '${p.department}')">Delete</button>
                    ${p.status === 'SUBMITTED' ? `<button class="btn-small btn-primary" style="padding:4px 8px; font-size:11px;" onclick="approveDeptParams('${p.department}')">Approve</button>` : ''}
                </div>
            </td>
        </tr>
    `}).join('');
}

function bindSearch() {
    const search = document.getElementById('paramSearch');
    // FIX: Use oninput instead of addEventListener to prevent duplication loops
    if (search) {
        search.oninput = () => renderParamsTable(search.value.toLowerCase());
    }
}

function bindParamForm() {
    const form = document.getElementById('paramForm');
    if (!form) return;

    // FIX: Use onsubmit to completely overwrite any existing listener, preventing the 4x/8x duplicating loop bug.
    form.onsubmit = (e) => {
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
    if (form) { 
        form.reset(); 
        delete form.dataset.editId; 
        delete form.dataset.editDept; 
        // Reset the select styling
        form.paramDepts.value = "";
    }
    document.getElementById('paramModalTitle').textContent = 'Add Evaluation Parameter';
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

// FIX: New Delete Logic
window.openDeleteParam = (id, dept) => {
    const p = (deptConfigs[dept] || []).find(p => p.id === id);
    if (!p) return;

    document.getElementById('deleteItemName').textContent = p.name;
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    // Wire the confirmation button to safely delete this exact ID
    confirmBtn.onclick = () => {
        let allDrafts = get("draftParameters") || {};
        if (allDrafts[dept]) {
            allDrafts[dept] = allDrafts[dept].filter(item => item.id !== id);
            set("draftParameters", allDrafts);

            appendAuditLog(session, 'superuser', 'DELETE', 'Parameters', `${dept} — ${p.name}`, 'Parameter deleted by Superuser.');
            showToast('Parameter deleted successfully.', 'success');

            renderSuperuserParameters();
        }
        closeDeleteModal();
    };

    document.getElementById('deleteModal')?.classList.add('active');
};

window.approveDeptParams = (dept) => {
    let allStatuses = get("departmentConfigStatus") || {};
    let allDrafts = get("draftParameters") || {};
    let allActive = get("activeParameters") || {};

    const deptParams = allDrafts[dept] || [];
    const totalWeight = deptParams.reduce((sum, p) => sum + (p.weight || 0), 0);

    if (totalWeight !== 100) {
        showToast(`Cannot approve ${dept}. Total weightage is ${totalWeight}% but must be 100%.`, "error");
        return;
    }

    allActive[dept] = deptParams;
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
