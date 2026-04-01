import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";

let currentActiveFacultyId = null;
let currentActiveCourseId = null;

export async function renderReviewCheckins() {
    const user = getSession();
    if (!user) return;

    const listContainer = document.getElementById("checkinList");
    const banner = document.getElementById("cyclePhaseBanner");
    const emptyDetail = document.getElementById("emptyDetail");
    const checkinDetail = document.getElementById("checkinDetail");

    const cycleState = get("systemCycleState") || { id: "SETUP", phase: "PREPARATION" };
    const activeCycleId = cycleState.id;
    const badgeEl = document.getElementById("activeCycleBadge");
    if (badgeEl) badgeEl.innerText = activeCycleId;

    if (cycleState.phase !== "FACULTY_REFLECTION") {
        listContainer.innerHTML = `<div style="padding: 30px; text-align: center; color: #64748b; font-size: 14px;">No active check-ins for the current cycle.</div>`;
        checkinDetail.style.display = "none";
        emptyDetail.style.display = "flex";

        let reason = "The feedback cycle has been completed and archived.";
        if (cycleState.phase === "PREPARATION") reason = "The next cycle is still in the preparation phase.";
        if (cycleState.phase === "STUDENT_FEEDBACK") reason = "Students are currently providing feedback.";

        emptyDetail.innerHTML = `
            <div>
                <h2 style="margin-bottom: 8px; color: #0f172a;">Check-ins Closed</h2>
                <p>${reason}</p>
            </div>
        `;

        if (banner) {
            banner.style.display = "block";
            banner.style.background = "#f8fafc"; banner.style.border = "1px solid #cbd5e1"; banner.style.color = "#475569";
            banner.innerHTML = "<strong>🔒 Module Locked:</strong> Review check-ins are only active during the Faculty Reflection phase.";
        }
        return;
    }

    if (banner) {
        banner.style.display = "block";
        banner.style.background = "#f0fdf4"; banner.style.border = "1px solid #bbf7d0"; banner.style.color = "#166534";
        banner.innerHTML = "<strong>📝 Check-ins Open:</strong> You may now review Action Reports and finalize Check-ins.";
    }

    const [usersRes, coursesRes] = await Promise.all([
        fetch("../../js/mock-data/users.json"),
        fetch("../../js/mock-data/courses.json")
    ]);
    const allUsers = await usersRes.json();
    const allCourses = await coursesRes.json();

    // CYCLE FIX: Filter all records by the current active cycle
    const allSubmissions = get("submittedFeedback") || [];
    const allReflections = get("selfReflection") || [];
    const allActionReports = get("actionReports") || [];

    const submissions = allSubmissions.filter(f => f.cycleId === activeCycleId);
    const reflections = allReflections.filter(r => r.cycleId === activeCycleId);
    const actionReports = allActionReports.filter(a => a.cycleId === activeCycleId);

    const myFaculty = allUsers.filter(u => u.role === "faculty" && u.department === user.department);
    listContainer.innerHTML = "";

    const viewDataList = [];

    myFaculty.forEach(faculty => {
        const facultyCourses = allCourses.filter(c => c.facultyId === faculty.id);

        facultyCourses.forEach(course => {
            const courseFeedback = submissions.filter(f => f.course === course.id);
            let avgScore = 0;
            if (courseFeedback.length > 0) {
                let sumAverages = 0;
                courseFeedback.forEach(f => {
                    let metricSum = 0, metricCount = 0;
                    if (f.ratings) {
                        Object.values(f.ratings).forEach(val => {
                            if (typeof val === 'number') { metricSum += val; metricCount++; }
                        });
                    }
                    sumAverages += (metricCount > 0 ? (metricSum / metricCount) : 0);
                });
                avgScore = sumAverages / courseFeedback.length;
            }

            const reflection = reflections.find(r => r.courseId === course.id && r.facultyId === faculty.id);
            const actionReport = actionReports.find(a => a.courseId === course.id && a.facultyId === faculty.id);

            let status = "PENDING";
            let statusClass = "neutral";
            let subText = "Awaiting Faculty Draft";

            if (actionReport) {
                if (actionReport.status === "FINALIZED") {
                    status = "FINALIZED";
                    statusClass = "primary";
                    subText = "Check-in Complete";
                } else if (actionReport.status === "REVISION_REQUESTED") {
                    status = "REVISION PENDING";
                    statusClass = "warning";
                    subText = "Waiting on Faculty";
                } else {
                    status = "SUBMITTED";
                    statusClass = "success";
                    subText = "Action Report Ready";
                }
            } else if (reflection && avgScore < 3.5 && avgScore > 0) {
                status = "URGENT";
                statusClass = "danger";
                subText = "Gap Detected";
            }

            viewDataList.push({ faculty, course, avgScore, status, statusClass, subText, actionReport });
        });
    });

    viewDataList.sort((a, b) => {
        const priority = { "URGENT": 1, "SUBMITTED": 2, "REVISION PENDING": 3, "PENDING": 4, "FINALIZED": 5 };
        return priority[a.status] - priority[b.status];
    });

    viewDataList.forEach((data) => {
        const item = document.createElement("div");
        item.className = "checkin-item";
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="color: #0f172a; font-size: 14px;">${data.faculty.name}</strong>
                <span class="badge ${data.statusClass}" style="font-size: 10px;">${data.status}</span>
            </div>
            <div style="color: #64748b; font-size: 12px; margin-bottom: 8px;">${data.course.id}: ${data.course.name}</div>
            <div style="font-size: 12px; font-weight: 500; color: ${data.statusClass === 'danger' ? '#dc2626' : (data.statusClass === 'success' ? '#16a34a' : (data.statusClass === 'warning' ? '#d97706' : '#64748b'))}">
                ${data.subText}
            </div>
        `;

        item.onclick = () => {
            document.querySelectorAll(".checkin-item").forEach(el => el.classList.remove("active"));
            item.classList.add("active");
            openDetailView(data);
        };
        listContainer.appendChild(item);
    });

    window.finalizeCheckin = finalizeCheckin;
    window.requestRevision = requestRevision;
}

function openDetailView(data) {
    document.getElementById("emptyDetail").style.display = "none";
    document.getElementById("checkinDetail").style.display = "flex";

    currentActiveFacultyId = data.faculty.id;
    currentActiveCourseId = data.course.id;

    document.getElementById("detailName").innerText = data.faculty.name;
    document.getElementById("detailMeta").innerText = `Professor • ${data.faculty.department}`;
    document.getElementById("detailScore").innerText = data.avgScore > 0 ? data.avgScore.toFixed(1) + "/5.0" : "N/A";
    document.getElementById("detailCourse").innerText = data.course.id;
    document.getElementById("detailStatusBadge").innerText = data.status;
    document.getElementById("detailStatusBadge").className = `badge ${data.statusClass}`;

    const rootCauseEl = document.getElementById("detailRootCause");
    const strategiesEl = document.getElementById("detailStrategies");
    const notesEl = document.getElementById("hodNotes");
    const outcomesEl = document.getElementById("hodOutcomes");
    const actionBar = document.getElementById("hodActionBar");

    if (data.actionReport) {
        rootCauseEl.innerText = data.actionReport.rootCause || "No root cause provided.";
        const strategies = (data.actionReport.plannedStrategies || "No strategies provided.").split('\n').filter(s => s.trim() !== '');
        strategiesEl.innerHTML = strategies.map(s => `<div class="snippet-item">${s}</div>`).join('');

        notesEl.value = data.actionReport.hodNotes || "";
        outcomesEl.value = data.actionReport.hodOutcomes || "";
    } else {
        rootCauseEl.innerText = "Waiting for Faculty to submit Action Report.";
        strategiesEl.innerHTML = `<p style="color: #94a3b8; font-style: italic;">No strategies submitted yet.</p>`;
        notesEl.value = "";
        outcomesEl.value = "";
    }

    // STATE LOGIC
    if (data.status === "FINALIZED") {
        notesEl.disabled = true;
        outcomesEl.disabled = true;
        notesEl.style.backgroundColor = "#f8fafc";
        outcomesEl.style.backgroundColor = "#f8fafc";
        if (actionBar) {
            actionBar.style.display = "flex";
            actionBar.innerHTML = `
                <div style="flex: 1; display: flex; align-items: center;">
                    <span style="color: #16a34a; font-size: 14px; font-weight: 600;">✅ Check-in Finalized</span>
                </div>
            `;
        }
    } else if (data.actionReport && data.actionReport.status === "REVISION_REQUESTED") {
        notesEl.disabled = true;
        outcomesEl.disabled = true;
        notesEl.style.backgroundColor = "#f8fafc";
        outcomesEl.style.backgroundColor = "#f8fafc";
        if (actionBar) {
            actionBar.style.display = "flex";
            actionBar.innerHTML = `
                <div style="flex: 1; display: flex; align-items: center;">
                    <span style="color: #d97706; font-size: 14px; font-weight: 600;">⏳ Waiting for Faculty to Resubmit</span>
                </div>
                <button class="btn-outline" disabled style="opacity: 0.5; cursor: not-allowed;">Request Revision</button>
                <button class="btn-primary" disabled style="opacity: 0.5; cursor: not-allowed; background: #1e3a8a;">Finalize Check-in</button>
            `;
        }
    } else if (!data.actionReport) {
        notesEl.disabled = true;
        outcomesEl.disabled = true;
        notesEl.style.backgroundColor = "#f8fafc";
        outcomesEl.style.backgroundColor = "#f8fafc";
        if (actionBar) {
            actionBar.style.display = "flex";
            actionBar.innerHTML = `
                <div style="flex: 1; display: flex; align-items: center;">
                    <span style="color: #dc2626; font-size: 14px; font-weight: 600;">⚠️ Action Report not arrived yet</span>
                </div>
                <button class="btn-outline" disabled style="opacity: 0.5; cursor: not-allowed;">Request Revision</button>
                <button class="btn-primary" disabled style="opacity: 0.5; cursor: not-allowed; background: #1e3a8a;">Finalize Check-in</button>
            `;
        }
    } else {
        notesEl.disabled = false;
        outcomesEl.disabled = false;
        notesEl.style.backgroundColor = "#fff";
        outcomesEl.style.backgroundColor = "#fff";
        if (actionBar) {
            actionBar.style.display = "flex";
            actionBar.innerHTML = `
                <button class="btn-outline" onclick="requestRevision()">Request Revision</button>
                <button class="btn-primary" onclick="finalizeCheckin()" style="background: #1e3a8a;">Finalize Check-in</button>
            `;
        }
    }
}

function processCheckinAction(newStatus) {
    if (!currentActiveFacultyId || !currentActiveCourseId) return;

    const notes = document.getElementById("hodNotes").value.trim();
    const outcomes = document.getElementById("hodOutcomes").value.trim();

    if (!notes || !outcomes) {
        alert("Please provide Meeting Notes and Agreed Outcomes.");
        return;
    }

    const actionReports = get("actionReports") || [];
    const cycleState = get("systemCycleState") || { id: "SETUP" };

    // Make sure we update the specific report for THIS cycle
    const reportIndex = actionReports.findIndex(a => a.facultyId === currentActiveFacultyId && a.courseId === currentActiveCourseId && a.cycleId === cycleState.id);

    if (reportIndex >= 0) {
        actionReports[reportIndex].hodNotes = notes;
        actionReports[reportIndex].hodOutcomes = outcomes;
        actionReports[reportIndex].status = newStatus;
        set("actionReports", actionReports);

        renderReviewCheckins();
        document.getElementById("checkinDetail").style.display = "none";
        document.getElementById("emptyDetail").style.display = "flex";
    } else {
        alert("Cannot review. The faculty hasn't submitted an Action Report yet.");
    }
}

function finalizeCheckin() { processCheckinAction("FINALIZED"); }
function requestRevision() { processCheckinAction("REVISION_REQUESTED"); }
