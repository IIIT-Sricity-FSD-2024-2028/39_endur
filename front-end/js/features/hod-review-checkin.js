import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";

let currentActiveFacultyId = null;
let currentActiveCourseId = null;

export async function renderReviewCheckins() {
    const user = getSession();
    if (!user) return;

    const [usersRes, coursesRes] = await Promise.all([
        fetch("../../js/mock-data/users.json"),
        fetch("../../js/mock-data/courses.json")
    ]);
    const allUsers = await usersRes.json();
    const allCourses = await coursesRes.json();
    
    const submissions = get("submittedFeedback") || [];
    const reflections = get("selfReflection") || [];
    const actionReports = get("actionReports") || [];

    const myFaculty = allUsers.filter(u => u.role === "faculty" && u.department === user.department);
    const listContainer = document.getElementById("checkinList");
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
                        if (typeof f.ratings.clarity === 'number') { metricSum += f.ratings.clarity; metricCount++; }
                        if (typeof f.ratings.structure === 'number') { metricSum += f.ratings.structure; metricCount++; }
                        if (typeof f.ratings.engagement === 'number') { metricSum += f.ratings.engagement; metricCount++; }
                        if (typeof f.ratings.difficulty === 'number') { metricSum += f.ratings.difficulty; metricCount++; }
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
    
    // Load Action Report Data if it exists
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

    // ==========================================
    // DYNAMIC STATE MANAGEMENT (Locked vs Waiting vs Disabled vs Active)
    // ==========================================
    if (data.status === "FINALIZED") {
        // STATE 1: Fully Locked (History View)
        notesEl.disabled = true;
        outcomesEl.disabled = true;
        notesEl.style.backgroundColor = "#f8fafc";
        outcomesEl.style.backgroundColor = "#f8fafc";
        if (actionBar) actionBar.style.display = "none";

    } else if (data.actionReport && data.actionReport.status === "REVISION_REQUESTED") {
        // STATE 2: Revision Pending (Disabled + Waiting Warning)
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
        // STATE 3: Pending Arrival (Disabled + Warning)
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
        // STATE 4: Ready for Review (Active)
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

// SHARED LOGIC for HOD Actions
function processCheckinAction(newStatus) {
    if (!currentActiveFacultyId || !currentActiveCourseId) return;

    const notes = document.getElementById("hodNotes").value.trim();
    const outcomes = document.getElementById("hodOutcomes").value.trim();

    if (!notes || !outcomes) {
        alert("Please provide Meeting Notes and Agreed Outcomes.");
        return;
    }

    const actionReports = get("actionReports") || [];
    const reportIndex = actionReports.findIndex(a => a.facultyId === currentActiveFacultyId && a.courseId === currentActiveCourseId);

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
