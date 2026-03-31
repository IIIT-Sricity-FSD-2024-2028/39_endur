import { get } from "../core/storage.js";

async function getCourses() {
    const res = await fetch("../../js/mock-data/courses.json");
    return await res.json();
}

// FIX: Now requires currentCycleId to differentiate between semesters
function getStatus(courseId, userId, currentCycleId) {
    const submitted = get("submittedFeedback") || [];
    const drafts = get("feedbackDraft") || {};

    // Check if submitted specifically during THIS cycle
    if (submitted.find(f => f.course === courseId && f.userId === userId && f.cycleId === currentCycleId)) return "completed";

    if (drafts[userId] && drafts[userId][courseId]) return "progress";
    return "pending";
}

export async function updateDashboard() {
    const allCourses = await getCourses();
    const user = get("endurSession");
    const table = document.getElementById("dashboardTable");

    const cycleState = get("systemCycleState") || { id: "FALLBACK_CYCLE", phase: "COMPLETED" };
    const currentCycleId = cycleState.id;
    const isFeedbackOpen = cycleState.phase === "STUDENT_FEEDBACK";

    // Manage Global Banner
    const banner = document.getElementById("cycleStatusBanner");
    if (banner) {
        banner.style.display = "block";
        if (!cycleState || cycleState.phase === "COMPLETED") {
            banner.style.background = "#f1f5f9";
            banner.style.border = "1px solid #cbd5e1";
            banner.style.color = "#475569";
            banner.innerHTML = "<strong>ℹ️ Feedback Closed:</strong> There is no active feedback cycle currently running.";
        } else if (cycleState.phase === "PREPARATION") {
            banner.style.background = "#eff6ff";
            banner.style.border = "1px solid #bfdbfe";
            banner.style.color = "#1e40af";
            banner.innerHTML = "<strong>⏳ Coming Soon:</strong> A new feedback cycle is being prepared and will open shortly.";
        } else if (cycleState.phase === "STUDENT_FEEDBACK") {
            banner.style.background = "#f0fdf4";
            banner.style.border = "1px solid #bbf7d0";
            banner.style.color = "#166534";
            let deadlineStr = cycleState.studentDeadline ? ` Closes: ${new Date(cycleState.studentDeadline).toLocaleString()}` : '';
            banner.innerHTML = `<strong>✅ Feedback is Open!</strong> Please submit your course evaluations.${deadlineStr}`;
        } else {
            banner.style.background = "#fef2f2";
            banner.style.border = "1px solid #fecaca";
            banner.style.color = "#991b1b";
            banner.innerHTML = "<strong>🔒 Feedback Closed:</strong> The evaluation window for this cycle has ended. Faculty are now reviewing the results.";
        }
    }

    if (table) table.innerHTML = "";

    const myCourses = allCourses.filter(c => user.enrolledCourses && user.enrolledCourses.includes(c.id));
    
    // Always append the Endur Meta-Review as a mandatory feedback object for the active cycle
    myCourses.push({
        id: "reviewOfReviews",
        name: "Platform System Review (Review of Reviews)"
    });

    myCourses.forEach(course => {
        // Pass currentCycleId to check status
        const status = getStatus(course.id, user.id, currentCycleId);
        let actionHtml = "";

        if (status === "completed") {
            actionHtml = `<button class="btn-small btn-outline" onclick="window.location.href='feedback-history.html'">View</button>`;
        } else {
            if (isFeedbackOpen) {
                actionHtml = `<button class="btn-small btn-primary" onclick="openFeedback('${course.id}')">${statusAction(status)}</button>`;
            } else {
                actionHtml = `<span style="color: var(--text-muted); cursor: not-allowed; font-size: 13px;">Locked</span>`;
            }
        }

        if (table) {
            table.innerHTML += `
            <tr data-course="${course.id}">
                <td>
                    <strong>${course.name}</strong><br>
                    <span class="sub-text">${course.id}</span>
                </td>
                <td>
                    <span class="badge ${status}">${statusLabel(status)}</span>
                </td>
                <td>${actionHtml}</td>
            </tr>
            `;
        }
    });

    if (table && table.innerHTML === "") {
        document.getElementById("emptyDashboard").style.display = "block";
    }
}

export async function updateStats() {
    const allCourses = await getCourses();
    const user = get("endurSession");
    const cycleState = get("systemCycleState") || { id: "FALLBACK_CYCLE" };

    const myCourses = allCourses.filter(c => user.enrolledCourses && user.enrolledCourses.includes(c.id));
    myCourses.push({ id: "reviewOfReviews", name: "Platform System Review (Review of Reviews)" });

    let completed = 0, progress = 0, pending = 0;

    myCourses.forEach(course => {
        const status = getStatus(course.id, user.id, cycleState.id);
        if (status === "completed") completed++;
        else if (status === "progress") progress++;
        else pending++;
    });

    const statComp = document.getElementById("statCompleted");
    if (statComp) statComp.innerText = completed;

    const statProg = document.getElementById("statProgress");
    if (statProg) statProg.innerText = progress;

    const statPend = document.getElementById("statPending");
    if (statPend) statPend.innerText = pending;

    const statTot = document.getElementById("statTotal");
    if (statTot) statTot.innerText = myCourses.length;
}

function statusLabel(status) {
    return { pending: "Pending", progress: "In Progress", completed: "Completed" }[status];
}
function statusAction(status) {
    return { pending: "Start", progress: "Resume", completed: "View" }[status];
}
