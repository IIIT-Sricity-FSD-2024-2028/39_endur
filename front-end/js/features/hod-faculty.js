import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderFacultyManagement() {
    const user = getSession();
    if (!user) return;

    // 1. Fetch Mock Data
    const [usersRes, coursesRes] = await Promise.all([
        fetch("../../js/mock-data/users.json"),
        fetch("../../js/mock-data/courses.json")
    ]);
    
    const allUsers = await usersRes.json();
    const allCourses = await coursesRes.json();
    
    // Feedback from Local Storage
    const submissions = get("submittedFeedback") || [];

    // 2. Filter Faculty to ONLY the HOD's Department
    const myFaculty = allUsers.filter(u => u.role === "faculty" && u.department === user.department);

    const tableBody = document.getElementById("managementTableBody");
    if (tableBody) tableBody.innerHTML = "";

    // Helper to generate a fake designation based on ID length/number to make it look like the mockup
    const getDesignation = (id) => {
        const lastDigit = parseInt(id.slice(-1));
        if (lastDigit <= 2) return "Professor";
        if (lastDigit <= 4) return "Associate Prof";
        if (lastDigit <= 7) return "Assistant Prof";
        return "Lecturer";
    };

    // 3. Loop through Faculty and calculate stats
    myFaculty.forEach(faculty => {
        // Find courses taught by this faculty member
        const facultyCourses = allCourses.filter(c => c.facultyId === faculty.id);
        
        // Generate Course Pills HTML
        let coursePillsHtml = "";
        facultyCourses.forEach(c => {
            coursePillsHtml += `<span class="course-pill">${c.id}</span>`;
        });
        if (!coursePillsHtml) coursePillsHtml = `<span style="color:#94a3b8; font-size:12px;">Unassigned</span>`;

        // Find all feedback for this faculty member
        const facultyFeedback = submissions.filter(f => f.facultyId === faculty.id);
        const responseCount = facultyFeedback.length;
        
        let facultyAvgScore = 0;

        // Calculate Average Score
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
                sumAverages += (metricCount > 0 ? (metricSum / metricCount) : 0);
            });
            facultyAvgScore = (sumAverages / responseCount);
        }

        // Generate Fake Email (e.g., a.turing@endur.edu)
        const nameParts = faculty.name.replace("Dr. ", "").replace("Ms. ", "").replace("Mrs. ", "").split(" ");
        const fakeEmail = `${nameParts[0][0].toLowerCase()}.${nameParts[nameParts.length-1].toLowerCase()}@endur.edu`;
        const designation = getDesignation(faculty.id);

        // Calculate progress bar width (Score out of 5)
        const barWidth = (facultyAvgScore / 5) * 100;

        // Render Table Row
        if (tableBody) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding-left: 30px; padding-top: 16px; padding-bottom: 16px;">
                    <strong style="display: block; color: #0f172a; font-size: 14px;">${faculty.name}</strong>
                    <span style="font-size: 12px; color: #94a3b8;">${fakeEmail}</span>
                </td>
                <td style="color: #64748b; font-size: 14px;">${faculty.id}</td>
                <td>
                    <span class="designation-badge">${designation}</span>
                </td>
                <td style="max-width: 150px;">
                    ${coursePillsHtml}
                </td>
                <td>
                    <strong style="color: #1e3a8a; font-size: 15px;">${facultyAvgScore > 0 ? facultyAvgScore.toFixed(1) : "0.0"}/5.0</strong>
                    <div class="perf-bar-bg">
                        <div class="perf-bar-fill" style="width: ${facultyAvgScore > 0 ? barWidth : 0}%;"></div>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        }
    });
}
