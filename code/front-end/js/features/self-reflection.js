import { get, set } from "../core/storage.js";
import { getSession } from "../core/session.js";
import { createRating } from "../components/rating.js";

const ratings = {};
let activeParamsForDept = [];

export function initSelfReflection() {
    const user = getSession();
    if (!user) return;

    // 1. Get the source of truth: Active Parameters finalized by HOD/Dean
    const allActiveParams = get("activeParameters") || {};
    activeParamsForDept = allActiveParams[user.department] || [];

    // Fallback logic if no parameters are found for the department
    if (activeParamsForDept.length === 0) {
        console.warn("No active parameters found for department. Using defaults.");
        activeParamsForDept = [
            { id: "clarity", name: "Clarity of Explanation", desc: "Effectiveness of teaching methods." },
            { id: "structure", name: "Structure of Course", desc: "Organization of materials." },
            { id: "engagement", name: "Student Engagement", desc: "Fostering an interactive environment." },
            { id: "difficulty", name: "Difficulty Level", desc: "Appropriateness of the coursework." }
        ];
    }

    const container = document.getElementById("dynamicQuestionsContainer");
    if (container) {
        container.innerHTML = ""; // Clear loader

        activeParamsForDept.forEach(p => {
            const card = document.createElement("div");
            card.className = "question-card";
            card.innerHTML = `
                <h4>${p.name}</h4>
                <p>${p.desc}</p>
                <div class="rating" data-field="${p.id}" id="${p.id}Rating"></div>
            `;
            container.appendChild(card);

            // Initialize rating component for this dynamic ID
            createRating(`${p.id}Rating`, p.id, handleRatingChange);
        });
    }

    loadDraft();

    const textArea = document.getElementById("reflectionText");
    if (textArea) {
        textArea.addEventListener("input", saveDraft);
    }
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

    // Set star visual states
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

import { logAction } from "../core/audit.js";

export function submitSelfReflection() {
    // Validate that ALL dynamic parameters have been rated
    if (Object.keys(ratings).length < activeParamsForDept.length) {
        alert(`Please complete all ${activeParamsForDept.length} quantitative ratings before submitting.`);
        return;
    }

    const textValue = document.getElementById("reflectionText").value.trim();
    if (!textValue) {
        alert("Please provide qualitative feedback in the text area.");
        return;
    }

    const user = getSession();
    const activeCourse = localStorage.getItem("activeFacultyCourse");
    const cycleState = get("systemCycleState") || { id: "CYCLE_ERROR" };

    let stored = get("selfReflection") || [];

    // Map ratings specifically to the IDs of the active parameters
    const expectedRatings = {};
    activeParamsForDept.forEach(p => {
        expectedRatings[p.id] = ratings[p.id];
    });

    const newReflection = {
        reflectionId: "REFL_" + new Date().getTime(),
        facultyId: user.id,
        courseId: activeCourse,
        cycleId: cycleState.id,
        expectedRatings: expectedRatings,
        reflectionText: textValue,
        submissionDate: new Date().toISOString()
    };

    stored.push(newReflection);
    set("selfReflection", stored);

    // Clear draft
    let drafts = get("selfReflectionDraft") || {};
    delete drafts[user.id];
    set("selfReflectionDraft", drafts);

    logAction("CREATE", "Reflection", `Submitted self-reflection for course ${activeCourse}`);
    window.location.href = "gap-analysis.html";
}
