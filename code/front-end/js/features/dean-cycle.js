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
    const start   = document.getElementById('dlStart')?.value || document.getElementById('dlPrep')?.value;
    const student = document.getElementById('dlStudent')?.value;
    const end     = document.getElementById('dlEnd')?.value || document.getElementById('dlReflection')?.value;
    if (!nameInput || !start || !student || !end) { alert('Please enter a name and select all dates.'); return; }
    const dStart = new Date(start), dStudent = new Date(student), dEnd = new Date(end);
    if (dStart >= dStudent || dStudent >= dEnd) { alert('Dates must be chronological: Start → Student Deadline → End.'); return; }

    try {
        await POST('/feedback-cycles', {
            cycleName:       nameInput,
            startTimestamp:  dStart.toISOString(),
            studentDeadline: dStudent.toISOString(),
            endTimestamp:    dEnd.toISOString(),
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

    window.viewRequest = (dept) => { window.location.href = `review-parameters.html?dept=${encodeURIComponent(dept)}`; };
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
        <div class="approval-row" style="grid-template-columns:2fr 1fr 1fr 1fr;">
            <div>
                <strong style="color:#0f172a;font-size:14px;">${c.cycleName || c.cycleId}</strong>
                <p style="font-size:11px;color:#94a3b8;margin-top:2px">${c.startTimestamp ? new Date(c.startTimestamp).toLocaleDateString() : ''} — ${c.endTimestamp ? new Date(c.endTimestamp).toLocaleDateString() : ''}</p>
            </div>
            <div><span class="badge ${c.status === 'active' ? 'success' : 'neutral'}" style="font-size:10px;">${(c.status || '').toUpperCase()}</span></div>
            <div><span style="color:#64748b;font-size:12px;">${(c.phase||'COMPLETED').replace(/_/g,' ')}</span></div>
            <div style="text-align:right;"><button class="btn-small" onclick="deanViewResponses('${c.cycleId}')">View</button></div>
        </div>`).join('');

    // View responses modal handler (Dean — studentId masked)
    window.deanViewResponses = async (cycleId) => {
        let modal = document.getElementById('deanResponsesModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'deanResponsesModal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `<div class="modal-card" style="max-width:750px;width:95%">
                <h3 id="deanRespTitle">Cycle Responses <button class="modal-close" onclick="document.getElementById('deanResponsesModal').classList.remove('active')">✕</button></h3>
                <div style="overflow-x:auto;max-height:60vh;overflow-y:auto" id="deanRespBody"></div>
                <div class="modal-footer"><button class="btn-outline" onclick="document.getElementById('deanResponsesModal').classList.remove('active')">Close</button></div>
            </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target===modal) modal.classList.remove('active'); });
        }
        const body = document.getElementById('deanRespBody');
        document.getElementById('deanRespTitle').textContent = `Responses — ${cycles.find(c=>c.cycleId===cycleId)?.cycleName??cycleId}`;
        body.innerHTML = '<p style="padding:20px;color:var(--text-muted)">Loading…</p>';
        modal.classList.add('active');
        try {
            const [responses, allCourses] = await Promise.all([GET(`/feedback-responses?cycleId=${cycleId}`), GET('/courses')]);
            if (!responses.length) { body.innerHTML='<p style="padding:20px;text-align:center;color:var(--text-muted)">No responses recorded.</p>'; return; }
            body.innerHTML = `
                <style>
                    .resp-det { font-size: 11px; color: #64748b; margin-top: 4px; display: grid; gap: 4px; padding: 8px; background: #f8fafc; border-radius: 4px; }
                    .resp-comm { font-style: italic; color: var(--primary); }
                </style>
                <table class="data-table"><thead><tr><th>Course & Faculty</th><th>Dept</th><th>Date</th><th>Score & Breakdown</th></tr></thead><tbody>
                ${responses.map(r => {
                    const course = allCourses.find(c=>c.id===r.courseId);
                    const avg = Array.isArray(r.ratings) && r.ratings.length ? (() => {
                        const scores = r.ratings.map(x => {
                            let s = Number(x.score || 0);
                            if (s > 5) s = s / 20;
                            return s;
                        });
                        return (scores.reduce((a, b) => a + b, 0) / scores.length * 20).toFixed(1) + '%';
                    })() : '—';
                    const ratingsHtml = Array.isArray(r.ratings) ? r.ratings.map(rt => {
                        let s = Number(rt.score || 0);
                        if (s > 5) s = s / 20;
                        return `<div class="resp-det"><span><strong>${rt.paramName || rt.paramId}</strong>: ${s.toFixed(1)}/5</span>${rt.comment ? `<span class="resp-comm">"${rt.comment}"</span>` : ''}</div>`;
                    }).join('') : '';
                    return `<tr>
                        <td><strong>${course?.name??r.courseId}</strong><br><span style="font-size:11px;color:var(--text-muted)">${r.facultyId??'—'}</span></td>
                        <td>${r.studentDepartment??'—'}</td>
                        <td style="font-size:12px">${r.submittedAt?new Date(r.submittedAt).toLocaleDateString():'—'}</td>
                        <td><strong>${avg}</strong>${ratingsHtml}</td>
                    </tr>`;
                }).join('')}</tbody></table>`;
        } catch { body.innerHTML='<p style="padding:20px;color:var(--danger)">Failed to load responses.</p>'; }
    };
}
