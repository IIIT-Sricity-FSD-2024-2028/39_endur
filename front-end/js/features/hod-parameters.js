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
let isDragEventsAttached = false;
let isDragging = false;
let dragStartX = 0;
let dragLeftIndex = -1;
let initialLeftWeight = 0;
let initialRightWeight = 0;

// Security check to prevent backend manipulation when closed
function checkPhaseLock() {
    const cycleState = get("systemCycleState") || { phase: "COMPLETED" };
    return cycleState.phase !== "PREPARATION";
}

export function initParameters() {
    const user = getSession();
    if (!user) return;

    let allDrafts = get("draftParameters") || {};
    let activeParams = get("activeParameters") || {};
    let statuses = get("departmentConfigStatus") || {};
    
    // Inherit from active parameters first, fallback to default if completely new
    if (!allDrafts[user.department] || allDrafts[user.department].length === 0) {
        if (activeParams[user.department] && activeParams[user.department].length > 0) {
            allDrafts[user.department] = activeParams[user.department];
            statuses[user.department] = "DRAFT"; 
        } else {
            allDrafts[user.department] = DEFAULT_PARAMETERS;
            statuses[user.department] = "DRAFT";
        }
        set("draftParameters", allDrafts);
        set("departmentConfigStatus", statuses);
    }
    
    let currentStatus = statuses[user.department] || "DRAFT";

    if (!isDragEventsAttached) {
        document.addEventListener("mousemove", handleDragMove);
        document.addEventListener("mouseup", handleDragEnd);
        isDragEventsAttached = true;
    }
    
    renderAll(allDrafts[user.department], currentStatus);
}

