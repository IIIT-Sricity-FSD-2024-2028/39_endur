import { GET, POST } from '../core/api.js';
import { getSession } from '../core/session.js';

export function initActionReport() {
    const user = getSession();
    if (!user) return;

    const activeCourseId = localStorage.getItem('activeFacultyCourse');
    if (!activeCourseId) {
        const noState = document.getElementById('noCourseState');
        const form = document.getElementById('actionReportForm');
        if (noState) noState.style.display = 'block';
        if (form) form.style.display = 'none';
        return;
    }

    document.getElementById('courseIdLabel').innerText = activeCourseId;
    _loadActionReport(user, activeCourseId);
}

async function _loadActionReport(user, activeCourseId) {
    let activeCycleId = null;
    let existingReport = null;
    let hasReflection = false;

    try {
        const cycles = await GET('/feedback-cycles');
        const active = cycles.find(c => c.status === 'active');
        activeCycleId = active?.cycleId || null;
    } catch {}

    if (!activeCycleId) {
        _showBlocked('No active feedback cycle found.');
        return;
    }

    try {
        const reports = await GET(`/faculty-reports/action-reports?facultyId=${user.id}&courseId=${activeCourseId}&cycleId=${activeCycleId}`);
        existingReport = reports[0] || null;
    } catch {}

    try {
        const reflections = await GET(`/faculty-reports/self-reflections?facultyId=${user.id}&courseId=${activeCourseId}&cycleId=${activeCycleId}`);
        hasReflection = reflections.length > 0;
    } catch {}

    if (!existingReport && !hasReflection) {
        _showBlocked('Access Denied: Complete your Self-Reflection before creating an Action Report.');
        return;
    }

    const form = document.getElementById('actionReportForm');
    const rootCauseInput = document.getElementById('rootCause');
    const strategiesInput = document.getElementById('plannedStrategies');
    const timelineInput = document.getElementById('timeline');
    const submitBtn = form?.querySelector("button[type='submit']");

    if (existingReport) {
        if (rootCauseInput) rootCauseInput.value = existingReport.rootCause || '';
        if (strategiesInput) strategiesInput.value = existingReport.plannedStrategies || '';
        if (timelineInput) timelineInput.value = existingReport.timeline || '';

        if (existingReport.status === 'REVISION_REQUESTED') {
            const b = document.getElementById('revisionBanner');
            if (b) { b.style.display = 'block'; document.getElementById('revHodNotes').innerText = existingReport.hodNotes || ''; document.getElementById('revHodOutcomes').innerText = existingReport.hodOutcomes || ''; }
            if (submitBtn) submitBtn.innerText = 'Resubmit Action Report';
        } else if (existingReport.status === 'FINALIZED') {
            const b = document.getElementById('finalizedBanner');
            if (b) { b.style.display = 'block'; document.getElementById('finHodNotes').innerText = existingReport.hodNotes || ''; document.getElementById('finHodOutcomes').innerText = existingReport.hodOutcomes || ''; }
            if (rootCauseInput) rootCauseInput.disabled = true;
            if (strategiesInput) strategiesInput.disabled = true;
            if (timelineInput) timelineInput.disabled = true;
            if (submitBtn) submitBtn.style.display = 'none';
        } else {
            if (rootCauseInput) rootCauseInput.disabled = true;
            if (strategiesInput) strategiesInput.disabled = true;
            if (timelineInput) timelineInput.disabled = true;
            if (submitBtn) { submitBtn.innerText = 'Submitted - Pending HOD Review'; submitBtn.disabled = true; submitBtn.className = 'btn-outline'; }
        }
    }

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            try {
                await POST('/faculty-reports/action-reports', {
                    facultyId: user.id,
                    courseId: activeCourseId,
                    cycleId: activeCycleId,
                    rootCause: rootCauseInput.value,
                    plannedStrategies: strategiesInput.value,
                    timeline: timelineInput.value,
                });
                window.location.href = 'action-report-success.html';
            } catch (err) {
                alert('Failed to submit: ' + (err.message || 'Server error'));
            }
        };
    }
}

function _showBlocked(msg) {
    alert(msg);
    window.location.href = 'reports.html';
}
