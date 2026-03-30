import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";

export function initActionReport() {
    loadGapSummary();
    loadDraft();
    bindDraft();
}

/* Dynamically load and calculate scores to match Gap Analysis */
function loadGapSummary() {
    const reflections = get("selfReflection") || [];
    const studentData = get("submittedFeedback") || [];
    const user = getSession();

    if (!user) return;

    // 1. Get the latest reflection for this faculty member
    const latest = reflections
        .filter(r => r.facultyId === user.id) // Fixed schema
        .pop();

    if (!latest) return;

    const activeCourse = latest.courseId;

    // 2. Calculate Student Average for this course
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

    // 3. Calculate Self Reflection Average
    let selfTotal = 0;
    let selfCount = 0;
    const expected = latest.expectedRatings || {};

    Object.values(expected).forEach(val => {
        selfTotal += val;
        selfCount++;
    });

    const selfAvg = selfCount > 0 ? (selfTotal / selfCount) : 0;

    // 4. Calculate absolute gap
    const gap = Math.abs(selfAvg - studentAvg);

    // 5. Output to DOM as percentages
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

    // Validation
    if (!rootCauseVal || !planVal) {
        alert("Please complete both the Root Cause Analysis and the Improvement Plan.");
        return;
    }

    const stored = get("actionReports") || [];
    const user = getSession();
    
    // Get active course from recent reflection
    const reflections = get("selfReflection") || [];
    const latest = reflections.filter(r => r.facultyId === user.id).pop();
    const courseId = latest ? latest.courseId : "Unknown Course";

    // Build the Action Report object matching the DB schema
    stored.push({
        actionId: "ACT_" + new Date().getTime(),
        facultyId: user.id,
        courseId: courseId,
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
