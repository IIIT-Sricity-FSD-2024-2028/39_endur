/* =========================
GLOBAL STATE & INIT
========================= */
let ratings = {};
let currentQuestions = [];
window.ratings = ratings;

const DEFAULT_PARAMETERS = [
    { id: "clarity", name: "Clarity of Explanation", desc: "Effectiveness of teaching methods." },
    { id: "structure", name: "Structure of Course", desc: "Organization of materials." },
    { id: "engagement", name: "Student Engagement", desc: "Fostering an interactive environment." },
    { id: "difficulty", name: "Difficulty Level", desc: "Appropriateness of the coursework." }
];

document.addEventListener("DOMContentLoaded", async () => {
    // SECURITY CHECK: Is the cycle actually open?
    const cycleState = JSON.parse(localStorage.getItem("systemCycleState"));
    if (!cycleState || cycleState.phase !== "STUDENT_FEEDBACK") {
        alert("Access Denied: The feedback submission window is currently closed.");
        window.location.href = "dashboard.html";
        return;
    }

    const courseId = localStorage.getItem("activeCourse");
    if (!courseId) return;

    const [coursesRes, usersRes] = await Promise.all([
        fetch("../../js/mock-data/courses.json"),
        fetch("../../js/mock-data/users.json")
    ]);
    const courses = await coursesRes.json();
    const allUsers = await usersRes.json();

    const course = courses.find(c => c.id === courseId);
    document.getElementById("courseTitle").innerText = `${course.id} — ${course.name}`;

    let targetDept = "System"; 
    if (course.facultyId) {
        const faculty = allUsers.find(u => u.id === course.facultyId);
        if (faculty) targetDept = faculty.department;
    }

    const activeParams = JSON.parse(localStorage.getItem("activeParameters")) || {};
    currentQuestions = activeParams[targetDept];
    
    if (!currentQuestions || currentQuestions.length === 0) {
        currentQuestions = DEFAULT_PARAMETERS;
    }

    const container = document.getElementById("dynamicQuestionsContainer");
    container.innerHTML = "";

    currentQuestions.forEach(q => {
        const div = document.createElement("div");
        div.className = "question-card";
        div.innerHTML = `
            <h3>${q.name}</h3>
            <p style="font-size: 12px; color: #64748b; margin-bottom: 8px;">${q.desc || ''}</p>
            <div class="rating">
                <span onclick="setRating('${q.id}', 1)">★</span>
                <span onclick="setRating('${q.id}', 2)">★</span>
                <span onclick="setRating('${q.id}', 3)">★</span>
                <span onclick="setRating('${q.id}', 4)">★</span>
                <span onclick="setRating('${q.id}', 5)">★</span>
            </div>
        `;
        container.appendChild(div);
    });

    loadDraft();
});

/* =========================
STAR CLICK
========================= */
window.setRating = function (field, value) {
    ratings[field] = value;
    const stars = document.querySelectorAll(`[onclick*="'${field}'"]`);
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

    if (!drafts[user.id]) drafts[user.id] = {};
    drafts[user.id][course] = { ratings, comment: document.getElementById("commentBox").value };
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
    
    const commentBox = document.getElementById("commentBox");
    if(commentBox) commentBox.value = saved.comment || "";

    Object.entries(ratings).forEach(([field, value]) => {
        const stars = document.querySelectorAll(`[onclick*="'${field}'"]`);
        stars.forEach((star, index) => {
            star.classList.toggle("active", index < value);
        });
    });
}

/* =========================
SUBMIT
========================= */
window.submitFeedback = async function () {
    if (Object.keys(ratings).length < currentQuestions.length) {
        alert(`Please answer all ${currentQuestions.length} questions before submitting.`);
        return;
    }

    const courseId = localStorage.getItem("activeCourse");
    const user = JSON.parse(localStorage.getItem("endurSession"));
    
    let assignedFacultyId = "SYSTEM";
    try {
        const res = await fetch("../../js/mock-data/courses.json");
        const courses = await res.json();
        const activeCourseData = courses.find(c => c.id === courseId);
        if (activeCourseData && activeCourseData.facultyId) {
            assignedFacultyId = activeCourseData.facultyId;
        }
    } catch (e) { console.error(e); }

    const cycleState = JSON.parse(localStorage.getItem("systemCycleState"));

    let submitted = JSON.parse(localStorage.getItem("submittedFeedback")) || [];

    submitted.push({
        responseId: "RESP_" + new Date().getTime(),
        userId: user.id,
        course: courseId,
        facultyId: assignedFacultyId,
        cycleId: cycleState ? cycleState.id : "FALLBACK_CYCLE", 
        ratings, 
        comment: document.getElementById("commentBox").value,
        date: new Date().toISOString(),
        status: "processed",
        isValid: true
    });

    localStorage.setItem("submittedFeedback", JSON.stringify(submitted));

    let drafts = JSON.parse(localStorage.getItem("feedbackDraft")) || {};
    if (drafts[user.id]) delete drafts[user.id][courseId];
    localStorage.setItem("feedbackDraft", JSON.stringify(drafts));

    window.location.href = "feedback-success.html";
};

document.addEventListener("DOMContentLoaded", () => {
    const commentBox = document.getElementById("commentBox");
    if (commentBox) commentBox.addEventListener("input", saveDraft);
});
