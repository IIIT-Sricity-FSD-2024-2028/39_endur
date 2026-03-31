import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderDeanDashboard() {
    const user = getSession();
    // Accept dean role, or faculty/hod users who have switched to dean view
    if (!user) return;


    // 1. Fetch Master Data
    const [usersRes, coursesRes] = await Promise.all([
        fetch("../../js/mock-data/users.json"),
        fetch("../../js/mock-data/courses.json")
    ]);
    const allUsers = await usersRes.json();
    const allCourses = await coursesRes.json();
    
    const submittedFeedback = get("submittedFeedback") || [];
    const cycles = get("systemFeedbackCycles") || [];
    const configStatuses = get("departmentConfigStatus") || {};
    const allStudents = (JSON.parse(localStorage.getItem("systemUsers")) || allUsers).filter(u => u.role === "student");

    // 2. Identify Departments dynamically from users
    const departments = {};
    const facultyList = allUsers.filter(u => u.role === "faculty");
    
    facultyList.forEach(f => {
        if (!departments[f.department]) {
            departments[f.department] = { totalScore: 0, metricCount: 0, courses: [] };
        }
    });

    // Assign courses to departments
    allCourses.forEach(c => {
        const faculty = facultyList.find(f => f.id === c.facultyId);
        if (faculty && departments[faculty.department]) {
            departments[faculty.department].courses.push(c.id);
        }
    });

    // 3. Process Feedback (Dynamic Math)
    let instTotalScore = 0;
    let instMetricCount = 0;

    // Track course averages to find flags
    const courseAverages = {};

    submittedFeedback.forEach(f => {
        const faculty = facultyList.find(u => u.id === f.facultyId);
        const dept = faculty ? faculty.department : null;

        if (f.ratings) {
            Object.values(f.ratings).forEach(val => {
                if (typeof val === 'number') {
                    // Institutional Total
                    instTotalScore += val;
                    instMetricCount++;
                    
                    // Department Total
                    if (dept && departments[dept]) {
                        departments[dept].totalScore += val;
                        departments[dept].metricCount++;
                    }

                    // Course Total (for flagging)
                    if (!courseAverages[f.course]) courseAverages[f.course] = { sum: 0, count: 0 };
                    courseAverages[f.course].sum += val;
                    courseAverages[f.course].count++;
                }
            });
        }
    });

    // No flagged courses stat

    // 4. Update Top Stats
    const instAvg = instMetricCount > 0 ? (instTotalScore / instMetricCount).toFixed(1) : "0.0";
    document.getElementById("instOverallScore").innerText = instAvg;
    document.getElementById("instActiveCycles").innerText = cycles.filter(c => c.status === "active").length;

    // Real participation: unique students who submitted at least one feedback / total enrolled students
    const uniqueStudentsWhoSubmitted = new Set(submittedFeedback.map(f => f.userId)).size;
    const totalStudents = allStudents.length;
    const participationRate = totalStudents > 0 ? Math.round((uniqueStudentsWhoSubmitted / totalStudents) * 100) : 0;
    document.getElementById("instParticipation").innerText = `${Math.min(participationRate, 100)}%`;

    // 5. Render Departmental Performance Bars
    const deptBarsContainer = document.getElementById("deptBarsContainer");
    deptBarsContainer.innerHTML = "";

    const deptArray = Object.keys(departments).map(deptName => {
        const data = departments[deptName];
        const avg = data.metricCount > 0 ? (data.totalScore / data.metricCount) : 0;
        return { name: deptName, avg: avg };
    });

    // Sort by performance descending
    deptArray.sort((a, b) => b.avg - a.avg);

    if (deptArray.length === 0 || instMetricCount === 0) {
        deptBarsContainer.innerHTML = `<p style="color:#94a3b8; font-style:italic;">No departmental data available yet.</p>`;
    } else {
        deptArray.forEach(dept => {
            const displayAvg = dept.avg > 0 ? dept.avg.toFixed(1) : "N/A";
            const isDanger = dept.avg > 0 && dept.avg < 3.5;
            const barColor = isDanger ? "#ef4444" : "#1e3a8a"; // Red if low, Blue if good
            const widthPct = dept.avg > 0 ? (dept.avg / 5) * 100 : 0;

            const row = document.createElement("div");
            row.className = "dept-row";
            row.innerHTML = `
                <div class="dept-header">
                    <span style="${isDanger ? 'color: #ef4444;' : ''}">${dept.name}</span>
                    <span style="${isDanger ? 'color: #ef4444;' : ''}">${displayAvg}</span>
                </div>
                <div class="dept-bar-bg">
                    <div class="dept-bar-fill" style="width: ${widthPct}%; background-color: ${barColor};"></div>
                </div>
            `;
            deptBarsContainer.appendChild(row);
        });
    }

    // 6. Generate Smart Institutional Alerts
    const alertsContainer = document.getElementById("alertsContainer");
    alertsContainer.innerHTML = "";
    let alertCount = 0;

    // Alert A: Pending Parameters from HODs
    Object.keys(configStatuses).forEach(dept => {
        if (configStatuses[dept] === "SUBMITTED") {
            alertsContainer.innerHTML += `
                <div class="alert-card alert-warning">
                    <h4>⚠️ Parameter Approval Required</h4>
                    <p>The HOD of <strong>${dept}</strong> has submitted new evaluation parameters for your review.</p>
                </div>
            `;
            alertCount++;
        }
    });

    // Alert B: Data Abnormality (Underperforming Departments)
    deptArray.forEach(dept => {
        if (dept.avg > 0 && dept.avg < 3.5) {
            alertsContainer.innerHTML += `
                <div class="alert-card alert-danger">
                    <h4>📉 Data Abnormality</h4>
                    <p>Pattern of low feedback detected across the <strong>${dept.name}</strong> department.</p>
                </div>
            `;
            alertCount++;
        }
    });

    // Alert C: Placeholder Success
    if (alertCount === 0) {
        alertsContainer.innerHTML = `
            <div class="alert-card alert-success">
                <h4>✅ All Systems Nominal</h4>
                <p>No urgent institutional alerts at this time.</p>
            </div>
        `;
    }
}
