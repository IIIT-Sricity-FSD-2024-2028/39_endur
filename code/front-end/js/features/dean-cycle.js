import { get, set } from '../core/storage.js';
import { GET } from '../core/api.js';
import { getSession } from '../core/session.js';
import { appendAuditLog } from './admin-utils.js';


const PHASES = ["PREPARATION", "STUDENT_FEEDBACK", "FACULTY_REFLECTION", "COMPLETED"];
const DEFAULT_PARAMETERS = [
    { id: "clarity", name: "Clarity of Explanation", desc: "Effectiveness of teaching methods and clear delivery.", weight: 25 },
    { id: "structure", name: "Structure of Course", desc: "Organization of materials and syllabus adherence.", weight: 25 },
    { id: "engagement", name: "Student Engagement", desc: "Fostering an interactive and responsive environment.", weight: 25 },
    { id: "difficulty", name: "Difficulty Level", desc: "Appropriateness of the coursework difficulty.", weight: 25 }
];

export function initCycleManagement() {
    renderCycleTracker();
    renderApprovalQueue();
    renderHistory();
}

function renderCycleTracker() {
    let rawCycles = get("systemFeedbackCycles") || [];
    let cycles = rawCycles.map(c => ({
        ...c,
        phase: c.phase || (c.status === "active" ? "STUDENT_FEEDBACK" : "COMPLETED")
    }));

    // Save enriched objects back so everyone is in sync
    set("systemFeedbackCycles", cycles);

    let cycleObj = cycles.find(c => c.status === "active");

    // Sync legacy systemCycleState for compatibility with other roles
    if (cycleObj) {
        set("systemCycleState", { id: cycleObj.cycleName, phase: cycleObj.phase });
    } else {
        set("systemCycleState", { phase: "COMPLETED" });
    }

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

    document.getElementById("currentCycleName").innerText = cycleObj.cycleName || cycleObj.id;

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

    const phaseString = cycleObj.phase ? cycleObj.phase.replace(/_/g, " ") : "UNKNOWN";
    badge.innerText = phaseString;
    deadlineText.innerText = "";

    // Fill specific phase dates if available
    function formatDateShort(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const dPrep = document.getElementById("date_PREPARATION");
    if (dPrep) dPrep.innerText = cycleObj.prepDeadline ? `Ends: ${formatDateShort(cycleObj.prepDeadline)}` : '';

    const dStud = document.getElementById("date_STUDENT_FEEDBACK");
    if (dStud) dStud.innerText = cycleObj.studentDeadline ? `Ends: ${formatDateShort(cycleObj.studentDeadline)}` : '';

    const dRef = document.getElementById("date_FACULTY_REFLECTION");
    if (dRef) dRef.innerText = cycleObj.reflectionDeadline ? `Ends: ${formatDateShort(cycleObj.reflectionDeadline)}` : '';

    const dComp = document.getElementById("date_COMPLETED");
    if (dComp) dComp.innerText = cycleObj.endTimestamp && cycleObj.phase === 'COMPLETED' ? `Ended: ${formatDateShort(cycleObj.endTimestamp)}` : '';

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
        if (cycleObj.studentDeadline) deadlineText.innerText = `Closes: ${new Date(cycleObj.studentDeadline).toLocaleString()}`;
    }
    else if (cycleObj.phase === "FACULTY_REFLECTION") {
        badge.className = "badge warning";
        desc.innerText = "Students locked. Faculty are submitting Self-Reflections and Action Reports.";
        btn.innerText = "Complete & Archive Cycle";
        approvalCard.style.display = "none";
        if (cycleObj.reflectionDeadline) deadlineText.innerText = `Deadline: ${new Date(cycleObj.reflectionDeadline).toLocaleString()}`;
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
    const prep = document.getElementById("dlPrep").value;
    const student = document.getElementById("dlStudent").value;
    const ref = document.getElementById("dlReflection").value;

    if (!nameInput || !prep || !student || !ref) {
        alert("Please enter a name and select all deadlines for the new feedback cycle.");
        return;
    }

    const dPrep = new Date(prep), dStudent = new Date(student), dRef = new Date(ref);
    if (dPrep >= dStudent || dStudent >= dRef) {
        alert('Deadlines must be chronological (Prep -> Student -> Reflection).');
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
    // Grab current parameters and statuses
    const previousActiveParams = get("activeParameters") || {};
    const users = get("systemUsers") || [];
    const allDepts = [...new Set(users.map(u => u.department || u.dept).filter(Boolean))];
    
    let newDrafts = {};
    let newStatuses = {};

    allDepts.forEach(dept => {
        const existing = previousActiveParams[dept] || [];
        const sum = existing.reduce((s, p) => s + (p.weight || 0), 0);
        
        if (existing.length > 0 && sum === 100) {
            newDrafts[dept] = existing;
            newStatuses[dept] = "APPROVED"; // Carry over if valid
        } else {
            newDrafts[dept] = JSON.parse(JSON.stringify(DEFAULT_PARAMETERS));
            newStatuses[dept] = "DRAFT"; // Force HODs to review defaults
        }
    });

    set("draftParameters", newDrafts);
    set("departmentConfigStatus", newStatuses);
    set("departmentConfigNotes", {});

    let cyclesArray = get("systemFeedbackCycles") || [];
    cyclesArray.forEach(c => c.status = "closed");
    cyclesArray.unshift({
        cycleId: 'CYCLE' + Date.now().toString(36).toUpperCase(),
        cycleName: nameInput,
        type: 'weekly',
        status: "active",
        phase: "PREPARATION",
        startTimestamp: new Date().toISOString(),
        endTimestamp: dRef.toISOString(),
        prepDeadline: dPrep.toISOString(),
        studentDeadline: dStudent.toISOString(),
        reflectionDeadline: dRef.toISOString()
    });
    set("systemFeedbackCycles", cyclesArray);

    const session = getSession();
    if (session) appendAuditLog(session, 'dean', 'CREATE', 'Feedback Cycles', nameInput, 'Dean initialized new feedback cycle.');

    set("systemCycleState", {
        id: nameInput,
        phase: "PREPARATION",
        prepDeadline: dPrep.toISOString(),
        studentDeadline: dStudent.toISOString(),
        reflectionDeadline: dRef.toISOString()
    });

    document.getElementById("createCycleForm").reset();
    document.getElementById('createCycleSection').style.display = 'none';

    renderCycleTracker();
    renderApprovalQueue();
    renderHistory();
}

async function renderApprovalQueue() {
    const listContainer = document.getElementById('approvalListContainer');
    let statuses = get('departmentConfigStatus') || {};

    let users = [];
    try { users = await GET('/users'); } catch {}
    const hods = users.filter(u => u.role === 'hod');
    const depts = [...new Set(hods.map(h => h.department))];

    if (!depts.length) {
        listContainer.innerHTML = `<p style="padding: 20px 0; color: #64748b; font-style: italic;">No departments found.</p>`;
        return;
    }

    listContainer.innerHTML = '';
    depts.forEach(dept => {
        const status = statuses[dept] || 'DRAFT';
        let statusBadge = '';
        let actionButtons = '';

        if (status === 'SUBMITTED') {
            statusBadge = `<span class="badge warning" style="font-size: 10px;">PENDING REVIEW</span>`;
            actionButtons = `<button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="viewRequest('${dept}')">Review Request →</button>`;
        } else if (status === 'APPROVED') {
            statusBadge = `<span class="badge success" style="font-size: 10px;">APPROVED</span>`;
            actionButtons = `<span style="color: #16a34a; font-size: 12px;">✅ Ready for Launch</span>`;
        } else if (status === 'REVISION_REQUESTED') {
            statusBadge = `<span class="badge danger" style="font-size: 10px;">REVISION PENDING</span>`;
            actionButtons = `<span style="color: #d97706; font-size: 12px;">⏳ Waiting on HOD</span>`;
        } else {
            statusBadge = `<span class="badge neutral" style="font-size: 10px;">NO ACTION YET</span>`;
            actionButtons = `<span style="color: #94a3b8; font-size: 12px;">Waiting for HOD</span>`;
        }

        const row = document.createElement('div');
        row.className = 'approval-row';
        row.innerHTML = `
            <div><strong style="color: #0f172a; font-size: 14px;">${dept}</strong></div>
            <div>${statusBadge}</div>
            <div style="text-align: right;">${actionButtons}</div>
        `;
        listContainer.appendChild(row);
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
        let drafts = get("draftParameters") || {};
        const users = get("systemUsers") || [];
        const allDepts = [...new Set(users.map(u => u.department || u.dept).filter(Boolean))];

        const failingDepts = [];
        allDepts.forEach(dept => {
            const params = drafts[dept] || [];
            const sum = params.reduce((s, p) => s + (p.weight || 0), 0);
            if (sum !== 100) failingDepts.push(`${dept} (${sum}%)`);
        });

        if (failingDepts.length > 0) {
            alert(`⚠️ LAUNCH ABORTED: The following departments do not have exactly 100% total weightage:\n\n${failingDepts.join('\n')}\n\nPlease fix these configurations in the Evaluation Parameters review section first.`);
            return;
        }

        const pendingReview = Object.values(statuses).some(s => s === "SUBMITTED" || s === "REVISION_REQUESTED");
        if (pendingReview) {
            const confirmLaunch = confirm("Note: Some departments are'Pending Review'. Launching now will finalize their current 100% configurations. Continue?");
            if (!confirmLaunch) return;
        }

        let activeParams = {};
        allDepts.forEach(dept => { activeParams[dept] = drafts[dept]; });
        set("activeParameters", activeParams);
        
        let newStatuses = {};
        allDepts.forEach(dept => { newStatuses[dept] = "APPROVED"; });
        set("departmentConfigStatus", newStatuses);

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

        let rawCycles = get("systemFeedbackCycles") || [];
        let cycles = rawCycles.map(c => ({
            ...c,
            phase: c.phase || (c.status === "active" ? "STUDENT_FEEDBACK" : "COMPLETED")
        }));

        let active = cycles.find(c => c.status === "active");
        if (active) {
            active.phase = cycleObj.phase;
            if (active.phase === "COMPLETED") active.status = "closed";
            set("systemFeedbackCycles", cycles);
        }

        const session = getSession();
        if (session) {
            let logMsg = active && active.phase === "COMPLETED" ? "Cycle successfully completed and archived." : `Phase advanced to ${cycleObj.phase.replace(/_/g, " ")}.`;
            appendAuditLog(session, 'dean', 'UPDATE', 'Feedback Cycles', cycleObj.id || 'Active Cycle', logMsg);
        }

        renderCycleTracker();
        renderHistory();
    }
}

function renderHistory() {
    const listContainer = document.getElementById("cycleHistoryContainer");
    if (!listContainer) return; // if div is missing, skip

    let cyclesArray = get("systemFeedbackCycles") || [];
    if (!cyclesArray.length) {
        listContainer.innerHTML = '<p style="padding: 20px 0; color: #64748b; font-style: italic;">No cycle history found.</p>';
        return;
    }

    listContainer.innerHTML = cyclesArray.map(c => {
        return `
        <div class="approval-row">
            <div>
                <strong style="color: #0f172a; font-size: 14px;">${c.cycleName || c.cycleId}</strong>
            </div>
            <div>
                <span class="badge ${c.status === 'active' ? 'success' : 'neutral'}" style="font-size: 10px;">${(c.status || '').toUpperCase()}</span>
            </div>
            <div style="text-align: right;">
                <span style="color: #64748b; font-size: 12px;">${c.status === 'active' ? 'IN PROGRESS' : 'ARCHIVED'}</span>
            </div>
        </div>`;
    }).join('');
}
