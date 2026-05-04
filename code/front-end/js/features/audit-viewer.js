import { GET, getSession } from '../core/api.js';
import { formatDateTime } from './admin-utils.js';

let logs = [];

export async function renderAuditView() {
    try {
        const result = await GET('/audit-logs?limit=200');
        logs = result.data || [];
    } catch (e) {
        logs = [];
        console.error('Failed to load audit logs:', e);
    }
    renderLogTable();
    bindFilters();
}

function renderLogTable(filter = { role: '', action: '' }) {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    const filtered = logs.filter(l => {
        const roleMatch = !filter.role || l.actorRole === filter.role;
        const actionMatch = !filter.action || l.action === filter.action;
        return roleMatch && actionMatch;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No audit entries found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(l => `
        <tr>
            <td style="white-space:nowrap;color:var(--text-muted);font-size:0.85rem">${formatDateTime(l.timestamp)}</td>
            <td><strong>${l.actorName}</strong><br><small style="color:var(--text-muted)">${l.actor}</small></td>
            <td><span class="badge ${roleBadge(l.actorRole)}">${l.actorRole}</span></td>
            <td><span class="badge ${actionBadge(l.action)}">${l.action}</span></td>
            <td>${l.module}</td>
            <td style="max-width:220px;font-size:0.875rem;color:var(--text-muted)">${l.details}</td>
        </tr>
    `).join('');
}

function bindFilters() {
    const roleFilter = document.getElementById('filterRole');
    const actionFilter = document.getElementById('filterAction');
    function applyFilters() { renderLogTable({ role: roleFilter?.value || '', action: actionFilter?.value || '' }); }
    roleFilter?.addEventListener('change', applyFilters);
    actionFilter?.addEventListener('change', applyFilters);
}

function roleBadge(role) {
    const map = { superuser: 'danger', admin: 'primary', dean: 'progress', hod: 'warning', faculty: 'neutral', student: 'neutral' };
    return map[role] || 'neutral';
}

function actionBadge(action) {
    const map = { 
        CREATE: 'success', 
        UPDATE: 'primary', 
        DELETE: 'danger', 
        APPROVE: 'progress', 
        VIEW: 'neutral', 
        BULK_CREATE: 'success', 
        BULK_ASSIGN: 'primary',
        ASSIGN: 'primary', 
        SUBMIT: 'warning' 
    };
    return map[action] || 'neutral';
}
