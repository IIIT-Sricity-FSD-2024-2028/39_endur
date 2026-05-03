import { GET, POST, PATCH, DELETE } from "../core/api.js";
import { getSession } from "../core/session.js";

const CHART_COLORS = ["#3b82f6", "#a855f7", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];

export const DEFAULT_PARAMETERS = [
    { name: "Clarity of Explanation", desc: "Effectiveness of teaching methods and clear delivery.", weight: 25 },
    { name: "Structure of Course", desc: "Organization of materials and syllabus adherence.", weight: 25 },
    { name: "Student Engagement", desc: "Fostering an interactive and responsive environment.", weight: 25 },
    { name: "Difficulty Level", desc: "Appropriateness of the coursework difficulty.", weight: 25 }
];

let editingParamId = null;
let isDragEventsAttached = false;
let isDragging = false;
let dragStartX = 0;
let dragLeftIndex = -1;
let initialLeftWeight = 0;
let initialRightWeight = 0;
let deptParams = [];
let currentStatus = "DRAFT";
let isLockedGlobal = false;
let globalCycleState = {};

async function fetchParams() {
    const user = getSession();
    try {
        const statuses = await GET('/evaluation-parameters/status');
        currentStatus = statuses[user.department] || "DRAFT";
        const fetchedParams = await GET(`/evaluation-parameters/dept/${encodeURIComponent(user.department)}`);
        
        if (fetchedParams.length === 0 && currentStatus === "DRAFT") {
            // Seed defaults
            let sum = 0;
            for (const p of DEFAULT_PARAMETERS) {
                await POST(`/evaluation-parameters`, { name: p.name, description: p.desc, weight: p.weight, department: user.department });
            }
            deptParams = await GET(`/evaluation-parameters/dept/${encodeURIComponent(user.department)}`);
        } else {
            deptParams = fetchedParams;
        }
    } catch(e) {
        deptParams = [];
    }
}

export async function initParameters() {
    const user = getSession();
    if (!user) return;

    try { globalCycleState = await GET('/feedback-cycles/state'); } 
    catch { globalCycleState = { id: 'SETUP', phase: 'PREPARATION' }; }

    await fetchParams();

    if (!isDragEventsAttached) {
        document.addEventListener("mousemove", handleDragMove);
        document.addEventListener("mouseup", handleDragEnd);
        isDragEventsAttached = true;
    }
    
    renderAll();
}

