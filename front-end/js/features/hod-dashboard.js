import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderHodDashboard() {
    const user = getSession();
    if (!user) return;

    const [usersRes, coursesRes] = await Promise.all([
        fetch("../../js/mock-data/users.json"),
        fetch("../../js/mock-data/courses.json")
    ]);
    const allUsers = await usersRes.json();
    const allCourses = await coursesRes.json();
    
    // If no active cycle is found in state, try to find the latest one from submissions
    const cycleState = get("systemCycleState") || { id: "SETUP" };
    let activeCycleId = cycleState.id;
    const allSubmissions = get("submittedFeedback") || [];
    
    if (activeCycleId === "SETUP" && allSubmissions.length > 0) {
        activeCycleId = allSubmissions[allSubmissions.length - 1].cycleId;
    }

    const allActionReports = get("actionReports") || [];
    
    const submissions = allSubmissions.filter(f => f.cycleId === activeCycleId);
    const actionReports = allActionReports.filter(a => a.cycleId === activeCycleId);
    
    const myFaculty = allUsers.filter(u => u.role === "faculty" && u.department === user.department);
    const facultyIds = myFaculty.map(f => f.id);
    
    // Calculate Department Wide Stats
    const deptFeedback = submissions.filter(f => facultyIds.includes(f.facultyId));
    let totalDeptScore = 0;
    let deptMetricCount = 0;

    // DYNAMIC MATH FIX
    deptFeedback.forEach(f => {
        if (f.ratings) {
            Object.values(f.ratings).forEach(val => {
                if (typeof val === 'number') { totalDeptScore += val; deptMetricCount++; }
            });
        }
    });

    const deptAverage = deptMetricCount > 0 ? (totalDeptScore / deptMetricCount) : 0;
    const deptSatisfaction = deptAverage > 0 ? (deptAverage / 5) * 100 : 0;

    // Response Rate (Mock calculation based on total courses)
    const deptCourses = allCourses.filter(c => facultyIds.includes(c.facultyId));
    const estimatedStudents = deptCourses.length * 40; 
    const responseRate = estimatedStudents > 0 ? (deptFeedback.length / estimatedStudents) * 100 : 0;

    // Update Top Stats
    document.getElementById("deptSatisfaction").innerText = `${deptSatisfaction.toFixed(1)}%`;
    document.getElementById("satProgressBar").style.width = `${deptSatisfaction}%`;
    document.getElementById("deptResponseRate").innerText = `${responseRate.toFixed(1)}%`;
    document.getElementById("respProgressBar").style.width = `${Math.min(responseRate, 100)}%`;

    // Calculate Pending Actions
    let pendingCheckins = 0;

    myFaculty.forEach(faculty => {
        const fCourses = deptCourses.filter(c => c.facultyId === faculty.id);
        fCourses.forEach(course => {
            const actionReport = actionReports.find(a => a.facultyId === faculty.id && a.courseId === course.id);
            if (actionReport && actionReport.status === "SUBMITTED") pendingCheckins++;
        });
    });

    document.getElementById("pendingCheckins").innerText = pendingCheckins;

    // Populate Faculty Quick Table
    const tableBody = document.getElementById("facultyTableBody");
    tableBody.innerHTML = "";

    myFaculty.slice(0, 5).forEach(faculty => {
        const fCourses = deptCourses.filter(c => c.facultyId === faculty.id);
        let facultyAvgScore = 0;
        let fCount = 0;

        const facultyFeedback = deptFeedback.filter(f => f.facultyId === faculty.id);
        facultyFeedback.forEach(f => {
            if (f.ratings) Object.values(f.ratings).forEach(val => {
                if (typeof val === 'number') { facultyAvgScore += val; fCount++; }
            });
        });
        const finalAvg = fCount > 0 ? (facultyAvgScore / fCount).toFixed(1) : "N/A";

        let statusBadge = `<span class="badge success">On Track</span>`;
        if (finalAvg !== "N/A" && parseFloat(finalAvg) < 3.5) {
            statusBadge = `<span class="badge danger">Requires Review</span>`;
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="padding-left: 24px; padding-top: 16px; padding-bottom: 16px;">
                <strong style="display: block; color: #0f172a; font-size: 14px;">${faculty.name}</strong>
            </td>
            <td style="color: #64748b;">${fCourses.length} Courses</td>
            <td><strong>${finalAvg}/5.0</strong></td>
            <td>${statusBadge}</td>
        `;
        tableBody.appendChild(tr);
    });
}
