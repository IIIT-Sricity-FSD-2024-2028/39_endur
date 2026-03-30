import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";

export function initActionReport() {
    loadGapSummary();
    
    // Check if we are in View Mode or Edit Mode
    const isReadOnly = checkIfSubmitted();
    
    if (!isReadOnly) {
        loadDraft();
        bindDraft();
    }
}

function checkIfSubmitted() {
    const stored = get("actionReports") || [];
    const user = getSession();
    const activeCourse = localStorage.getItem("activeFacultyCourse");

    if (!user || !activeCourse) return false;

    // Check if an action report exists for this faculty and course
    const existingReport = stored.find(r => r.facultyId === user.id && r.courseId === activeCourse);

    if (existingReport) {
        // Populate the text areas
        document.getElementById("rootCause").value = existingReport.rootCause;
        document.getElementById("improvementPlan").value = existingReport.plannedStrategies;

        // Make text areas Read-Only
        document.getElementById("rootCause").disabled = true;
        document.getElementById("improvementPlan").disabled = true;
        
        // Change styling to look disabled
        document.getElementById("rootCause").style.backgroundColor = "#f5f5f5";
        document.getElementById("improvementPlan").style.backgroundColor = "#f5f5f5";

        // Hide Submit Button
        const submitBtn = document.getElementById("submitArBtn");
        if (submitBtn) submitBtn.style.display = "none";

        // Update Subtitle
        const subtitle = document.querySelector(".subtitle");
        if (subtitle) subtitle.innerText = "Submitted Performance Improvement Plan (Read-Only)";

        return true; // Yes, it is read-only
    }

    return false; // No, proceed as a new form
}

/* Dynamically load and calculate scores to match Gap Analysis */
function loadGapSummary() {
    const reflections = get("selfReflection") || [];
    const studentData = get("submittedFeedback") || [];
    const user = getSession();
    const activeCourse = localStorage.getItem("activeFacultyCourse");

    if (!user || !activeCourse) return;

    // Get reflection for THIS course
    const latest = reflections.find(r => r.facultyId === user.id && r.courseId === activeCourse);
    if (!latest) return;

    // Calculate Student Average
    const courseFeedback = studentData.filter(f => f.course === activeCourse);
    let stTotal = 0;
    let stCount = 0;

    courseFeedback.forEach(f => {
        if (f.ratings) {
            if (typeof f.ratings.clarity === 'number') { stTotal += f.ratings.clarity; stCount++; }
            if (typeof f.ratings.structure === 'number') { stTotal += f.ratings.structure; stCount++; }
            if (typeof f.ratings.engagement === 'number') { stTotal += f.ratings.engagement; stCount++; }
            if (typeof f.ratings.difficulty === 'number') { stTotal += f.ratings.difficulty; stCount++; }
        }
    });

    const studentAvg = stCount > 0 ? (stTotal / stCount) : 0;

    // Calculate Self Reflection Average
    let selfTotal = 0;
    let selfCount = 0;
    const expected = latest.expectedRatings || {};

    Object.values(expected).forEach(val => {
        selfTotal += val;
        selfCount++;
    });

    const selfAvg = selfCount > 0 ? (selfTotal / selfCount) : 0;

    // Calculate absolute gap
    const gap = Math.abs(selfAvg - studentAvg);

    // Output to DOM as percentages
    document.getElementById("selfScore").innerText = (selfAvg * 20).toFixed(0) + "%";
    document.getElementById("studentScore").innerText = (studentAvg * 20).toFixed(0) + "%";
    document.getElementById("gapScore").innerText = (gap * 20).toFixed(0) + "%";
}

/* =========================
   DRAFT LOGIC
========================= */
function loadDraft() {
    const drafts = get("actionReportDraft") || {};
    const user = getSession();
    if (!user || !drafts[user.id]) return;

    document.getElementById("rootCause").value = drafts[user.id].rootCause || "";
    document.getElementById("improvementPlan").value = drafts[user.id].plan || "";
}

function bindDraft() {
    document.getElementById("rootCause").addEventListener("input", saveDraft);
    document.getElementById("improvementPlan").addEventListener("input", saveDraft);
}

function saveDraft() {
    const drafts = get("actionReportDraft") || {};
    const user = getSession();
    if (!user) return;

    drafts[user.id] = {
        rootCause: document.getElementById("rootCause").value,
        plan: document.getElementById("improvementPlan").value
    };
    set("actionReportDraft", drafts);
}

/* =========================
   SUBMIT LOGIC
========================= */
export function submitActionReport() {
    const rootCauseVal = document.getElementById("rootCause").value.trim();
    const planVal = document.getElementById("improvementPlan").value.trim();

    if (!rootCauseVal || !planVal) {
        alert("Please complete both the Root Cause Analysis and the Improvement Plan.");
        return;
    }

    const stored = get("actionReports") || [];
    const user = getSession();
    const activeCourse = localStorage.getItem("activeFacultyCourse");

    if (!activeCourse) {
        alert("System error: No active course selected.");
        return;
    }

    // Double-check to prevent duplicate submissions via console tampering
    const existing = stored.find(r => r.facultyId === user.id && r.courseId === activeCourse);
    if (existing) {
        alert("Action report already submitted for this course.");
        return;
    }

    // Build the Action Report object matching the DB schema
    stored.push({
        actionId: "ACT_" + new Date().getTime(),
        facultyId: user.id,
        courseId: activeCourse,
        rootCause: rootCauseVal,
        plannedStrategies: planVal,
        submissionDate: new Date().toISOString()
    });

    set("actionReports", stored);

    // Clear draft after submit
    const drafts = get("actionReportDraft") || {};
    delete drafts[user.id];
    set("actionReportDraft", drafts);

    // Redirect to success page
    window.location.href = "action-report-success.html";
}
