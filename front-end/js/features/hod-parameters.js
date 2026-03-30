import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";

const CHART_COLORS = ["#3b82f6", "#a855f7", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];

export const DEFAULT_PARAMETERS = [
    { id: "clarity", name: "Clarity of Explanation", desc: "Effectiveness of teaching methods and clear delivery.", weight: 25 },
    { id: "structure", name: "Structure of Course", desc: "Organization of materials and syllabus adherence.", weight: 25 },
    { id: "engagement", name: "Student Engagement", desc: "Fostering an interactive and responsive environment.", weight: 25 },
    { id: "difficulty", name: "Difficulty Level", desc: "Appropriateness of the coursework difficulty.", weight: 25 }
];

let editingParamId = null;

export function initParameters() {
    const user = getSession();
    if (!user) return;

    let allDrafts = get("draftParameters") || {};
    let statuses = get("departmentConfigStatus") || {};
    let currentStatus = statuses[user.department] || "DRAFT";
    
    if (!allDrafts[user.department] || allDrafts[user.department].length === 0) {
        allDrafts[user.department] = DEFAULT_PARAMETERS;
        set("draftParameters", allDrafts);
    }
    
    renderAll(allDrafts[user.department], currentStatus);
}

function renderAll(params, status = "DRAFT") {
    const user = getSession();
    const listContainer = document.getElementById("paramListContainer");
    const stackedBar = document.getElementById("stackedBar");
    const legendContainer = document.getElementById("legendContainer");
    
    listContainer.innerHTML = "";
    stackedBar.innerHTML = "";
    legendContainer.innerHTML = "";

    const isLocked = (status === "SUBMITTED" || status === "APPROVED");

    // Manage Banners
    document.getElementById("statusBannerPending").style.display = status === "SUBMITTED" ? "block" : "none";
    document.getElementById("statusBannerApproved").style.display = status === "APPROVED" ? "block" : "none";
    
    const revBanner = document.getElementById("statusBannerRevision");
    if (status === "REVISION_REQUESTED") {
        revBanner.style.display = "block";
        const notesObj = get("departmentConfigNotes") || {};
        document.getElementById("deanNotesText").innerText = notesObj[user.department] || "Please revise your configuration.";
    } else {
        revBanner.style.display = "none";
    }

    // Manage Add Button State
    const createBtn = document.getElementById("createParamBtn");
    if (createBtn) {
        createBtn.disabled = isLocked;
        createBtn.style.opacity = isLocked ? "0.5" : "1";
        createBtn.style.cursor = isLocked ? "not-allowed" : "pointer";
    }

    let totalWeight = 0;

    params.forEach((param, index) => {
        const weightNum = parseInt(param.weight);
        totalWeight += weightNum;
        const color = CHART_COLORS[index % CHART_COLORS.length];

        let actionButtonsHtml = "";
        if (!isLocked) {
            actionButtonsHtml = `
                <button class="action-btn" onclick="openParamModal('${param.id}')" title="Edit">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="action-btn delete" onclick="deleteParameter('${param.id}')" title="Delete">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                </button>
            `;
        } else {
            actionButtonsHtml = `<span style="color:#cbd5e1; font-size:11px;">LOCKED</span>`;
        }

        const row = document.createElement("div");
        row.className = "param-row";
        row.innerHTML = `
            <div>
                <strong style="color: #0f172a; font-size: 14px;">${param.name}</strong>
                <p class="param-desc">${param.desc}</p>
            </div>
            <div class="weight-display">
                <div class="mini-bar"><div class="mini-bar-fill" style="width: ${weightNum}%; background: ${color}"></div></div>
                <span>${weightNum}%</span>
            </div>
            <div style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                ${actionButtonsHtml}
            </div>
        `;
        listContainer.appendChild(row);

        const segment = document.createElement("div");
        segment.style.cssText = `height: 100%; width: ${weightNum}%; background-color: ${color};`;
        stackedBar.appendChild(segment);

        const legend = document.createElement("div");
        legend.className = "legend-item";
        legend.innerHTML = `
            <div><span class="legend-dot" style="background-color: ${color}"></span> ${param.name}</div>
            <strong style="color: #0f172a;">${weightNum}%</strong>
        `;
        legendContainer.appendChild(legend);
    });

    const totalEl = document.getElementById("totalAssignedText");
    const warningEl = document.getElementById("weightWarning");
    const finalizeBtn = document.getElementById("finalizeConfigBtn");

    totalEl.innerText = `${totalWeight}%`;
    
    // Manage Submit Button State
    if (isLocked) {
        totalEl.style.color = "#1e3a8a";
        warningEl.style.display = "none";
        if (finalizeBtn) {
            finalizeBtn.disabled = true;
            finalizeBtn.style.opacity = "0.5";
            finalizeBtn.style.cursor = "not-allowed";
            finalizeBtn.innerText = status === "APPROVED" ? "Approved" : "Submitted";
        }
    } else {
        if (finalizeBtn) finalizeBtn.innerText = "Submit Configuration";
        if (totalWeight !== 100) {
            totalEl.style.color = "#dc2626";
            warningEl.style.display = "block";
            if (finalizeBtn) {
                finalizeBtn.disabled = true;
                finalizeBtn.style.opacity = "0.5";
                finalizeBtn.style.cursor = "not-allowed";
            }
        } else {
            totalEl.style.color = "#1e3a8a";
            warningEl.style.display = "none";
            if (finalizeBtn) {
                finalizeBtn.disabled = false;
                finalizeBtn.style.opacity = "1";
                finalizeBtn.style.cursor = "pointer";
            }
        }
    }

    if (params.length === 0) {
        listContainer.innerHTML = `<p style="padding: 20px 0; color: #64748b; text-align: center;">No parameters defined.</p>`;
    }
}

