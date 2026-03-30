import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderHodDashboard() {
    const user = getSession();
    if (!user) return;

    // 1. Fetch Mock Data
    const [usersRes, coursesRes] = await Promise.all([
        fetch("../../js/mock-data/users.json"),
        fetch("../../js/mock-data/courses.json")
    ]);
    
    const allUsers = await usersRes.json();
    const allCourses = await coursesRes.json();
    
    // Feedback and Reports from Local Storage
    const submissions = get("submittedFeedback") || [];
    const actionReports = get("actionReports") || [];

    // 2. Filter Faculty to ONLY the HOD's Department
    const myFaculty = allUsers.filter(u => u.role === "faculty" && u.department === user.department);

    let totalDeptScore = 0;
    let totalDeptFeedbackCount = 0;
    
    let totalDeptEnrolled = 0;
    let totalDeptResponses = 0;

    let flaggedCount = 0;
    let pendingCheckins = 0;

    const tableBody = document.getElementById("facultyTableBody");
    if (tableBody) tableBody.innerHTML = "";

    // 3. Loop through Faculty and calculate stats
    myFaculty.forEach(faculty => {
        // Find courses taught by this faculty member
        const facultyCourses = allCourses.filter(c => c.facultyId === faculty.id);
        const courseIds = facultyCourses.map(c => c.id).join(", ");
        
        // Find all feedback for this faculty member
        const facultyFeedback = submissions.filter(f => f.facultyId === faculty.id);
        const responseCount = facultyFeedback.length;
        
        let facultyAvgScore = 0;

        // Calculate Average Score for this Faculty
        if (responseCount > 0) {
            let sumAverages = 0;
            facultyFeedback.forEach(f => {
                let metricSum = 0;
                let metricCount = 0;
                if (f.ratings) {
                    if (typeof f.ratings.clarity === 'number') { metricSum += f.ratings.clarity; metricCount++; }
                    if (typeof f.ratings.structure === 'number') { metricSum += f.ratings.structure; metricCount++; }
                    if (typeof f.ratings.engagement === 'number') { metricSum += f.ratings.engagement; metricCount++; }
                    if (typeof f.ratings.difficulty === 'number') { metricSum += f.ratings.difficulty; metricCount++; }
                }
                const formAvg = metricCount > 0 ? (metricSum / metricCount) : 0;
                sumAverages += formAvg;
            });
            
            facultyAvgScore = (sumAverages / responseCount);
            
            // Add to overall Dept aggregations
            totalDeptScore += facultyAvgScore;
            totalDeptFeedbackCount++;
        }

        // Add to Dept Response Rate aggregations
        totalDeptResponses += responseCount;
        facultyCourses.forEach(c => totalDeptEnrolled += (c.enrolled || 0));

        // Determine Status based on Figma logic
        let statusText = "ON TRACK";
        let statusClass = "success"; // Default green badge
        let scoreColor = "#000";

        if (responseCount === 0) {
            statusText = "PENDING DATA";
            statusClass = "neutral";
        } else if (facultyAvgScore < 3.5) {
            statusText = "GAP DETECTED";
            statusClass = "danger";
            scoreColor = "#ef4444"; // Red text
            flaggedCount++;
        } else if (facultyAvgScore >= 3.5 && facultyAvgScore < 4.0) {
            statusText = "CHECK-IN SCHEDULED";
            statusClass = "primary"; // Blue badge
            pendingCheckins++;
        } else {
            statusText = "REPORT SUBMITTED";
            statusClass = "success";
            scoreColor = "#22c55e"; // Green text
        }

        // Render Table Row
        if (tableBody) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding-left: 24px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 32px; height: 32px; background: #f1f5f9; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: var(--primary);">
                        ${faculty.name.split(" ")[1][0]}
                    </div>
                    <div>
                        <strong style="display: block; color: #0f172a;">${faculty.name}</strong>
                        <span style="font-size: 12px; color: #64748b;">${faculty.department} Professor</span>
                    </div>
                </td>
                <td style="color: #475569;">${courseIds || "None"}</td>
                <td style="font-weight: bold; color: ${scoreColor};">${facultyAvgScore > 0 ? facultyAvgScore.toFixed(1) : "0.0"}/5.0</td>
                <td>
                    <span class="badge ${statusClass}" style="text-transform: uppercase; font-size: 10px;">${statusText}</span>
                </td>
            `;
            tableBody.appendChild(tr);
        }
    });

    // 4. Update Top Stats Cards
    const finalDeptAvg = totalDeptFeedbackCount > 0 ? (totalDeptScore / totalDeptFeedbackCount) : 0;
    const deptSatisfactionPercentage = (finalDeptAvg / 5) * 100;
    
    document.getElementById("deptSatisfaction").innerText = deptSatisfactionPercentage.toFixed(0) + "%";
    document.getElementById("satProgressBar").style.width = deptSatisfactionPercentage + "%";

    const finalResponseRate = totalDeptEnrolled > 0 ? Math.round((totalDeptResponses / totalDeptEnrolled) * 100) : 0;
    document.getElementById("deptResponseRate").innerText = finalResponseRate + "%";
    document.getElementById("respProgressBar").style.width = finalResponseRate + "%";

    document.getElementById("flaggedCount").innerText = flaggedCount;
    document.getElementById("pendingCheckins").innerText = pendingCheckins;
}
