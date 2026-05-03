import { GET, POST, DELETE } from '../core/api.js';
import { showToast } from './admin-utils.js';

let departments = [];

export async function initDepartments() {
    try {
        departments = await GET('/departments');
    } catch {
        showToast('Failed to load departments', 'error');
        departments = [];
    }
    renderDepartments();
}

function renderDepartments() {
    const tbody = document.getElementById('departmentTableBody');
    if (!tbody) return;

    if (!departments.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;">No departments found.</td></tr>';
        return;
    }

    tbody.innerHTML = departments.map(d => `
        <tr>
            <td><span class="badge neutral" style="font-family:monospace">${d.id}</span></td>
            <td><strong>${d.name}</strong></td>
            <td>
                <button class="btn-small btn-danger-soft" onclick="deleteDepartment('${d.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

export function openAddDepartment() {
    const form = document.getElementById('deptForm');
    if (form) form.reset();
    document.getElementById('deptModal')?.classList.add('active');
}

export function closeDeptModal() {
    document.getElementById('deptModal')?.classList.remove('active');
}

export async function saveDepartment() {
    let id = document.getElementById('deptId').value.trim();
    const name = document.getElementById('deptName').value.trim();

    if (!id || !name) {
        showToast('ID and Name are required', 'error');
        return;
    }

    if (!/^DEPT-[a-zA-Z0-9]+$/.test(id.toUpperCase())) {
        showToast('Department ID must start with "DEPT-" and contain only alphanumeric characters.', 'error');
        return;
    }
    id = id.toUpperCase();

    try {
        const newDept = await POST('/departments', { id, name });
        departments.push(newDept);
        renderDepartments();
        closeDeptModal();
        showToast('Department created successfully', 'success');
    } catch (e) {
        showToast(e.message || 'Failed to create department', 'error');
    }
}

export async function deleteDepartment(id) {
    if (!confirm(`Are you sure you want to delete department ${id}? This may break association with existing users and courses.`)) return;
    
    try {
        await DELETE(`/departments/${id}`);
        departments = departments.filter(d => d.id !== id);
        renderDepartments();
        showToast('Department deleted successfully', 'success');
    } catch (e) {
        showToast(e.message || 'Failed to delete', 'error');
    }
}

// ===== BULK IMPORT =====

export function openBulkModal() {
    document.getElementById('bulkFileInput').value = '';
    const section = document.getElementById('bulkPreviewSection');
    if (section) section.style.display = 'none';
    window.__bulkImportData = null;
    document.getElementById('bulkModal')?.classList.add('active');
}

export function closeBulkModal() {
    document.getElementById('bulkModal')?.classList.remove('active');
    window.__bulkImportData = null;
}

export async function previewBulkFile() {
    const fileInput = document.getElementById('bulkFileInput');
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    const text = await file.text();

    let parsed = [];
    try {
        if (file.name.endsWith('.json')) {
            const raw = JSON.parse(text);
            parsed = Array.isArray(raw) ? raw : raw.departments || [];
        } else if (file.name.endsWith('.csv')) {
            parsed = parseCSV(text);
        } else {
            showToast('Only .json and .csv files are supported.', 'error');
            return;
        }
    } catch (err) {
        showToast('Failed to parse file: ' + err.message, 'error');
        return;
    }

    const invalid = parsed.filter(d => !d.id || !d.name || !d.id.toUpperCase().startsWith('DEPT-') || !/^DEPT-[A-Z0-9]+$/.test(d.id.toUpperCase()));
    if (invalid.length > 0) {
        showToast(`Found ${invalid.length} invalid rows. Ensure id starts with DEPT- and has no special characters.`, 'error');
        return;
    }

    window.__bulkImportData = parsed;
    const preview = document.getElementById('bulkPreviewBody');
    const section = document.getElementById('bulkPreviewSection');
    if (preview) {
        preview.innerHTML = parsed.slice(0, 20).map(d => `
            <tr>
                <td><span class="badge neutral" style="font-family:monospace">${d.id.toUpperCase()}</span></td>
                <td>${d.name}</td>
            </tr>
        `).join('');
    }
    if (section) {
        section.style.display = 'block';
        document.getElementById('bulkPreviewCount').textContent = `${parsed.length} departments ready`;
    }
}

export async function commitBulkImport() {
    const data = window.__bulkImportData;
    if (!data || !data.length) { showToast('No data to import.', 'error'); return; }

    const btn = document.getElementById('commitBulkBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

    try {
        // Map to uppercase id
        const payload = data.map(d => ({ id: d.id.toUpperCase(), name: d.name }));
        const result = await POST('/departments/bulk', payload);
        
        // Response format is { message, added: [] }
        if (result.added && result.added.length > 0) {
            departments.push(...result.added);
            renderDepartments();
            showToast(`Successfully imported ${result.added.length} new departments.`, 'success');
        } else {
            showToast('No new departments imported. They may already exist.', 'info');
        }
        
        closeBulkModal();
    } catch (err) {
        showToast('Bulk import failed: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Confirm Import'; }
    }
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    // Lowercase headers for consistent object mapping
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => { 
            if (vals[i]) obj[h] = vals[i]; 
        });
        return obj;
    }).filter(obj => Object.keys(obj).length > 0);
}
