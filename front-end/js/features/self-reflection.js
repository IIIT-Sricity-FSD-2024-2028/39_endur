import { GET, POST } from '../core/api.js';
import { getSession } from '../core/session.js';
import { createRating } from '../components/rating.js';

const ratings = {};
let activeParamsForDept = [];
let activeCycleId = null;

export async function initSelfReflection() {
    const user = getSession();
    if (!user) return;

    // Load active cycle from backend
    try {
        const cycles = await GET('/feedback-cycles');
        const active = cycles.find(c => c.status === 'active');
        activeCycleId = active?.cycleId || null;
    } catch { }

    // Load parameters from backend
    try {
        const params = await GET(`/evaluation-parameters?department=${encodeURIComponent(user.department || '')}`);
        activeParamsForDept = params.length > 0 ? params : _defaults();
    } catch {
        activeParamsForDept = _defaults();
    }

    const container = document.getElementById('dynamicQuestionsContainer');
    if (container) {
        container.innerHTML = '';
        activeParamsForDept.forEach(p => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.innerHTML = `<h4>${p.name}</h4><p>${p.description || p.desc || ''}</p><div class="rating" data-field="${p.id}" id="${p.id}Rating"></div>`;
            container.appendChild(card);
            createRating(`${p.id}Rating`, p.id, handleRatingChange);
        });
    }

    // Load draft from backend if available
    if (activeCycleId) {
        try {
            const activeCourse = new URLSearchParams(window.location.search).get('courseId');
            const refs = await GET(`/faculty-reports/self-reflections?facultyId=${user.id}&courseId=${activeCourse}&cycleId=${activeCycleId}`);
            if (refs[0]) {
                Object.assign(ratings, refs[0].expectedRatings || {});
                const ta = document.getElementById('reflectionText');
                if (ta) ta.value = refs[0].reflectionText || '';
                // Update star visuals
                Object.entries(ratings).forEach(([field, value]) => {
                    const el = document.getElementById(field + 'Rating');
                    if (el) el.querySelectorAll('span').forEach((s, i) => s.classList.toggle('active', i < value));
                });
            }
        } catch { }
    }

    const ta = document.getElementById('reflectionText');
    if (ta) ta.addEventListener('input', () => { }); // no local draft needed
}

function handleRatingChange(field, value) { ratings[field] = value; }

function _defaults() {
    return [
        { id: 'clarity', name: 'Clarity of Explanation', desc: 'Effectiveness of teaching methods.' },
        { id: 'structure', name: 'Structure of Course', desc: 'Organization of materials.' },
        { id: 'engagement', name: 'Student Engagement', desc: 'Fostering an interactive environment.' },
        { id: 'difficulty', name: 'Difficulty Level', desc: 'Appropriateness of the coursework.' }
    ];
}

export async function submitSelfReflection() {
    if (Object.keys(ratings).length < activeParamsForDept.length) {
        alert(`Please complete all ${activeParamsForDept.length} quantitative ratings before submitting.`);
        return;
    }
    const textValue = document.getElementById('reflectionText')?.value.trim();
    if (!textValue) { alert('Please provide qualitative feedback in the text area.'); return; }

    const user = getSession();
    const activeCourse = new URLSearchParams(window.location.search).get('courseId');
    if (!activeCycleId) { alert('No active feedback cycle found.'); return; }

    const expectedRatings = {};
    activeParamsForDept.forEach(p => { expectedRatings[p.id] = ratings[p.id]; });

    try {
        await POST('/faculty-reports/self-reflections', {
            facultyId: user.id,
            courseId: activeCourse,
            cycleId: activeCycleId,
            expectedRatings,
            reflectionText: textValue,
        });
        window.location.href = `gap-analysis.html?courseId=${encodeURIComponent(activeCourse)}`;
    } catch (err) {
        alert('Failed to submit reflection: ' + (err.message || 'Server error'));
    }
}
