import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";

export function initActionReport() {
    const user = getSession();
    if (!user) return;

    const activeCourseId = localStorage.getItem("activeFacultyCourse");
    if (!activeCourseId) {
        window.location.href = "reports.html";
        return;
    }

    document.getElementById("courseIdLabel").innerText = activeCourseId;

    const actionReports = get("actionReports") || [];
    const existingReport = actionReports.find(r => r.courseId === activeCourseId && r.facultyId === user.id);

    const form = document.getElementById("actionReportForm");
    const rootCauseInput = document.getElementById("rootCause");
    const strategiesInput = document.getElementById("plannedStrategies");
    const timelineInput = document.getElementById("timeline");
    const submitBtn = form.querySelector("button[type='submit']");

    if (existingReport) {
        // Pre-fill data
        rootCauseInput.value = existingReport.rootCause;
        strategiesInput.value = existingReport.plannedStrategies;
        timelineInput.value = existingReport.timeline;

        if (existingReport.status === "REVISION_REQUESTED") {
            // STATE: Revision Needed
            document.getElementById("revisionBanner").style.display = "block";
            document.getElementById("revHodNotes").innerText = existingReport.hodNotes;
            document.getElementById("revHodOutcomes").innerText = existingReport.hodOutcomes;
            submitBtn.innerText = "Resubmit Action Report";
            
        } else if (existingReport.status === "FINALIZED") {
            // STATE: Approved and Locked
            document.getElementById("finalizedBanner").style.display = "block";
            document.getElementById("finHodNotes").innerText = existingReport.hodNotes;
            document.getElementById("finHodOutcomes").innerText = existingReport.hodOutcomes;
            
            rootCauseInput.disabled = true;
            strategiesInput.disabled = true;
            timelineInput.disabled = true;
            submitBtn.style.display = "none";
            
        } else {
            // STATE: Submitted (Pending HOD Review)
            rootCauseInput.disabled = true;
            strategiesInput.disabled = true;
            timelineInput.disabled = true;
            submitBtn.innerText = "Submitted - Pending HOD Review";
            submitBtn.disabled = true;
            submitBtn.className = "btn-outline";
        }
    }

    form.onsubmit = (e) => {
        e.preventDefault();

        // ==========================================
        // SYSTEM CHECK: Prevent Exact Duplicate Resubmission
        // ==========================================
        if (existingReport && existingReport.status === "REVISION_REQUESTED") {
            if (
                rootCauseInput.value.trim() === existingReport.rootCause.trim() &&
                strategiesInput.value.trim() === existingReport.plannedStrategies.trim() &&
                timelineInput.value.trim() === existingReport.timeline.trim()
            ) {
                alert("⚠️ Action Required: You must make changes to your Action Report before resubmitting. The current text is identical to your previous submission.");
                return; // HALT SUBMISSION
            }
        }
        
        const updatedReport = {
            facultyId: user.id,
            courseId: activeCourseId,
            rootCause: rootCauseInput.value,
            plannedStrategies: strategiesInput.value,
            timeline: timelineInput.value,
            status: "SUBMITTED", // Reverts back to submitted on save
            hodNotes: existingReport ? existingReport.hodNotes : "",
            hodOutcomes: existingReport ? existingReport.hodOutcomes : ""
        };

        if (existingReport) {
            const index = actionReports.findIndex(r => r.courseId === activeCourseId && r.facultyId === user.id);
            actionReports[index] = updatedReport;
        } else {
            actionReports.push(updatedReport);
        }

        set("actionReports", actionReports);
        window.location.href = "action-report-success.html";
    };
}
