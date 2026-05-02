import { GET, POST, PATCH, DELETE, getSession } from '../core/api.js';
import { showToast, genId, appendAuditLog } from './admin-utils.js';

let deptConfigs = {};
let statuses = {};
let session = null;
let allDepts = [];
let activeCycle = null;

export async function renderSuperuserParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const cycleId = urlParams.get('cycleId');
    if (!cycleId) {
        showToast('No Cycle ID provided. Returning to cycles list.', 'error');
        setTimeout(() => window.location.href = 'manage-cycles.html', 1500);
        return;
    }

    session = getSession();
    try {
        activeCycle = await GET(`/feedback-cycles/${cycleId}`);
        if (!activeCycle.departmentParameters) activeCycle.departmentParameters = {};
        
        deptConfigs = activeCycle.departmentParameters;
        allDepts = Object.keys(deptConfigs).sort();
        
        document.getElementById('statTotalParams').textContent = `Cycle: ${activeCycle.cycleName}`;
        if (document.getElementById('statActiveParams')) document.getElementById('statActiveParams').style.display = 'none';

        statuses = Object.keys(deptConfigs).reduce((acc, d) => ({...acc, [d]: 'APPROVED'}), {});
    } catch (e) {
        showToast('Failed to load cycle data.', 'error');
        deptConfigs = {};
        statuses = {};
    }

    renderParamsTable();
    populateDeptDropdown(allDepts);
    bindParamForm();
    bindSearch();
}

function populateDeptDropdown(depts) {
    const select = document.getElementById('paramDepts');
    if (!select) return;
    
    // Also include all standard departments from endpoint
    GET('/departments').then(sysDepts => {
        const dNames = sysDepts.map(d => d.name);
        [...new Set([...depts, ...dNames])].sort().forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d; select.appendChild(opt);
        });
    }).catch(()=>{});
}

function renderParamsTable(filter = '') {
    const tbody = document.getElementById('paramsTableBody');
    if (!tbody) return;

    let flatList = [];
    Object.entries(deptConfigs).forEach(([dept, params]) => {
        params.forEach(p => { flatList.push({ ...p, department: dept }); });
    });

    const list = filter ? flatList.filter(p => p.name.toLowerCase().includes(filter) || p.department.toLowerCase().includes(filter)) : flatList;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">No parameters.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(p => {
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
            <td><span class="badge success">CYCLE BOUND</span></td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="openEditParam('${p.id}', '${p.department}')">Edit</button>
                    <button class="btn-small btn-danger-soft" onclick="openDeleteParam('${p.id}', '${p.department}')">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function bindSearch() {
    const search = document.getElementById('paramSearch');
    if (search) search.oninput = () => renderParamsTable(search.value.toLowerCase());
}

async function saveCycleParams() {
    try {
        await PATCH(`/feedback-cycles/${activeCycle.cycleId}`, { departmentParameters: deptConfigs });
        showToast('Cycle parameters updated globally!', 'success');
        activeCycle = await GET(`/feedback-cycles/${activeCycle.cycleId}`);
    } catch(e) {
        showToast(e.message || 'Failed to sync cycle', 'error');
    }
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

        if (!deptConfigs[deptStr]) deptConfigs[deptStr] = [];

        if (editId) {
            // Edit mode
            if (editDept !== deptStr) {
                if(deptConfigs[editDept]) deptConfigs[editDept] = deptConfigs[editDept].filter(x => x.id !== editId);
            }
            const existingInNew = deptConfigs[deptStr].find(x => x.id === editId);
            if (existingInNew) {
                existingInNew.name = name; existingInNew.description = desc; existingInNew.weight = weight;
            } else {
                deptConfigs[deptStr].push({ id: editId, name, description: desc, weight });
            }
        } else {
            // Create mode
            deptConfigs[deptStr].push({ id: 'P_'+Date.now(), name, description: desc, weight });
        }

        await saveCycleParams();
        renderParamsTable();
        closeParamModal();
    };
}


