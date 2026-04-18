import { GET, POST, getSession } from '../core/api.js';

/* =========================
   GLOBAL STATE & INIT
========================= */
let ratings = {};
let currentQuestions = [];
window.ratings = ratings;

const DEFAULT_PARAMETERS = [
    { id: 'clarity', name: 'Clarity of Explanation', description: 'Effectiveness of teaching methods.', weight: 25 },
    { id: 'structure', name: 'Structure of Course', description: 'Organization of materials.', weight: 25 },
    { id: 'engagement', name: 'Student Engagement', description: 'Fostering an interactive environment.', weight: 25 },
    { id: 'difficulty', name: 'Difficulty Level', description: 'Appropriateness of the coursework.', weight: 25 },
];

document.addEventListener('DOMContentLoaded', async () => {
    // SECURITY CHECK: Is the cycle actually open?
    let cycleState;
    try {
        cycleState = await GET('/feedback-cycles/state');
    } catch { cycleState = null; }

    if (!cycleState || cycleState.phase !== 'STUDENT_FEEDBACK') {
        alert('Access Denied: The feedback submission window is currently closed.');
        window.location.href = 'dashboard.html';
        return;
    }

    const courseId = localStorage.getItem('activeCourse');
    if (!courseId) return;

    let course, faculty;
    try {
        course = await GET(`/courses/${courseId}`);
        document.getElementById('courseTitle').innerText = `${course.id} — ${course.name}`;
        if (course.facultyId) faculty = await GET(`/users/${course.facultyId}`).catch(() => null);
    } catch (e) { console.error('Failed to load course:', e); return; }

    // Load evaluation parameters for the faculty's department
    const targetDept = faculty?.department || course?.department || 'System';
    let params = [];
    try {
        params = await GET(`/evaluation-parameters?department=${encodeURIComponent(targetDept)}`);
        if (!params.length) params = DEFAULT_PARAMETERS;
    } catch { params = DEFAULT_PARAMETERS; }

    currentQuestions = params;
    const container = document.getElementById('dynamicQuestionsContainer');
    if (container) {
        container.innerHTML = '';
        currentQuestions.forEach(q => {
            const div = document.createElement('div');
            div.className = 'question-card';
            div.innerHTML = `
                <h3>${q.name}</h3>
                <p style="font-size:12px;color:#64748b;margin-bottom:8px;">${q.description || ''}</p>
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
    }

    loadDraft();
});

/* ========================= STAR CLICK ========================= */
window.setRating = function(field, value) {
    ratings[field] = value;
    const stars = document.querySelectorAll(`[onclick*="'${field}'"]`);
    stars.forEach((star, index) => star.classList.toggle('active', index < value));
    saveDraft();
};

/* ========================= DRAFT ========================= */
function saveDraft() {
    const course = localStorage.getItem('activeCourse');
    let drafts = JSON.parse(localStorage.getItem('feedbackDraft') || '{}');
    const user = getSession();
    if (!drafts[user.id]) drafts[user.id] = {};
    drafts[user.id][course] = { ratings, comment: document.getElementById('commentBox')?.value };
    localStorage.setItem('feedbackDraft', JSON.stringify(drafts));
}

function loadDraft() {
    const course = localStorage.getItem('activeCourse');
    let drafts = JSON.parse(localStorage.getItem('feedbackDraft') || '{}');
    const user = getSession();
    if (!drafts[user?.id] || !drafts[user.id][course]) return;
    const saved = drafts[user.id][course];
    Object.assign(ratings, saved.ratings || {});
    const commentBox = document.getElementById('commentBox');
    if (commentBox) commentBox.value = saved.comment || '';
    Object.entries(ratings).forEach(([field, value]) => {
        const stars = document.querySelectorAll(`[onclick*="'${field}'"]`);
        stars.forEach((star, idx) => star.classList.toggle('active', idx < value));
    });
}

/* ========================= SUBMIT ========================= */
window.submitFeedback = async function() {
    if (Object.keys(ratings).length < currentQuestions.length) {
        alert(`Please answer all ${currentQuestions.length} questions before submitting.`);
        return;
    }

    const courseId = localStorage.getItem('activeCourse');
    const user = getSession();
    let cycleState;
    try { cycleState = await GET('/feedback-cycles/state'); } catch { cycleState = null; }

    const payload = {
        cycleId: cycleState?.id || 'FALLBACK_CYCLE',
        courseId,
        studentId: user.id,
        ratings,
        openEndedComment: document.getElementById('commentBox')?.value || '',
    };

    try {
        await POST('/feedback-responses', payload, 'student');

        // Track locally for dashboard status
        // Removed: API is now the sole source of truth for submissions
        // Clear draft
        let drafts = JSON.parse(localStorage.getItem('feedbackDraft') || '{}');
        if (drafts[user.id]) delete drafts[user.id][courseId];
        localStorage.setItem('feedbackDraft', JSON.stringify(drafts));

        window.location.href = 'feedback-success.html';
    } catch (err) {
        alert('Submission failed: ' + err.message);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const commentBox = document.getElementById('commentBox');
    if (commentBox) commentBox.addEventListener('input', saveDraft);
});
