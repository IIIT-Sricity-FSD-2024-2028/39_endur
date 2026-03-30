import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";

let currentActiveFacultyId = null;
let currentActiveCourseId = null;

export async function renderReviewCheckins() {
    const user = getSession();
    if (!user) return;

    // 1. Fetch Mock Data & Storage Data
    const [usersRes, coursesRes] = await Promise.all([
        fetch("../../js/mock-data/users.json"),
        fetch("../../js/mock-data/courses.json")
    ]);
    const allUsers = await usersRes.json();
    const allCourses = await coursesRes.json();
    
    const submissions = get("submittedFeedback") || [];
    const reflections = get("selfReflection") || [];
    const actionReports = get("actionReports") || [];
    const hodCheckins = get("hodCheckins") || []; // New storage for HOD notes

    // 2. Filter Faculty to HOD's Department
    const myFaculty = allUsers.filter(u => u.role === "faculty" && u.department === user.department);
    const listContainer = document.getElementById("checkinList");
    listContainer.innerHTML = "";

    const viewDataList = [];

    // 3. Compile Data per Faculty & Course
    myFaculty.forEach(faculty => {
        const facultyCourses = allCourses.filter(c => c.facultyId === faculty.id);
        
        facultyCourses.forEach(course => {
            // Find Student Avg
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

            // Check States
            const reflection = reflections.find(r => r.courseId === course.id && r.facultyId === faculty.id);
            const actionReport = actionReports.find(a => a.courseId === course.id && a.facultyId === faculty.id);
            const existingCheckin = hodCheckins.find(h => h.courseId === course.id && h.facultyId === faculty.id);

            let status = "PENDING";
            let statusClass = "neutral";
            let subText = "Awaiting Faculty Draft";

            if (existingCheckin) {
                status = "FINALIZED";
                statusClass = "primary";
                subText = "Check-in Complete";
            } else if (actionReport) {
                status = "SUBMITTED";
                statusClass = "success";
                subText = "Action Report Ready";
            } else if (reflection && avgScore < 3.5 && avgScore > 0) {
                status = "URGENT";
                statusClass = "danger";
                subText = "Gap Detected";
            }

            viewDataList.push({
                faculty, course, avgScore, status, statusClass, subText, actionReport, existingCheckin
            });
        });
    });

    // Sort: Submitted/Urgent first, Pending/Finalized last
    viewDataList.sort((a, b) => {
        const priority = { "URGENT": 1, "SUBMITTED": 2, "PENDING": 3, "FINALIZED": 4 };
        return priority[a.status] - priority[b.status];
    });

    // 4. Render the Left List
    viewDataList.forEach((data, index) => {
        const item = document.createElement("div");
        item.className = "checkin-item";
        item.dataset.facultyId = data.faculty.id;
        item.dataset.courseId = data.course.id;
        
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="color: #0f172a; font-size: 14px;">${data.faculty.name}</strong>
                <span class="badge ${data.statusClass}" style="font-size: 10px;">${data.status}</span>
            </div>
            <div style="color: #64748b; font-size: 12px; margin-bottom: 8px;">${data.course.id}: ${data.course.name}</div>
            <div style="font-size: 12px; font-weight: 500; color: ${data.statusClass === 'danger' ? '#dc2626' : (data.statusClass === 'success' ? '#16a34a' : '#64748b')}">
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

    // Expose Global Functions for Buttons
    window.finalizeCheckin = finalizeCheckin;
    window.requestRevision = () => alert("Revision requested. Faculty will be notified.");
}

// 5. Render the Right Detail View
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

    // Action Report Data
    const rootCauseEl = document.getElementById("detailRootCause");
    const strategiesEl = document.getElementById("detailStrategies");
    
    if (data.actionReport) {
        rootCauseEl.innerText = data.actionReport.rootCause || "No root cause provided.";
        
        // Split strategies into bullet points
        const strategies = (data.actionReport.plannedStrategies || "No strategies provided.").split('\n').filter(s => s.trim() !== '');
        strategiesEl.innerHTML = strategies.map(s => `<div class="snippet-item">${s}</div>`).join('');
    } else {
        rootCauseEl.innerText = "Waiting for Faculty to submit Action Report.";
        strategiesEl.innerHTML = `<p style="color: #94a3b8; font-style: italic;">No strategies submitted yet.</p>`;
    }

    // Load Existing HOD Notes if any
    const notesEl = document.getElementById("hodNotes");
    const outcomesEl = document.getElementById("hodOutcomes");
    
    if (data.existingCheckin) {
        notesEl.value = data.existingCheckin.notes || "";
        outcomesEl.value = data.existingCheckin.outcomes || "";
    } else {
        notesEl.value = "";
        outcomesEl.value = "";
    }
}

// 6. Finalize Action
function finalizeCheckin() {
    if (!currentActiveFacultyId || !currentActiveCourseId) return;

    const notes = document.getElementById("hodNotes").value.trim();
    const outcomes = document.getElementById("hodOutcomes").value.trim();

    if (!notes || !outcomes) {
        alert("Please complete both the Meeting Notes and Agreed Outcomes before finalizing.");
        return;
    }

    const hodCheckins = get("hodCheckins") || [];
    
    // Check if already exists, if so update it, otherwise add new
    const existingIndex = hodCheckins.findIndex(h => h.facultyId === currentActiveFacultyId && h.courseId === currentActiveCourseId);
    
    const checkinData = {
        facultyId: currentActiveFacultyId,
        courseId: currentActiveCourseId,
        notes: notes,
        outcomes: outcomes,
        timestamp: new Date().toISOString(),
        status: "FINALIZED"
    };

    if (existingIndex >= 0) {
        hodCheckins[existingIndex] = checkinData;
    } else {
        hodCheckins.push(checkinData);
    }

    set("hodCheckins", hodCheckins);
    alert("Check-in Finalized successfully!");
    
    // Refresh the view
    renderReviewCheckins();
    document.getElementById("checkinDetail").style.display = "none";
    document.getElementById("emptyDetail").style.display = "flex";
}
