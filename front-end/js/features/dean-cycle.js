import { get, set } from "../core/storage.js";

const PHASES = ["PREPARATION", "STUDENT_FEEDBACK", "FACULTY_REFLECTION", "COMPLETED"];

export function initCycleManagement() {
    renderCycleTracker();
    renderApprovalQueue();
}

function renderCycleTracker() {
    let cycleObj = get("systemCycleState");
    
    const createSection = document.getElementById("createCycleSection");
    const activeCard = document.getElementById("activeCycleCard");
    const approvalCard = document.getElementById("approvalQueueCard");
    const btn = document.getElementById("advancePhaseBtn");

    if (!cycleObj || cycleObj.phase === "COMPLETED") {
        createSection.style.display = "block";
        btn.style.display = "none";
        
        if (!cycleObj) {
            activeCard.style.display = "none";
            approvalCard.style.display = "none";
            return; 
        }
    } else {
        createSection.style.display = "none";
        activeCard.style.display = "block";
        btn.style.display = "block";
    }

    activeCard.style.display = "block";
    const currentPhaseIndex = PHASES.indexOf(cycleObj.phase);

    document.getElementById("currentCycleName").innerText = cycleObj.id;

    PHASES.forEach((phase, index) => {
        const stepEl = document.getElementById(`step_${phase}`);
        if (!stepEl) return;
        
        stepEl.classList.remove("active", "completed");
        if (index < currentPhaseIndex) {
            stepEl.classList.add("completed");
        } else if (index === currentPhaseIndex) {
            stepEl.classList.add("active");
        }
    });

    const badge = document.getElementById("cycleStatusBadge");
    const desc = document.getElementById("currentCycleDesc");
    const deadlineText = document.getElementById("deadlineText");

    badge.innerText = cycleObj.phase.replace("_", " ");
    deadlineText.innerText = "";

    if (cycleObj.phase === "PREPARATION") {
        badge.className = "badge neutral";
        desc.innerText = "Review HOD parameters below before launching.";
        btn.innerText = "Launch Student Feedback Phase";
        approvalCard.style.display = "block";
    } 
    else if (cycleObj.phase === "STUDENT_FEEDBACK") {
        badge.className = "badge primary";
        desc.innerText = "Students are currently submitting feedback. Faculty forms are locked.";
        btn.innerText = "Close Student Phase & Open Faculty Reflection";
        approvalCard.style.display = "none";
        if(cycleObj.studentDeadline) deadlineText.innerText = `Closes: ${new Date(cycleObj.studentDeadline).toLocaleString()}`;
    }
    else if (cycleObj.phase === "FACULTY_REFLECTION") {
        badge.className = "badge warning";
        desc.innerText = "Students locked. Faculty are submitting Self-Reflections and Action Reports.";
        btn.innerText = "Complete & Archive Cycle";
        approvalCard.style.display = "none";
        if(cycleObj.reflectionDeadline) deadlineText.innerText = `Deadline: ${new Date(cycleObj.reflectionDeadline).toLocaleString()}`;
    }
    else if (cycleObj.phase === "COMPLETED") {
        badge.className = "badge success";
        desc.innerText = "Cycle is fully archived. You may start a new one.";
        btn.style.display = "none";
        approvalCard.style.display = "none";
    }
}

export function createNewCycle() {
    const nameInput = document.getElementById("newCycleName").value.trim();
    if (!nameInput) {
        alert("Please enter a name for the new feedback cycle.");
        return;
    }

    let cycleObj = get("systemCycleState");
    if (cycleObj && cycleObj.phase !== "COMPLETED") {
        alert("An active cycle is already in progress. You must complete it first.");
        return;
    }

    // ==========================================
    // CYCLE INHERITANCE FIX
    // ==========================================
    // Grab the parameters that were active in the previous cycle
    const previousActiveParams = get("activeParameters") || {};
    
    // Copy them over to be the new drafts, and pre-approve them
    set("draftParameters", previousActiveParams);
    
    let newStatuses = {};
    Object.keys(previousActiveParams).forEach(dept => {
        newStatuses[dept] = "APPROVED"; // Seamless rollover
    });
    
    set("departmentConfigStatus", newStatuses);
    set("departmentConfigNotes", {});

    let cyclesArray = get("feedbackCycles") || [];
    cyclesArray.forEach(c => c.status = "completed");
    cyclesArray.push({
        cycleId: nameInput,
        status: "active",
        endTimestamp: new Date(new Date().getTime() + 7*24*60*60*1000).toISOString() 
    });
    set("feedbackCycles", cyclesArray);

    cycleObj = {
        id: nameInput,
        phase: "PREPARATION",
        studentDeadline: null,
        reflectionDeadline: null
    };
    set("systemCycleState", cycleObj);

    document.getElementById("newCycleName").value = "";
    
    renderCycleTracker();
    renderApprovalQueue();
}

