/**
 * faculty-action-report.js
 * Handles all action report API interactions.
 */
import { GET, POST, PATCH, getSession } from '../core/api.js';
import { showToast } from './admin-utils.js';

// ─── API Helpers ──────────────────────────────────────────────────────────────

export async function getMyActionReports(cycleId = null) {
    const user = getSession();
    if (!user) return [];
    try {
        const q = cycleId ? `?facultyId=${user.id}&cycleId=${cycleId}` : `?facultyId=${user.id}`;
        return await GET(`/faculty-reports/action-reports${q}`);
    } catch {
        return [];
    }
}

export async function getActionReportForCourse(courseId, cycleId) {
    const user = getSession();
    if (!user) return null;
    try {
        const list = await GET(`/faculty-reports/action-reports?facultyId=${user.id}&courseId=${courseId}&cycleId=${cycleId}`);
        return list?.[0] || null;
    } catch {
        return null;
    }
}

export async function submitActionReport(payload) {
    // payload: { facultyId, courseId, cycleId, rootCause, plannedStrategies, timeline }
    return await POST('/faculty-reports/action-reports', payload);
}

export async function reviewCheckin(reportId, payload) {
    // payload: { status, hodNotes?, hodOutcomes? }
    return await PATCH(`/faculty-reports/action-reports/${reportId}/checkin`, payload);
}

// ─── Page Init ────────────────────────────────────────────────────────────────

export async function initActionReport() {
    const user = getSession();
    if (!user) return;

    let activeCourse = new URLSearchParams(window.location.search).get('courseId');
    const noCourseState = document.getElementById('noCourseState');
    const form = document.getElementById('actionReportForm');

    // Auto-detect course and build selector
    try {
        const allCourses = await GET('/courses');
        const myCourses = allCourses.filter(c => c.facultyId === user.id || (c.facultyIds && c.facultyIds.includes(user.id)));

        if (myCourses.length === 0) {
            if (noCourseState) noCourseState.style.display = 'block';
            if (form) form.style.display = 'none';
            return;
        }

        if (!activeCourse) {
            window.location.href = `action-report.html?courseId=${encodeURIComponent(myCourses[0].id)}`;
            return;
        }

        const selectorEl = document.getElementById('courseSelector');
        if (selectorEl) {
            selectorEl.innerHTML = myCourses.map(c =>
                `<button class="course-tab ${activeCourse === c.id ? 'active' : ''}" onclick="window.location.href='action-report.html?courseId=${c.id}'">${c.id}</button>`
            ).join('');
        }
    } catch { }

    if (!activeCourse) {
        if (noCourseState) noCourseState.style.display = 'block';
        if (form) form.style.display = 'none';
        return;
    }

    const label = document.getElementById('courseIdLabel');
    if (label) label.textContent = activeCourse;

    // Fetch cycle state
    let cycleState;
    try { cycleState = await GET('/feedback-cycles/state'); }
    catch { cycleState = { id: 'SETUP', phase: 'PREPARATION' }; }
    const cycleId = cycleState?.id;

    if (!cycleId || cycleId === 'SETUP' || (cycleState.phase !== 'FACULTY_REFLECTION' && cycleState.phase !== 'ACTION_REPORT')) {
        if (noCourseState) { 
            noCourseState.style.display = 'block'; 
            noCourseState.querySelector('h2').textContent = 'Phase Locked'; 
            noCourseState.querySelector('p.subtitle').textContent = 'Action reports are only unlocked during the faculty reflection phase of the active cycle.'; 
        }
        if (form) form.style.display = 'none';
        return;
    }

    // Check existing action report for this course + cycle
    let existing = null;
    try { existing = await getActionReportForCourse(activeCourse, cycleId); } catch { }

    // Check if Self Reflection is submitted for current cycle
    let hasReflection = false;
    try {
        const { getReflectionForCourse } = await import('./faculty-self-reflection.js');
        const ref = await getReflectionForCourse(activeCourse, cycleId);
        if (ref) hasReflection = true;
    } catch { }

    if (!hasReflection) {
        if (noCourseState) { 
            noCourseState.style.display = 'block'; 
            noCourseState.querySelector('h2').textContent = 'Self-Reflection Required'; 
            noCourseState.querySelector('p.subtitle').textContent = 'You must submit your Self-Reflection for this cycle before you can create an Action Report.'; 
        }
        if (form) form.style.display = 'none';
        return;
    }

    // Populate banners
    const revBanner = document.getElementById('revisionBanner');
    const finBanner = document.getElementById('finalizedBanner');
    if (revBanner) revBanner.style.display = 'none';
    if (finBanner) finBanner.style.display = 'none';

    if (existing?.status === 'REVISION_REQUESTED') {
        if (revBanner) {
            document.getElementById('revHodNotes').textContent = existing.hodNotes || '—';
            document.getElementById('revHodOutcomes').textContent = existing.hodOutcomes || '—';
            revBanner.style.display = 'block';
        }
    } else if (existing?.status === 'FINALIZED') {
        if (finBanner) {
            document.getElementById('finHodNotes').textContent = existing.hodNotes || '—';
            document.getElementById('finHodOutcomes').textContent = existing.hodOutcomes || '—';
            finBanner.style.display = 'block';
        }
        // Lock the form
        if (form) {
            Array.from(form.querySelectorAll('textarea, input, button')).forEach(el => el.disabled = true);
        }
    }

    // Pre-fill form if we have an existing report
    if (existing) {
        const rootCauseEl = document.getElementById('rootCause');
        const strategiesEl = document.getElementById('plannedStrategies');
        const timelineEl = document.getElementById('timeline');
        if (rootCauseEl) rootCauseEl.value = existing.rootCause || '';
        if (strategiesEl) strategiesEl.value = existing.plannedStrategies || '';
        if (timelineEl) timelineEl.value = existing.timeline || '';
    }

    // Bind form submit
    if (form && existing?.status !== 'FINALIZED') {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

            const rootCause = document.getElementById('rootCause')?.value.trim() || '';
            const plannedStrategies = document.getElementById('plannedStrategies')?.value.trim() || '';
            const timeline = document.getElementById('timeline')?.value.trim() || '';

            if (!rootCause || !plannedStrategies || !timeline) {
                alert('Please fill in all sections.');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Action Report'; }
                return;
            }

            try {
                await submitActionReport({ facultyId: user.id, courseId: activeCourse, cycleId, rootCause, plannedStrategies, timeline });
                window.location.href = 'action-report-success.html';
            } catch (err) {
                alert('Failed to submit: ' + (err.message || 'Server error'));
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Action Report'; }
            }
        };
    }
}

// ─── HOD Review helper (used by HOD pages) ───────────────────────────────────

export async function initHodReviewCheckin(reportId) {
    return async (status, hodNotes, hodOutcomes) => {
        try {
            await reviewCheckin(reportId, { status, hodNotes, hodOutcomes });
            showToast(`Report marked as ${status}`, 'success');
            return true;
        } catch (err) {
            showToast(err.message || 'Failed to update report', 'error');
            return false;
        }
    };
}