function renderAll() {
    const user = getSession();
    
    const isPrep = globalCycleState.phase === "PREPARATION" && globalCycleState.id !== "SETUP";
    const isNoCycle = globalCycleState.id === "SETUP";
    const isCycleActive = ["STUDENT_FEEDBACK", "FACULTY_REFLECTION", "COMPLETED"].includes(globalCycleState.phase);
    const isCycleCompleted = globalCycleState.phase === "COMPLETED";

    const badgeEl = document.getElementById("cycleBadge") || document.getElementById("cycleNameBadge");
    if (badgeEl) {
        if (isNoCycle) {
            badgeEl.innerText = "No Active Cycle";
            badgeEl.style.background = "#f1f5f9";
            badgeEl.style.color = "#64748b";
        } else {
            badgeEl.innerText = globalCycleState.cycleName || globalCycleState.name || globalCycleState.id || "Active Cycle";
        }
    }

    let isLocked = false;
    if (isNoCycle) {
        isLocked = true;
    } else if (isCycleActive) {
        isLocked = true;
    } else if (globalCycleState.phase === "PREPARATION") {
        isLocked = (currentStatus === "SUBMITTED" || currentStatus === "APPROVED");
    }
    isLockedGlobal = isLocked;

    const listContainer = document.getElementById("paramListContainer");
    const stackedBar = document.getElementById("stackedBar");
    const legendContainer = document.getElementById("legendContainer");
    
    if(!listContainer || !stackedBar || !legendContainer) return;

    listContainer.innerHTML = "";
    stackedBar.innerHTML = "";
    legendContainer.innerHTML = "";

    if (document.getElementById("statusBannerNoCycle")) {
        document.getElementById("statusBannerNoCycle").style.display = isNoCycle ? "block" : "none";
    }
    document.getElementById("statusBannerCycleActive").style.display = (isCycleActive && !isCycleCompleted) ? "block" : "none";
    document.getElementById("statusBannerCompleted").style.display = isCycleCompleted ? "block" : "none"; 
    document.getElementById("statusBannerPending").style.display = (currentStatus === "SUBMITTED" && isPrep) ? "block" : "none";
    document.getElementById("statusBannerApproved").style.display = (currentStatus === "APPROVED" && isPrep) ? "block" : "none";
    
    const revBanner = document.getElementById("statusBannerRevision");
    if (currentStatus === "REVISION_REQUESTED" && isPrep) {
        revBanner.style.display = "block";
        GET('/evaluation-parameters/notes').then(notes => {
             const deanNote = notes[user.department] || "Please revise your configuration.";
             document.getElementById("deanNotesText").innerText = deanNote;
        });
    } else {
        revBanner.style.display = "none";
    }

    const createBtn = document.getElementById("createParamBtn");
    if (createBtn) {
        createBtn.disabled = isLocked;
        createBtn.style.opacity = isLocked ? "0.5" : "1";
        createBtn.style.cursor = isLocked ? "not-allowed" : "pointer";
    }

    let totalWeight = 0;

    deptParams.forEach((param, index) => {
        const weightNum = parseInt(param.weight);
        totalWeight += weightNum;
        const color = CHART_COLORS[index % CHART_COLORS.length];

        // Robust naming fallback
        const pName = param.name || param.paramName || param.label || `Parameter ${index + 1}`;
        const pDesc = param.description || param.desc || '';

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
                <strong style="color: #0f172a; font-size: 14px;">${pName}</strong>
                <p class="param-desc">${pDesc}</p>
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
        segment.style.cssText = `position: relative; height: 100%; width: ${weightNum}%; background-color: ${color};`;
        
        if (index < deptParams.length - 1 && !isLocked) {
            const handle = document.createElement("div");
            handle.className = "drag-handle";
            handle.addEventListener("mousedown", (e) => {
                isDragging = true;
                dragStartX = e.clientX;
                dragLeftIndex = index;
                initialLeftWeight = parseInt(deptParams[index].weight);
                initialRightWeight = parseInt(deptParams[index+1].weight);
                handle.classList.add("active");
                document.body.classList.add("dragging-bar");
            });
            segment.appendChild(handle);
        }
        stackedBar.appendChild(segment);

        const legend = document.createElement("div");
        legend.className = "legend-item";
        legend.innerHTML = `
            <div><span class="legend-dot" style="background-color: ${color}"></span> ${pName}</div>
            <strong style="color: #0f172a;">${weightNum}%</strong>
        `;
        legendContainer.appendChild(legend);
    });

    const totalEl = document.getElementById("totalAssignedText");
    const warningEl = document.getElementById("weightWarning");
    const finalizeBtn = document.getElementById("finalizeConfigBtn");
    
    const magicWandBtn = warningEl ? warningEl.querySelector("button") : null;
    if (magicWandBtn) {
        magicWandBtn.style.display = isLocked ? "none" : "block";
    }

    if(totalEl) totalEl.innerText = `${totalWeight}%`;
    
    if (isLocked) {
        if(totalEl) totalEl.style.color = "#1e3a8a";
        if(warningEl) warningEl.style.display = "none";
        if (finalizeBtn) {
            finalizeBtn.disabled = true;
            finalizeBtn.style.opacity = "0.5";
            finalizeBtn.style.cursor = "not-allowed";
            if(isCycleActive || isCycleCompleted) {
                finalizeBtn.innerText = "Locked";
            } else {
                finalizeBtn.innerText = currentStatus === "APPROVED" ? "Approved" : "In Review";
                
                if(currentStatus === "APPROVED" || currentStatus === "REVISION_REQUESTED") {
                    let unlockBtn = document.getElementById("unlockDraftBtn");
                    if(!unlockBtn) {
                        unlockBtn = document.createElement("button");
                        unlockBtn.id = "unlockDraftBtn";
                        unlockBtn.className = "btn-outline";
                        unlockBtn.style.marginLeft = "10px";
                        unlockBtn.innerText = "Edit Again";
                        unlockBtn.onclick = () => window.revertToDraft();
                        finalizeBtn.parentNode.insertBefore(unlockBtn, finalizeBtn.nextSibling);
                    }
                } else if (currentStatus === "SUBMITTED") {
                    const ex = document.getElementById("unlockDraftBtn");
                    if(ex) ex.remove();
                }
            }
        }
    } else {
        if (finalizeBtn) finalizeBtn.innerText = "Submit Configuration";
        if (totalWeight !== 100) {
            if(totalEl) totalEl.style.color = "#dc2626";
            if(warningEl) warningEl.style.display = "flex"; 
            if (finalizeBtn) {
                finalizeBtn.disabled = true;
                finalizeBtn.style.opacity = "0.5";
                finalizeBtn.style.cursor = "not-allowed";
            }
        } else {
            if(totalEl) totalEl.style.color = "#1e3a8a";
            if(warningEl) warningEl.style.display = "none";
            if (finalizeBtn) {
                finalizeBtn.disabled = false;
                finalizeBtn.style.opacity = "1";
                finalizeBtn.style.cursor = "pointer";
            }
        }
    }

    if (deptParams.length === 0) {
        listContainer.innerHTML = `<p style="padding: 20px 0; color: #64748b; text-align: center;">No parameters defined.</p>`;
    }
}

