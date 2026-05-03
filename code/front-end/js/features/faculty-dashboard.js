import { GET, getSession } from '../core/api.js';
import { getMyReflections } from './faculty-self-reflection.js';

async function getCourses() {
    try { return await GET('/courses'); }
    catch { return []; }
}

async function getCycleState() {
    try { return await GET('/feedback-cycles/state'); }
    catch { return { id: 'SETUP', phase: 'PREPARATION' }; }
}

async function getFeedbackResponses(cycleId) {
    try { return await GET(`/feedback-responses?cycleId=${cycleId}`); }
    catch { return []; }
}

export async function renderFacultyDashboard() {
    const user = getSession();
    if (!user) return;

    const allCourses = await getCourses();
    const myCourses = allCourses.filter(c => c.facultyId === user.id || (c.facultyIds && c.facultyIds.includes(user.id)));
    const cycleState = await getCycleState();
    const activeCycleId = cycleState?.id || 'FALLBACK_CYCLE';

    // Feedback from API — use courseId field
    const allSubmissions = await getFeedbackResponses(activeCycleId);

    // ── Load users for enrollment count ───────────────────────────────────────
    let allStudents = [];
    try { allStudents = await GET('/users'); allStudents = allStudents.filter(u => u.role === 'student'); } catch {}

    // ── Self-reflections from API (not localStorage) ──────────────────────────
    const reflections = await getMyReflections(activeCycleId);

    // ── Phase Banner ──────────────────────────────────────────────────────────
    const cycleBadge = document.getElementById('dashboardCycleName');
    if (cycleBadge) cycleBadge.innerText = cycleState?.cycleName || cycleState?.name || activeCycleId;

    const banner = document.getElementById('phaseBanner');
    if (banner) {
        banner.style.display = 'block';
        const phase = cycleState?.phase || 'PREPARATION';
        if (phase === 'PREPARATION') {
            banner.style.cssText = 'background:#f8fafc;border:1px solid #cbd5e1;color:#475569;padding:16px;border-radius:8px;margin-bottom:24px;font-size:14px;';
            banner.innerHTML = '<strong>⏳ Cycle Preparation:</strong> The next evaluation cycle is being configured by the Dean and HODs.';
        } else if (phase === 'STUDENT_FEEDBACK') {
            banner.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:16px;border-radius:8px;margin-bottom:24px;font-size:14px;';
            banner.innerHTML = '<strong>📝 Feedback Cycle Active:</strong> Students are currently submitting evaluations.';
        } else if (phase === 'FACULTY_REFLECTION') {
            banner.style.cssText = 'background:#fffbeb;border:1px solid #fde68a;color:#b45309;padding:16px;border-radius:8px;margin-bottom:24px;font-size:14px;';
            banner.innerHTML = '<strong>🔍 Self-Reflection Window:</strong> Please complete your Self-Reflections in the Reports tab.';
        } else if (phase === 'ACTION_REPORT') {
            banner.style.cssText = 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:16px;border-radius:8px;margin-bottom:24px;font-size:14px;';
            banner.innerHTML = '<strong>📋 Action Plan Check-In:</strong> Please submit your Action Reports and review them with your HOD.';
        } else {
            banner.style.cssText = 'background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:16px;border-radius:8px;margin-bottom:24px;font-size:14px;';
            banner.innerHTML = '<strong>✅ Cycle Archived:</strong> All evaluations and reports are finalized.';
        }
    }

    if (myCourses.length === 0) {
        const emptyState = document.getElementById('emptyState');
        if (emptyState) emptyState.style.display = 'block';
        _setStats(0, 0, 0, 0);
        return;
    }

    // ── Per-course aggregation ────────────────────────────────────────────────
    const table = document.getElementById('courseTable');
    if (table) table.innerHTML = '';

    let totalScoreAcc = 0;
    let coursesWithData = 0;
    let totalResponses = 0;
    let totalEnrolled = 0;
    let pendingReflectionCount = 0;
    let totalGap = 0;
    let gapCourses = 0;

    const phase = cycleState?.phase || 'PREPARATION';

    for (const course of myCourses) {
        // Fix: API uses `courseId`, not `course`
        const courseFeedback = allSubmissions.filter(f => f.courseId === course.id);
        const responses = courseFeedback.length;

        let courseAvgPct = 0;
        if (responses > 0) {
            let scoreSum = 0, scoreCount = 0;
            courseFeedback.forEach(f => {
                if (!Array.isArray(f.ratings)) return;
                f.ratings.forEach(entry => {
                    let s = Number(entry.score ?? 0);
                    if (s > 5) s = s / 20;
                    scoreSum += s;
                    scoreCount += 1;
                });
            });
            const avg = scoreCount > 0 ? (scoreSum / scoreCount) : 0;
            courseAvgPct = isNaN(avg) ? 0 : avg * 20;
            totalScoreAcc += courseAvgPct;
            coursesWithData++;
        }

        totalResponses += responses;

        // Enrollment count from user records or course.enrolled fallback
        const enrolled = allStudents.filter(s =>
            Array.isArray(s.enrolledCourses) && s.enrolledCourses.includes(course.id)
        ).length;
        totalEnrolled += enrolled > 0 ? enrolled : (course.enrolled || 0);

        // Reflection from API
        const hasReflection = reflections.find(r => r.courseId === course.id && r.facultyId === user.id);
        if (!hasReflection) {
            pendingReflectionCount++;
        } else {
            let selfSum = 0, selfCount = 0;
            Object.values(hasReflection.expectedRatings || {}).forEach(v => {
                if (typeof v === 'number') { selfSum += v; selfCount++; }
            });
            const selfAvgPct = selfCount > 0 ? (selfSum / selfCount) * 20 : 0;
            totalGap += Math.abs(selfAvgPct - courseAvgPct);
            gapCourses++;
        }

        // Display avg calculation
        // UNLOCK logic: Enforce self-reflection before showing current cycle scores.
        const isLocked = ['PREPARATION', 'STUDENT_FEEDBACK'].includes(phase);
        let displayAvg;
        if (responses === 0) {
            displayAvg = `<span style="color:#94a3b8">N/A</span>`;
        } else if (isLocked) {
            const lockMsg = 'Scores locked until student feedback deadline';
            displayAvg = `<span title="${lockMsg}" style="color:#94a3b8;font-size:13px">Locked 🔒</span>`;
        } else if (!hasReflection) {
            const lockMsg = 'Submit self-reflection to unlock feedback scores';
            displayAvg = `<span title="${lockMsg}" style="color:#f59e0b;font-size:13px">Reflection Needed 🔒</span>`;
        } else {
            displayAvg = `${courseAvgPct.toFixed(0)}%`;
        }

        if (table) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${course.id}</td>
                <td>${course.name}</td>
                <td>${course.enrolled || enrolled || 0}</td>
                <td><span class="badge ${responses > 0 ? 'success' : 'neutral'}">${responses > 0 ? 'Active' : 'Waiting'}</span></td>
                <td style="font-weight:600">${displayAvg}</td>
            `;
            table.appendChild(tr);
        }
    }

    // ── Stat cards ────────────────────────────────────────────────────────────
    const finalAvg = coursesWithData > 0 ? (totalScoreAcc / coursesWithData).toFixed(0) : 0;
    const finalGap = gapCourses > 0 ? (totalGap / gapCourses).toFixed(0) : 0;
    const finalRate = totalEnrolled > 0 ? Math.min(Math.round((totalResponses / totalEnrolled) * 100), 100) : 0;

    _setStats(finalAvg, finalRate, pendingReflectionCount, finalGap, phase);

    // ── Export button ─────────────────────────────────────────────────────────
    const exportBtn = document.getElementById('exportTrendsBtn');
    if (exportBtn) {
        exportBtn.style.display = 'block';
        exportBtn.onclick = async () => {
            const { downloadCSV } = await import('./admin-utils.js');
            const myIds = new Set(myCourses.map(c => c.id));
            const myFeedback = allSubmissions.filter(f => myIds.has(f.courseId));
            const rows = ['Cycle ID,Course ID,User ID,Avg Score'];
            myFeedback.forEach(f => {
                let sum = 0, count = 0;
                if (Array.isArray(f.ratings)) {
                    f.ratings.forEach(r => {
                        const score = Number(r.score);
                        if (!isNaN(score)) { sum += score; count++; }
                    });
                }
                rows.push(`${f.cycleId},${f.courseId},${f.studentId || f.userId},${count ? (sum / count).toFixed(2) : 0}`);
            });
            downloadCSV(`Faculty_Trends_${user.id}_${activeCycleId}.csv`, rows.join('\n'));
        };
    }
}

function _setStats(avgScore, responseRate, pendingReflections, gapScore, phase = '') {
    const avgEl = document.getElementById('avgScore');
    const rateEl = document.getElementById('responseRate');
    const pendEl = document.getElementById('pendingReflection');
    const gapEl = document.getElementById('gapScore');

    if (avgEl) {
        if (['PREPARATION', 'STUDENT_FEEDBACK'].includes(phase)) {
            avgEl.innerHTML = `<span style="font-size:18px;color:#94a3b8">Locked 🔒</span>`;
        } else {
            avgEl.innerText = +avgScore > 0 ? `${avgScore}%` : 'N/A';
        }
    }
    if (rateEl) rateEl.innerText = `${responseRate}%`;
    if (pendEl) { pendEl.innerText = pendingReflections; if (pendingReflections > 0) pendEl.style.color = '#d97706'; }
    if (gapEl) {
        const gapLocked = (pendingReflections > 0 || ['PREPARATION', 'STUDENT_FEEDBACK'].includes(phase));
        if (gapLocked) { gapEl.innerHTML = `<span style="font-size:18px;color:#94a3b8">Locked 🔒</span>`; }
        else { gapEl.innerText = +gapScore > 0 ? `${gapScore}%` : 'N/A'; }
    }
}
