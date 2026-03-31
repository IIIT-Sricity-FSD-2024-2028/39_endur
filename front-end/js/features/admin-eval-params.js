import { showToast, formatDate, genId } from './admin-utils.js';

let params = [];

async function loadParams() {
    if (params.length) return params;
    const res = await fetch('../../js/mock-data/evaluationParameters.json');
    params = await res.json();
    return params;
}

export async function renderAdminParameters() {
    await loadParams();
    renderParamsTable();
    bindParamSearch();
}

function renderParamsTable(filter = '') {
    const tbody = document.getElementById('paramsTableBody');
    if (!tbody) return;

    const filtered = filter
        ? params.filter(p =>
            p.name.toLowerCase().includes(filter) ||
            p.category.toLowerCase().includes(filter) ||
            p.status.toLowerCase().includes(filter))
        : params;

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No parameters found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td><strong>${p.name}</strong><br><small style="color:var(--text-muted)">${p.description}</small></td>
            <td><span class="badge neutral">${p.category}</span></td>
            <td>${p.weight > 0 ? p.weight + '%' : '—'}</td>
            <td><span class="badge ${p.status === 'active' ? 'success' : 'warning'}">${p.status}</span></td>
            <td style="color:var(--text-muted);font-size:0.85rem">${(p.departments || []).join(', ')}</td>
        </tr>
    `).join('');
}

function bindParamSearch() {
    const search = document.getElementById('paramSearch');
    if (search) {
        search.addEventListener('input', () => renderParamsTable(search.value.toLowerCase()));
    }
}