function handleDragMove(e) {
    if (!isDragging) return;
    const stackedBar = document.getElementById("stackedBar");
    const containerWidth = stackedBar.getBoundingClientRect().width;
    const deltaX = e.clientX - dragStartX;
    const deltaPercent = Math.round((deltaX / containerWidth) * 100);

    let newLeft = initialLeftWeight + deltaPercent;
    let newRight = initialRightWeight - deltaPercent;

    if (newLeft < 1) { newLeft = 1; newRight = initialLeftWeight + initialRightWeight - 1; }
    if (newRight < 1) { newRight = 1; newLeft = initialLeftWeight + initialRightWeight - 1; }

    stackedBar.children[dragLeftIndex].style.width = newLeft + "%";
    stackedBar.children[dragLeftIndex+1].style.width = newRight + "%";
}

async function handleDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    document.body.classList.remove("dragging-bar");
    document.querySelectorAll('.drag-handle').forEach(h => h.classList.remove('active'));

    if (isLockedGlobal) return;

    const stackedBar = document.getElementById("stackedBar");
    const containerWidth = stackedBar.getBoundingClientRect().width;
    const deltaX = e.clientX - dragStartX;
    const deltaPercent = Math.round((deltaX / containerWidth) * 100);

    let newLeft = initialLeftWeight + deltaPercent;
    let newRight = initialRightWeight - deltaPercent;

    if (newLeft < 1) { newLeft = 1; newRight = initialLeftWeight + initialRightWeight - 1; }
    if (newRight < 1) { newRight = 1; newLeft = initialLeftWeight + initialRightWeight - 1; }

    if (newLeft !== initialLeftWeight) {
        deptParams[dragLeftIndex].weight = newLeft;
        deptParams[dragLeftIndex+1].weight = newRight;
        
        const user = getSession();
        try {
            await PATCH(`/evaluation-parameters/${deptParams[dragLeftIndex].id}/dept/${encodeURIComponent(user.department)}`, { weight: newLeft });
            await PATCH(`/evaluation-parameters/${deptParams[dragLeftIndex+1].id}/dept/${encodeURIComponent(user.department)}`, { weight: newRight });
            await fetchParams();
        } catch(e) {}
        renderAll();
    } else {
        renderAll();
    }
}

