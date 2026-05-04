import { formatDate } from './admin-utils.js';
import { GET } from '../core/api.js';

export async function renderAdminDashboard() {
    const [cycles, depts, users, logRes] = await Promise.all([
        GET('/feedback-cycles').catch(() => []),
        GET('/departments').catch(() => []),
        GET('/users').catch(() => []),
        GET('/audit-logs').catch(() => ({ data: [] }))
    ]);

    const activeCycle = cycles.find(c => c.status === 'active');
    const totalFaculty = users.filter(u => u.role === 'faculty' || u.role === 'hod' || u.role === 'dean').length;

    safeSet('statActiveCycleName', activeCycle ? activeCycle.cycleName : 'None Active');
    safeSet('statTotalCycles', cycles.length);
    safeSet('statTotalDepts', depts.length);
    safeSet('statTotalFaculty', totalFaculty);

    // Active cycle detail banner
    const banner = document.getElementById('activeCycleBanner');
    if (banner && activeCycle) {
        banner.style.display = 'block';
        safeSet('bannerCycleName', activeCycle.cycleName);
        safeSet('bannerStart', formatDate(activeCycle.startTimestamp));
        safeSet('bannerEnd', formatDate(activeCycle.endTimestamp));
    }

    // Recent logs
    const logBody = document.getElementById('recentLogBody');
    if (logBody) {
        const logs = logRes.data || [];
        const adminLogs = logs.filter(l => l.actorRole === 'admin' || l.actorRole === 'superuser').slice(0, 8);
        
        if (adminLogs.length === 0) {
            logBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">No recent admin activity recorded.</td></tr>';
        } else {
            logBody.innerHTML = adminLogs.map(l => `
                <tr>
                    <td style="color:var(--text-muted);font-size:0.8rem;white-space:nowrap">${formatDate(l.timestamp)}</td>
                    <td><strong>${l.actorName}</strong></td>
                    <td><span class="badge ${actionBadge(l.action)}">${l.action}</span></td>
                    <td>${l.module}</td>
                    <td style="font-size:0.875rem;color:var(--text-muted)">${l.details}</td>
                </tr>
            `).join('');
        }
    }
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function actionBadge(action) {
    const map = { CREATE: 'success', UPDATE: 'primary', DELETE: 'danger', APPROVE: 'progress' };
    return map[action] || 'neutral';
}
