import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderFacultyReports() {
    const user = getSession();
    if (!user) return;

    const summaryRes = await fetch("../../js/mock-data/faculty-feedback-summary.json");
    const summaryData = await summaryRes.json();

    const coursesRes = await fetch("../../js/mock-data/courses.json");
    const allCourses = await coursesRes.json();
    const myCourses = allCourses.filter(course => course.facultyId === user.id);

    if (myCourses.length === 0) return; 

    const allFeedback = get("submittedFeedback") || [];
    const reflections = get("selfReflection") || [];
    const actionReports = get("actionReports") || []; // NEW: Fetch action reports
    
    const cycles = get("feedbackCycles") || [{ cycleId: "CYCLE_W4", endTimestamp: "2026-03-30T23:59:59Z", status: "active" }];
    const activeCycle = cycles.find(c => c.status === "active") || cycles[0];

    const dotsContainer = document.getElementById("courseDots");
    if (dotsContainer) dotsContainer.innerHTML = "";

    myCourses.forEach((course, index) => {
        const dot = document.createElement("span");
        dot.style.cssText = "height: 12px; width: 12px; border-radius: 50%; background-color: #ccc; cursor: pointer; transition: 0.2s;";
        dot.onclick = () => selectCourse(index);
        dotsContainer.appendChild(dot);
    });

    function selectCourse(index) {
        const course = myCourses[index];
        localStorage.setItem("activeFacultyCourse", course.id);

        Array.from(dotsContainer.children).forEach((dot, i) => {
            dot.style.backgroundColor = i === index ? "var(--primary)" : "#ccc";
            dot.style.transform = i === index ? "scale(1.2)" : "scale(1)";
        });

        const nameEl = document.getElementById("currentCourseName");
        if (nameEl) nameEl.innerText = `${course.id}`;

        const courseFeedback = allFeedback.filter(f => f.course === course.id);
        let totalScore = 0;
        let metricCount = 0;

        courseFeedback.forEach(feedback => {
            const ratings = feedback.ratings;
            if (ratings) {
                if (typeof ratings.clarity === 'number') { totalScore += ratings.clarity; metricCount++; }
                if (typeof ratings.structure === 'number') { totalScore += ratings.structure; metricCount++; }
                if (typeof ratings.engagement === 'number') { totalScore += ratings.engagement; metricCount++; }
                if (typeof ratings.difficulty === 'number') { totalScore += ratings.difficulty; metricCount++; }
            }
        });

        const realAverage = metricCount > 0 ? (totalScore / metricCount).toFixed(1) : 0;
        const avgEl = document.getElementById("avgRating");
        if (avgEl) avgEl.innerText = `${realAverage}/5`;

        // ==========================================
        // DYNAMIC BUTTON STATES (Reflection & Action)
        // ==========================================
        const hasReflection = reflections.find(r => r.courseId === course.id && r.facultyId === user.id);
        const hasActionReport = actionReports.find(a => a.courseId === course.id && a.facultyId === user.id);
        
        // 1. Self-Reflection Button
        const feedbackBtn = document.getElementById("feedbackActionBtn");
        if (feedbackBtn) {
            if (hasReflection) {
                feedbackBtn.innerText = "View Gap Analysis →";
                feedbackBtn.className = "btn-outline"; 
                feedbackBtn.onclick = () => window.location.href = "gap-analysis.html";
            } else {
                feedbackBtn.innerText = "Open Feedback →";
                feedbackBtn.className = "btn-primary";
                feedbackBtn.onclick = () => window.location.href = "self-reflection.html";
            }
        }

        // 2. Action Report Button
        const arBtn = document.getElementById("actionReportBtn");
        const arMsg = document.getElementById("actionReportMsg");

        if (arBtn && arMsg) {
            // Reset message
            arMsg.style.display = "none";

            if (!hasReflection) {
                arBtn.innerText = "Start Action Report";
                arBtn.className = "btn-outline";
                arBtn.style.opacity = "0.6";
                arBtn.onclick = () => {
                    arMsg.innerText = "⚠️ Please submit your Self-Reflection first.";
                    arMsg.style.display = "block";
                };
            } else if (hasActionReport) {
                arBtn.innerText = "View Action Report →";
                arBtn.className = "btn-primary";
                arBtn.style.opacity = "1";
                arBtn.onclick = () => window.location.href = "action-report.html";
            } else {
                arBtn.innerText = "Start Action Report →";
                arBtn.className = "btn-primary";
                arBtn.style.opacity = "1";
                arBtn.onclick = () => window.location.href = "action-report.html";
            }
        }

        const courseEl = document.getElementById("actionCourse");
        if (courseEl) courseEl.innerText = `${course.id} - ${course.name}`;
    }

    selectCourse(0);

    const deadlineDate = new Date(activeCycle.endTimestamp);
    deadlineDate.setHours(deadlineDate.getHours() + 72);
    const formattedDeadline = deadlineDate.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const deadlineEl = document.getElementById("actionDeadline");
    if (deadlineEl) deadlineEl.innerText = formattedDeadline;

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
