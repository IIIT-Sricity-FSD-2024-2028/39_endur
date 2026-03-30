import { get, set, remove } from "../core/storage.js";
import { getSession } from "../core/session.js";
import { createRating } from "../components/rating.js";

const ratings = {};

export function initSelfReflection() {
    createRating("clarityRating", "clarity", handleRatingChange);
    createRating("structureRating", "structure", handleRatingChange);
    createRating("engagementRating", "engagement", handleRatingChange);
    createRating("difficultyRating", "difficulty", handleRatingChange);

    loadDraft();

    const textArea = document.getElementById("reflectionText");
    if (textArea) {
        textArea.addEventListener("input", saveDraft);
    }

    window.submitSelfReflection = submitSelfReflection;
}

function handleRatingChange(field, value) {
    ratings[field] = value;
    saveDraft();
}

function saveDraft() {
    const user = getSession();
    let drafts = get("selfReflectionDraft") || {};

    drafts[user.id] = {
        ratings: ratings,
        text: document.getElementById("reflectionText").value
    };

    set("selfReflectionDraft", drafts);
}

function loadDraft() {
    const user = getSession();
    let drafts = get("selfReflectionDraft") || {};

    if (!drafts[user.id]) return;

    Object.assign(ratings, drafts[user.id].ratings);
    document.getElementById("reflectionText").value = drafts[user.id].text || "";

    Object.entries(ratings).forEach(([field, value]) => {
        const container = document.getElementById(field + "Rating");
        if (container) {
            const stars = container.querySelectorAll("span");
            stars.forEach((s, index) => {
                s.classList.toggle("active", index < value);
            });
        }
    });
}

function submitSelfReflection() {
    if (Object.keys(ratings).length < 4) {
        alert("Please complete all 4 quantitative ratings before submitting.");
        return;
    }

    const textValue = document.getElementById("reflectionText").value.trim();
    if (!textValue) {
        alert("Please provide qualitative feedback in the text area.");
        return;
    }

    const user = getSession();
    
    // READ THE DYNAMIC COURSE
    const activeCourse = localStorage.getItem("activeFacultyCourse");
    if (!activeCourse) {
        alert("Error: No active course selected. Returning to dashboard.");
        window.location.href = "reports.html";
        return;
    }

    const cycles = get("feedbackCycles") || [];
    const activeCycleObj = cycles.find(c => c.status === "active") || { cycleId: "CYCLE_W4" };
    const activeCycle = activeCycleObj.cycleId;

    let stored = get("selfReflection") || [];

    // Defensive check: Prevent double submission
    const alreadySubmitted = stored.find(r => r.courseId === activeCourse && r.facultyId === user.id && r.cycleId === activeCycle);
    if (alreadySubmitted) {
        alert(`Self-reflection already submitted for ${activeCourse}. Routing to Gap Analysis.`);
        window.location.href = "gap-analysis.html";
        return;
    }

    const newReflection = {
        reflectionId: "REFL_" + new Date().getTime(),
        facultyId: user.id,
        courseId: activeCourse,
        cycleId: activeCycle,
        expectedRatings: {
            clarity: ratings.clarity,
            structure: ratings.structure,
            engagement: ratings.engagement,
            difficulty: ratings.difficulty
        },
        reflectionText: textValue,
        submissionDate: new Date().toISOString()
    };

    stored.push(newReflection);
    set("selfReflection", stored);

    let drafts = get("selfReflectionDraft") || {};
    delete drafts[user.id];
    set("selfReflectionDraft", drafts);

    window.location.href = "gap-analysis.html";
}
