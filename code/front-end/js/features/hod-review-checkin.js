import { GET, PATCH } from '../core/api.js';
import { getSession } from '../core/session.js';

let currentActiveFacultyId = null;
let currentActiveCourseId = null;
let currentReportId = null;

export async function renderReviewCheckins() {
    const user = getSession();
    if (!user) return;

    const listContainer = document.getElementById('checkinList');
    const banner = document.getElementById('cyclePhaseBanner');
    const emptyDetail = document.getElementById('emptyDetail');
    const checkinDetail = document.getElementById('checkinDetail');

    // Get active cycle from backend
    let activeCycleId = null;
    let cyclePhase = 'COMPLETED';
    try {
        const cycles = await GET('/feedback-cycles');
        const active = cycles.find(c => c.status === 'active');
        if (active) { activeCycleId = active.cycleId; cyclePhase = active.phase || 'PREPARATION'; }
    } catch {}

    const badgeEl = document.getElementById('activeCycleBadge');
    if (badgeEl) badgeEl.innerText = activeCycleId || 'None';

    if (cyclePhase !== 'FACULTY_REFLECTION') {
        if (listContainer) listContainer.innerHTML = `<div style="padding:30px;text-align:center;color:#64748b;font-size:14px;">Check-ins are only available during the Faculty Reflection phase.</div>`;
        if (checkinDetail) checkinDetail.style.display = 'none';
        if (emptyDetail) emptyDetail.style.display = 'flex';
        if (banner) { banner.style.display = 'block'; banner.innerHTML = '<strong>🔒 Module Locked:</strong> Review check-ins are only active during the Faculty Reflection phase.'; }
        return;
    }

    if (banner) { banner.style.display = 'block'; banner.innerHTML = '<strong>📝 Check-ins Open:</strong> You may now review Action Reports and finalize Check-ins.'; }

    const [allUsers, allCourses] = await Promise.all([GET('/users'), GET('/courses')]);
    let allSubmissions = [], allReflections = [], allActionReports = [];
    try { allSubmissions = await GET(`/feedback-responses?cycleId=${activeCycleId}`); } catch {}
    try { allReflections = await GET(`/faculty-reports/self-reflections?cycleId=${activeCycleId}`); } catch {}
    try { allActionReports = await GET(`/faculty-reports/action-reports?cycleId=${activeCycleId}`); } catch {}

    const myFaculty = allUsers.filter(u => u.role === 'faculty' && u.department === user.department);
    if (listContainer) listContainer.innerHTML = '';

    const viewDataList = [];
    myFaculty.forEach(faculty => {
        const facultyCourses = allCourses.filter(c => c.facultyId === faculty.id);
        facultyCourses.forEach(course => {
            const courseFeedback = allSubmissions.filter(f => f.course === course.id);
            let avgScore = 0;
            if (courseFeedback.length > 0) {
                const sumAverages = courseFeedback.reduce((sum, f) => {
                    const vals = Object.values(f.ratings || {}).filter(v => typeof v === 'number');
                    return sum + (vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);
                }, 0);
                avgScore = sumAverages / courseFeedback.length;
            }

            const reflection = allReflections.find(r => r.courseId === course.id && r.facultyId === faculty.id);
            const actionReport = allActionReports.find(a => a.courseId === course.id && a.facultyId === faculty.id);

            let status = 'PENDING', statusClass = 'neutral', subText = 'Awaiting Faculty Draft';
            if (actionReport) {
                if (actionReport.status === 'FINALIZED') { status = 'FINALIZED'; statusClass = 'primary'; subText = 'Check-in Complete'; }
                else if (actionReport.status === 'REVISION_REQUESTED') { status = 'REVISION PENDING'; statusClass = 'warning'; subText = 'Waiting on Faculty'; }
                else { status = 'SUBMITTED'; statusClass = 'success'; subText = 'Action Report Ready'; }
            } else if (reflection && avgScore < 3.5 && avgScore > 0) { status = 'URGENT'; statusClass = 'danger'; subText = 'Gap Detected'; }

            viewDataList.push({ faculty, course, avgScore, status, statusClass, subText, actionReport });
        });
    });

    viewDataList.sort((a, b) => ({ URGENT: 1, SUBMITTED: 2, 'REVISION PENDING': 3, PENDING: 4, FINALIZED: 5 }[a.status] - ({ URGENT: 1, SUBMITTED: 2, 'REVISION PENDING': 3, PENDING: 4, FINALIZED: 5 }[b.status])));

    viewDataList.forEach((data) => {
        const item = document.createElement('div');
        item.className = 'checkin-item';
        item.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><strong style="color:#0f172a;font-size:14px;">${data.faculty.name}</strong><span class="badge ${data.statusClass}" style="font-size:10px;">${data.status}</span></div>
            <div style="color:#64748b;font-size:12px;margin-bottom:8px;">${data.course.id}: ${data.course.name}</div>
            <div style="font-size:12px;font-weight:500;">${data.subText}</div>`;
        item.onclick = () => { document.querySelectorAll('.checkin-item').forEach(el => el.classList.remove('active')); item.classList.add('active'); openDetailView(data); };
        if (listContainer) listContainer.appendChild(item);
    });

    window.finalizeCheckin = finalizeCheckin;
    window.requestRevision = requestRevision;
}

function openDetailView(data) {
    document.getElementById('emptyDetail').style.display = 'none';
    document.getElementById('checkinDetail').style.display = 'flex';

    currentActiveFacultyId = data.faculty.id;
    currentActiveCourseId = data.course.id;
    currentReportId = data.actionReport?.reportId || null;

    document.getElementById('detailName').innerText = data.faculty.name;
    document.getElementById('detailMeta').innerText = `Professor • ${data.faculty.department}`;
    document.getElementById('detailScore').innerText = data.avgScore > 0 ? data.avgScore.toFixed(1) + '/5.0' : 'N/A';
    document.getElementById('detailCourse').innerText = data.course.id;
    document.getElementById('detailStatusBadge').innerText = data.status;
    document.getElementById('detailStatusBadge').className = `badge ${data.statusClass}`;

    const rootCauseEl = document.getElementById('detailRootCause');
    const strategiesEl = document.getElementById('detailStrategies');
    const notesEl = document.getElementById('hodNotes');
    const outcomesEl = document.getElementById('hodOutcomes');
    const actionBar = document.getElementById('hodActionBar');

    if (data.actionReport) {
        rootCauseEl.innerText = data.actionReport.rootCause || 'No root cause provided.';
        const strategies = (data.actionReport.plannedStrategies || '').split('\n').filter(s => s.trim());
        strategiesEl.innerHTML = strategies.map(s => `<div class="snippet-item">${s}</div>`).join('') || '<p style="color:#94a3b8;font-style:italic;">No strategies submitted yet.</p>';
        notesEl.value = data.actionReport.hodNotes || '';
        outcomesEl.value = data.actionReport.hodOutcomes || '';
    } else {
        rootCauseEl.innerText = 'Waiting for Faculty to submit Action Report.';
        strategiesEl.innerHTML = '<p style="color:#94a3b8;font-style:italic;">No strategies submitted yet.</p>';
        notesEl.value = ''; outcomesEl.value = '';
    }

    if (data.status === 'FINALIZED') {
        notesEl.disabled = true; outcomesEl.disabled = true;
        if (actionBar) actionBar.innerHTML = '<div style="flex:1;display:flex;align-items:center;"><span style="color:#16a34a;font-size:14px;font-weight:600;">✅ Check-in Finalized</span></div>';
    } else if (!data.actionReport || data.actionReport.status === 'REVISION_REQUESTED') {
        notesEl.disabled = true; outcomesEl.disabled = true;
        if (actionBar) {
            if (!data.actionReport) {
                actionBar.innerHTML = `
                    <div style="flex:1;display:flex;align-items:center;">
                        <span style="color:#64748b;font-size:14px;font-weight:600;">⚠️ No Action Report assigned yet</span>
                    </div>
                    <button class="btn-primary" onclick="triggerActionReport()" style="background:#4f46e5;">Assign Action Plan</button>
                `;
            } else {
                actionBar.innerHTML = `
                    <div style="flex:1;display:flex;align-items:center;">
                        <span style="color:#dc2626;font-size:14px;font-weight:600;">⏳ Waiting for Faculty to Resubmit</span>
                    </div>
                    <button class="btn-outline" disabled style="opacity:0.5">Request Revision</button>
                    <button class="btn-primary" disabled style="opacity:0.5">Finalize Check-in</button>
                `;
            }
        }
    } else {
        notesEl.disabled = false; outcomesEl.disabled = false;
        if (actionBar) actionBar.innerHTML = `<button class="btn-outline" onclick="requestRevision()">Request Revision</button><button class="btn-primary" onclick="finalizeCheckin()" style="background:#1e3a8a;">Finalize Check-in</button>`;
    }
}

async function triggerActionReport() {
    const cycle = document.getElementById('activeCycleBadge').innerText;
    try {
        await POST('/faculty-reports/action-reports/trigger', {
            facultyId: currentActiveFacultyId,
            courseId: currentActiveCourseId,
            cycleId: cycle
        });
        alert('✅ Action Plan has been assigned to this faculty member.');
        renderReviewCheckins();
    } catch (err) {
        alert('Failed to trigger: ' + (err.message || 'Server error'));
    }
}

async function processCheckinAction(newStatus) {
    if (!currentReportId) { alert('Cannot review. The faculty hasn\'t submitted an Action Report yet.'); return; }
    const notes = document.getElementById('hodNotes')?.value.trim();
    const outcomes = document.getElementById('hodOutcomes')?.value.trim();
    if (!notes || !outcomes) { alert('Please provide Meeting Notes and Agreed Outcomes.'); return; }

    try {
        await PATCH(`/faculty-reports/action-reports/${currentReportId}/checkin`, { status: newStatus, hodNotes: notes, hodOutcomes: outcomes });
        renderReviewCheckins();
    } catch (err) {
        alert('Failed to update check-in: ' + (err.message || 'Server error'));
    }
}

function finalizeCheckin() { processCheckinAction('FINALIZED'); }
function requestRevision() { processCheckinAction('REVISION_REQUESTED'); }
