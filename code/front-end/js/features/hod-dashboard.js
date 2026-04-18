import { GET } from '../core/api.js';
import { getSession } from '../core/session.js';

export async function renderHodDashboard() {
    const user = getSession();
    if (!user) return;

    let allUsers = [], allCourses = [], cycleState = { id: 'SETUP', phase: 'PREPARATION' };
    try {
        [allUsers, allCourses, cycleState] = await Promise.all([
            GET('/users'),
            GET('/courses'),
            GET('/feedback-cycles/state').catch(() => ({ id: 'SETUP', phase: 'PREPARATION' })),
        ]);
    } catch (e) { console.error('HOD Dashboard: failed to load data', e); }

    let activeCycleId = cycleState.id;

    let allSubmissions = [];
    try { const res = await GET(`/feedback-responses?cycleId=${activeCycleId}`); allSubmissions = res; }
    catch { allSubmissions = []; }

    const allActionReports = JSON.parse(localStorage.getItem('actionReports') || '[]');

    const submissions = allSubmissions.filter(f => f.cycleId === activeCycleId);
    const actionReports = allActionReports.filter(a => a.cycleId === activeCycleId);

    const myFaculty = allUsers.filter(u => u.role === 'faculty' && u.department === user.department);
    const facultyIds = myFaculty.map(f => f.id);

    // Department-wide stats
    const deptFeedback = submissions.filter(f => {
        const course = allCourses.find(c => c.id === f.courseId);
        return course && facultyIds.includes(course.facultyId);
    });
    let totalDeptScore = 0, deptMetricCount = 0;
    deptFeedback.forEach(f => {
        if (f.ratings) Object.values(f.ratings).forEach(val => {
            if (typeof val === 'number') { totalDeptScore += val; deptMetricCount++; }
        });
    });

    const deptAverage = deptMetricCount > 0 ? (totalDeptScore / deptMetricCount) : 0;
    const deptSatisfaction = deptAverage > 0 ? (deptAverage / 5) * 100 : 0;

    const deptCourses = allCourses.filter(c => facultyIds.includes(c.facultyId));
    const estimatedStudents = deptCourses.length * 40;
    const responseRate = estimatedStudents > 0 ? (deptFeedback.length / estimatedStudents) * 100 : 0;

    const deptSatEl = document.getElementById('deptSatisfaction');
    if (deptSatEl) deptSatEl.innerText = `${deptSatisfaction.toFixed(1)}%`;
    const satBar = document.getElementById('satProgressBar');
    if (satBar) satBar.style.width = `${deptSatisfaction}%`;
    const respRateEl = document.getElementById('deptResponseRate');
    if (respRateEl) respRateEl.innerText = `${responseRate.toFixed(1)}%`;
    const respBar = document.getElementById('respProgressBar');
    if (respBar) respBar.style.width = `${Math.min(responseRate, 100)}%`;

    // Pending check-ins
    let pendingCheckins = 0;
    myFaculty.forEach(faculty => {
        const fCourses = deptCourses.filter(c => c.facultyId === faculty.id);
        fCourses.forEach(course => {
            const actionReport = actionReports.find(a => a.facultyId === faculty.id && a.courseId === course.id);
            if (actionReport && actionReport.status === 'SUBMITTED') pendingCheckins++;
        });
    });

    const pendingEl = document.getElementById('pendingCheckins');
    if (pendingEl) pendingEl.innerText = pendingCheckins;

    // Faculty quick table
    const tableBody = document.getElementById('facultyTableBody');
    if (tableBody) {
        tableBody.innerHTML = '';
        myFaculty.slice(0, 5).forEach(faculty => {
            const fCourses = deptCourses.filter(c => c.facultyId === faculty.id);
            let facultyAvgScore = 0, fCount = 0;
            const facultyFeedback = deptFeedback.filter(f => {
                const c = allCourses.find(c => c.id === f.courseId);
                return c && c.facultyId === faculty.id;
            });
            facultyFeedback.forEach(f => {
                if (f.ratings) Object.values(f.ratings).forEach(val => {
                    if (typeof val === 'number') { facultyAvgScore += val; fCount++; }
                });
            });
            const finalAvg = fCount > 0 ? (facultyAvgScore / fCount).toFixed(1) : 'N/A';
            let statusBadge = `<span class="badge success">On Track</span>`;
            if (finalAvg !== 'N/A' && parseFloat(finalAvg) < 3.5) {
                statusBadge = `<span class="badge danger">Requires Review</span>`;
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding-left:24px;padding-top:16px;padding-bottom:16px;">
                    <strong style="display:block;color:#0f172a;font-size:14px;">${faculty.name}</strong>
                </td>
                <td style="color:#64748b;">${fCourses.length} Courses</td>
                <td><strong>${finalAvg}/5.0</strong></td>
                <td>${statusBadge}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
}
