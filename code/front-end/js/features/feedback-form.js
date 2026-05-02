import { GET, POST, getSession } from '../core/api.js';

/* =========================
   GLOBAL STATE & INIT
========================= */
let ratings   = {};    // { paramId: score }
let comments  = {};    // { paramId: comment }
let currentQuestions = [];
window.ratings  = ratings;
window.comments = comments;

const DEFAULT_PARAMETERS = [
    { id: 'delivery',   name: 'Course Delivery & Clarity',        description: 'Effectiveness and clarity of teaching.', weight: 25 },
    { id: 'relevance',  name: 'Course Relevance',                  description: 'How relevant the course content is.',    weight: 25 },
    { id: 'support',    name: 'Faculty Support & Availability',    description: 'Support provided outside class.',        weight: 25 },
    { id: 'assessment', name: 'Fairness of Assessments',           description: 'Appropriateness of grading & tasks.',   weight: 25 },
];

document.addEventListener('DOMContentLoaded', async () => {
    // Security: is the feedback window open?
    let cycleState;
    try { cycleState = await GET('/feedback-cycles/state'); } catch { cycleState = null; }

    if (!cycleState || cycleState.phase !== 'STUDENT_FEEDBACK') {
        alert('Access Denied: The feedback submission window is currently closed.');
        window.location.href = 'dashboard.html';
        return;
    }

    const courseId = new URLSearchParams(window.location.search).get('courseId');
    if (!courseId) return;

    let course, resolvedFacultyId = null;
    try {
        course = await GET(`/courses/${courseId}`);
        document.getElementById('courseTitle').innerText = `${course.id} — ${course.name}`;

        let validFacultyIds = course.facultyIds?.slice() || [];
        if (course.facultyId && !validFacultyIds.includes(course.facultyId)) validFacultyIds.push(course.facultyId);

        const selectorContainer = document.getElementById('facultySelectorContainer');
        const selectEl          = document.getElementById('evalFacultySelect');

        if (validFacultyIds.length > 1) {
            selectorContainer.style.display = 'block';
            selectEl.innerHTML = '<option value="">Select Faculty to Evaluate…</option>';
            for (let i = 0; i < validFacultyIds.length; i++) {
                const fid   = validFacultyIds[i];
                const fname = course.facultyNames?.[i] ?? fid;
                selectEl.innerHTML += `<option value="${fid}">${fname}</option>`;
            }
            resolvedFacultyId = null; // set on selection
        } else if (validFacultyIds.length === 1) {
            resolvedFacultyId = validFacultyIds[0];
            selectEl.innerHTML = `<option value="${resolvedFacultyId}" selected>${resolvedFacultyId}</option>`;
        }
    } catch (e) { console.error('Failed to load course:', e); return; }

    // Load eval parameters from the active cycle's departmentParameters
    const targetDept = course?.department || 'Unassigned';
    let params = [];
    try {
        const cycleId   = cycleState.id;
        const fullCycle = await GET(`/feedback-cycles/${cycleId}`);
        const deptParams = fullCycle?.departmentParameters;
        if (deptParams) {
            params = deptParams[targetDept] || deptParams['Unassigned'] || Object.values(deptParams)[0] || [];
        }
    } catch { /* fall through */ }
    if (!params.length) params = DEFAULT_PARAMETERS;

    currentQuestions = params;
    renderQuestions(params);
    loadDraft();
});

/* ========================= RENDER QUESTIONS ========================= */
function renderQuestions(params) {
    const container = document.getElementById('dynamicQuestionsContainer');
    if (!container) return;
    container.innerHTML = '';
    params.forEach(q => {
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
            <textarea
                id="comment_${q.id}"
                placeholder="Optional comment for this parameter…"
                rows="2"
                style="width:100%;margin-top:10px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;resize:vertical;font-family:inherit;"
                oninput="saveComment('${q.id}', this.value)"
            ></textarea>
        `;
        container.appendChild(div);
    });
}

/* ========================= STAR CLICK ========================= */
window.setRating = function(field, value) {
    ratings[field] = value;
    const stars = document.querySelectorAll(`[onclick*="'${field}'"]`);
    stars.forEach((star, index) => star.classList.toggle('active', index < value));
    saveDraft();
};

window.saveComment = function(paramId, text) {
    comments[paramId] = text;
    saveDraft();
};

/* ========================= DRAFT ========================= */
function saveDraft() {
    const course = new URLSearchParams(window.location.search).get('courseId');
    const user   = getSession();
    let drafts   = JSON.parse(localStorage.getItem('feedbackDraft') || '{}');
    if (!drafts[user.id]) drafts[user.id] = {};
    drafts[user.id][course] = { ratings: { ...ratings }, comments: { ...comments } };
    localStorage.setItem('feedbackDraft', JSON.stringify(drafts));
}

function loadDraft() {
    const course = new URLSearchParams(window.location.search).get('courseId');
    const user   = getSession();
    let drafts   = JSON.parse(localStorage.getItem('feedbackDraft') || '{}');
    const saved  = drafts[user?.id]?.[course];
    if (!saved) return;
    Object.assign(ratings,  saved.ratings  || {});
    Object.assign(comments, saved.comments || {});
    Object.entries(ratings).forEach(([field, value]) => {
        const stars = document.querySelectorAll(`[onclick*="'${field}'"]`);
        stars.forEach((star, idx) => star.classList.toggle('active', idx < value));
    });
    Object.entries(comments).forEach(([paramId, text]) => {
        const el = document.getElementById(`comment_${paramId}`);
        if (el) el.value = text;
    });
}

/* ========================= SUBMIT ========================= */
window.submitFeedback = async function() {
    if (Object.keys(ratings).length < currentQuestions.length) {
        alert(`Please rate all ${currentQuestions.length} parameters before submitting.`);
        return;
    }

    const courseId = new URLSearchParams(window.location.search).get('courseId');
    const user     = getSession();
    let cycleState;
    try { cycleState = await GET('/feedback-cycles/state'); } catch { cycleState = null; }

    const selectedFacultyId = document.getElementById('evalFacultySelect')?.value || undefined;

    if (document.getElementById('facultySelectorContainer')?.style.display === 'block' && !selectedFacultyId) {
        alert('Please select the faculty member you are evaluating.');
        return;
    }

    // Build ratings array with per-param comments
    const ratingsArray = currentQuestions.map(q => ({
        paramId: q.id,
        score:   ratings[q.id]   ?? 0,
        comment: comments[q.id]  ?? '',
    }));

    const payload = {
        cycleId:           cycleState?.id || 'FALLBACK_CYCLE',
        courseId,
        studentId:         user.id,
        studentDepartment: user.department || '',
        facultyId:         selectedFacultyId,
        ratings:           ratingsArray,
    };

    try {
        await POST('/feedback-responses', payload, 'student');
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
    // Comments are bound per-field via oninput; no global commentBox needed
});
