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

    const cycleState = get("systemCycleState") || { id: "SETUP", phase: "PREPARATION" };
    const currentPhase = cycleState.phase;
    const activeCycleId = cycleState.id;

    // CYCLE FIX: Fetch only data belonging to THIS cycle
    const allFeedbackRaw = get("submittedFeedback") || [];
    const reflectionsRaw = get("selfReflection") || [];
    const actionReportsRaw = get("actionReports") || []; 

    const allFeedback = allFeedbackRaw.filter(f => f.cycleId === activeCycleId);
    const reflections = reflectionsRaw.filter(r => r.cycleId === activeCycleId);
    const actionReports = actionReportsRaw.filter(a => a.cycleId === activeCycleId);
    
    // GLOBAL ALERT: Check for Pending Revisions
    const globalAlertContainer = document.getElementById("globalAlertContainer");
    if (globalAlertContainer) {
        const needsRevision = actionReports.filter(a => a.facultyId === user.id && a.status === "REVISION_REQUESTED");
        if (needsRevision.length > 0) {
            const coursesText = needsRevision.map(a => a.courseId).join(", ");
            globalAlertContainer.innerHTML = `
                <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 8px; margin-bottom: 24px; display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 24px;">⚠️</div>
                    <div>
                        <h3 style="color: #991b1b; margin-bottom: 4px; font-size: 15px;">Action Required: HOD Revision Requested</h3>
                        <p style="color: #b91c1c; font-size: 14px; margin: 0;">The HOD has requested revisions for your Action Reports in: <strong>${coursesText}</strong>. Please select the course below and update your report.</p>
                    </div>
                </div>
            `;
        } else {
            globalAlertContainer.innerHTML = "";
        }
    }

    const dotsContainer = document.getElementById("courseDots");
    const actionDotsContainer = document.getElementById("actionDots");

    if (dotsContainer) dotsContainer.innerHTML = "";
    if (actionDotsContainer) actionDotsContainer.innerHTML = "";

    myCourses.forEach((course, index) => {
        const dot = document.createElement("span");
        dot.style.cssText = "height: 12px; width: 12px; border-radius: 50%; background-color: #ccc; cursor: pointer; transition: 0.2s;";
        dot.onclick = () => selectCourse(index);
        if (dotsContainer) dotsContainer.appendChild(dot);

        const actionDot = document.createElement("span");
        actionDot.style.cssText = "height: 12px; width: 12px; border-radius: 50%; background-color: #ccc; cursor: pointer; transition: 0.2s;";
        actionDot.onclick = () => selectCourse(index);
        if (actionDotsContainer) actionDotsContainer.appendChild(actionDot);
    });

    function selectCourse(index) {
        const course = myCourses[index];
        localStorage.setItem("activeFacultyCourse", course.id);

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
            if (feedback.ratings) {
                Object.values(feedback.ratings).forEach(val => {
                    if (typeof val === 'number') { totalScore += val; metricCount++; }
                });
            }
        });

        const realAverage = metricCount > 0 ? (totalScore / metricCount).toFixed(1) : 0;
        const avgEl = document.getElementById("avgRating");
        
        if (avgEl) {
            if (responseCount === 0) {
                avgEl.innerText = "0/5";
                avgEl.style.opacity = "0.5";
            } else if (!hasReflection && currentPhase !== "ACTION_REPORT" && currentPhase !== "COMPLETED") {
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
            } 
            else if (currentPhase === "PREPARATION" || currentPhase === "STUDENT_FEEDBACK") {
                feedbackBtn.innerText = `Locked (Waiting for Student Phase to close)`;
                feedbackBtn.className = "btn-outline";
                feedbackBtn.style.opacity = "0.6";
                feedbackBtn.disabled = true;
            }
            else if (currentPhase === "FACULTY_REFLECTION") {
                feedbackBtn.innerText = "Start Self-Reflection →";
                feedbackBtn.className = "btn-primary";
                feedbackBtn.style.opacity = "1";
                feedbackBtn.disabled = false;
                feedbackBtn.onclick = () => window.location.href = "self-reflection.html";
            }
            else { 
                feedbackBtn.innerText = "Reflection Period Ended";
                feedbackBtn.className = "btn-outline";
                feedbackBtn.style.opacity = "0.6";
                feedbackBtn.disabled = true;
            }
        }

        const arBtn = document.getElementById("actionReportBtn");
        const arMsg = document.getElementById("actionReportMsg");

        if (arBtn && arMsg) {
            arMsg.style.display = "none";
            arBtn.disabled = false; 

            if (hasActionReport && (hasActionReport.status === "FINALIZED" || hasActionReport.status === "SUBMITTED")) {
                if (hasActionReport.status === "FINALIZED") {
                    arBtn.innerText = "View Finalized Report →";
                    arBtn.className = "btn-outline";
                    arBtn.style.opacity = "1";
                    arMsg.innerHTML = "✅ <strong>Check-in Finalized</strong> by HOD.";
                    arMsg.style.color = "#4ade80"; 
                    arMsg.style.display = "block";
                } else {
                    arBtn.innerText = "View Action Report →";
                    arBtn.className = "btn-primary";
                    arBtn.style.opacity = "1";
                    arMsg.innerHTML = "⏳ Submitted - Pending HOD Review";
                    arMsg.style.color = "#94a3b8"; 
                    arMsg.style.display = "block";
                }
                arBtn.onclick = () => window.location.href = "action-report.html";
            } 
            else if (hasActionReport && hasActionReport.status === "REVISION_REQUESTED") {
                arBtn.innerText = "Revise Action Report →";
                arBtn.className = "btn-danger"; 
                arBtn.style.opacity = "1";
                arMsg.innerHTML = "<strong>⚠️ HOD requested a revision.</strong> Please update your report.";
                arMsg.style.color = "#f87171"; 
                arMsg.style.display = "block";
                arBtn.onclick = () => window.location.href = "action-report.html";
            }
            else {
                if (currentPhase === "COMPLETED") {
                    arBtn.innerText = "Action Report Period Ended";
                    arBtn.className = "btn-outline";
                    arBtn.style.opacity = "0.6";
                    arBtn.disabled = true;
                } 
                else if (!hasReflection) {
                    arBtn.innerText = "Locked";
                    arBtn.className = "btn-outline";
                    arBtn.style.opacity = "0.6";
                    arBtn.disabled = true;
                    arMsg.innerHTML = "⚠️ Please submit your Self-Reflection to unlock.";
                    arMsg.style.color = "#cbd5e1";
                    arMsg.style.display = "block";
                } 
                else {
                    arBtn.innerText = "Start Action Report →";
                    arBtn.className = "btn-primary";
                    arBtn.style.opacity = "1";
                    arBtn.onclick = () => window.location.href = "action-report.html";
                }
            }
        }

        const courseEl = document.getElementById("actionCourse");
        if (courseEl) courseEl.innerText = `${course.id} - ${course.name}`;
    }

    selectCourse(0);

    const deadlineEl = document.getElementById("actionDeadline");
    if (deadlineEl) {
        if (cycleState.actionDeadline) {
            // Read the explicitly stamped deadline
            deadlineEl.innerText = new Date(cycleState.actionDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else if (cycleState.reflectionDeadline) {
            // Failsafe: Dynamically calculate 72 hours after the reflection deadline
            const fallbackDate = new Date(cycleState.reflectionDeadline);
            fallbackDate.setHours(fallbackDate.getHours() + 72);
            deadlineEl.innerText = fallbackDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else {
            deadlineEl.innerText = "TBD";
        }
    }

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