export function openParamModal(id = null) {
    editingParamId = id;
    const user = getSession();
    
    const title = document.getElementById("modalTitle");
    const nameInput = document.getElementById("newParamName");
    const descInput = document.getElementById("newParamDesc");
    const weightInput = document.getElementById("newParamWeight");

    if (id) {
        title.innerText = "Edit Parameter";
        let allDrafts = get("draftParameters") || {};
        let deptParams = allDrafts[user.department] || [];
        const param = deptParams.find(p => p.id === id);
        
        if (param) {
            nameInput.value = param.name;
            descInput.value = param.desc;
            weightInput.value = param.weight;
        }
    } else {
        title.innerText = "Add New Parameter";
        nameInput.value = "";
        descInput.value = "";
        weightInput.value = "";
    }

    document.getElementById("paramModal").style.display = "flex";
}

export function closeParamModal() {
    document.getElementById("paramModal").style.display = "none";
    editingParamId = null;
}

export function deleteParameter(id) {
    const user = getSession();
    let allDrafts = get("draftParameters") || {};
    let statuses = get("departmentConfigStatus") || {};
    
    allDrafts[user.department] = allDrafts[user.department].filter(p => p.id !== id);
    set("draftParameters", allDrafts);
    renderAll(allDrafts[user.department], statuses[user.department]);
}

export function saveParameter() {
    const name = document.getElementById("newParamName").value.trim();
    const desc = document.getElementById("newParamDesc").value.trim();
    const weight = parseInt(document.getElementById("newParamWeight").value);

    if (!name || isNaN(weight) || weight <= 0) {
        alert("Valid Name and Weightage greater than 0 are required.");
        return;
    }
    
    const user = getSession();
    let allDrafts = get("draftParameters") || {};
    let statuses = get("departmentConfigStatus") || {};
    let deptParams = allDrafts[user.department] || [];
    
    if (editingParamId) {
        const index = deptParams.findIndex(p => p.id === editingParamId);
        if (index > -1) {
            deptParams[index].name = name;
            deptParams[index].desc = desc;
            deptParams[index].weight = weight;
        }
    } else {
        deptParams.push({
            id: "p" + new Date().getTime(),
            name: name,
            desc: desc || "No description provided.",
            weight: weight
        });
    }

    allDrafts[user.department] = deptParams;
    set("draftParameters", allDrafts);
    
    closeParamModal();
    renderAll(deptParams, statuses[user.department]);
}

export function finalizeConfig() {
    const user = getSession();
    let allDrafts = get("draftParameters") || {};
    let deptParams = allDrafts[user.department] || [];
    
    const totalWeight = deptParams.reduce((sum, p) => sum + parseInt(p.weight), 0);
    
    if (totalWeight !== 100) {
        alert("Cannot submit. Total weightage must equal exactly 100%.");
        return;
    }

    let statuses = get("departmentConfigStatus") || {};
    statuses[user.department] = "SUBMITTED";
    set("departmentConfigStatus", statuses);

    renderAll(deptParams, "SUBMITTED");
    alert("✅ Success! Your department's Evaluation Parameters have been submitted to the Dean for review.");
}
