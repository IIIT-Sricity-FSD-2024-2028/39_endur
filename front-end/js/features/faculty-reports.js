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
    const actionReports = get("actionReports") || []; 
    
    const cycles = get("feedbackCycles") || [{ cycleId: "CYCLE_W4", endTimestamp: "2026-03-30T23:59:59Z", status: "active" }];
    const activeCycle = cycles.find(c => c.status === "active") || cycles[0];

    const dotsContainer = document.getElementById("courseDots");
    const actionDotsContainer = document.getElementById("actionDots");

    if (dotsContainer) dotsContainer.innerHTML = "";
    if (actionDotsContainer) actionDotsContainer.innerHTML = "";

    myCourses.forEach((course, index) => {
        // Feedback Card Dots
        const dot = document.createElement("span");
        dot.style.cssText = "height: 12px; width: 12px; border-radius: 50%; background-color: #ccc; cursor: pointer; transition: 0.2s;";
        dot.onclick = () => selectCourse(index);
        if (dotsContainer) dotsContainer.appendChild(dot);

        // Action Report Card Dots
        const actionDot = document.createElement("span");
        actionDot.style.cssText = "height: 12px; width: 12px; border-radius: 50%; background-color: #ccc; cursor: pointer; transition: 0.2s;";
        actionDot.onclick = () => selectCourse(index);
        if (actionDotsContainer) actionDotsContainer.appendChild(actionDot);
    });

    function selectCourse(index) {
        const course = myCourses[index];
        localStorage.setItem("activeFacultyCourse", course.id);

        // Sync visual highlights
        if (dotsContainer) {
            Array.from(dotsContainer.children).forEach((dot, i) => {
                dot.style.backgroundColor = i === index ? "var(--primary)" : "#ccc";
                dot.style.transform = i === index ? "scale(1.2)" : "scale(1)";
            });
        }
        if (actionDotsContainer) {
            Array.from(actionDotsContainer.children).forEach((dot, i) => {
                dot.style.backgroundColor = i === index ? "var(--primary)" : "#ccc";
                dot.style.transform = i === index ? "scale(1.2)" : "scale(1)";
            });
        }

        const nameEl = document.getElementById("currentCourseName");
        if (nameEl) nameEl.innerText = `${course.id}`;

        const courseFeedback = allFeedback.filter(f => f.course === course.id);
        const responseCount = courseFeedback.length; 
        
        const hasReflection = reflections.find(r => r.courseId === course.id && r.facultyId === user.id);
        const hasActionReport = actionReports.find(a => a.courseId === course.id && a.facultyId === user.id);

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
        
        if (avgEl) {
            if (responseCount === 0) {
                avgEl.innerText = "0/5";
                avgEl.style.opacity = "0.5";
            } else if (!hasReflection) {
                avgEl.innerText = "?/5";
                avgEl.style.opacity = "0.5";
                avgEl.title = "Submit your self-reflection to reveal the student average.";
            } else {
                avgEl.innerText = `${realAverage}/5`;
                avgEl.style.opacity = "1";
                avgEl.title = "Actual Student Average";
            }
        }

        const feedbackBtn = document.getElementById("feedbackActionBtn");
        if (feedbackBtn) {
            if (hasReflection) {
                feedbackBtn.innerText = "View Gap Analysis →";
                feedbackBtn.className = "btn-outline"; 
                feedbackBtn.style.opacity = "1";
                feedbackBtn.disabled = false;
                feedbackBtn.onclick = () => window.location.href = "gap-analysis.html";
                
            } else if (responseCount < 3) {
                feedbackBtn.innerText = `Locked (${responseCount}/3 Responses)`;
                feedbackBtn.className = "btn-outline";
                feedbackBtn.style.opacity = "0.6";
                feedbackBtn.disabled = true; 
                feedbackBtn.onclick = (e) => {
                    e.preventDefault();
                    alert(`Anonymity Lock: You need at least 3 student responses to open feedback. Currently at ${responseCount}.`);
                };
            } else {
                feedbackBtn.innerText = "Open Feedback →";
                feedbackBtn.className = "btn-primary";
                feedbackBtn.style.opacity = "1";
                feedbackBtn.disabled = false;
                feedbackBtn.onclick = () => window.location.href = "self-reflection.html";
            }
        }

        // ==========================================
        // ACTION REPORT BUTTON & NOTIFICATION STATUS
        // ==========================================
        const arBtn = document.getElementById("actionReportBtn");
        const arMsg = document.getElementById("actionReportMsg");

        if (arBtn && arMsg) {
            arMsg.style.display = "none";

            if (!hasReflection) {
                arBtn.innerText = "Start Action Report";
                arBtn.className = "btn-outline";
                arBtn.style.opacity = "0.6";
                arBtn.onclick = () => {
                    arMsg.innerHTML = "⚠️ Please submit your Self-Reflection first.";
                    arMsg.style.color = "#ffcccc";
                    arMsg.style.display = "block";
                };
            } else if (hasActionReport) {
                
                // Check specific status to notify faculty
                if (hasActionReport.status === "REVISION_REQUESTED") {
                    arBtn.innerText = "Revise Action Report →";
                    arBtn.className = "btn-danger"; // Turns the button Red!
                    arBtn.style.opacity = "1";
                    arMsg.innerHTML = "<strong>⚠️ HOD requested a revision.</strong> Please update your report.";
                    arMsg.style.color = "#f87171"; // Light red text
                    arMsg.style.display = "block";
                } else if (hasActionReport.status === "FINALIZED") {
                    arBtn.innerText = "View Finalized Report →";
                    arBtn.className = "btn-outline";
                    arBtn.style.opacity = "1";
                    arMsg.innerHTML = "✅ <strong>Check-in Finalized</strong> by HOD.";
                    arMsg.style.color = "#4ade80"; // Light green text
                    arMsg.style.display = "block";
                } else {
                    arBtn.innerText = "View Action Report →";
                    arBtn.className = "btn-primary";
                    arBtn.style.opacity = "1";
                    arMsg.innerHTML = "⏳ Submitted - Pending HOD Review";
                    arMsg.style.color = "#94a3b8"; // Slate text
                    arMsg.style.display = "block";
                }

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
