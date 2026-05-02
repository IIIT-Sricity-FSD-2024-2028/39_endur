/**
 * faculty-self-reflection.js
 * Handles all self-reflection API interactions.
 * Replaces localStorage-based selfReflection storage.
 */
import { GET, POST, getSession } from '../core/api.js';

// ─── API Helpers ──────────────────────────────────────────────────────────────

export async function getMyReflections(cycleId = null) {
    const user = getSession();
    if (!user) return [];
    try {
        const q = cycleId ? `?facultyId=${user.id}&cycleId=${cycleId}` : `?facultyId=${user.id}`;
        return await GET(`/faculty-reports/self-reflections${q}`);
    } catch {
        return [];
    }
}

export async function getReflectionForCourse(courseId, cycleId) {
    const user = getSession();
    if (!user) return null;
    try {
        const list = await GET(`/faculty-reports/self-reflections?facultyId=${user.id}&courseId=${courseId}&cycleId=${cycleId}`);
        return list?.[0] || null;
    } catch {
        return null;
    }
}

export async function submitReflection(payload) {
    // payload: { facultyId, courseId, cycleId, expectedRatings, reflectionText }
    return await POST('/faculty-reports/self-reflections', payload);
}

// ─── Page Init ────────────────────────────────────────────────────────────────

export async function initSelfReflection() {
    const user = getSession();
    if (!user) return;

    const activeCourse = new URLSearchParams(window.location.search).get('courseId');
    if (!activeCourse) {
        const label = document.getElementById('activeCourseLabel');
        if (label) label.textContent = 'No course selected — go back to Reports';
        return;
    }

    // Fetch cycle state
    let cycleState;
    try { cycleState = await GET('/feedback-cycles/state'); }
    catch { cycleState = { id: 'SETUP', phase: 'PREPARATION' }; }
    const activeCycleId = cycleState?.id;
    const activeCycleIdRef = { value: activeCycleId };

    // Get course details
    let courses = [];
    try { courses = await GET('/courses'); } catch {}
    const course = courses.find(c => c.id === activeCourse);
    const label = document.getElementById('activeCourseLabel');
    if (label) label.textContent = course ? `${course.id} — ${course.name}` : activeCourse;

    // Load eval parameters for this faculty's department from the active cycle
    let myParams = [];
    try { 
        myParams = await GET(`/feedback-cycles/${activeCycleId}/parameters?department=${encodeURIComponent(user.department)}`); 
    } catch {}

    // Check for existing reflection
    let existing = null;
    try { existing = await getReflectionForCourse(activeCourse, activeCycleId); } catch {}

    // Render quantitative questions
    const container = document.getElementById('dynamicQuestionsContainer');
    if (!container) return;

    if (!myParams.length) {
        container.innerHTML = `<p style="color:var(--text-muted);font-style:italic;padding:16px 0;">No evaluation parameters configured for your department.</p>`;
        return;
    }

    const ratings = {};
    // Pre-fill existing ratings
    if (existing?.expectedRatings) {
        Object.assign(ratings, existing.expectedRatings);
    }

    container.innerHTML = myParams.map(param => `
        <div class="question-card" id="qcard_${param.id}">
            <h4>${param.name}</h4>
            <p>${param.description || ''} <span style="font-size:0.8rem;color:var(--text-muted)">(Weight: ${param.weight || 0}%)</span></p>
            <div class="rating" id="rating_${param.id}">
                ${[1,2,3,4,5].map(n => `<span data-val="${n}" onclick="setRating('${param.id}', ${n}, ${JSON.stringify(myParams)})">★</span>`).join('')}
            </div>
        </div>
    `).join('');

    // Bind rating function to window
    window.setRating = (paramId, val, params) => {
        ratings[paramId] = val;
        const ratingEl = document.getElementById(`rating_${paramId}`);
        if (ratingEl) {
            Array.from(ratingEl.children).forEach((star, i) => {
                star.classList.toggle('active', i < val);
            });
        }
    };

    // Restore previous selections
    myParams.forEach(p => {
        if (ratings[p.id]) {
            window.setRating(p.id, ratings[p.id], myParams);
        }
    });

    // Pre-fill text
    if (existing?.reflectionText) {
        const textEl = document.getElementById('reflectionText');
        if (textEl) textEl.value = existing.reflectionText;
    }

    // Store references for submit
    window._srContext = { ratings, myParams, activeCycleIdRef, activeCourse, user };
}

export async function submitSelfReflection() {
    const ctx = window._srContext;
    if (!ctx) { alert('Page not initialized.'); return; }

    const { ratings, myParams, activeCycleIdRef, activeCourse, user } = ctx;
    const cycleId = activeCycleIdRef.value;

    const missing = myParams.filter(p => !ratings[p.id]);
    if (missing.length) {
        alert(`Please rate all ${myParams.length} parameters before submitting.`);
        return;
    }

    const reflectionText = document.getElementById('reflectionText')?.value.trim();
    if (!reflectionText) { alert('Please provide qualitative feedback.'); return; }
    if (!cycleId || cycleId === 'SETUP') { alert('No active feedback cycle found.'); return; }

    const expectedRatings = {};
    myParams.forEach(p => { expectedRatings[p.id] = ratings[p.id]; });

    try {
        await submitReflection({
            facultyId: user.id,
            courseId: activeCourse,
            cycleId,
            expectedRatings,
            reflectionText,
        });
        window.location.href = 'gap-analysis.html';
    } catch (err) {
        alert('Failed to submit reflection: ' + (err.message || 'Server error'));
    }
}
