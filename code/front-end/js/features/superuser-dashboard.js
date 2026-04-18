import { GET } from '../core/api.js';
import { formatDate } from './admin-utils.js';

export async function renderSuperuserDashboard() {
    try {
        const [users, cycles, params, logsRes] = await Promise.all([
            GET('/users'),
            GET('/feedback-cycles'),
            GET('/evaluation-parameters'),
            GET('/audit-logs?limit=5'),
        ]);
        const logs = logsRes.data || [];

        // Stats
        safeSet('statTotalUsers', users.length);
        safeSet('statTotalCycles', cycles.length);
        safeSet('statActiveCycles', cycles.filter(c => c.status === 'active').length);
        safeSet('statActiveParams', params.length);

        // Role breakdown
        const roleCounts = users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});
        const roleBreakdown = document.getElementById('roleBreakdown');
        if (roleBreakdown) {
            const roles = ['student', 'faculty', 'hod', 'dean', 'admin', 'superuser'];
            roleBreakdown.innerHTML = roles.map(r => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--glass-border)">
                    <span style="display:flex;align-items:center;gap:8px">
                        <span class="badge ${roleBadge(r)}" style="min-width:80px;text-align:center">${r}</span>
                    </span>
                    <strong>${roleCounts[r] || 0}</strong>
                </div>
            `).join('');
        }

        // Recent cycles
        const cyclesList = document.getElementById('recentCyclesList');
        if (cyclesList) {
            cyclesList.innerHTML = cycles.slice(0, 3).map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--glass-border)">
                    <div>
                        <strong style="font-size:0.9rem">${c.cycleName}</strong>
                        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">${formatDate(c.startTimestamp)} → ${formatDate(c.endTimestamp)}</p>
                    </div>
                    <span class="badge ${c.status === 'active' ? 'success' : 'neutral'}">${c.status}</span>
                </div>
            `).join('');
        }

        // Recent audit log
        const recentLog = document.getElementById('recentLogBody');
        if (recentLog) {
            recentLog.innerHTML = logs.map(l => `
                <tr>
                    <td style="color:var(--text-muted);font-size:0.8rem;white-space:nowrap">${formatDate(l.timestamp)}</td>
                    <td><strong>${l.actorName}</strong></td>
                    <td><span class="badge ${actionBadge(l.action)}">${l.action}</span></td>
                    <td>${l.module}</td>
                    <td style="font-size:0.875rem;color:var(--text-muted);max-width:180px">${l.details}</td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Superuser dashboard error:', e);
    }
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function roleBadge(role) {
    const map = { superuser: 'danger', admin: 'primary', dean: 'progress', hod: 'warning', faculty: 'neutral', student: 'success' };
    return map[role] || 'neutral';
}

function actionBadge(action) {
    const map = { CREATE: 'success', UPDATE: 'primary', DELETE: 'danger', APPROVE: 'progress', BULK_CREATE: 'success' };
    return map[action] || 'neutral';
}
