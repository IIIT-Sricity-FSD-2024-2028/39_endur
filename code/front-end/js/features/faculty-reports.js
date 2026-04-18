/**
 * faculty-reports.js
 * Report page feature — all data from API, zero localStorage reads.
 */
import { GET, getSession } from '../core/api.js';
import { getMyReflections } from './faculty-self-reflection.js';
import { getMyActionReports } from './faculty-action-report.js';

export async function renderFacultyReports() {
    const user = getSession();
    if (!user) return;

    // ── 1. Fetch all needed data from API ──────────────────────────────────────
    let allCourses = [];
    try { allCourses = await GET('/courses'); } catch {}
    const myCourses = allCourses.filter(c => c.facultyId === user.id);

    if (myCourses.length === 0) {
        _showNoCourses();
        return;
    }

    let cycleState;
    try { cycleState = await GET('/feedback-cycles/state'); }
    catch { cycleState = { id: 'SETUP', phase: 'PREPARATION' }; }
    const activeCycleId = cycleState?.id || 'SETUP';
    const currentPhase = cycleState?.phase || 'PREPARATION';

    let allFeedback = [];
    try { allFeedback = await GET(`/feedback-responses?cycleId=${activeCycleId}`); } catch {}

    // Fetch reflections and action reports from API (not localStorage)
    const reflections = await getMyReflections(activeCycleId);
    const actionReports = await getMyActionReports(activeCycleId);

    // ── 2. Render revisions alert ─────────────────────────────────────────────
    const alertBox = document.getElementById('globalAlertContainer');
    if (alertBox) {
        const needsRevision = actionReports.filter(a => a.status === 'REVISION_REQUESTED');
        if (needsRevision.length > 0) {
            const ids = needsRevision.map(a => a.courseId).join(', ');
            alertBox.innerHTML = `
                <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:8px;margin-bottom:24px;display:flex;align-items:center;gap:16px;">
                    <div style="font-size:24px">⚠️</div>
                    <div>
                        <h3 style="color:#991b1b;margin-bottom:4px;font-size:15px">Action Required: HOD Revision Requested</h3>
                        <p style="color:#b91c1c;font-size:14px;margin:0">Please revise your Action Reports for: <strong>${ids}</strong></p>
                    </div>
                    <a href="action-report.html" class="btn-danger" style="flex-shrink:0;margin-left:auto">Revise Now →</a>
                </div>`;
        } else {
            alertBox.innerHTML = '';
        }
    }

    // ── 3. Build course tab selector ─────────────────────────────────────────
    const selector = document.getElementById('courseSelector');
    const reportContent = document.getElementById('reportContent');
    const anonNote = document.getElementById('anonNote');
    const noCoursesState = document.getElementById('noCoursesState');

    if (noCoursesState) noCoursesState.style.display = 'none';
    if (reportContent) reportContent.style.display = 'block';
    if (anonNote) anonNote.style.display = 'block';

    if (selector) {
        selector.innerHTML = '';
        myCourses.forEach((course, i) => {
            const btn = document.createElement('button');
            btn.className = 'course-tab' + (i === 0 ? ' active' : '');
            btn.dataset.id = course.id;
            btn.textContent = `${course.id} — ${course.name}`;
            btn.onclick = () => {
                document.querySelectorAll('.course-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                localStorage.setItem('activeFacultyCourse', course.id);
                renderCourse(course, allFeedback, reflections, actionReports, activeCycleId, currentPhase, user);
            };
            selector.appendChild(btn);
        });
    }

    // Select first course
    localStorage.setItem('activeFacultyCourse', myCourses[0].id);
    renderCourse(myCourses[0], allFeedback, reflections, actionReports, activeCycleId, currentPhase, user);

    // ── 4. Deadline display ───────────────────────────────────────────────────
    const deadlineEl = document.getElementById('actionDeadline');
    if (deadlineEl) {
        if (cycleState?.actionDeadline) {
            deadlineEl.innerText = _fmt(cycleState.actionDeadline);
        } else if (cycleState?.reflectionDeadline) {
            const fb = new Date(cycleState.reflectionDeadline);
            fb.setHours(fb.getHours() + 72);
            deadlineEl.innerText = _fmt(fb.toISOString());
        } else {
            deadlineEl.innerText = 'TBD';
        }
    }
}

function renderCourse(course, allFeedback, reflections, actionReports, activeCycleId, currentPhase, user) {
    // Filter feedback for THIS course and cycle — use courseId (API field)
    const courseFeedback = allFeedback.filter(f => f.courseId === course.id);
    const hasReflection = reflections.find(r => r.courseId === course.id && r.facultyId === user.id);
    const hasActionReport = actionReports.find(a => a.courseId === course.id && a.facultyId === user.id);

    // ── Phase tag ─────────────────────────────────────────────────────────────
    const phaseTag = document.getElementById('phaseTag');
    const phaseLabels = {
        PREPARATION: { label: 'Preparation', cls: 'phase-locked' },
        STUDENT_FEEDBACK: { label: 'Student Feedback Open', cls: 'phase-active' },
        FACULTY_REFLECTION: { label: 'Reflection Phase', cls: 'phase-open' },
        ACTION_REPORT: { label: 'Action Report Phase', cls: 'phase-active' },
        COMPLETED: { label: 'Cycle Completed', cls: 'phase-locked' },
    };
    const pInfo = phaseLabels[currentPhase] || { label: currentPhase, cls: 'phase-locked' };
    if (phaseTag) { phaseTag.textContent = pInfo.label; phaseTag.className = `phase-badge ${pInfo.cls}`; }

    // ── Aggregate ratings (API returns ratings as object keyed by param ID) ───
    const ratingTotals = {};
    const ratingCounts = {};
    courseFeedback.forEach(f => {
        if (!f.ratings) return;
        Object.entries(f.ratings).forEach(([paramId, score]) => {
            if (typeof score !== 'number') return;
            ratingTotals[paramId] = (ratingTotals[paramId] || 0) + score;
            ratingCounts[paramId] = (ratingCounts[paramId] || 0) + 1;
        });
    });

    // Overall average across all params
    const allParamAvgs = Object.keys(ratingTotals).map(k => ratingTotals[k] / ratingCounts[k]);
    const overall = allParamAvgs.length > 0
        ? (allParamAvgs.reduce((a, b) => a + b, 0) / allParamAvgs.length).toFixed(1)
        : null;

    // ── Score display ─────────────────────────────────────────────────────────
    const scoreEl = document.getElementById('scoreDisplay');
    const respEl = document.getElementById('responseCount');
    if (respEl) respEl.textContent = courseFeedback.length;

    const canSeeRatings = courseFeedback.length > 0 &&
        (hasReflection || currentPhase === 'ACTION_REPORT' || currentPhase === 'COMPLETED');

    if (scoreEl) {
        if (courseFeedback.length === 0) {
            scoreEl.innerHTML = `<span class="na">No responses yet</span>`;
        } else if (!canSeeRatings) {
            scoreEl.innerHTML = `<span class="na">Submit self-reflection to reveal</span>`;
        } else {
            scoreEl.innerHTML = `<span class="big">${overall}</span><span class="of">/ 5</span>`;
        }
    }

    // ── Per-param metric rows ─────────────────────────────────────────────────
    const metricsEl = document.getElementById('metricRows');
    if (metricsEl) {
        if (!canSeeRatings) {
            const lockCount = Object.keys(ratingTotals).length;
            metricsEl.innerHTML = `<div class="metric-row"><span class="label">All Parameters</span><span class="value locked">🔒 Submit reflection to unlock</span></div>`;
        } else {
            metricsEl.innerHTML = Object.keys(ratingTotals).map(paramId => {
                const avg = (ratingTotals[paramId] / ratingCounts[paramId]).toFixed(1);
                return `<div class="metric-row"><span class="label">${paramId}</span><span class="value">${avg} / 5</span></div>`;
            }).join('') || `<div class="metric-row"><span class="label">No metrics</span><span class="value locked">—</span></div>`;
        }
    }

    // ── Primary action button ─────────────────────────────────────────────────
    const btn = document.getElementById('primaryActionBtn');
    const actionTitle = document.getElementById('actionTitle');
    const actionDesc = document.getElementById('actionDesc');
    if (!btn) return;

    btn.disabled = false;
    btn.onclick = null;
    btn.className = 'btn-primary action-btn';

    if (hasReflection) {
        if (actionTitle) actionTitle.textContent = 'View Gap Analysis';
        if (actionDesc) actionDesc.textContent = 'Reflection submitted. Review your performance gap vs student expectations.';
        btn.textContent = 'Open Gap Analysis →';
        btn.onclick = () => window.location.href = 'gap-analysis.html';
    } else if (currentPhase === 'PREPARATION' || currentPhase === 'STUDENT_FEEDBACK') {
        if (actionTitle) actionTitle.textContent = 'Self-Reflection';
        if (actionDesc) actionDesc.textContent = 'Locked until the student feedback phase is complete.';
        btn.textContent = 'Not Available Yet';
        btn.className = 'btn-outline action-btn';
        btn.disabled = true;
    } else if (currentPhase === 'FACULTY_REFLECTION') {
        if (actionTitle) actionTitle.textContent = 'Submit Self-Reflection';
        if (actionDesc) actionDesc.textContent = 'Rate your own performance before reviewing student results.';
        btn.textContent = 'Start Self-Reflection →';
        btn.onclick = () => { localStorage.setItem('activeFacultyCourse', course.id); window.location.href = 'self-reflection.html'; };
    } else if (currentPhase === 'ACTION_REPORT' || currentPhase === 'COMPLETED') {
        if (hasActionReport?.status === 'FINALIZED') {
            if (actionTitle) actionTitle.textContent = 'Action Report (Finalized)';
            if (actionDesc) actionDesc.textContent = '✅ HOD has reviewed and finalized this report.';
            btn.textContent = 'View Report →';
            btn.className = 'btn-outline action-btn';
            btn.onclick = () => window.location.href = 'action-report.html';
        } else if (hasActionReport?.status === 'SUBMITTED') {
            if (actionTitle) actionTitle.textContent = 'Action Report (Pending HOD)';
            if (actionDesc) actionDesc.textContent = '⏳ Submitted — awaiting HOD review.';
            btn.textContent = 'View Report →';
            btn.className = 'btn-outline action-btn';
            btn.onclick = () => window.location.href = 'action-report.html';
        } else if (hasActionReport?.status === 'REVISION_REQUESTED') {
            if (actionTitle) actionTitle.textContent = 'Action Report (Revision Needed)';
            if (actionDesc) actionDesc.textContent = '⚠️ HOD has requested a revision.';
            btn.textContent = 'Revise Report →';
            btn.className = 'btn-danger action-btn';
            btn.onclick = () => window.location.href = 'action-report.html';
        } else {
            if (actionTitle) actionTitle.textContent = 'Submit Action Report';
            if (actionDesc) actionDesc.textContent = 'Outline your improvement plan based on the gap analysis.';
            btn.textContent = 'Start Action Report →';
            btn.onclick = () => { localStorage.setItem('activeFacultyCourse', course.id); window.location.href = 'action-report.html'; };
        }
    } else {
        if (actionTitle) actionTitle.textContent = 'No Actions Required';
        if (actionDesc) actionDesc.textContent = 'Monitor this page as the cycle progresses.';
        btn.textContent = 'Waiting…';
        btn.disabled = true;
        btn.className = 'btn-outline action-btn';
    }
}

function _showNoCourses() {
    const noCoursesState = document.getElementById('noCoursesState');
    const reportContent = document.getElementById('reportContent');
    if (noCoursesState) noCoursesState.style.display = 'block';
    if (reportContent) reportContent.style.display = 'none';
}

function _fmt(iso) {
    return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}
