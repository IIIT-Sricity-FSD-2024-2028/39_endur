import { get, set, remove } from "../core/storage.js";
import { getSession } from "../core/session.js";
import { createRating } from "../components/rating.js";

const ratings = {};

export function initSelfReflection() {
    // 1. Initialize rating components for the 4 updated metrics
    createRating("clarityRating", "clarity", handleRatingChange);
    createRating("structureRating", "structure", handleRatingChange);
    createRating("engagementRating", "engagement", handleRatingChange);
    createRating("difficultyRating", "difficulty", handleRatingChange);

    // 2. Load existing draft if any
    loadDraft();

    // 3. Bind text area input to save draft automatically
    const textArea = document.getElementById("reflectionText");
    if (textArea) {
        textArea.addEventListener("input", saveDraft);
    }

    // 4. Expose submit function globally
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
    // 1. Validation (checking for 4 metrics now)
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
    let stored = get("selfReflection") || [];

    const activeCourse = "CS101"; 
    const activeCycle = "CYCLE_1";

    // 2. Construct the record with the 4 matched metrics
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

    // 3. Save to Mock DB
    stored.push(newReflection);
    set("selfReflection", stored);

    // 4. Clear the draft
    let drafts = get("selfReflectionDraft") || {};
    delete drafts[user.id];
    set("selfReflectionDraft", drafts);

    window.location.href = "gap-analysis.html";
}
