import { GET, POST } from "../core/api.js";
import { getSession } from "../core/session.js";
import { appendAuditLog } from "../features/admin-utils.js";

let targetDept = null;

export async function initReview() {
    targetDept = new URLSearchParams(window.location.search).get('dept');
    
    if (!targetDept) {
        window.location.href = "cycle-management.html";
        return;
    }

    const deptTitle = document.getElementById("deptTitle");
    if (deptTitle) deptTitle.innerText = `Review ${targetDept} Parameters`;

    const container = document.getElementById("paramListContainer");
    if (!container) return;
    container.innerHTML = "";

    let total = 0;
    try {
        const params = await GET(`/evaluation-parameters/dept/${encodeURIComponent(targetDept)}`);
        if (params.length === 0) {
            container.innerHTML = `<p style="color: #64748b; font-style: italic;">No parameters drafted yet.</p>`;
        } else {
            params.forEach(p => {
                total += parseInt(p.weight);
                container.innerHTML += `
                    <div class="param-card">
                        <div>
                            <strong style="color: #0f172a; font-size: 15px;">${p.name}</strong>
                            <p style="color: #64748b; font-size: 14px; margin-top: 4px;">${p.description || p.desc || ''}</p>
                        </div>
                        <div style="font-weight: bold; color: #1e3a8a; font-size: 18px; padding-left: 20px; text-align: right;">
                            ${p.weight}%
                        </div>
                    </div>
                `;
            });
        }
    } catch (e) {
        container.innerHTML = `<p style="color: red;">Failed to load parameters.</p>`;
    }

    const totalWeightEl = document.getElementById("totalWeight");
    if (totalWeightEl) totalWeightEl.innerText = `${total}%`;
    const approveBtn = document.querySelector('button[onclick="approveConfig()"]');
    const warningEl = document.getElementById("weightWarning");

    if (total !== 100) {
        if (totalWeightEl) totalWeightEl.style.color = "var(--danger)";
        if (approveBtn) {
            approveBtn.disabled = true;
            approveBtn.style.opacity = "0.5";
            approveBtn.title = `Total weightage must be 100% (currently ${total}%)`;
        }
        if (warningEl) {
            warningEl.style.display = "block";
            warningEl.innerText = `⚠️ Total weightage is ${total}%. It must be exactly 100% before approval.`;
        }
    } else {
        if (totalWeightEl) totalWeightEl.style.color = "var(--primary)";
        if (approveBtn) {
            approveBtn.disabled = false;
            approveBtn.style.opacity = "1";
        }
        if (warningEl) warningEl.style.display = "none";
    }
}

export async function approveConfig() {
    if (!targetDept) return;
    try {
        await POST(`/evaluation-parameters/dept/${encodeURIComponent(targetDept)}/approve`, {});
        alert(`Configuration for ${targetDept} has been approved.`);
        window.location.href = "cycle-management.html";
    } catch(err) {
        alert("Failed to approve config: " + err.message);
    }
}
window.approveConfig = approveConfig;

export async function requestRevision() {
    if (!targetDept) return;
    
    const noteEl = document.getElementById("deanNotesInput");
    const note = noteEl ? noteEl.value.trim() : "Revision requested.";
    
    if (!note) {
        alert("Please enter feedback notes before requesting a revision.");
        return;
    }

    try {
        await POST(`/evaluation-parameters/dept/${encodeURIComponent(targetDept)}/reject`, { note });
        alert(`Revision requested. Notes sent to ${targetDept} HOD.`);
        window.location.href = "cycle-management.html";
    } catch (err) {
        alert("Failed to request revision: " + err.message);
    }
}
window.requestRevision = requestRevision;