function renderApprovalQueue() {
    const listContainer = document.getElementById("approvalListContainer");
    let statuses = get("departmentConfigStatus") || {};
    
    fetch("../../js/mock-data/users.json").then(res => res.json()).then(users => {
        const hods = users.filter(u => u.role === "hod");
        const depts = [...new Set(hods.map(h => h.department))];

        if (depts.length === 0) {
            listContainer.innerHTML = `<p style="padding: 20px 0; color: #64748b; font-style: italic;">No departments found.</p>`;
            return;
        }

        listContainer.innerHTML = "";
        
        depts.forEach(dept => {
            const status = statuses[dept] || "DRAFT";
            let statusBadge = "";
            let actionButtons = "";

            if (status === "SUBMITTED") {
                statusBadge = `<span class="badge warning" style="font-size: 10px;">PENDING REVIEW</span>`;
                actionButtons = `<button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="viewRequest('${dept}')">Review Request →</button>`;
            } else if (status === "APPROVED") {
                statusBadge = `<span class="badge success" style="font-size: 10px;">APPROVED</span>`;
                actionButtons = `<span style="color: #16a34a; font-size: 12px;">✅ Ready for Launch</span>`;
            } else if (status === "REVISION_REQUESTED") {
                statusBadge = `<span class="badge danger" style="font-size: 10px;">REVISION PENDING</span>`;
                actionButtons = `<span style="color: #d97706; font-size: 12px;">⏳ Waiting on HOD</span>`;
            } else {
                statusBadge = `<span class="badge neutral" style="font-size: 10px;">DRAFTING</span>`;
                actionButtons = `<span style="color: #94a3b8; font-size: 12px;">Not Submitted</span>`;
            }

            const row = document.createElement("div");
            row.className = "approval-row";
            row.innerHTML = `
                <div><strong style="color: #0f172a; font-size: 14px;">${dept}</strong></div>
                <div>${statusBadge}</div>
                <div style="text-align: right;">${actionButtons}</div>
            `;
            listContainer.appendChild(row);
        });
    });
}

export function viewRequest(dept) {
    localStorage.setItem("activeReviewDept", dept);
    window.location.href = "review-parameters.html";
}

export function advanceCyclePhase() {
    let cycleObj = get("systemCycleState") || { phase: "PREPARATION" };
    const currentIndex = PHASES.indexOf(cycleObj.phase);
    
    if (currentIndex === 0) {
        let statuses = get("departmentConfigStatus") || {};
        const pending = Object.values(statuses).some(s => s === "SUBMITTED" || s === "REVISION_REQUESTED");
        
        if (pending) {
            const force = confirm("Warning: Some departments have unapproved parameters. Launching now will force them to use default parameters. Continue?");
            if (!force) return;
        }

        let allDrafts = get("draftParameters") || {};
        let activeParams = {};
        
        Object.keys(allDrafts).forEach(dept => {
            if (statuses[dept] === "APPROVED") {
                activeParams[dept] = allDrafts[dept];
            }
        });
        set("activeParameters", activeParams);

        const d = new Date();
        d.setDate(d.getDate() + 7);
        cycleObj.studentDeadline = d.toISOString();
    }
    else if (currentIndex === 1) {
        const d = new Date();
        d.setHours(d.getHours() + 24);
        cycleObj.reflectionDeadline = d.toISOString();
        
        const actionD = new Date(d);
        actionD.setHours(actionD.getHours() + 72);
        cycleObj.actionDeadline = actionD.toISOString();
    }

    if (currentIndex < PHASES.length - 1) {
        cycleObj.phase = PHASES[currentIndex + 1];
        set("systemCycleState", cycleObj);
        renderCycleTracker();
    }
}
