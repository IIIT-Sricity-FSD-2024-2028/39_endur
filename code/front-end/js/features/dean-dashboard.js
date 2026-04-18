import { GET } from '../core/api.js';
import { getSession } from '../core/session.js';

export async function renderDeanDashboard() {
    const user = getSession();
    if (!user) return;

    let allUsers = [], allCourses = [], cycles = [], cycleState = { id: 'SETUP' };
    try {
        [allUsers, allCourses, cycles, cycleState] = await Promise.all([
            GET('/users'),
            GET('/courses'),
            GET('/feedback-cycles'),
            GET('/feedback-cycles/state').catch(() => ({ id: 'SETUP' })),
        ]);
    } catch (e) { console.error('Dean Dashboard: failed to load data', e); }

    let allSubmissions = [];
    try { allSubmissions = await GET('/feedback-responses'); } catch {}

    const configStatuses = await GET('/evaluation-parameters/status').catch(() => ({}));
    const allStudents = allUsers.filter(u => u.role === 'student');
    const facultyList = allUsers.filter(u => u.role === 'faculty');

    // 2. Identify departments
    const departments = {};
    facultyList.forEach(f => {
        if (!departments[f.department]) departments[f.department] = { totalScore: 0, metricCount: 0, courses: [] };
    });

    allCourses.forEach(c => {
        const faculty = facultyList.find(f => f.id === c.facultyId);
        if (faculty && departments[faculty.department]) departments[faculty.department].courses.push(c.id);
    });

    // 3. Process feedback
    let instTotalScore = 0, instMetricCount = 0;
    const courseAverages = {};

    allSubmissions.forEach(f => {
        const course = allCourses.find(c => c.id === f.courseId);
        const faculty = course ? facultyList.find(u => u.id === course.facultyId) : null;
        const dept = faculty?.department;

        if (f.ratings) {
            Object.values(f.ratings).forEach(val => {
                if (typeof val === 'number') {
                    instTotalScore += val; instMetricCount++;
                    if (dept && departments[dept]) { departments[dept].totalScore += val; departments[dept].metricCount++; }
                    if (!courseAverages[f.courseId]) courseAverages[f.courseId] = { sum: 0, count: 0 };
                    courseAverages[f.courseId].sum += val; courseAverages[f.courseId].count++;
                }
            });
        }
    });

    // 4. Update stats
    const instAvg = instMetricCount > 0 ? (instTotalScore / instMetricCount).toFixed(1) : '0.0';
    const instOverallEl = document.getElementById('instOverallScore');
    if (instOverallEl) instOverallEl.innerText = instAvg;
    const activeCyclesEl = document.getElementById('instActiveCycles');
    if (activeCyclesEl) activeCyclesEl.innerText = cycles.filter(c => c.status === 'active').length;

    const uniqueStudentsWhoSubmitted = new Set(allSubmissions.map(f => f.studentId)).size;
    const totalStudents = allStudents.length;
    const participationRate = totalStudents > 0 ? Math.round((uniqueStudentsWhoSubmitted / totalStudents) * 100) : 0;
    const partEl = document.getElementById('instParticipation');
    if (partEl) partEl.innerText = `${Math.min(participationRate, 100)}%`;

    // 5. Dept performance bars
    const deptBarsContainer = document.getElementById('deptBarsContainer');
    if (deptBarsContainer) {
        deptBarsContainer.innerHTML = '';
        const deptArray = Object.keys(departments).map(deptName => {
            const data = departments[deptName];
            const avg = data.metricCount > 0 ? (data.totalScore / data.metricCount) : 0;
            return { name: deptName, avg };
        }).sort((a, b) => b.avg - a.avg);

        if (!deptArray.length || instMetricCount === 0) {
            deptBarsContainer.innerHTML = `<p style="color:#94a3b8;font-style:italic;">No departmental data available yet.</p>`;
        } else {
            deptArray.forEach(dept => {
                const displayAvg = dept.avg > 0 ? dept.avg.toFixed(1) : 'N/A';
                const isDanger = dept.avg > 0 && dept.avg < 3.5;
                const barColor = isDanger ? '#ef4444' : '#1e3a8a';
                const widthPct = dept.avg > 0 ? (dept.avg / 5) * 100 : 0;
                const row = document.createElement('div');
                row.className = 'dept-row';
                row.innerHTML = `
                    <div class="dept-header">
                        <span style="${isDanger ? 'color:#ef4444;' : ''}">${dept.name}</span>
                        <span style="${isDanger ? 'color:#ef4444;' : ''}">${displayAvg}</span>
                    </div>
                    <div class="dept-bar-bg">
                        <div class="dept-bar-fill" style="width:${widthPct}%;background-color:${barColor};"></div>
                    </div>
                `;
                deptBarsContainer.appendChild(row);
            });
        }
    }
}
