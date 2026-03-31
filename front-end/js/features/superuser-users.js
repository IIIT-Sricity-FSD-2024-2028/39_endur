import { showToast, formatDate, genId, appendAuditLog } from './admin-utils.js';

let users = [];
let session = null;

export async function renderSuperuserUsers() {
    const sessionRaw = localStorage.getItem('endurSession');
    session = sessionRaw ? JSON.parse(sessionRaw) : null;

    users = JSON.parse(localStorage.getItem("systemUsers")) || [];

    renderUsersTable();
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No users found.</td></tr>';
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
                    <button class="btn-small btn-danger-soft" onclick="confirmDeleteUser('${u.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function roleBadge(role) {
    const map = {
        superuser: 'danger',
        admin: 'primary',
        dean: 'progress',
        hod: 'warning',
        faculty: 'neutral',
        student: 'success'
    };
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
                        <button class="btn-small btn-danger-soft" onclick="confirmDeleteUser('${u.id}')">Delete</button>
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

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors(form);

        const errs = [];
        const name = form.userName.value.trim();
        const id = form.userId.value.trim();
        const role = form.userRole.value;
        const dept = form.userDept.value.trim();
        const password = form.userPassword.value;
        const editId = form.dataset.editId;

        if (!name) errs.push(['userName', 'Full name is required.']);
        if (!id) errs.push(['userId', 'User ID is required.']);
        if (!role) errs.push(['userRole', 'Role is required.']);
        if (!dept) errs.push(['userDept', 'Department is required.']);
        if (!editId && !password) errs.push(['userPassword', 'Password is required for new users.']);

        if (!editId && users.find(u => u.id === id)) {
            errs.push(['userId', 'A user with this ID already exists.']);
        }

        if (errs.length) {
            errs.forEach(([fieldId, msg]) => showFieldError(form, fieldId, msg));
            return;
        }

        if (editId) {
            const idx = users.findIndex(u => u.id === editId);
            if (idx > -1) {
                users[idx] = { ...users[idx], name, id, role, department: dept };
                if (password) users[idx].password = password;
            }
            appendAuditLog(session, 'superuser', 'UPDATE', 'Users', `${id} — ${name}`, `User details updated.`);
            showToast(`User "${name}" updated successfully.`, 'success');
        } else {
            users.push({ id, password, name, role, department: dept });
            appendAuditLog(session, 'superuser', 'CREATE', 'Users', `${id} — ${name}`, `New ${role} account created.`);
            showToast(`User "${name}" created successfully.`, 'success');
        }
        localStorage.setItem("systemUsers", JSON.stringify(users));

        renderUsersTable();
        updateUserCount();
        closeUserModal();
    });
}

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
    if (elF) elF.textContent = users.filter(u => u.role === 'faculty' || u.role === 'hod' || u.role === 'dean').length;
    const elSt = document.getElementById('statStaff');
    if (elSt) elSt.textContent = users.filter(u => u.role === 'admin' || u.role === 'superuser').length;
}

function closeUserModal() {
    document.getElementById('userModal')?.classList.remove('active');
    const form = document.getElementById('userForm');
    if (form) { form.reset(); delete form.dataset.editId; }
    const title = document.getElementById('userModalTitle');
    if (title) title.textContent = 'Add New User';
    const pwGroup = document.getElementById('passwordGroup');
    if (pwGroup) pwGroup.querySelector('label').textContent = 'Password';
}

// ===== GLOBAL HANDLERS =====
window.openAddUser = () => {
    const form = document.getElementById('userForm');
    if (form) { form.reset(); delete form.dataset.editId; clearErrors(form); }
    document.getElementById('userModal')?.classList.add('active');
};

window.openEditUser = (id) => {
    const u = users.find(u => u.id === id);
    if (!u) return;
    const form = document.getElementById('userForm');
    if (!form) return;
    clearErrors(form);
    form.userName.value = u.name;
    form.userId.value = u.id;
    form.userRole.value = u.role;
    form.userDept.value = u.department || '';
    form.userPassword.value = '';
    form.dataset.editId = id;
    const title = document.getElementById('userModalTitle');
    if (title) title.textContent = 'Edit User';
    const pwLabel = document.querySelector('label[for="userPassword"]');
    if (pwLabel) pwLabel.textContent = 'New Password (leave blank to keep current)';
    document.getElementById('userModal')?.classList.add('active');
};

window.confirmDeleteUser = (id) => {
    const u = users.find(u => u.id === id);
    if (!u) return;
    document.getElementById('deleteUserName').textContent = `${u.name} (${u.id})`;
    document.getElementById('confirmDeleteBtn').onclick = () => {
        users = users.filter(u => u.id !== id);
        localStorage.setItem("systemUsers", JSON.stringify(users));
        appendAuditLog(session, 'superuser', 'DELETE', 'Users', `${id} — ${u.name}`, `User account removed.`);
        showToast(`User "${u.name}" deleted.`, 'info');
        renderUsersTable();
        updateUserCount();
        closeDeleteModal();
    };
    document.getElementById('deleteModal')?.classList.add('active');
};

window.closeUserModal = closeUserModal;
window.closeDeleteModal = () => document.getElementById('deleteModal')?.classList.remove('active');
