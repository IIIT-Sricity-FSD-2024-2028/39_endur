/* =========================
GLOBAL STATE
========================= */
const ratings = {};
window.ratings = ratings;

/* =========================
STAR CLICK
========================= */
window.setRating = function (field, value) {
    ratings[field] = value;

    const stars = document.querySelectorAll(`[onclick*="${field}"]`);
    stars.forEach((star, index) => {
        star.classList.toggle("active", index < value);
    });

    saveDraft();
};

/* =========================
SAVE DRAFT
========================= */
function saveDraft() {
    const course = localStorage.getItem("activeCourse");
    let drafts = JSON.parse(localStorage.getItem("feedbackDraft")) || {};
    const user = JSON.parse(localStorage.getItem("endurSession"));

    if (!drafts[user.id]) {
        drafts[user.id] = {};
    }

    drafts[user.id][course] = {
        ratings,
        comment: document.getElementById("commentBox").value
    };

    localStorage.setItem("feedbackDraft", JSON.stringify(drafts));
}

/* =========================
LOAD DRAFT
========================= */
function loadDraft() {
    const course = localStorage.getItem("activeCourse");
    let drafts = JSON.parse(localStorage.getItem("feedbackDraft")) || {};
    const user = JSON.parse(localStorage.getItem("endurSession"));

    if (!drafts[user.id] || !drafts[user.id][course]) return;

    const saved = drafts[user.id][course];
    Object.assign(ratings, saved.ratings || {});
    document.getElementById("commentBox").value = saved.comment || "";

    Object.entries(ratings).forEach(([field, value]) => {
        const stars = document.querySelectorAll(`[onclick*="${field}"]`);
        stars.forEach((star, index) => {
            star.classList.toggle("active", index < value);
        });
    });
}
loadDraft();

/* =========================
SUBMIT
========================= */
window.submitFeedback = async function () {
    if (Object.keys(ratings).length < 4) {
        alert("Please answer all 4 questions before submitting.");
        return;
    }

    const courseId = localStorage.getItem("activeCourse");
    const user = JSON.parse(localStorage.getItem("endurSession"));
    
    // 1. Fetch the course list to find out WHO the professor is for this specific class
    let assignedFacultyId = "SYSTEM"; // Fallback for things like reviewOfReviews
    try {
        const res = await fetch("../../js/mock-data/courses.json");
        const courses = await res.json();
        const activeCourseData = courses.find(c => c.id === courseId);
        if (activeCourseData && activeCourseData.facultyId) {
            assignedFacultyId = activeCourseData.facultyId;
        }
    } catch (e) {
        console.error("Failed to fetch faculty ID", e);
    }

    // 2. Determine active feedback cycle
    const cycles = JSON.parse(localStorage.getItem("feedbackCycles")) || [];
    const activeCycle = cycles.find(c => c.status === "active") || { cycleId: "CYCLE_W4" };

    // 3. Save the feedback
    let submitted = JSON.parse(localStorage.getItem("submittedFeedback")) || [];

    submitted.push({
        responseId: "RESP_" + new Date().getTime(),
        userId: user.id,
        course: courseId,
        facultyId: assignedFacultyId, // CRITICAL FIX: Now the faculty dashboard will see this!
        cycleId: activeCycle.cycleId, 
        ratings,
        comment: document.getElementById("commentBox").value,
        date: new Date().toISOString(),
        status: "processed",
        isValid: true // Required for the Compliance Audit later
    });

    localStorage.setItem("submittedFeedback", JSON.stringify(submitted));

    // 4. Remove draft
    let drafts = JSON.parse(localStorage.getItem("feedbackDraft")) || {};
    if (drafts[user.id]) {
        delete drafts[user.id][courseId];
    }
    localStorage.setItem("feedbackDraft", JSON.stringify(drafts));

    window.location.href = "feedback-success.html";
};

/* =========================
CLOSE BUTTON & LISTENERS
========================= */
window.goBack = function () {
    window.history.back();
};

const commentBox = document.getElementById("commentBox");
if (commentBox) {
    commentBox.addEventListener("input", saveDraft);
}
