import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderFacultyReports() {
    const user = getSession();
    if (!user) return;

    // 1. Fetch static summary data just for the historical chart
    const summaryRes = await fetch("../../js/mock-data/faculty-feedback-summary.json");
    const summaryData = await summaryRes.json();

    // 2. Fetch all courses so we can map courses to this specific faculty member
    const coursesRes = await fetch("../../js/mock-data/courses.json");
    const allCourses = await coursesRes.json();

    // Find the courses this specific faculty member teaches
    const myCourses = allCourses.filter(course => course.facultyId === user.id);
    const myCourseIds = myCourses.map(course => course.id);

    // 3. Get all feedback from localStorage
    const allFeedback = get("submittedFeedback") || [];
    const myFeedback = allFeedback.filter(f => myCourseIds.includes(f.course));

    let totalScore = 0;
    let metricCount = 0;

    // 4. Calculate the real average
    myFeedback.forEach(feedback => {
        const ratings = feedback.ratings;
        if (ratings) {
            if (typeof ratings.clarity === 'number') { totalScore += ratings.clarity; metricCount++; }
            if (typeof ratings.structure === 'number') { totalScore += ratings.structure; metricCount++; }
            if (typeof ratings.engagement === 'number') { totalScore += ratings.engagement; metricCount++; }
            if (typeof ratings.difficulty === 'number') { totalScore += ratings.difficulty; metricCount++; }
        }
    });

    let realAverage = summaryData.current.avgRating; 
    if (metricCount > 0) {
        realAverage = (totalScore / metricCount).toFixed(1);
    }

    const avgEl = document.getElementById("avgRating");
    if (avgEl) avgEl.innerText = `${realAverage}/5`;

    // 5. DYNAMIC ACTION REPORT DATA
    // Set the Focus Area to the professor's actual course
    const courseEl = document.getElementById("actionCourse");
    if (courseEl && myCourses.length > 0) {
        // Defaults to their first course for the MVP
        courseEl.innerText = `${myCourses[0].id} - ${myCourses[0].name}`;
    }

    // Calculate Deadline: 72 Hours after Feedback Cycle Ends
    const cycles = get("feedbackCycles") || [
        { endTimestamp: "2026-03-30T23:59:59Z", status: "active" } // Safe fallback
    ];
    const activeCycle = cycles.find(c => c.status === "active") || cycles[0];
    
    // Add 72 hours (3 days) to the end timestamp
    const deadlineDate = new Date(activeCycle.endTimestamp);
    deadlineDate.setHours(deadlineDate.getHours() + 72);

    // Format it nicely (e.g., "Apr 2, 2026, 11:59 PM")
    const formattedDeadline = deadlineDate.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const deadlineEl = document.getElementById("actionDeadline");
    if (deadlineEl) deadlineEl.innerText = formattedDeadline;

    // 6. Render simple chart bars
    const chart = document.getElementById("trendChart");
    if (chart) {
        chart.innerHTML = ""; 
        summaryData.history.forEach(item => {
            const bar = document.createElement("div");
            bar.className = "chart-bar";
            bar.style.height = (item.rating * 20) + "px";
            chart.appendChild(bar);
        });
    }
}

// Global window functions for UI buttons
window.openCurrentFeedback = function() {
    alert("Opens detailed feedback table (next phase)");
};

window.viewArchive = function() {
    alert("Shows semester comparison view");
};

window.startActionReport = function() {
    window.location.href = "action-report.html";
};
