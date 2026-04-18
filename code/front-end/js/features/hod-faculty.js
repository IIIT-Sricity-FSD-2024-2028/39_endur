import { GET } from '../core/api.js';
import { getSession } from '../core/session.js';

export async function renderFacultyManagement() {
    const user = getSession();
    if (!user) return;

    let allUsers = [], allCourses = [], cycleState = { id: 'SETUP' };
    try {
        [allUsers, allCourses, cycleState] = await Promise.all([
            GET('/users'),
            GET('/courses'),
            GET('/feedback-cycles/state').catch(() => ({ id: 'SETUP' })),
        ]);
    } catch (e) { console.error('HOD faculty: failed to load data', e); }

    const activeCycleId = cycleState.id;
    let allSubmissions = [];
    try { allSubmissions = await GET(`/feedback-responses?cycleId=${activeCycleId}`); } catch {}
    const submissions = allSubmissions;

    
    const myFaculty = allUsers.filter(u => u.role === "faculty" && u.department === user.department);
    const tableBody = document.getElementById("managementTableBody");
    if (tableBody) tableBody.innerHTML = "";

    const getDesignation = (id) => {
        const lastDigit = parseInt(id.slice(-1));
        if (lastDigit <= 2) return "Professor";
        if (lastDigit <= 4) return "Associate Prof";
        if (lastDigit <= 7) return "Assistant Prof";
        return "Lecturer";
    };

    myFaculty.forEach(faculty => {
        const facultyCourses = allCourses.filter(c => c.facultyId === faculty.id);
        
        let coursePillsHtml = "";
        facultyCourses.forEach(c => {
            coursePillsHtml += `<span class="course-pill">${c.id}</span>`;
        });
        if (!coursePillsHtml) coursePillsHtml = `<span style="color:#94a3b8; font-size:12px;">Unassigned</span>`;

        const facultyFeedback = submissions.filter(f => f.facultyId === faculty.id);
        const responseCount = facultyFeedback.length;
        let facultyAvgScore = 0;

        // DYNAMIC MATH FIX
        if (responseCount > 0) {
            let sumAverages = 0;
            facultyFeedback.forEach(f => {
                let metricSum = 0;
                let metricCount = 0;
                if (f.ratings) {
                    Object.values(f.ratings).forEach(val => {
                        if (typeof val === 'number') { metricSum += val; metricCount++; }
                    });
                }
                sumAverages += (metricCount > 0 ? (metricSum / metricCount) : 0);
            });
            facultyAvgScore = (sumAverages / responseCount);
        }

        const nameParts = faculty.name.replace("Dr. ", "").replace("Ms. ", "").replace("Mrs. ", "").split(" ");
        const fakeEmail = `${nameParts[0][0].toLowerCase()}.${nameParts[nameParts.length-1].toLowerCase()}@endur.edu`;
        const designation = getDesignation(faculty.id);
        const barWidth = (facultyAvgScore / 5) * 100;

        if (tableBody) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding-left: 30px; padding-top: 16px; padding-bottom: 16px;">
                    <strong style="display: block; color: #0f172a; font-size: 14px;">${faculty.name}</strong>
                    <span style="font-size: 12px; color: #94a3b8;">${fakeEmail}</span>
                </td>
                <td style="color: #64748b; font-size: 14px;">${faculty.id}</td>
                <td><span class="designation-badge">${designation}</span></td>
                <td style="max-width: 150px;">${coursePillsHtml}</td>
                <td>
                    <strong style="color: #1e3a8a; font-size: 15px;">${facultyAvgScore > 0 ? facultyAvgScore.toFixed(1) : "0.0"}/5.0</strong>
                    <div class="perf-bar-bg"><div class="perf-bar-fill" style="width: ${facultyAvgScore > 0 ? barWidth : 0}%;"></div></div>
                </td>
            `;
            tableBody.appendChild(tr);
        }
    });
}
