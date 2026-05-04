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
    try { allSubmissions = await GET(`/feedback-responses`); }
    catch { allSubmissions = []; }

    let allActionReports = [];
    try { allActionReports = await GET('/faculty-reports/action-reports'); }
    catch { allActionReports = []; }

    const currentSubmissions = allSubmissions.filter(f => f.cycleId === activeCycleId);
    const actionReports = allActionReports.filter(a => a.cycleId === activeCycleId);

    const myFaculty = allUsers.filter(u => u.role === 'faculty' && u.department === user.department);
    const facultyIds = myFaculty.map(f => f.id);

    // Department-wide stats (Satisfaction across ALL cycles)
    const historicalDeptFeedback = allSubmissions.filter(f => {
        const course = allCourses.find(c => c.id === f.courseId);
        return course && (facultyIds.includes(course.facultyId) || (course.facultyIds && course.facultyIds.some(fid => facultyIds.includes(fid))));
    });
    
    let totalDeptScore = 0, deptMetricCount = 0;
    historicalDeptFeedback.forEach(f => {
        if (Array.isArray(f.ratings)) f.ratings.forEach(val => {
            const score = Number(val.score);
            if (!isNaN(score)) { totalDeptScore += score; deptMetricCount++; }
        });
    });

    const deptAverage = deptMetricCount > 0 ? (totalDeptScore / deptMetricCount) : 0;
    const deptSatisfaction = deptAverage > 0 ? (deptAverage / 5) * 100 : 0;

    const deptCourses = allCourses.filter(c => facultyIds.includes(c.facultyId) || (c.facultyIds && c.facultyIds.some(fid => facultyIds.includes(fid))));
    const currentDeptFeedback = currentSubmissions.filter(f => deptCourses.some(c => c.id === f.courseId));
    
    // Response rate based on students in department's courses (using unique submitters for those courses)
    const uniqueDeptSubmitters = new Set(currentDeptFeedback.map(f => f.studentId || f.userId)).size;
    const estimatedStudents = (deptCourses.length * 40) || 1; 
    const responseRate = (uniqueDeptSubmitters / estimatedStudents) * 100;

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
        const fCourses = deptCourses.filter(c => c.facultyId === faculty.id || (c.facultyIds && c.facultyIds.includes(faculty.id)));
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
            const fCourses = deptCourses.filter(c => c.facultyId === faculty.id || (c.facultyIds && c.facultyIds.includes(faculty.id)));
            let totalScore = 0, metricCount = 0;
            const facultyFeedback = allSubmissions.filter(f => f.facultyId === faculty.id);
            
            facultyFeedback.forEach(f => {
                if (Array.isArray(f.ratings)) f.ratings.forEach(val => {
                    const score = Number(val.score);
                    if (!isNaN(score)) { totalScore += score; metricCount++; }
                });
            });

            const finalScore = metricCount > 0 ? (totalScore / metricCount) * 20 : 0;
            let statusBadge = `<span class="badge success">On Track</span>`;
            if (finalScore < 60 && metricCount > 0) {
                statusBadge = `<span class="badge danger">Performance Alert</span>`;
            } else if (metricCount === 0) {
                statusBadge = `<span class="badge neutral">No Data</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding-left:24px;padding-top:16px;padding-bottom:16px;">
                    <strong style="display:block;color:#0f172a;font-size:14px;">${faculty.name}</strong>
                </td>
                <td style="color:#64748b;">${fCourses.length} Courses</td>
                <td><strong>${finalScore.toFixed(1)}/100</strong></td>
                <td>${statusBadge}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // EXPORT LOGIC
    const btn = document.getElementById('btnExportCSV');
    if (btn) {
        btn.onclick = async () => {
            const { exportToCSV } = await import('./admin-utils.js');
            const exportData = [];
            const myDeptFeedback = allSubmissions.filter(f => {
                const c = allCourses.find(course => course.id === f.courseId);
                return c && c.department === user.department;
            });
            myDeptFeedback.forEach(f => {
                let sum = 0, count = 0;
                if(Array.isArray(f.ratings)) { 
                    f.ratings.forEach(rating => {
                        const score = Number(rating.score);
                        if (!isNaN(score)) {
                            exportData.push({
                                CycleID: f.cycleId,
                                CourseID: f.courseId,
                                FacultyID: allCourses.find(c => c.id === f.courseId)?.facultyId || '',
                                Parameter: rating.paramName || rating.paramId,
                                Rating: score,
                                Comments: rating.comment || ""
                            });
                        }
                    });
                }
            });
            exportToCSV(`HOD_Trends_${user.department.replace(/\s+/g, '_')}.csv`, exportData);
        };
    }
}