function renderAll(params, status = "DRAFT") {
    const user = getSession();
    const cycleState = get("systemCycleState") || { id: "SETUP", phase: "COMPLETED" };
    
    const badgeEl = document.getElementById("cycleNameBadge");
    if(badgeEl) badgeEl.innerText = cycleState.id;

    const isCycleActive = cycleState.phase === "STUDENT_FEEDBACK" || cycleState.phase === "FACULTY_REFLECTION" || cycleState.phase === "ACTION_REPORT";
    const isCycleCompleted = cycleState.phase === "COMPLETED";
    
    let isLocked = false;
    if (isCycleActive || isCycleCompleted) {
        isLocked = true;
    } else if (cycleState.phase === "PREPARATION") {
        isLocked = (status === "SUBMITTED" || status === "APPROVED");
    }

    const listContainer = document.getElementById("paramListContainer");
    const stackedBar = document.getElementById("stackedBar");
    const legendContainer = document.getElementById("legendContainer");
    
    listContainer.innerHTML = "";
    stackedBar.innerHTML = "";
    legendContainer.innerHTML = "";

    document.getElementById("statusBannerCycleActive").style.display = isCycleActive ? "block" : "none";
    document.getElementById("statusBannerCompleted").style.display = isCycleCompleted ? "block" : "none"; 
    document.getElementById("statusBannerPending").style.display = (status === "SUBMITTED" && cycleState.phase === "PREPARATION") ? "block" : "none";
    document.getElementById("statusBannerApproved").style.display = (status === "APPROVED" && cycleState.phase === "PREPARATION") ? "block" : "none";
    
    const revBanner = document.getElementById("statusBannerRevision");
    if (status === "REVISION_REQUESTED" && cycleState.phase === "PREPARATION") {
        revBanner.style.display = "block";
        const notesObj = get("departmentConfigNotes") || {};
        document.getElementById("deanNotesText").innerText = notesObj[user.department] || "Please revise your configuration.";
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
        segment.style.cssText = `position: relative; height: 100%; width: ${weightNum}%; background-color: ${color};`;
        
        if (index < params.length - 1 && !isLocked) {
            const handle = document.createElement("div");
            handle.className = "drag-handle";
            handle.addEventListener("mousedown", (e) => {
                isDragging = true;
                dragStartX = e.clientX;
                dragLeftIndex = index;
                initialLeftWeight = parseInt(params[index].weight);
                initialRightWeight = parseInt(params[index+1].weight);
                handle.classList.add("active");
                document.body.classList.add("dragging-bar");
            });
            segment.appendChild(handle);
        }
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
    
    const magicWandBtn = warningEl ? warningEl.querySelector("button") : null;
    if (magicWandBtn) {
        magicWandBtn.style.display = isLocked ? "none" : "block";
    }

    totalEl.innerText = `${totalWeight}%`;
    
    if (isLocked) {
        totalEl.style.color = "#1e3a8a";
        if(warningEl) warningEl.style.display = "none";
        if (finalizeBtn) {
            finalizeBtn.disabled = true;
            finalizeBtn.style.opacity = "0.5";
            finalizeBtn.style.cursor = "not-allowed";
            if(isCycleActive || isCycleCompleted) {
                finalizeBtn.innerText = "Locked";
            } else {
                finalizeBtn.innerText = status === "APPROVED" ? "Approved" : "Submitted";
                
                // Add Edit Again button for stuck states during PREPARATION
                if(status === "APPROVED" || status === "SUBMITTED") {
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
                }
            }
        }
    } else {
        if (finalizeBtn) finalizeBtn.innerText = "Submit Configuration";
        if (totalWeight !== 100) {
            totalEl.style.color = "#dc2626";
            if(warningEl) warningEl.style.display = "flex"; 
            if (finalizeBtn) {
                finalizeBtn.disabled = true;
                finalizeBtn.style.opacity = "0.5";
                finalizeBtn.style.cursor = "not-allowed";
            }
        } else {
            totalEl.style.color = "#1e3a8a";
            if(warningEl) warningEl.style.display = "none";
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

function handleDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    document.body.classList.remove("dragging-bar");
    document.querySelectorAll('.drag-handle').forEach(h => h.classList.remove('active'));

    if (checkPhaseLock()) return;

    const user = getSession();
    let allDrafts = get("draftParameters") || {};
    let params = allDrafts[user.department] || [];
    let statuses = get("departmentConfigStatus") || {};

    const stackedBar = document.getElementById("stackedBar");
    const containerWidth = stackedBar.getBoundingClientRect().width;
    const deltaX = e.clientX - dragStartX;
    const deltaPercent = Math.round((deltaX / containerWidth) * 100);

    let newLeft = initialLeftWeight + deltaPercent;
    let newRight = initialRightWeight - deltaPercent;

    if (newLeft < 1) { newLeft = 1; newRight = initialLeftWeight + initialRightWeight - 1; }
    if (newRight < 1) { newRight = 1; newLeft = initialLeftWeight + initialRightWeight - 1; }

    if (newLeft !== initialLeftWeight) {
        params[dragLeftIndex].weight = newLeft;
        params[dragLeftIndex+1].weight = newRight;
        
        statuses[user.department] = "DRAFT";
        set("departmentConfigStatus", statuses);

        allDrafts[user.department] = params;
        set("draftParameters", allDrafts);
        renderAll(params, "DRAFT");
    } else {
        renderAll(params, statuses[user.department]);
    }
}

export function autoBalance() {
    if (checkPhaseLock()) return;
    const user = getSession();
    let allDrafts = get("draftParameters") || {};
    let params = allDrafts[user.department] || [];
    if (params.length === 0) return;

    let total = params.reduce((sum, p) => sum + parseInt(p.weight), 0);
    if (total === 100 || total === 0) return;

    let newTotal = 0;
    
    params.forEach((p, i) => {
        if (i === params.length - 1) {
            p.weight = 100 - newTotal;
            if(p.weight <= 0) p.weight = 1; 
        } else {
            let scaled = Math.round(parseInt(p.weight) * (100 / total));
            if (scaled < 1) scaled = 1; 
            p.weight = scaled;
            newTotal += scaled;
        }
    });

    let statuses = get("departmentConfigStatus") || {};
    statuses[user.department] = "DRAFT";
    set("departmentConfigStatus", statuses);

    allDrafts[user.department] = params;
    set("draftParameters", allDrafts);
    renderAll(params, "DRAFT");
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
    if (checkPhaseLock()) return;
    const user = getSession();
    let allDrafts = get("draftParameters") || {};
    let statuses = get("departmentConfigStatus") || {};
    
    statuses[user.department] = "DRAFT";
    set("departmentConfigStatus", statuses);

    allDrafts[user.department] = allDrafts[user.department].filter(p => p.id !== id);
    set("draftParameters", allDrafts);
    renderAll(allDrafts[user.department], "DRAFT");
}

export function saveParameter() {
    if (checkPhaseLock()) return;
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
    
    statuses[user.department] = "DRAFT";
    set("departmentConfigStatus", statuses);

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
    renderAll(deptParams, "DRAFT");
}

export function finalizeConfig() {
    if (checkPhaseLock()) return;
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

export function revertToDraft() {
    if (checkPhaseLock()) return;
    const user = getSession();
    let statuses = get("departmentConfigStatus") || {};
    statuses[user.department] = "DRAFT";
    set("departmentConfigStatus", statuses);
    
    let drafts = get("draftParameters") || {};
    renderAll(drafts[user.department] || [], "DRAFT");
}
