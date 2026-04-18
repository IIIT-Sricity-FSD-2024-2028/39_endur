import { GET, POST, PATCH } from '../core/api.js';
import { getSession } from '../core/session.js';
import { showToast } from './admin-utils.js';

const PHASES = ['PREPARATION', 'STUDENT_FEEDBACK', 'FACULTY_REFLECTION', 'COMPLETED'];

export async function initCycleManagement() {
    await renderCycleTracker();
    await renderApprovalQueue();
    await renderHistory();
}

async function renderCycleTracker() {
    let cycles = [];
    try { cycles = await GET('/feedback-cycles'); } catch { showToast('Could not load cycles', 'error'); return; }

    let cycleObj = cycles.find(c => c.status === 'active');
    const createSection = document.getElementById('createCycleSection');
    const activeCard = document.getElementById('activeCycleCard');
    const approvalCard = document.getElementById('approvalQueueCard');
    const btn = document.getElementById('advancePhaseBtn');

    if (!cycleObj || cycleObj.phase === 'COMPLETED') {
        if (createSection) createSection.style.display = 'block';
        if (btn) btn.style.display = 'none';
        if (!cycleObj && activeCard) { activeCard.style.display = 'none'; if (approvalCard) approvalCard.style.display = 'none'; return; }
    } else {
        if (createSection) createSection.style.display = 'none';
        if (activeCard) activeCard.style.display = 'block';
        if (btn) btn.style.display = 'block';
    }

    if (activeCard) activeCard.style.display = 'block';
    const currentPhaseIndex = PHASES.indexOf(cycleObj.phase);
    const nameEl = document.getElementById('currentCycleName');
    if (nameEl) nameEl.innerText = cycleObj.cycleName || cycleObj.cycleId;

    PHASES.forEach((phase, index) => {
        const stepEl = document.getElementById(`step_${phase}`);
        if (!stepEl) return;
        stepEl.classList.remove('active', 'completed');
        if (index < currentPhaseIndex) stepEl.classList.add('completed');
        else if (index === currentPhaseIndex) stepEl.classList.add('active');
    });

    const badge = document.getElementById('cycleStatusBadge');
    const desc = document.getElementById('currentCycleDesc');
    const deadlineText = document.getElementById('deadlineText');

    function fmt(iso) { return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
    const dPrep = document.getElementById('date_PREPARATION'); if (dPrep) dPrep.innerText = cycleObj.prepDeadline ? `Ends: ${fmt(cycleObj.prepDeadline)}` : '';
    const dStud = document.getElementById('date_STUDENT_FEEDBACK'); if (dStud) dStud.innerText = cycleObj.studentDeadline ? `Ends: ${fmt(cycleObj.studentDeadline)}` : '';
    const dRef = document.getElementById('date_FACULTY_REFLECTION'); if (dRef) dRef.innerText = cycleObj.reflectionDeadline ? `Ends: ${fmt(cycleObj.reflectionDeadline)}` : '';
    const dComp = document.getElementById('date_COMPLETED'); if (dComp) dComp.innerText = cycleObj.endTimestamp && cycleObj.phase === 'COMPLETED' ? `Ended: ${fmt(cycleObj.endTimestamp)}` : '';

    if (badge && desc && deadlineText) {
        badge.innerText = (cycleObj.phase || '').replace(/_/g, ' ');
        deadlineText.innerText = '';
        if (cycleObj.phase === 'PREPARATION') { badge.className = 'badge neutral'; desc.innerText = 'Review HOD parameters below before launching.'; if (btn) btn.innerText = 'Launch Student Feedback Phase'; if (approvalCard) approvalCard.style.display = 'block'; }
        else if (cycleObj.phase === 'STUDENT_FEEDBACK') { badge.className = 'badge primary'; desc.innerText = 'Students are currently submitting feedback.'; if (btn) btn.innerText = 'Close Student Phase & Open Faculty Reflection'; if (approvalCard) approvalCard.style.display = 'none'; if (cycleObj.studentDeadline) deadlineText.innerText = `Closes: ${new Date(cycleObj.studentDeadline).toLocaleString()}`; }
        else if (cycleObj.phase === 'FACULTY_REFLECTION') { badge.className = 'badge warning'; desc.innerText = 'Faculty are submitting Self-Reflections and Action Reports.'; if (btn) btn.innerText = 'Complete & Archive Cycle'; if (approvalCard) approvalCard.style.display = 'none'; if (cycleObj.reflectionDeadline) deadlineText.innerText = `Deadline: ${new Date(cycleObj.reflectionDeadline).toLocaleString()}`; }
        else if (cycleObj.phase === 'COMPLETED') { badge.className = 'badge success'; desc.innerText = 'Cycle is fully archived. You may start a new one.'; if (btn) btn.style.display = 'none'; if (approvalCard) approvalCard.style.display = 'none'; }
    }
    window._activeCycle = cycleObj;
}

export async function createNewCycle() {
    const nameInput = document.getElementById('newCycleName').value.trim();
    const prep = document.getElementById('dlPrep').value;
    const student = document.getElementById('dlStudent').value;
    const ref = document.getElementById('dlReflection').value;
    if (!nameInput || !prep || !student || !ref) { alert('Please enter a name and select all deadlines.'); return; }
    const dPrep = new Date(prep), dStudent = new Date(student), dRef = new Date(ref);
    if (dPrep >= dStudent || dStudent >= dRef) { alert('Deadlines must be chronological (Prep → Student → Reflection).'); return; }

    try {
        await POST('/feedback-cycles', { 
            cycleName: nameInput, 
            type: 'weekly', 
            startTimestamp: new Date().toISOString(), 
            prepDeadline: dPrep.toISOString(), 
            studentDeadline: dStudent.toISOString(), 
            reflectionDeadline: dRef.toISOString(), 
            endTimestamp: dRef.toISOString() 
        });
        showToast('Cycle created successfully!', 'success');
        document.getElementById('createCycleForm')?.reset();
        await initCycleManagement();
    } catch (err) {
        alert('Failed to create cycle: ' + (err.message || 'Server error'));
    }
}

async function renderApprovalQueue() {
    const listContainer = document.getElementById('approvalListContainer');
    if (!listContainer) return;
    let statusMap = {};
    try { statusMap = await GET('/evaluation-parameters/status'); } catch {}
    let deptsData = [];
    try { deptsData = await GET('/departments'); } catch {}
    const depts = deptsData.map(d => d.name).sort();

    if (!depts.length) { listContainer.innerHTML = `<p style="padding:20px 0;color:#64748b;font-style:italic;">No departments found.</p>`; return; }

    listContainer.innerHTML = '';
    depts.forEach(dept => {
        const status = statusMap[dept] || 'DRAFT';
        const statusBadge = status === 'SUBMITTED' ? `<span class="badge warning" style="font-size:10px;">PENDING REVIEW</span>` : status === 'APPROVED' ? `<span class="badge success" style="font-size:10px;">APPROVED</span>` : status === 'REVISION_REQUESTED' ? `<span class="badge danger" style="font-size:10px;">REVISION PENDING</span>` : `<span class="badge neutral" style="font-size:10px;">NO ACTION YET</span>`;
        const actionButtons = status === 'SUBMITTED' ? `<button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="window.viewRequest('${dept}')">Review Request →</button>` : status === 'APPROVED' ? `<span style="color:#16a34a;font-size:12px;">✅ Ready for Launch</span>` : `<span style="color:#94a3b8;font-size:12px;">Waiting for HOD</span>`;
        const row = document.createElement('div');
        row.className = 'approval-row';
        row.innerHTML = `<div><strong style="color:#0f172a;font-size:14px;">${dept}</strong></div><div>${statusBadge}</div><div style="text-align:right;">${actionButtons}</div>`;
        listContainer.appendChild(row);
    });

    window.viewRequest = (dept) => { localStorage.setItem('activeReviewDept', dept); window.location.href = 'review-parameters.html'; };
}

export async function advanceCyclePhase() {
    const cycle = window._activeCycle;
    if (!cycle) { alert('No active cycle found.'); return; }
    const currentIndex = PHASES.indexOf(cycle.phase);

    if (currentIndex === 0) {
        // Validate all dept params add up to 100%
        let statusMap = {};
        try { statusMap = await GET('/evaluation-parameters/status'); } catch {}
        const notApproved = Object.entries(statusMap).filter(([, s]) => s !== 'APPROVED').map(([d]) => d);
        if (notApproved.length > 0 && !confirm(`Some departments are not fully approved (${notApproved.join(', ')}). Launch anyway?`)) return;
    }

    const nextPhase = currentIndex < PHASES.length - 1 ? PHASES[currentIndex + 1] : null;
    if (!nextPhase) return;

    try {
        const newStatus = nextPhase === 'COMPLETED' ? 'closed' : 'active';
        await PATCH(`/feedback-cycles/${cycle.cycleId}/status`, { status: newStatus, phase: nextPhase });
        showToast(`Phase advanced to ${nextPhase.replace(/_/g, ' ')}`, 'success');
        await initCycleManagement();
    } catch (err) {
        alert('Failed to advance phase: ' + (err.message || 'Server error'));
    }
}

async function renderHistory() {
    const listContainer = document.getElementById('cycleHistoryContainer');
    if (!listContainer) return;
    let cycles = [];
    try { cycles = await GET('/feedback-cycles'); } catch {}
    if (!cycles.length) { listContainer.innerHTML = '<p style="padding:20px 0;color:#64748b;font-style:italic;">No cycle history found.</p>'; return; }
    listContainer.innerHTML = cycles.map(c => `
        <div class="approval-row">
            <div><strong style="color:#0f172a;font-size:14px;">${c.cycleName || c.cycleId}</strong></div>
            <div><span class="badge ${c.status === 'active' ? 'success' : 'neutral'}" style="font-size:10px;">${(c.status || '').toUpperCase()}</span></div>
            <div style="text-align:right;"><span style="color:#64748b;font-size:12px;">${c.status === 'active' ? 'IN PROGRESS' : 'ARCHIVED'}</span></div>
        </div>`).join('');
}
