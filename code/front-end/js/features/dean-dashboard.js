import { GET, getSession } from '../core/api.js';

export async function renderDeanDashboard() {
    const user = getSession();
    if (!user) return;

    // ── 1. Load all data from API ──────────────────────────────────────────────
    let allUsers = [], allCourses = [], cycles = [], cycleState = { id: 'SETUP' };
    let allSubmissions = [];

    try {
        [allUsers, allCourses, cycles] = await Promise.all([
            GET('/users'),
            GET('/courses'),
            GET('/feedback-cycles'),
        ]);
        cycleState = await GET('/feedback-cycles/state').catch(() => ({ id: 'SETUP', phase: 'PREPARATION' }));
    } catch (e) {
        console.error('Dean Dashboard: failed to load base data', e);
    }

    try { allSubmissions = await GET('/feedback-responses'); } catch {}

    const facultyList = allUsers.filter(u => u.role === 'faculty');
    const allStudents = allUsers.filter(u => u.role === 'student');

    // ── 2. Build dept structure from faculty users + courses ───────────────────
    const departments = {};
    facultyList.forEach(f => {
        if (f.department && !departments[f.department]) {
            departments[f.department] = { totalScore: 0, metricCount: 0, courseIds: [], facultyIds: [] };
        }
        if (f.department) departments[f.department].facultyIds.push(f.id);
    });

    allCourses.forEach(c => {
        const faculty = facultyList.find(f => f.id === c.facultyId);
        if (faculty?.department && departments[faculty.department]) {
            departments[faculty.department].courseIds.push(c.id);
        }
    });

    // ── 3. Process feedback submissions ───────────────────────────────────────
    let instTotalScore = 0, instMetricCount = 0;

    allSubmissions.forEach(f => {
        const facultyId = f.facultyId || allCourses.find(c => c.id === f.courseId)?.facultyId;
        const faculty = facultyList.find(u => u.id === facultyId);
        const dept = faculty?.department;

        if (Array.isArray(f.ratings) && f.ratings.length > 0) {
            let rSum = 0;
            let rWeight = 0;
            f.ratings.forEach(rt => {
                let s = Number(rt.score ?? 0);
                if (s > 5) s = s / 20; // Normalize
                const w = rt.weight ?? 25;
                rSum += (s * 20) * w; // Scale to % and weight
                rWeight += w;
            });

            if (rWeight > 0) {
                const rOverall = rSum / rWeight;
                instTotalScore += rOverall;
                instMetricCount++;
                if (dept && departments[dept]) {
                    departments[dept].totalScore += rOverall;
                    departments[dept].metricCount++;
                }
            }
        }
    });

    // ── 4. Stat Cards ─────────────────────────────────────────────────────────
    const instAvg = instMetricCount > 0 ? ((instTotalScore / instMetricCount) / 20).toFixed(1) : '0.0';
    _setEl('instOverallScore', instAvg);
    _setEl('instActiveCycles', cycles.filter(c => c.status === 'active').length);

    const uniqueSubmitters = new Set(allSubmissions.map(f => f.studentId)).size;
    const totalStudents = allStudents.length;
    const participation = totalStudents > 0 ? Math.min(Math.round((uniqueSubmitters / totalStudents) * 100), 100) : 0;
    _setEl('instParticipation', `${participation}%`);

    // ── 5. Departmental Bars ───────────────────────────────────────────────────
    const container = document.getElementById('deptBarsContainer');
    if (container) {
        container.innerHTML = '';

        const deptArray = Object.keys(departments).map(name => ({
            name,
            avg: departments[name].metricCount > 0
                ? departments[name].totalScore / departments[name].metricCount
                : 0,
            responses: departments[name].metricCount,
        })).sort((a, b) => b.avg - a.avg);

        if (!deptArray.length) {
            container.innerHTML = `<p style="color:#94a3b8;font-style:italic;padding:24px 0">No departments found. Add faculty users to see departmental data.</p>`;
        } else if (instMetricCount === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:#94a3b8">
                    <div style="font-size:2.5rem;margin-bottom:12px">📊</div>
                    <strong style="display:block;margin-bottom:6px">No Feedback Data Yet</strong>
                    <p style="font-size:0.875rem">Departmental charts will appear once students submit feedback.</p>
                </div>`;
        } else {
            deptArray.forEach(dept => {
                const displayAvg = dept.avg > 0 ? dept.avg.toFixed(1) : 'N/A';
                const isDanger = dept.avg > 0 && dept.avg < 70;
                const barColor = isDanger ? '#ef4444' : '#1e3a8a';
                const widthPct = dept.avg > 0 ? dept.avg : 0;
                const row = document.createElement('div');
                row.className = 'dept-row';
                row.innerHTML = `
                    <div class="dept-header">
                        <span style="${isDanger ? 'color:#ef4444' : ''}">${dept.name}</span>
                        <span style="${isDanger ? 'color:#ef4444' : ''}">${displayAvg} / 100</span>
                    </div>
                    <div class="dept-bar-bg">
                        <div class="dept-bar-fill" style="width:${widthPct}%;background-color:${barColor}"></div>
                    </div>
                `;
                container.appendChild(row);
            });
        }
    }

    // Export button removed by user request
}

function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
}