export async function autoBalance() {
    if (isLockedGlobal) return;
    if (deptParams.length === 0) return;

    let total = deptParams.reduce((sum, p) => sum + parseInt(p.weight), 0);
    if (total === 100 || total === 0) return;

    let newTotal = 0;
    const user = getSession();
    
    try {
        for(let i=0; i<deptParams.length; i++) {
            const p = deptParams[i];
            let w;
            if (i === deptParams.length - 1) {
                w = 100 - newTotal;
                if(w <= 0) w = 1; 
            } else {
                let scaled = Math.round(parseInt(p.weight) * (100 / total));
                if (scaled < 1) scaled = 1; 
                w = scaled;
                newTotal += scaled;
            }
            await PATCH(`/evaluation-parameters/${p.id}/dept/${encodeURIComponent(user.department)}`, { weight: w });
        }
        await fetchParams();
        renderAll();
    } catch(e) {
        alert("Autobalance failed.");
    }
}

export function openParamModal(id = null) {
    editingParamId = id;
    const title = document.getElementById("modalTitle");
    const nameInput = document.getElementById("newParamName");
    const descInput = document.getElementById("newParamDesc");
    const weightInput = document.getElementById("newParamWeight");

    if (id) {
        title.innerText = "Edit Parameter";
        const param = deptParams.find(p => p.id === id);
        if (param) {
            nameInput.value = param.name;
            descInput.value = param.description || param.desc || '';
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

export async function deleteParameter(id) {
    if (isLockedGlobal) return;
    const user = getSession();
    try {
        await DELETE(`/evaluation-parameters/${id}/dept/${encodeURIComponent(user.department)}`);
        await fetchParams();
        renderAll();
    } catch(err) {
        alert("Failed to delete: " + err.message);
    }
}

export async function saveParameter() {
    if (isLockedGlobal) return;
    const name = document.getElementById("newParamName").value.trim();
    const desc = document.getElementById("newParamDesc").value.trim();
    const weight = parseInt(document.getElementById("newParamWeight").value);

    if (!name || isNaN(weight) || weight <= 0) {
        alert("Valid Name and Weightage greater than 0 are required.");
        return;
    }
    
    const user = getSession();
    try {
        if (editingParamId) {
            await PATCH(`/evaluation-parameters/${editingParamId}/dept/${encodeURIComponent(user.department)}`, {
                name, description: desc, weight
            });
        } else {
            await POST('/evaluation-parameters', {
                name, description: desc, weight, department: user.department
            });
        }
        await fetchParams();
        closeParamModal();
        renderAll();
    } catch(err) {
        alert("Failed to save: " + err.message);
    }
}

export async function finalizeConfig() {
    if (isLockedGlobal) return;
    const user = getSession();
    const totalWeight = deptParams.reduce((sum, p) => sum + parseInt(p.weight), 0);
    
    if (totalWeight !== 100) {
        alert("Cannot submit. Total weightage must equal exactly 100%.");
        return;
    }

    try {
        await POST(`/evaluation-parameters/dept/${encodeURIComponent(user.department)}/submit`, {});
        alert("✅ Success! Your department's Evaluation Parameters have been submitted to the Dean for review.");
        await fetchParams();
        renderAll();
    } catch(err) {
        alert("Failed to submit: " + err.message);
    }
}

export async function revertToDraft() {
    if (!confirm("Are you sure you want to unlock this configuration? It will return to DRAFT state and you will need to re-submit for approval.")) return;
    
    const user = getSession();
    try {
        await POST(`/evaluation-parameters/dept/${encodeURIComponent(user.department)}/revert`, {});
        await fetchParams();
        renderAll();
    } catch(err) {
        alert("Failed to revert: " + err.message);
    }
}

// Window bindings
window.openParamModal = openParamModal;
window.closeParamModal = closeParamModal;
window.saveParameter = saveParameter;
window.deleteParameter = deleteParameter;
window.autoBalance = autoBalance;
window.finalizeConfig = finalizeConfig;
window.revertToDraft = revertToDraft;
