import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderFacultyReports() {
    const user = getSession();
    if (!user) return;

    // 1. Fetch static summary data for the chart and action report placeholders
    const summaryRes = await fetch("../../js/mock-data/faculty-feedback-summary.json");
    const summaryData = await summaryRes.json();

    // 2. Fetch all courses so we can map courses to this specific faculty member
    const coursesRes = await fetch("../../js/mock-data/courses.json");
    const allCourses = await coursesRes.json();

    // Create an array of course IDs that this faculty member teaches (e.g., ["CS101"])
    const myCourseIds = allCourses
        .filter(course => course.facultyId === user.id)
        .map(course => course.id);

    // 3. Get all feedback from localStorage
    const allFeedback = get("submittedFeedback") || [];
    
    // Filter feedback: Keep it ONLY if the feedback's 'course' is in myCourseIds
    const myFeedback = allFeedback.filter(f => myCourseIds.includes(f.course));

    let totalScore = 0;
    let metricCount = 0;

    // 4. Calculate the real average, ignoring corrupted test data
    myFeedback.forEach(feedback => {
        const ratings = feedback.ratings;
        if (ratings) {
            // Using typeof ensures we only add actual numbers, ignoring nested objects from old test data
            if (typeof ratings.clarity === 'number') { totalScore += ratings.clarity; metricCount++; }
            if (typeof ratings.structure === 'number') { totalScore += ratings.structure; metricCount++; }
            if (typeof ratings.engagement === 'number') { totalScore += ratings.engagement; metricCount++; }
            if (typeof ratings.difficulty === 'number') { totalScore += ratings.difficulty; metricCount++; }
        }
    });

    // If there is real feedback, calculate it. Otherwise, fall back to the mock JSON data.
    let realAverage = summaryData.current.avgRating; 
    if (metricCount > 0) {
        realAverage = (totalScore / metricCount).toFixed(1);
    }

    // 5. Update the DOM
    const avgEl = document.getElementById("avgRating");
    if (avgEl) avgEl.innerText = `${realAverage}/5`;

    const courseEl = document.getElementById("actionCourse");
    if (courseEl) courseEl.innerText = summaryData.actionRequired.course;

    const deadlineEl = document.getElementById("actionDeadline");
    if (deadlineEl) deadlineEl.innerText = summaryData.actionRequired.deadline;

    // 6. Render simple chart bars
    const chart = document.getElementById("trendChart");
    if (chart) {
        chart.innerHTML = ""; // Clear placeholder content
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
