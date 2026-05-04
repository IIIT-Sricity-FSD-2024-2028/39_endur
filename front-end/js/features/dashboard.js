import { GET, getSession, refreshSession } from '../core/api.js';

async function getMyCourses() {
    try { return await GET('/users/me/courses'); }
    catch { return []; }
}

async function getCycleState() {
    try { return await GET('/feedback-cycles/state'); }
    catch { return { phase: 'COMPLETED' }; }
}

function getStatus(courseId, userId, currentCycleId, allSubmissions) {
    if (allSubmissions.find(f => f.courseId === courseId && f.studentId === userId && f.cycleId === currentCycleId)) return 'completed';
    const drafts = JSON.parse(localStorage.getItem('feedbackDraft') || '{}');
    if (drafts[userId] && drafts[userId][courseId]) return 'progress';
    return 'pending';
}

export async function updateDashboard() {
    const user = await refreshSession();
    if (!user) return;

    let [myCourses, cycleState, allSubmissions] = await Promise.all([
        getMyCourses(),
        getCycleState(),
        GET(`/feedback-responses?studentId=${user.id}`).catch(() => [])
    ]);
    const table = document.getElementById('dashboardTable');
    const currentCycleId = cycleState.id || 'FALLBACK_CYCLE';
    const isFeedbackOpen = cycleState.phase === 'STUDENT_FEEDBACK';

    // Banner
    const banner = document.getElementById('cycleStatusBanner');
    if (banner) {
        banner.style.display = 'block';
        if (!cycleState || cycleState.phase === 'COMPLETED') {
            banner.style.cssText = 'background:#f1f5f9;border:1px solid #cbd5e1;color:#475569;';
            banner.innerHTML = '<strong>ℹ️ Feedback Closed:</strong> There is no active feedback cycle currently running.';
        } else if (cycleState.phase === 'PREPARATION') {
            banner.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;';
            banner.innerHTML = '<strong>⏳ Coming Soon:</strong> A new feedback cycle is being prepared and will open shortly.';
        } else if (cycleState.phase === 'STUDENT_FEEDBACK') {
            banner.style.cssText = 'background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;';
            let deadlineStr = cycleState.studentDeadline ? ` Closes: ${new Date(cycleState.studentDeadline).toLocaleString()}` : '';
            banner.innerHTML = `<strong>✅ Feedback is Open!</strong> Please submit your course evaluations.${deadlineStr}`;
        } else {
            banner.style.cssText = 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;';
            banner.innerHTML = '<strong>🔒 Feedback Closed:</strong> The evaluation window for this cycle has ended.';
        }
    }

    if (table) table.innerHTML = '';
    // Remove the hardcoded reviewOfReviews to align with user expectation of 0 pending when 0 courses enrolled
    // myCourses.push({ id: 'reviewOfReviews', name: 'Platform System Review (Review of Reviews)' });

    myCourses.forEach(course => {
        const status = getStatus(course.id, user.id, currentCycleId, allSubmissions);
        if (!isFeedbackOpen && (status === 'pending' || status === 'progress')) return;

        let actionHtml = '';
        if (status === 'completed') {
            actionHtml = `<button class="btn-small btn-outline" onclick="window.location.href='feedback-history.html'">View</button>`;
        } else if (isFeedbackOpen) {
            actionHtml = `<button class="btn-small btn-primary" onclick="openFeedback('${course.id}')">${statusAction(status)}</button>`;
        } else {
            actionHtml = `<span style="color:var(--text-muted);cursor:not-allowed;font-size:13px;">Locked</span>`;
        }

        if (table) {
            const thumb = course.id === 'reviewOfReviews' ? 'img_bookclub.jpg' : (course.thumbnail || 'img_read.jpg');
            table.innerHTML += `
            <tr data-course="${course.id}">
                <td style="display:flex;align-items:center;gap:12px;">
                    <img src="../../assets/images/${thumb}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">
                    <div>
                        <strong>${course.name}</strong><br>
                        <span class="sub-text">${course.id}</span>
                    </div>
                </td>
                <td><span class="badge ${status}">${statusLabel(status)}</span></td>
                <td>${actionHtml}</td>
            </tr>`;
        }
    });

    if (table && table.innerHTML === '') {
        const emptyEl = document.getElementById('emptyDashboard');
        if (emptyEl) emptyEl.style.display = 'block';
    }
}

export async function updateStats() {
    const user = getSession(); 
    if (!user) return;

    const [myCourses, cycleState, allSubmissions] = await Promise.all([
        getMyCourses(),
        getCycleState(),
        GET(`/feedback-responses?studentId=${user.id}`).catch(() => [])
    ]);
    // myCourses.push({ id: 'reviewOfReviews', name: 'Platform System Review' });

    let completed = 0, progress = 0, pending = 0;
    myCourses.forEach(course => {
        const status = getStatus(course.id, user.id, cycleState.id || 'FALLBACK', allSubmissions);
        if (status === 'completed') completed++;
        else if (status === 'progress' && cycleState.phase === 'STUDENT_FEEDBACK') progress++;
        else if (cycleState.phase === 'STUDENT_FEEDBACK') pending++;
    });

    if (cycleState.phase !== 'STUDENT_FEEDBACK') { pending = 0; progress = 0; }

    if (document.getElementById('statCompleted')) document.getElementById('statCompleted').innerText = completed;
    if (document.getElementById('statProgress')) document.getElementById('statProgress').innerText = progress;
    if (document.getElementById('statPending')) document.getElementById('statPending').innerText = pending;
    if (document.getElementById('statTotal')) document.getElementById('statTotal').innerText = myCourses.length;

    const hero = document.getElementById('progressHero');
    if (hero) {
        if (cycleState.phase === 'STUDENT_FEEDBACK' && myCourses.length > 0) {
            hero.style.display = 'flex';
            const percent = Math.round((completed / myCourses.length) * 100);
            const titleEl = document.getElementById('heroProgressTitle');
            const subEl = document.getElementById('heroProgressSub');
            const percentEl = document.getElementById('heroProgressPercent');
            const barEl = document.getElementById('heroProgressBar');

            if (percent === 100) { titleEl.innerText = 'All Done! 🎉'; subEl.innerText = 'Thank you for completing all your feedbacks this cycle.'; }
            else if (percent > 50) { titleEl.innerText = "You're getting there!"; subEl.innerText = `Just ${pending} more feedback${pending > 1 ? 's' : ''} to go!`; }
            else { titleEl.innerText = 'Welcome back!'; subEl.innerText = `You have ${pending} evaluation${pending > 1 ? 's' : ''} waiting.`; }

            if (percentEl) percentEl.innerText = `${percent}%`;
            if (barEl) {
                const radius = 40, circumference = 2 * Math.PI * radius;
                barEl.style.strokeDasharray = circumference;
                barEl.style.strokeDashoffset = circumference - (percent / 100) * circumference;
            }
        } else { hero.style.display = 'none'; }
    }
}

function statusLabel(s) { return { pending: 'Pending', progress: 'In Progress', completed: 'Completed' }[s]; }
function statusAction(s) { return { pending: 'Start', progress: 'Resume', completed: 'View' }[s]; }
