import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";
import { appendAuditLog } from "../features/admin-utils.js";

let targetDept = null;

export function initReview() {
    targetDept = localStorage.getItem("activeReviewDept");
    
    if (!targetDept) {
        window.location.href = "cycle-management.html";
        return;
    }

    document.getElementById("deptTitle").innerText = `Review ${targetDept} Parameters`;

    const allDrafts = get("draftParameters") || {};
    const params = allDrafts[targetDept] || [];

    const container = document.getElementById("paramListContainer");
    container.innerHTML = "";

    let total = 0;

    if (params.length === 0) {
        container.innerHTML = `<p style="color: #64748b; font-style: italic;">No parameters drafted yet.</p>`;
    } else {
        params.forEach(p => {
            total += parseInt(p.weight);
            container.innerHTML += `
                <div class="param-card">
                    <div>
                        <strong style="color: #0f172a; font-size: 15px;">${p.name}</strong>
                        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">${p.desc}</p>
                    </div>
                    <div style="font-weight: bold; color: #1e3a8a; font-size: 18px; padding-left: 20px; text-align: right;">
                        ${p.weight}%
                    </div>
                </div>
            `;
        });
    }

    document.getElementById("totalWeight").innerText = `${total}%`;
}

export function approveConfig() {
    if (!targetDept) return;
    
    let statuses = get("departmentConfigStatus") || {};
    statuses[targetDept] = "APPROVED";
    set("departmentConfigStatus", statuses);
    
    // Audit Log
    const session = getSession();
    appendAuditLog(session, 'dean', 'APPROVE', 'Parameters', `${targetDept} Config`, `Parameter configuration approved by Dean.`);

    alert(`Configuration for ${targetDept} has been approved.`);
    window.location.href = "cycle-management.html";
}

export function requestRevision() {
    if (!targetDept) return;
    
    const note = document.getElementById("deanNotesInput").value.trim();
    if (!note) {
        alert("Please enter feedback notes before requesting a revision.");
        return;
    }

    let statuses = get("departmentConfigStatus") || {};
    let notes = get("departmentConfigNotes") || {};
    
    statuses[targetDept] = "REVISION_REQUESTED";
    notes[targetDept] = note;
    
    set("departmentConfigStatus", statuses);
    set("departmentConfigNotes", notes);
    
    // Audit Log
    const session = getSession();
    appendAuditLog(session, 'dean', 'REVISE', 'Parameters', `${targetDept} Config`, `Revision requested for ${targetDept} parameters.`);

    alert(`Revision requested. Notes sent to ${targetDept} HOD.`);
    window.location.href = "cycle-management.html";
}
