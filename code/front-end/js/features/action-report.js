import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";

export function initActionReport() {
    const user = getSession();
    if (!user) return;

    const activeCourseId = localStorage.getItem("activeFacultyCourse");
    if (!activeCourseId) {
        // Show the inline empty state rather than redirecting
        const noState = document.getElementById("noCourseState");
        const form = document.getElementById("actionReportForm");
        if (noState) noState.style.display = "block";
        if (form) form.style.display = "none";
        return;
    }

    document.getElementById("courseIdLabel").innerText = activeCourseId;

    const actionReports = get("actionReports") || [];
    const cycleState = get("systemCycleState") || { id: "SETUP", phase: "PREPARATION" };
    const activeCycleId = cycleState.id;

    // CYCLE FIX: Look specifically for a report from THIS cycle
    const existingReport = actionReports.find(r => r.courseId === activeCourseId && r.facultyId === user.id && r.cycleId === activeCycleId);

    // SECURITY CHECK
    const reflections = get("selfReflection") || [];
    const hasReflection = reflections.find(r => r.courseId === activeCourseId && r.facultyId === user.id && r.cycleId === activeCycleId);

    if (!existingReport) {
        if (cycleState.phase === "COMPLETED") {
            alert("Access Denied: The evaluation cycle has been closed and archived.");
            window.location.href = "reports.html";
            return;
        }
        if (!hasReflection) {
            alert("Access Denied: You must complete your Self-Reflection and view the Gap Analysis before creating an Action Report.");
            window.location.href = "reports.html";
            return;
        }
    }

    const form = document.getElementById("actionReportForm");
    const rootCauseInput = document.getElementById("rootCause");
    const strategiesInput = document.getElementById("plannedStrategies");
    const timelineInput = document.getElementById("timeline");
    const submitBtn = form.querySelector("button[type='submit']");

    if (existingReport) {
        rootCauseInput.value = existingReport.rootCause;
        strategiesInput.value = existingReport.plannedStrategies;
        timelineInput.value = existingReport.timeline;

        if (existingReport.status === "REVISION_REQUESTED") {
            document.getElementById("revisionBanner").style.display = "block";
            document.getElementById("revHodNotes").innerText = existingReport.hodNotes;
            document.getElementById("revHodOutcomes").innerText = existingReport.hodOutcomes;
            submitBtn.innerText = "Resubmit Action Report";

        } else if (existingReport.status === "FINALIZED") {
            document.getElementById("finalizedBanner").style.display = "block";
            document.getElementById("finHodNotes").innerText = existingReport.hodNotes;
            document.getElementById("finHodOutcomes").innerText = existingReport.hodOutcomes;

            rootCauseInput.disabled = true;
            strategiesInput.disabled = true;
            timelineInput.disabled = true;
            submitBtn.style.display = "none";

        } else {
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

        if (existingReport && existingReport.status === "REVISION_REQUESTED") {
            if (
                rootCauseInput.value.trim() === existingReport.rootCause.trim() &&
                strategiesInput.value.trim() === existingReport.plannedStrategies.trim() &&
                timelineInput.value.trim() === existingReport.timeline.trim()
            ) {
                alert("⚠️ Action Required: You must make changes to your Action Report before resubmitting.");
                return;
            }
        }

        // CYCLE FIX: Attach activeCycleId
        const updatedReport = {
            facultyId: user.id,
            courseId: activeCourseId,
            cycleId: activeCycleId,
            rootCause: rootCauseInput.value,
            plannedStrategies: strategiesInput.value,
            timeline: timelineInput.value,
            status: "SUBMITTED",
            hodNotes: existingReport ? existingReport.hodNotes : "",
            hodOutcomes: existingReport ? existingReport.hodOutcomes : ""
        };

        if (existingReport) {
            const index = actionReports.findIndex(r => r.courseId === activeCourseId && r.facultyId === user.id && r.cycleId === activeCycleId);
            actionReports[index] = updatedReport;
        } else {
            actionReports.push(updatedReport);
        }

        set("actionReports", actionReports);
        window.location.href = "action-report-success.html";
    };
}
