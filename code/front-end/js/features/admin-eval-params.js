import { GET } from '../core/api.js';

let deptConfigs = {};
let statuses = {};

export async function renderAdminParameters() {
    try {
        const [params, deptStatuses] = await Promise.all([
            GET('/evaluation-parameters'),
            GET('/evaluation-parameters/status'),
        ]);

        statuses = deptStatuses;
        deptConfigs = {};
        params.forEach(p => {
            if (!deptConfigs[p.department]) deptConfigs[p.department] = [];
            deptConfigs[p.department].push(p);
        });
    } catch (e) {
        deptConfigs = {}; statuses = {};
    }

    renderParamsTable();
    bindParamSearch();
}

function renderParamsTable(filter = '') {
    const tbody = document.getElementById('paramsTableBody');
    if (!tbody) return;

    let flatList = [];
    Object.entries(deptConfigs).forEach(([dept, params]) => {
        const deptStatus = statuses[dept] || (params.length > 0 ? 'DRAFT' : 'NOT STARTED');
        if (!params.length) {
            flatList.push({ name: 'Manual Setup Required', description: 'HOD has not configured parameters for this department.', weight: 0, status: deptStatus, department: dept });
        } else {
            params.forEach(p => flatList.push({ ...p, department: dept, status: deptStatus }));
        }
    });

    const filtered = filter
        ? flatList.filter(p => p.name.toLowerCase().includes(filter) || p.department.toLowerCase().includes(filter) || (p.status || '').toLowerCase().includes(filter))
        : flatList;

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No parameters match your search.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const displayStatus = p.status === 'SUBMITTED' ? 'IN REVIEW' : (p.status === 'APPROVED' ? 'APPROVED' : (p.status === 'NOT STARTED' ? 'NOT STARTED' : 'DRAFT'));
        const badgeClass = p.status === 'APPROVED' ? 'success' : (p.status === 'SUBMITTED' ? 'warning' : 'neutral');
        return `
            <tr>
                <td>
                    <strong>${p.name}</strong><br>
                    <small style="color:var(--text-muted)">${p.description || ''}</small>
                </td>
                <td><span class="badge neutral">${p.department}</span></td>
                <td>${p.weight > 0 ? `<strong>${p.weight}%</strong>` : '—'}</td>
                <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
                <td style="color:var(--text-muted);font-size:0.85rem">Custom</td>
            </tr>
        `;
    }).join('');
}

function bindParamSearch() {
    const search = document.getElementById('paramSearch');
    if (search) search.addEventListener('input', () => renderParamsTable(search.value.toLowerCase()));
}
