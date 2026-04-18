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
    form.cycleName.value = c.cycleName;
    form.cycleType.value = c.type || 'weekly';
    form.startDate.value = c.startTimestamp?.slice(0, 10) || '';
    form.endDate.value = c.endTimestamp?.slice(0, 10) || '';
    form.reflectionDeadline.value = c.reflectionDeadline?.slice(0, 10) || '';
    form.actionReportDeadline.value = c.actionReportDeadline?.slice(0, 10) || '';
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
    document.getElementById('deleteItemName').textContent = c.cycleName;
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.onclick = async () => {
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
        if (!row.cycleName) return;
        if (!cycleMap[row.cycleName]) {
            cycleMap[row.cycleName] = {
                cycleName: row.cycleName,
                type: row.type || 'weekly',
                startTimestamp: row.startTimestamp,
                endTimestamp: row.endTimestamp,
                reflectionDeadline: row.reflectionDeadline || undefined,
                actionReportDeadline: row.actionReportDeadline || undefined,
                responses: []
            };
        }
        
        // Add responses if available
        if (row.facultyId) {
            cycleMap[row.cycleName].responses.push({
                courseId: row.courseId || '',
                facultyId: row.facultyId || '',
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
    if (preview) preview.innerHTML = parsed.slice(0, 20).map(c => `<tr><td>${c.cycleName}</td><td>${c.type || 'weekly'}</td><td>${formatDate(c.startTimestamp)}</td><td>${formatDate(c.endTimestamp)}</td></tr>`).join('');
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
