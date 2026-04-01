import { get } from '../core/storage.js';

let deptConfigs = {};
let statuses = {};

export async function renderAdminParameters() {
    // Load from same sources as Superuser/HOD
    const drafts = get("draftParameters") || {};
    const finals = get("activeParameters") || {};
    statuses = get("departmentConfigStatus") || {};

    // Get all unique departments from system users
    const users = get("systemUsers") || [];
    const allDepts = [...new Set(users.map(u => u.department || u.dept).filter(Boolean))].sort();

    deptConfigs = {};
    allDepts.forEach(d => {
        deptConfigs[d] = drafts[d] || finals[d] || [];
    });

    renderParamsTable();
    bindParamSearch();
}

function renderParamsTable(filter = '') {
    const tbody = document.getElementById('paramsTableBody');
    if (!tbody) return;

    let flatList = [];
    Object.entries(deptConfigs).forEach(([dept, params]) => {
        const deptStatus = statuses[dept] || (params.length > 0 ? 'DRAFT' : 'NOT STARTED');
        
        // Check if it's the default set (Clarity, Structure, Engagement, Difficulty at 25 each)
        const isDefault = params.length === 4 && 
                          params.every(p => p.weight === 25) &&
                          params.some(p => p.id === 'clarity');

        if (params.length === 0) {
            flatList.push({ name: "Manual Setup Required", description: "HOD has not configured parameters for this department.", weight: 0, status: deptStatus, department: dept, isDefault: false });
        } else {
            params.forEach(p => {
                flatList.push({ ...p, department: dept, status: deptStatus, isDefault });
            });
        }
    });

    const filtered = filter
        ? flatList.filter(p =>
            p.name.toLowerCase().includes(filter) ||
            p.department.toLowerCase().includes(filter) ||
            p.status.toLowerCase().includes(filter))
        : flatList;

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No parameters match your search.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const displayStatus = p.status === 'SUBMITTED' ? 'IN REVIEW' : (p.status === 'APPROVED' ? 'APPROVED' : (p.status === 'NOT STARTED' ? 'NOT STARTED' : 'DRAFT'));
        const badgeClass = p.status === 'APPROVED' ? 'success' : (p.status === 'SUBMITTED' ? 'warning' : (p.status === 'NOT STARTED' ? 'neutral' : 'neutral'));
        
        return `
            <tr>
                <td>
                    <strong>${p.name}</strong><br>
                    <small style="color:var(--text-muted)">${p.desc || p.description || ''}</small>
                    ${p.isDefault ? '<br><span style="font-size:10px; color:var(--primary); font-weight:600; text-transform:uppercase;">⚙️ System Default</span>' : ''}
                </td>
                <td><span class="badge neutral">${p.department}</span></td>
                <td>${p.weight > 0 ? `<strong>${p.weight}%</strong>` : '—'}</td>
                <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
                <td style="color:var(--text-muted);font-size:0.85rem">${p.isDefault ? 'Default' : 'Custom'}</td>
            </tr>
        `;
    }).join('');
}

function bindParamSearch() {
    const search = document.getElementById('paramSearch');
    if (search) {
        search.addEventListener('input', () => renderParamsTable(search.value.toLowerCase()));
    }
}
