import { get, set } from "../core/storage.js";


export function initActionReport() {

    loadGapSummary();

    loadDraft();

    bindDraft();

}



/* load scores from gap analysis */

function loadGapSummary() {

    const reflections =
        get("selfReflection") || [];


    const user =
        get("endurSession");


    const latest =
        reflections
            .filter(r => r.userId === user.id)
            .pop();


    if (!latest) return;


    /* mock student avg */

    const studentAvg = 74;


    const selfAvg = Math.round(

        Object.values(latest.ratings)
            .reduce((a, b) => a + b, 0)

        / Object.keys(latest.ratings).length

        * 20

    );


    const gap =
        selfAvg - studentAvg;


    document.getElementById(
        "selfScore"
    ).innerText =
        selfAvg;


    document.getElementById(
        "studentScore"
    ).innerText =
        studentAvg;


    document.getElementById(
        "gapScore"
    ).innerText =
        gap;

}



/* draft */

function loadDraft() {

    const drafts =
        get("actionReportDraft") || {};


    const user =
        get("endurSession");


    if (!drafts[user.id]) return;


    document.getElementById(
        "rootCause"
    ).value =
        drafts[user.id].rootCause || "";


    document.getElementById(
        "improvementPlan"
    ).value =
        drafts[user.id].plan || "";

}



function bindDraft() {

    document
        .getElementById("rootCause")
        .addEventListener(
            "input",
            saveDraft
        );


    document
        .getElementById("improvementPlan")
        .addEventListener(
            "input",
            saveDraft
        );

}



function saveDraft() {

    const drafts =
        get("actionReportDraft") || {};


    const user =
        get("endurSession");


    drafts[user.id] = {

        rootCause:
            document.getElementById(
                "rootCause"
            ).value,

        plan:
            document.getElementById(
                "improvementPlan"
            ).value

    };


    set(
        "actionReportDraft",
        drafts
    );

}



/* submit */
/* =========================
   SUBMIT
========================= */

function submitActionReport(){

const stored =
get("actionReports") || [];


const user =
get("endurSession");


stored.push({

userId:user.id,

rootCause:
document.getElementById(
"rootCause"
).value,

plan:
document.getElementById(
"improvementPlan"
).value,

date:new Date().toISOString()

});


set(
"actionReports",
stored
);


/* clear draft after submit */

const drafts =
get("actionReportDraft") || {};

delete drafts[user.id];

set(
"actionReportDraft",
drafts
);


window.location.href =
"action-report-success.html";

}


/* make available to HTML button */

window.submitActionReport =
submitActionReport;