export function openAddParam() {
    const form = document.getElementById('paramForm');
    if (form) { form.reset(); delete form.dataset.editId; delete form.dataset.editDept; form.paramDepts.value = ''; }
    document.getElementById('paramModalTitle').textContent = 'Add Evaluation Parameter';
    document.getElementById('paramModal')?.classList.add('active');
}

export function openEditParam(id, dept) {
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
}

export function openDeleteParam(id, dept) {
    const p = (deptConfigs[dept] || []).find(p => p.id === id);
    if (!p) return;
    document.getElementById('deleteItemName').textContent = p.name;
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.onclick = async () => {
        try {
            deptConfigs[dept] = deptConfigs[dept].filter(x => x.id !== id);
            await saveCycleParams();
            showToast('Parameter deleted from cycle.', 'success');
            renderParamsTable();
        } catch (err) { showToast(err.message, 'error'); }
        closeDeleteModal();
    };
    document.getElementById('deleteModal')?.classList.add('active');
}

export async function approveDeptParams(dept) {
    try {
        await POST(`/evaluation-parameters/dept/${encodeURIComponent(dept)}/approve`, {});
        showToast(`${dept} parameters approved!`, 'success');
        await renderSuperuserParameters();
    } catch (err) { showToast(err.message, 'error'); }
}

export function closeParamModal() { document.getElementById('paramModal')?.classList.remove('active'); }
export function closeDeleteModal() { document.getElementById('deleteModal')?.classList.remove('active'); }

// ===== BULK IMPORT =====
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        if (obj.weight) obj.weight = Number(obj.weight) || 0;
        return obj;
    });
}

export function openParamBulkModal() {
    document.getElementById('paramBulkModal')?.classList.add('active');
    document.getElementById('paramBulkPreviewSection').style.display = 'none';
    document.getElementById('paramBulkFileInput').value = '';
}
export function closeParamBulkModal() { document.getElementById('paramBulkModal')?.classList.remove('active'); }

export async function previewParamBulkFile() {
    const file = document.getElementById('paramBulkFileInput')?.files[0];
    if (!file) { showToast('Please select a file first.', 'error'); return; }
    const text = await file.text();
    let parsed = [];
    try {
        if (file.name.endsWith('.json')) { const raw = JSON.parse(text); parsed = Array.isArray(raw) ? raw : raw.params || []; }
        else if (file.name.endsWith('.csv')) { parsed = parseCSV(text); }
        else { showToast('Only .json and .csv files are supported.', 'error'); return; }
    } catch (err) { showToast('Failed to parse file: ' + err.message, 'error'); return; }
    if (!parsed.length) { showToast('No valid data found.', 'error'); return; }
    const missing = parsed.filter(p => !p.name || !p.department || p.weight === undefined);
    if (missing.length) { showToast(`${missing.length} rows missing required fields (name, department, weight).`, 'error'); return; }
    window.__bulkParamData = parsed;
    const preview = document.getElementById('paramBulkPreviewBody');
    if (preview) preview.innerHTML = parsed.slice(0, 20).map(p => `<tr><td>${p.name}</td><td>${p.department}</td><td>${p.weight}%</td><td>${p.type || 'rating'}</td></tr>`).join('');
    const section = document.getElementById('paramBulkPreviewSection');
    if (section) { section.style.display = 'block'; document.getElementById('paramBulkPreviewCount').textContent = `${parsed.length} parameters to import`; }
}

export async function commitParamBulkImport() {
    const data = window.__bulkParamData;
    if (!data?.length) { showToast('No data to import.', 'error'); return; }
    const btn = document.getElementById('commitParamBulkBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    try {
        const result = await POST('/evaluation-parameters/bulk', { params: data });
        const { success, failed, total } = result;
        showToast(`Imported ${success.length}/${total} parameters. ${failed.length ? failed.length + ' failed.' : ''}`, success.length > 0 ? 'success' : 'error');
        await renderSuperuserParameters();
        closeParamBulkModal();
    } catch (err) { showToast('Bulk import failed: ' + err.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Confirm Import'; } }
}
