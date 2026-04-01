import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

async function getCourses() {
    try {
        const res = await fetch("../../js/mock-data/courses.json");
        return await res.json();
    } catch (e) {
        console.error("Failed to fetch courses", e);
        return [];
    }
}

export async function renderFacultyDashboard() {
    const user = getSession();
    if (!user) return;

    const allCourses = await getCourses();
    const myCourses = allCourses.filter(c => c.facultyId === user.id);

    // Use systemUsers for real enrollment counts (fallback to static json)
    const allSystemUsers = JSON.parse(localStorage.getItem("systemUsers")) || [];
    const allStudents = allSystemUsers.filter(u => u.role === "student");

    const allSubmissions = get("submittedFeedback") || [];
    const allReflections = get("selfReflection") || [];
    const cycleState = get("systemCycleState") || { id: "SYSTEM SETUP", phase: "PREPARATION" };

    const activeCycleId = cycleState.id;

    // Filter to active cycle submissions — fall back to ALL submissions if none match
    // (handles fresh sessions where cycleState.id may not match stored feedback's cycleId)
    let submissions = allSubmissions.filter(f => f.cycleId === activeCycleId);
    if (submissions.length === 0) {
        // Fallback: show all feedback for this faculty's courses regardless of cycle
        const myIds = new Set(myCourses.map(c => c.id));
        submissions = allSubmissions.filter(f => myIds.has(f.course));
    }
    const reflections = allReflections.filter(r => r.cycleId === activeCycleId);

    const cycleBadge = document.getElementById("dashboardCycleName");
    if (cycleBadge) cycleBadge.innerText = activeCycleId;

    const banner = document.getElementById("phaseBanner");
    if (banner) {
        banner.style.display = "block";
        if (cycleState.phase === "PREPARATION") {
            banner.style.background = "#f8fafc"; banner.style.border = "1px solid #cbd5e1"; banner.style.color = "#475569";
            banner.innerHTML = "<strong>⏳ Cycle Preparation:</strong> The next evaluation cycle is being configured by the Dean and HODs.";
        } else if (cycleState.phase === "STUDENT_FEEDBACK") {
            banner.style.background = "#eff6ff"; banner.style.border = "1px solid #bfdbfe"; banner.style.color = "#1e40af";
            banner.innerHTML = "<strong>📝 Feedback Cycle Active:</strong> Students are currently submitting evaluations. Your dashboard will update once this cycle closes.";
        } else if (cycleState.phase === "FACULTY_REFLECTION") {
            banner.style.background = "#fffbeb"; banner.style.border = "1px solid #fde68a"; banner.style.color = "#b45309";
            banner.innerHTML = "<strong>🔍 Self-Reflection Window:</strong> The student cycle has closed. Please complete your Self-Reflections in the Reports tab.";
        } else if (cycleState.phase === "ACTION_REPORT") {
            banner.style.background = "#fef2f2"; banner.style.border = "1px solid #fecaca"; banner.style.color = "#991b1b";
            banner.innerHTML = "<strong>📋 Action Plan Check-In:</strong> Please submit your Action Reports and review them with your HOD.";
        } else {
            banner.style.background = "#f0fdf4"; banner.style.border = "1px solid #bbf7d0"; banner.style.color = "#166534";
            banner.innerHTML = "<strong>✅ Cycle Archived:</strong> All evaluations and reports for this cycle are finalized.";
        }
    }

    const table = document.getElementById("courseTable");
    if (table) table.innerHTML = "";

    let totalStudentScorePercentage = 0;
    let coursesWithFeedbackCount = 0;
    let totalResponses = 0;
    let totalStudentsEnrolled = 0;
    let pendingReflectionCount = 0;
    let totalGapAccumulator = 0;
    let gapCalculatedCourses = 0;

    myCourses.forEach(course => {
        const courseFeedback = submissions.filter(f => f.course === course.id);
        const responses = courseFeedback.length;
        let courseAvgPercentage = 0;

        if (responses > 0) {
            let sumOfAverages = 0;

            courseFeedback.forEach(f => {
                let metricSum = 0;
                let metricCount = 0;
                if (f.ratings) {
                    Object.values(f.ratings).forEach(val => {
                        if (typeof val === 'number') { metricSum += val; metricCount++; }
                    });
                }
                const studentFormAvg = metricCount > 0 ? (metricSum / metricCount) : 0;
                sumOfAverages += studentFormAvg;
            });

            courseAvgPercentage = (sumOfAverages / responses) * 20;
            totalStudentScorePercentage += courseAvgPercentage;
            coursesWithFeedbackCount++;
        }

        totalResponses += responses;
        // Count students actually enrolled in this course
        const enrolledStudents = allStudents.filter(s => s.enrolledCourses && s.enrolledCourses.includes(course.id)).length;
        totalStudentsEnrolled += enrolledStudents > 0 ? enrolledStudents : (course.enrolled || 0);

        // Uses the pre-filtered 'reflections' array
        const hasReflection = reflections.find(r => r.courseId === course.id && r.facultyId === user.id);

        if (!hasReflection) {
            pendingReflectionCount++;
        } else {
            let selfMetricSum = 0;
            let selfMetricCount = 0;
            const expected = hasReflection.expectedRatings || {};

            Object.values(expected).forEach(val => {
                if (typeof val === 'number') { selfMetricSum += val; selfMetricCount++; }
            });

            const selfAvgPercentage = selfMetricCount > 0 ? (selfMetricSum / selfMetricCount) * 20 : 0;
            const absoluteGap = Math.abs(selfAvgPercentage - courseAvgPercentage);

            totalGapAccumulator += absoluteGap;
            gapCalculatedCourses++;
        }

        let displayAvg = `${courseAvgPercentage.toFixed(0)}%`;
        if (responses === 0) {
            displayAvg = `<span style="color:#94a3b8;">N/A</span>`;
        } else if (!hasReflection && cycleState.phase !== "ACTION_REPORT" && cycleState.phase !== "COMPLETED") {
            displayAvg = `<span title="Complete Self-Reflection to unlock" style="color:#94a3b8; font-size: 13px;">Locked 🔒</span>`;
        }

        if (table) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${course.id}</td>
                <td>${course.name}</td>
                <td>${course.enrolled || 0}</td>
                <td>
                    <span class="badge ${responses > 0 ? 'success' : 'neutral'}">
                        ${responses > 0 ? "Active" : "Waiting"}
                    </span>
                </td>
                <td style="font-weight: 600;">${displayAvg}</td>
            `;
            table.appendChild(tr);
        }
    });

    const finalAvgScore = coursesWithFeedbackCount > 0 ? (totalStudentScorePercentage / coursesWithFeedbackCount).toFixed(0) : 0;
    const finalGapScore = gapCalculatedCourses > 0 ? (totalGapAccumulator / gapCalculatedCourses).toFixed(0) : 0;

    const avgScoreEl = document.getElementById("avgScore");
    const gapScoreEl = document.getElementById("gapScore");

    // Student Satisfaction = real average, NEVER locked (it's student data, not reflection-gated)
    if (avgScoreEl) avgScoreEl.innerText = finalAvgScore > 0 ? `${finalAvgScore}%` : "N/A";

    // Performance Gap IS gated on self-reflection (needs both signals)
    if (pendingReflectionCount > 0 && ["PREPARATION", "STUDENT_FEEDBACK", "FACULTY_REFLECTION"].includes(cycleState.phase)) {
        if (gapScoreEl) { gapScoreEl.innerHTML = `<span style="font-size: 18px; color: #94a3b8;">Locked 🔒</span>`; }
    } else {
        if (gapScoreEl) gapScoreEl.innerText = finalGapScore > 0 ? `${finalGapScore}%` : "N/A";
    }

    const finalResponseRate = totalStudentsEnrolled > 0 ? Math.round((totalResponses / totalStudentsEnrolled) * 100) : 0;
    const responseRateEl = document.getElementById("responseRate");
    if (responseRateEl) responseRateEl.innerText = `${finalResponseRate}%`;

    const pendingRefEl = document.getElementById("pendingReflection");
    if (pendingRefEl) {
        pendingRefEl.innerText = pendingReflectionCount;
        if (pendingReflectionCount > 0) pendingRefEl.style.color = "#d97706";
    }

    const emptyState = document.getElementById("emptyState");
    if (emptyState) {
        emptyState.style.display = myCourses.length === 0 ? "block" : "none";
    }
}
