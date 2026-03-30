import { get } from "../core/storage.js";

/* =============================
LOAD COURSES
============================= */
async function getCourses() {
    const res = await fetch("../../js/mock-data/courses.json");
    return await res.json();
}

/* =============================
STATUS LOGIC
============================= */
function getStatus(courseId, userId) {
    const submitted = get("submittedFeedback") || [];
    const drafts = get("feedbackDraft") || {};

    if (submitted.find(f => f.course === courseId && f.userId === userId)) {
        return "completed";
    }

    if (drafts[userId] && drafts[userId][courseId]) {
        return "progress";
    }

    return "pending";
}

/* =============================
DASHBOARD TABLE
============================= */
export async function updateDashboard() {
    const allCourses = await getCourses();
    const user = get("endurSession");
    const table = document.getElementById("dashboardTable");

    if (table) table.innerHTML = "";

    // 1. Filter to ONLY show courses the student is actually enrolled in
    const myCourses = allCourses.filter(c => 
        user.enrolledCourses && user.enrolledCourses.includes(c.id)
    );

    myCourses.forEach(course => {
        const status = getStatus(course.id, user.id);
        let actionClick = "";

        if (status === "completed") {
            actionClick = "window.location.href='feedback-history.html'";
        } else {
            actionClick = `openFeedback('${course.id}')`;
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
                <td>
                    <span class="action-link" onclick="${actionClick}">
                        ${statusAction(status)}
                    </span>
                </td>
            </tr>
            `;
        }
    });

    if (table && table.innerHTML === "") {
        document.getElementById("emptyDashboard").style.display = "block";
    }
}

/* =============================
STATS
============================= */
export async function updateStats() {
    const allCourses = await getCourses();
    const user = get("endurSession");

    // 1. Filter to ONLY show courses the student is actually enrolled in
    const myCourses = allCourses.filter(c => 
        user.enrolledCourses && user.enrolledCourses.includes(c.id)
    );

    let completed = 0;
    let progress = 0;
    let pending = 0;

    myCourses.forEach(course => {
        const status = getStatus(course.id, user.id);
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

/* =============================
HELPERS
============================= */
function statusLabel(status) {
    return { pending: "Pending", progress: "In Progress", completed: "Completed" }[status];
}

function statusAction(status) {
    return { pending: "Start", progress: "Resume", completed: "View" }[status];
}
