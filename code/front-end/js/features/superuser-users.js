import { showToast, formatDate, appendAuditLog } from './admin-utils.js';
import { GET, POST, PATCH, DELETE, getSession } from '../core/api.js';

let users = [];
let departmentsList = [];
let session = null;

export async function renderSuperuserUsers() {
    session = getSession();
    try {
        users = await GET('/users');
        departmentsList = await GET('/departments');
    } catch (e) {
        showToast('Failed to load data from server.', 'error');
        users = [];
        departmentsList = [];
    }

    renderUsersTable();
    populateDeptSelect();
    bindSearch();
    bindUserForm();
    updateUserCount();
}

// ===== RENDER =====
function renderUsersTable(filter = '') {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const list = filter
        ? users.filter(u =>
            u.name.toLowerCase().includes(filter) ||
            u.id.toLowerCase().includes(filter) ||
            u.role.toLowerCase().includes(filter) ||
            (u.department || '').toLowerCase().includes(filter))
        : users;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(u => `
        <tr>
            <td><code style="background:rgba(59,130,246,0.1);padding:2px 8px;border-radius:4px;font-size:0.85rem">${u.id}</code></td>
            <td><strong>${u.name}</strong></td>
            <td><span class="badge ${roleBadge(u.role)}">${u.role}</span></td>
            <td>${u.department || '—'}</td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="openEditUser('${u.id}')">Edit</button>
                    ${u.id !== 'SU001' ? `<button class="btn-small btn-danger-soft" onclick="confirmDeleteUser('${u.id}')">Delete</button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function populateDeptSelect() {
    const list = document.getElementById('userDept');
    if (!list) return;
    list.innerHTML = '<option value="">Select Department</option>' + 
        departmentsList.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

function roleBadge(role) {
    const map = { superuser: 'danger', admin: 'primary', dean: 'progress', hod: 'warning', faculty: 'neutral', student: 'success' };
    return map[role] || 'neutral';
}

// ===== SEARCH =====
function bindSearch() {
    const search = document.getElementById('userSearch');
    const filterRole = document.getElementById('filterRole');

    function applyFilters() {
        const q = search?.value.toLowerCase() || '';
        const role = filterRole?.value || '';
        const list = users.filter(u => {
            const matchQ = !q || u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q) || (u.department || '').toLowerCase().includes(q);
            const matchRole = !role || u.role === role;
            return matchQ && matchRole;
        });

        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No users match your search.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(u => `
            <tr>
                <td><code style="background:rgba(59,130,246,0.1);padding:2px 8px;border-radius:4px;font-size:0.85rem">${u.id}</code></td>
                <td><strong>${u.name}</strong></td>
                <td><span class="badge ${roleBadge(u.role)}">${u.role}</span></td>
                <td>${u.department || '—'}</td>
                <td>
                    <div style="display:flex;gap:8px;">
                        <button class="btn-small" onclick="openEditUser('${u.id}')">Edit</button>
                        ${u.id !== 'SU001' ? `<button class="btn-small btn-danger-soft" onclick="confirmDeleteUser('${u.id}')">Delete</button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }

    search?.addEventListener('input', applyFilters);
    filterRole?.addEventListener('change', applyFilters);
}

// ===== FORM HANDLING =====
function bindUserForm() {
    const form = document.getElementById('userForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(form);

        const errs = [];
        const name = form.userName.value.trim();
        const id = form.userId.value.trim();
        const role = form.userRole.value;
        const dept = form.userDept.value.trim();
        const email = form.userEmail.value.trim();
        const password = form.userPassword.value;
        const editId = form.dataset.editId;

        if (!name) errs.push(['userName', 'Full name is required.']);
        if (!id) errs.push(['userId', 'User ID is required.']);
        if (!role) errs.push(['userRole', 'Role is required.']);
        if (!dept) errs.push(['userDept', 'Department is required.']);
        if (!editId && !password) errs.push(['userPassword', 'Password is required for new users.']);

        if (id && !/^[a-zA-Z0-9]+$/.test(id)) {
            errs.push(['userId', 'User ID cannot contain special characters.']);
        }
        if (id && role) {
            const rolePrefixes = {
                student: 'S', faculty: 'F', admin: 'A',
                dean: 'D', hod: 'H', superuser: 'SU'
            };
            const prefix = rolePrefixes[role];
            if (prefix && !id.toUpperCase().startsWith(prefix)) {
                errs.push(['userId', `User ID for ${role} must start with '${prefix}'.`]);
            }
        }

        if (errs.length) { errs.forEach(([f, m]) => showFieldError(form, f, m)); return; }

        try {
            if (editId) {
                const update = { name, role, department: dept };
                if (email) update.email = email;
                if (password) update.password = password;
                await PATCH(`/users/${editId}`, update);
                const idx = users.findIndex(u => u.id === editId);
                if (idx > -1) users[idx] = { ...users[idx], ...update };
                showToast(`User "${name}" updated successfully.`, 'success');
            } else {
                const payload = { id, password, name, role, department: dept };
                if (email) payload.email = email;
                const created = await POST('/users', payload);
                users.unshift(created);
                showToast(`User "${name}" created successfully.`, 'success');
            }
        } catch (err) {
            showToast(err.message || 'Failed to save user.', 'error');
            return;
        }

        renderUsersTable();
        updateUserCount();
        closeUserModal();
    });
}

// ===== BULK IMPORT =====
export function openBulkImportModal() {
    const modal = document.getElementById('bulkModal');
    if (modal) modal.classList.add('active');
    document.getElementById('bulkPreviewSection').style.display = 'none';
    document.getElementById('bulkFileInput').value = '';
}

export function closeBulkModal() {
    document.getElementById('bulkModal')?.classList.remove('active');
}

export async function previewBulkFile() {
    const fileInput = document.getElementById('bulkFileInput');
    const file = fileInput?.files[0];
    if (!file) { showToast('Please select a file first.', 'error'); return; }

    const text = await file.text();
    let parsed = [];

    try {
        if (file.name.endsWith('.json')) {
            const raw = JSON.parse(text);
            parsed = Array.isArray(raw) ? raw : raw.users || [];
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

    // Validate IDs and strict fields
    const rolePrefixes = { student: 'S', faculty: 'F', admin: 'A', dean: 'D', hod: 'H', superuser: 'SU' };
    const invalidUsers = parsed.filter(u => {
        if (!u.id || !u.name || !u.role || !u.password) return true;
        if (!/^[a-zA-Z0-9]+$/.test(u.id)) return true;
        const prefix = rolePrefixes[u.role.toLowerCase()];
        return !prefix || !u.id.toUpperCase().startsWith(prefix);
    });

    if (invalidUsers.length > 0) {
        showToast(`Found ${invalidUsers.length} invalid users. Ensure all rows have id, name, role, password, and correct prefixes.`, 'error');
        return;
    }

    // Store parsed for commit
    window.__bulkImportData = parsed;

    // Show preview
    const preview = document.getElementById('bulkPreviewBody');
    const section = document.getElementById('bulkPreviewSection');
    if (preview) {
        preview.innerHTML = parsed.slice(0, 20).map(u => `
            <tr>
                <td>${u.id || '—'}</td>
                <td>${u.name || '—'}</td>
                <td><span class="badge ${roleBadge(u.role || '')}">${u.role || '—'}</span></td>
                <td>${u.department || '—'}</td>
                <td>${u.email || '—'}</td>
            </tr>
        `).join('');
    }
    if (section) {
        section.style.display = 'block';
        document.getElementById('bulkPreviewCount').textContent = `${parsed.length} users to import`;
    }
}

export async function commitBulkImport() {
    const data = window.__bulkImportData;
    if (!data || !data.length) { showToast('No data to import.', 'error'); return; }

    const btn = document.getElementById('commitBulkBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

    try {
        const result = await POST('/users/bulk', { users: data });
        const { success, failed, total } = result;

        // Update local list
        users.unshift(...success);
        renderUsersTable();
        updateUserCount();

        let msg = `Imported ${success.length}/${total} users successfully.`;
        if (failed.length) msg += ` ${failed.length} failed (duplicate IDs).`;
        showToast(msg, success.length > 0 ? 'success' : 'error');

        if (failed.length > 0) console.warn('Failed imports:', failed);

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
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => { 
            let val = vals[i] || '';
            // Handle array fields
            if (h === 'enrolledCourses') {
                obj[h] = val ? val.split(';').map(x => x.trim()) : [];
            } else {
                obj[h] = val;
            }
        });
        return obj;
    });
}

// ===== ERRORS =====
function clearErrors(form) {
    form.querySelectorAll('.form-group').forEach(g => {
        g.classList.remove('has-error');
        const fe = g.querySelector('.field-error');
        if (fe) fe.textContent = '';
    });
}

function showFieldError(form, fieldId, msg) {
    const el = form.querySelector(`#${fieldId}`);
    const group = el?.closest('.form-group');
    if (!group) return;
    group.classList.add('has-error');
    const fe = group.querySelector('.field-error');
    if (fe) fe.textContent = msg;
}

function updateUserCount() {
    const el = document.getElementById('statTotalUsers');
    if (el) el.textContent = users.length;
    const elS = document.getElementById('statStudents');
    if (elS) elS.textContent = users.filter(u => u.role === 'student').length;
    const elF = document.getElementById('statFaculty');
    if (elF) elF.textContent = users.filter(u => ['faculty', 'hod', 'dean'].includes(u.role)).length;
    const elSt = document.getElementById('statStaff');
    if (elSt) elSt.textContent = users.filter(u => ['admin', 'superuser'].includes(u.role)).length;
}

export function closeUserModal() {
    document.getElementById('userModal')?.classList.remove('active');
    const form = document.getElementById('userForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    const title = document.getElementById('userModalTitle');
    if (title) title.textContent = 'Add New User';
    // Reset password label back to required
    const pwLabel = document.querySelector('label[for="userPassword"]');
    if (pwLabel) pwLabel.textContent = 'Password';
}

// ===== GLOBAL HANDLERS =====
export function openAddUser() {
    const form = document.getElementById('userForm');
    if (form) { form.reset(); delete form.dataset.editId; clearErrors(form); }
    document.getElementById('userModal')?.classList.add('active');
}

export function openEditUser(id) {
    const u = users.find(u => u.id === id);
    if (!u) return;
    const form = document.getElementById('userForm');
    if (!form) return;
    clearErrors(form);
    form.userName.value = u.name;
    form.userId.value = u.id;
    form.userRole.value = u.role;
    form.userDept.value = u.department || '';
    form.userEmail.value = u.email || '';
    form.userPassword.value = '';
    form.dataset.editId = id;
    const title = document.getElementById('userModalTitle');
    if (title) title.textContent = 'Edit User';
    // Update password label to signal it's optional when editing
    const pwLabel = document.querySelector('label[for="userPassword"]');
    if (pwLabel) pwLabel.textContent = 'Password (leave blank to keep current)';
    document.getElementById('userModal')?.classList.add('active');
}

export function confirmDeleteUser(id) {
    const u = users.find(u => u.id === id);
    if (!u) return;
    document.getElementById('deleteUserName').textContent = `${u.name} (${u.id})`;
    document.getElementById('confirmDeleteBtn').onclick = async () => {
        try {
            await DELETE(`/users/${id}`);
            users = users.filter(u => u.id !== id);
            showToast(`User "${u.name}" deleted.`, 'info');
            renderUsersTable();
            updateUserCount();
        } catch (err) {
            showToast(err.message || 'Delete failed.', 'error');
        }
        closeDeleteModal();
    };
    document.getElementById('deleteModal')?.classList.add('active');
}

export const closeDeleteModal = () => document.getElementById('deleteModal')?.classList.remove('active');
