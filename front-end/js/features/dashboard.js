import { get } from "../core/storage.js";

async function getCourses() {
    const stored = localStorage.getItem("systemCourses");
    if (stored) return JSON.parse(stored);

    const res = await fetch("../../js/mock-data/courses.json");
    const courses = await res.json();
    return courses;
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
        const status = getStatus(course.id, user.id, currentCycleId);

        // CYCLE-AWARE FILTER: If feedback closed, only show completed items in history
        if (!isFeedbackOpen && (status === "pending" || status === "progress")) return;

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
            // Priority: systemCourses > course.thumbnail > fallback
            const thumb = course.id === "reviewOfReviews" ? 'img_bookclub.jpg' : (course.thumbnail || 'img_read.jpg');

            table.innerHTML += `
            <tr data-course="${course.id}">
                <td style="display:flex; align-items:center; gap:12px;">
                    <img src="../../assets/images/${thumb}" style="width:36px; height:36px; border-radius:6px; object-fit:cover;">
                    <div>
                        <strong>${course.name}</strong><br>
                        <span class="sub-text">${course.id}</span>
                    </div>
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
    // Add meta-review to stats too
    myCourses.push({ id: "reviewOfReviews", name: "Platform System Review (Review of Reviews)" });

    let completed = 0, progress = 0, pending = 0;

    myCourses.forEach(course => {
        const status = getStatus(course.id, user.id, cycleState.id);
        if (status === "completed") completed++;
        else if (status === "progress") progress++;
        else pending++;
    });

    // Render Stats
    if (document.getElementById("statCompleted")) document.getElementById("statCompleted").innerText = completed;
    if (document.getElementById("statProgress")) document.getElementById("statProgress").innerText = progress;
    if (document.getElementById("statPending")) document.getElementById("statPending").innerText = pending;
    if (document.getElementById("statTotal")) document.getElementById("statTotal").innerText = myCourses.length;

    // Render Progress Hero
    const hero = document.getElementById("progressHero");
    if (hero) {
        if (cycleState.phase === "STUDENT_FEEDBACK" && myCourses.length > 0) {
            hero.style.display = "flex";
            const percent = Math.round((completed / myCourses.length) * 100);

            const titleEl = document.getElementById("heroProgressTitle");
            const subEl = document.getElementById("heroProgressSub");
            const percentEl = document.getElementById("heroProgressPercent");
            const barEl = document.getElementById("heroProgressBar");

            if (percent === 100) {
                titleEl.innerText = "All Done! 🎉";
                subEl.innerText = "Thank you for completing all your feedbacks this cycle.";
            } else if (percent > 50) {
                titleEl.innerText = "You're getting there!";
                subEl.innerText = `Just ${pending} more feedback${pending > 1 ? 's' : ''} to go. You've got this!`;
            } else {
                titleEl.innerText = "Welcome back!";
                subEl.innerText = `You have ${pending} course evaluation${pending > 1 ? 's' : ''} waiting for you.`;
            }

            if (percentEl) percentEl.innerText = `${percent}%`;

            if (barEl) {
                const radius = 40;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (percent / 100) * circumference;
                barEl.style.strokeDasharray = circumference;
                barEl.style.strokeDashoffset = offset;
            }
        } else {
            hero.style.display = "none";
        }
    }
}

function statusLabel(status) {
    return { pending: "Pending", progress: "In Progress", completed: "Completed" }[status];
}
function statusAction(status) {
    return { pending: "Start", progress: "Resume", completed: "View" }[status];
}
