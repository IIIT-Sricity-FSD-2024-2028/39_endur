import { GET, POST, PATCH, DELETE, getSession } from '../core/api.js';
import { showToast, formatDate, appendAuditLog, exportToCSV } from './admin-utils.js';

export function exportCycles() {
    if (!cycles.length) { showToast('No cycles to export.', 'error'); return; }
    const rows = cycles.map(c => ({
        CycleID: c.cycleId,
        Name: c.cycleName || c.name || 'Untitled',
        Start: c.startTimestamp,
        End: c.endTimestamp,
        StudentDeadline: c.studentDeadline || '',
        Status: c.status
    }));
    exportToCSV(`Endur_Cycles_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    showToast(`Exported ${rows.length} cycles.`, 'success');
}

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
        ? cycles.filter(c =>
            (c.cycleName || '').toLowerCase().includes(filter) ||
            (c.name || '').toLowerCase().includes(filter) ||
            (c.cycleId || '').toLowerCase().includes(filter)
        )
        : cycles;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No cycles found.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(c => `
        <tr>
            <td><code style="background:rgba(59,130,246,0.1);padding:2px 8px;border-radius:4px;font-size:0.85rem">${c.cycleId}</code></td>
            <td><strong>${c.cycleName || c.name || c.cycleId || 'Untitled Cycle'}</strong></td>
            <td>${formatDate(c.startTimestamp)} → ${formatDate(c.endTimestamp)}</td>
            <td><span class="badge ${c.status === 'active' ? 'success' : 'neutral'}">${c.status}</span></td>
            <td>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn-small" onclick="suViewCycleResponses('${c.cycleId}')">View</button>
                    <button class="btn-small" onclick="suEditCycle('${c.cycleId}')">Edit</button>
                    ${c.status === 'active'
            ? `<button class="btn-small" style="color:var(--warning)" onclick="suCloseCycle('${c.cycleId}')">Close</button>`
            : `<button class="btn-small" style="color:var(--accent)" onclick="suReopenCycle('${c.cycleId}')">Reopen</button>`
        }
                    <button class="btn-small" style="background:#5b21b6;color:#fff;" onclick="suManageCycleParams('${c.cycleId}')">Parameters</button>
                    ${session?.role === 'superuser' ? `<button class="btn-small btn-danger-soft" onclick="suDeleteCycle('${c.cycleId}')">Delete</button>` : ''}
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
        const type = form.cycleType?.value || '';
        const start = form.startDate?.value || '';
        const end = form.endDate?.value || '';
        const refDl = form.reflectionDeadline?.value || '';
        const actDl = form.actionReportDeadline?.value || '';

        if (!name) errs.push('Cycle name is required.');
        if (!start) errs.push('Start date is required.');
        if (!end) errs.push('End date is required.');
        if (start && end && start > end) errs.push('End date must be after start date.');
        if (errs.length) { showToast(errs[0], 'error'); return; }

        const payload = {
            cycleName: name,
            type: form.cycleType?.value || 'weekly',
            startTimestamp: new Date(start).toISOString(),
            studentDeadline: form.studentDeadline?.value ? new Date(form.studentDeadline.value).toISOString() : new Date(end).toISOString(),
            endTimestamp: new Date(end).toISOString(),
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

// Superuser View Responses — studentId IS visible
export function suViewCycleResponses(cycleId) {
    suViewCycleResponsesAsync(cycleId);
}

export async function suViewCycleResponsesAsync(cycleId) {
    let modal = document.getElementById('suResponsesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'suResponsesModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-card" style="max-width:800px;width:95%">
            <h3 id="suRespTitle">Cycle Responses <button class="modal-close" onclick="document.getElementById('suResponsesModal').classList.remove('active')">&#x2715;</button></h3>
            <div style="overflow-x:auto;max-height:60vh;overflow-y:auto" id="suRespBody"></div>
            <div class="modal-footer"><button class="btn-outline" onclick="document.getElementById('suResponsesModal').classList.remove('active')">Close</button></div>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
    }
    const body = document.getElementById('suRespBody');
    const title = document.getElementById('suRespTitle');
    const cycle = cycles.find(c => c.cycleId === cycleId);
    title.textContent = `Responses — ${cycle?.cycleName ?? cycleId} (Superuser)`;
    body.innerHTML = '<p style="padding:20px;color:var(--text-muted)">Loading…</p>';
    modal.classList.add('active');
    try {
        const [responses, allCourses] = await Promise.all([GET(`/feedback-responses?cycleId=${cycleId}`), GET('/courses')]);
        if (!responses.length) { body.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-muted)">No responses recorded for this cycle.</p>'; return; }

        body.innerHTML = `
            <style>
                .resp-det { font-size: 11px; color: #64748b; margin-top: 4px; padding: 4px; background: #f8fafc; border-radius: 4px; border: 1px solid #e2e8f0; }
                .resp-comm { display: block; font-style: italic; color: #94a3b8; border-top: 1px solid #f1f5f9; margin-top: 2px; padding-top: 2px; }
            </style>
            <table class="data-table">
                <thead><tr><th>Student & Course</th><th>Faculty</th><th>Dept</th><th>Date</th><th>Score & Breakdown</th></tr></thead>
                <tbody>
                ${responses.map(r => {
            const course = allCourses.find(c => c.id === r.courseId);
            const scores = (r.ratings || []).map(x => {
                let s = Number(x.score || 0);
                if (s > 5) s = s / 20;
                return s;
            });
            const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length * 20).toFixed(1) + '%' : '—';

            const ratingsHtml = (r.ratings || []).map(rt => {
                let s = Number(rt.score || 0);
                if (s > 5) s = s / 20;
                return `<div class="resp-det">
                            <strong>${rt.paramName || rt.paramId}</strong>: ${s.toFixed(1)}/5
                            ${rt.comment ? `<span class="resp-comm">"${rt.comment}"</span>` : ''}
                        </div>`;
            }).join('');

            const isSuper = session?.role === 'superuser';
            const displayStudentId = isSuper ? (r.studentId ?? '—') : 'S-***';

            return `<tr>
                        <td>
                            <code style="font-size:10px;color:var(--primary)">${displayStudentId}</code><br>
                            <strong>${course?.name ?? r.courseId}</strong>
                        </td>
                        <td>${r.facultyId ?? '—'}</td>
                        <td>${r.studentDepartment ?? '—'}</td>
                        <td style="font-size:12px">${r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}</td>
                        <td>
                            <div style="font-weight:700;color:var(--primary);margin-bottom:4px">${avg}</div>
                            ${ratingsHtml}
                        </td>
                    </tr>`;
        }).join('')}
                </tbody>
            </table>`;
    } catch (e) {
        console.error(e);
        body.innerHTML = '<p style="padding:20px;color:var(--danger)">Failed to load responses.</p>';
    }
}

export async function suManageCycleParams(cycleId) {
    let modal = document.getElementById('suParamsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'suParamsModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-card" style="max-width:900px;width:95%">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 id="suParamsTitle">Cycle Parameters</h3>
                <button class="btn-primary btn-small" onclick="suAddParamToCycle()">+ Add Parameter</button>
            </div>
            <div style="margin-bottom:16px;display:flex;gap:12px;">
                <input type="text" id="suParamSearch" class="search-bar" placeholder="Search parameters..." style="margin:0;flex:1">
            </div>
            <div style="overflow-x:auto;max-height:60vh;overflow-y:auto">
                <table class="data-table">
                    <thead><tr><th>Name / Dept</th><th>Weight</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody id="suParamsBody"></tbody>
                </table>
            </div>
            <div class="modal-footer">
                <button class="btn-outline" onclick="document.getElementById('suParamsModal').classList.remove('active')">Close</button>
            </div>
        </div>`;
        document.body.appendChild(modal);

        // Add the Add/Edit Modal
        const editModal = document.createElement('div');
        editModal.id = 'suParamEditModal';
        editModal.className = 'modal-overlay';
        editModal.innerHTML = `<div class="modal-card" style="max-width:500px">
            <h3 id="suParamEditTitle">Edit Parameter</h3>
            <form id="suParamEditForm">
                <div class="form-group"><label>Name</label><input type="text" id="suPName" required></div>
                <div class="form-group"><label>Description</label><textarea id="suPDesc" rows="2"></textarea></div>
                <div class="form-group"><label>Weight (%)</label><input type="number" id="suPWeight" min="0" max="100" required></div>
                <div class="form-group">
                    <label>Department</label>
                    <select id="suPDept" required></select>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-outline" onclick="document.getElementById('suParamEditModal').classList.remove('active')">Cancel</button>
                    <button type="submit" class="btn-primary">Save Parameter</button>
                </div>
            </form>
        </div>`;
        document.body.appendChild(editModal);
    }

    const cycle = cycles.find(c => c.cycleId === cycleId);
    if (!cycle) { showToast('Cycle not found.', 'error'); return; }

    window.__currentCycleId = cycleId;
    window.__currentCycleStatus = cycle.status;
    window.__currentCyclePhase = cycle.phase;
    window.__cycleParams = cycle.departmentParameters || {};

    // Hide add button if closed or past Phase 1
    const isLocked = cycle.status === 'closed' || (cycle.phase && cycle.phase !== 'PREPARATION');
    const addBtn = document.querySelector('#suParamsModal .btn-primary.btn-small');
    if (addBtn) addBtn.style.display = isLocked ? 'none' : 'block';

    document.getElementById('suParamsTitle').textContent = `Parameters — ${cycle.cycleName || cycle.name || cycleId} ${isLocked ? '(View Only)' : ''}`;
    modal.classList.add('active');
    renderParamsInModal();
}

function renderParamsInModal(filter = '') {
    const tbody = document.getElementById('suParamsBody');
    const configs = window.__cycleParams;
    const isLocked = window.__currentCycleStatus === 'closed' || (window.__currentCyclePhase && window.__currentCyclePhase !== 'PREPARATION');
    
    let flatList = [];
    Object.entries(configs).forEach(([dept, params]) => {
        params.forEach(p => { flatList.push({ ...p, department: dept }); });
    });

    const list = filter ? flatList.filter(p => p.name.toLowerCase().includes(filter) || p.department.toLowerCase().includes(filter)) : flatList;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">No parameters defined for this cycle.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(p => {
        const deptParams = configs[p.department] || [];
        const totalWeight = deptParams.reduce((sum, item) => sum + (item.weight || 0), 0);
        const weightStatus = totalWeight === 100 ? '✅ 100%' : `⚠️ ${totalWeight}%`;
        const weightColor = totalWeight === 100 ? 'var(--success)' : 'var(--danger)';

        const actionButtons = isLocked ? '' : `
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="suEditParamInCycle('${p.id}', '${p.department}')">Edit</button>
                    <button class="btn-small btn-danger-soft" onclick="suDeleteParamFromCycle('${p.id}', '${p.department}')">Delete</button>
                </div>`;

        return `<tr>
            <td>
                <strong>${p.name}</strong><br>
                <small style="color:var(--text-muted);font-size:0.8rem">${p.description || ''}</small><br>
                <span style="font-size:0.7rem;color:var(--primary);font-weight:600;">${p.department}</span>
                <span style="font-size:0.7rem;color:${weightColor};font-weight:700;margin-left:8px;">(${weightStatus})</span>
            </td>
            <td><strong>${p.weight}%</strong></td>
            <td><span class="badge success">CYCLE BOUND</span> ${isLocked ? '<span class="badge neutral">LOCKED</span>' : ''}</td>
            <td>${actionButtons}</td>
        </tr>`;
    }).join('');

    // Bind search
    const search = document.getElementById('suParamSearch');
    search.oninput = () => renderParamsInModal(search.value.toLowerCase());
}

window.suAddParamToCycle = async () => {
    const form = document.getElementById('suParamEditForm');
    form.reset();
    delete form.dataset.editId;
    delete form.dataset.editDept;

    // Populate departments
    const deptSelect = document.getElementById('suPDept');
    deptSelect.innerHTML = '<option value="">Select Department...</option>';
    try {
        const sysDepts = await GET('/departments');
        sysDepts.sort((a, b) => a.name.localeCompare(b.name)).forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.name; opt.textContent = d.name; deptSelect.appendChild(opt);
        });
    } catch (e) { }

    document.getElementById('suParamEditTitle').textContent = 'Add Parameter to Cycle';
    document.getElementById('suParamEditModal').classList.add('active');

    form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('suPName').value.trim();
        const desc = document.getElementById('suPDesc').value.trim();
        const weight = parseInt(document.getElementById('suPWeight').value) || 0;
        const dept = document.getElementById('suPDept').value;

        if (!name || !dept) return;

        if (!window.__cycleParams[dept]) window.__cycleParams[dept] = [];
        window.__cycleParams[dept].push({ id: 'P_' + Date.now(), name, description: desc, weight });

        await suSaveCycleParams();
        document.getElementById('suParamEditModal').classList.remove('active');
    };
};

window.suEditParamInCycle = async (id, dept) => {
    const p = (window.__cycleParams[dept] || []).find(x => x.id === id);
    if (!p) return;

    const form = document.getElementById('suParamEditForm');
    form.reset();
    document.getElementById('suPName').value = p.name;
    document.getElementById('suPDesc').value = p.description || '';
    document.getElementById('suPWeight').value = p.weight;

    const deptSelect = document.getElementById('suPDept');
    deptSelect.innerHTML = `<option value="${dept}">${dept}</option>`;

    document.getElementById('suParamEditTitle').textContent = 'Edit Parameter';
    document.getElementById('suParamEditModal').classList.add('active');

    form.onsubmit = async (e) => {
        e.preventDefault();
        p.name = document.getElementById('suPName').value.trim();
        p.description = document.getElementById('suPDesc').value.trim();
        p.weight = parseInt(document.getElementById('suPWeight').value) || 0;

        await suSaveCycleParams();
        document.getElementById('suParamEditModal').classList.remove('active');
    };
};

window.suDeleteParamFromCycle = async (id, dept) => {
    if (!confirm('Are you sure you want to remove this parameter from the cycle?')) return;
    window.__cycleParams[dept] = (window.__cycleParams[dept] || []).filter(x => x.id !== id);
    await suSaveCycleParams();
};

async function suSaveCycleParams() {
    try {
        const updated = await PATCH(`/feedback-cycles/${window.__currentCycleId}`, { departmentParameters: window.__cycleParams });
        const idx = cycles.findIndex(c => c.cycleId === window.__currentCycleId);
        if (idx > -1) cycles[idx] = { ...cycles[idx], ...updated };
        showToast('Parameters updated.', 'success');
        renderCycleTable(document.getElementById('cycleSearch')?.value.toLowerCase() || '');
        updateCycleCount();
        renderParamsInModal(document.getElementById('suParamSearch').value.toLowerCase());
    } catch (e) {
        showToast(e.message || 'Failed to update parameters.', 'error');
    }
}

function updateCycleCount() {
    const el = document.getElementById('statTotalCycles');
    if (el) el.textContent = cycles.length;
    const el2 = document.getElementById('statActiveCycles');
    if (el2) el2.textContent = cycles.filter(c => c.status === 'active').length;
}

export function suCloseCycleModal() {
    document.getElementById('cycleModal')?.classList.remove('active');
    const form = document.getElementById('cycleForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    const title = document.getElementById('cycleModalTitle');
    if (title) title.textContent = 'Create Feedback Cycle';
}

export function suOpenAddCycle() {
    const form = document.getElementById('cycleForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    document.getElementById('cycleModalTitle').textContent = 'Create Feedback Cycle';
    document.getElementById('cycleModal')?.classList.add('active');
}

export function suEditCycle(id) {
    const c = cycles.find(c => c.cycleId === id);
    if (!c) return;
    const form = document.getElementById('cycleForm');
    if (!form) return;
    if (form.cycleName) form.cycleName.value = c.cycleName || c.name || '';
    if (form.startDate) form.startDate.value = c.startTimestamp?.slice(0, 10) || '';
    if (form.studentDeadline) form.studentDeadline.value = c.studentDeadline?.slice(0, 10) || '';
    if (form.endDate) form.endDate.value = c.endTimestamp?.slice(0, 10) || '';
    form.dataset.editId = id;
    document.getElementById('cycleModalTitle').textContent = 'Edit Feedback Cycle';
    document.getElementById('cycleModal')?.classList.add('active');
}

export async function suCloseCycle(id) {
    try {
        const updated = await PATCH(`/feedback-cycles/${id}/status`, { status: 'closed', phase: 'COMPLETED' });
        const idx = cycles.findIndex(c => c.cycleId === id);
        if (idx > -1) cycles[idx] = updated;
        renderCycleTable();
        showToast('Cycle closed.', 'info');
    } catch (err) { showToast(err.message, 'error'); }
}

export async function suReopenCycle(id) {
    try {
        const updated = await PATCH(`/feedback-cycles/${id}/status`, { status: 'active' });
        const idx = cycles.findIndex(c => c.cycleId === id);
        if (idx > -1) cycles[idx] = updated;
        renderCycleTable();
        showToast('Cycle re-opened.', 'success');
    } catch (err) { showToast(err.message, 'error'); }
}

export function suDeleteCycle(id) {
    const c = cycles.find(c => c.cycleId === id);
    if (!c) return;
    const displayName = c.cycleName || c.name || id;
    document.getElementById('deleteItemName').textContent = displayName;
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.onclick = async () => {
        try {
            await DELETE(`/feedback-cycles/${id}`);
            cycles = cycles.filter(c => c.cycleId !== id);
            showToast(`Cycle "${displayName}" deleted.`, 'info');
            renderCycleTable();
            updateCycleCount();
        } catch (err) { showToast(err.message, 'error'); }
        document.getElementById('deleteModal')?.classList.remove('active');
    };
    document.getElementById('deleteModal')?.classList.add('active');
}

export const closeDeleteModal = () => document.getElementById('deleteModal')?.classList.remove('active');

// ===== BULK IMPORT =====
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    const parsedRows = lines.slice(1).map(line => {
        // match commas outside quotes
        const vals = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
    });

    const cycleMap = {};
    parsedRows.forEach(row => {
        const cName = row.cycleName || row.Name || row.name || '';
        if (!cName) return;

        if (!cycleMap[cName]) {
            cycleMap[cName] = {
                cycleName: cName,
                type: row.type || row.Type || 'weekly',
                startTimestamp: row.startTimestamp || row.Start || '',
                endTimestamp: row.endTimestamp || row.End || '',
                studentDeadline: row.studentDeadline || row.StudentDeadline || '',
                reflectionDeadline: row.reflectionDeadline || '',
                actionReportDeadline: row.actionReportDeadline || '',
                parametersJson: row.parametersJson || undefined,
                responses: []
            };
        }

        if (row.facultyId || row.facultyIds) {
            cycleMap[row.cycleName].responses.push({
                studentId: row.studentId || '',
                courseId: row.courseId || '',
                facultyId: row.facultyId || row.facultyIds || '',
                ratingsJson: row.ratingsJson || '',
                openEndedComment: row.openEndedComment || ''
            });
        }
    });

    return Object.values(cycleMap);
}

export function openCycleBulkModal() {
    document.getElementById('cycleBulkModal')?.classList.add('active');
    document.getElementById('cycleBulkPreviewSection').style.display = 'none';
    document.getElementById('cycleBulkFileInput').value = '';
}
export function closeCycleBulkModal() { document.getElementById('cycleBulkModal')?.classList.remove('active'); }

export async function previewCycleBulkFile() {
    const file = document.getElementById('cycleBulkFileInput')?.files[0];
    if (!file) { showToast('Please select a file first.', 'error'); return; }
    const text = await file.text();
    let parsed = [];
    try {
        if (file.name.endsWith('.json')) { const raw = JSON.parse(text); parsed = Array.isArray(raw) ? raw : raw.cycles || []; }
        else if (file.name.endsWith('.csv')) { parsed = parseCSV(text); }
        else { showToast('Only .json and .csv files are supported.', 'error'); return; }
    } catch (err) { showToast('Failed to parse file: ' + err.message, 'error'); return; }
    if (!parsed.length) { showToast('No valid data found.', 'error'); return; }
    const missing = parsed.filter(c => !c.cycleName || !c.startTimestamp || !c.endTimestamp);
    if (missing.length) { showToast(`${missing.length} rows missing required fields (cycleName, startTimestamp, endTimestamp).`, 'error'); return; }
    window.__bulkCycleData = parsed;
    const preview = document.getElementById('cycleBulkPreviewBody');
    if (preview) preview.innerHTML = parsed.slice(0, 20).map(c => `<tr><td>${c.cycleName}</td><td>${formatDate(c.startTimestamp)}</td><td>${formatDate(c.endTimestamp)}</td></tr>`).join('');
    const section = document.getElementById('cycleBulkPreviewSection');
    if (section) { section.style.display = 'block'; document.getElementById('cycleBulkPreviewCount').textContent = `${parsed.length} cycles to import`; }
}

export async function commitCycleBulkImport() {
    const data = window.__bulkCycleData;
    if (!data?.length) { showToast('No data to import.', 'error'); return; }
    const btn = document.getElementById('commitCycleBulkBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    try {
        const result = await POST('/feedback-cycles/bulk', { cycles: data });
        const { success, failed, total } = result;
        cycles.unshift(...success);
        renderCycleTable();
        updateCycleCount();
        showToast(`Imported ${success.length}/${total} cycles. ${failed.length ? failed.length + ' failed.' : ''}`, success.length > 0 ? 'success' : 'error');
        closeCycleBulkModal();
    } catch (err) { showToast('Bulk import failed: ' + err.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Confirm Import'; } }
}
