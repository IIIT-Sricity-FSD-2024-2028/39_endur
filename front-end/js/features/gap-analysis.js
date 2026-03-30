import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderGapAnalysis() {
    const allStudentData = get("submittedFeedback") || [];
    const allReflectionData = get("selfReflection") || [];
    const user = getSession();
    if (!user) return;

    const cycleState = get("systemCycleState") || { id: "FALLBACK" };
    const activeCycleId = cycleState.id;

    const activeCourse = localStorage.getItem("activeFacultyCourse");
    if (!activeCourse) {
        window.location.href = "reports.html";
        return;
    }

    // CYCLE FIX: Filter for current cycle
    const reflection = allReflectionData.find(r => 
        r.facultyId === user.id && 
        r.courseId === activeCourse && 
        r.cycleId === activeCycleId
    );

    if (!reflection) {
        alert("No reflection found for the current cycle. Please submit one first.");
        window.location.href = "self-reflection.html";
        return;
    }

    const courseTitleEl = document.getElementById("courseTitle");
    if (courseTitleEl) courseTitleEl.innerText = `${activeCourse} Gap Analysis`;

    // CYCLE FIX: Only use student feedback from THIS cycle
    const courseFeedback = allStudentData.filter(f => 
        f.course === activeCourse && 
        f.cycleId === activeCycleId
    );
    
    let totals = {};
    let counts = {};
    let comments = [];

    courseFeedback.forEach(f => {
        if (f.ratings) {
            Object.keys(f.ratings).forEach(key => {
                if (typeof f.ratings[key] === 'number') {
                    totals[key] = (totals[key] || 0) + f.ratings[key];
                    counts[key] = (counts[key] || 0) + 1;
                }
            });
        }
        if (f.comment?.trim()) comments.push(f.comment);
    });

    const expected = reflection.expectedRatings || {};
    const rows = [];
    let totalSelf = 0, totalStudent = 0, validMetricsCount = 0;

    const activeParams = get("activeParameters") || {};
    const deptParams = activeParams[user.department] || [];

    function getParamName(id) {
        const param = deptParams.find(p => p.id === id);
        return param ? param.name : "Parameter " + id;
    }

    const formatGapText = (gapValue) => {
        const pct = (gapValue * 20).toFixed(0);
        if (gapValue > 0.2) return `<strong style="color: #d97706;">+${pct}%</strong>`; 
        if (gapValue < -0.2) return `<strong style="color: #16a34a;">${pct}%</strong>`;
        return `<strong style="color: #64748b;">0%</strong>`;
    };

    Object.keys(expected).forEach(field => {
        const selfScore = expected[field];
        const studentScore = counts[field] ? (totals[field] / counts[field]) : 0;
        const gap = selfScore - studentScore; 

        rows.push({ 
            field: getParamName(field), 
            selfScore, 
            studentScore, 
            gap 
        });

        totalSelf += selfScore;
        totalStudent += studentScore;
        validMetricsCount++;
    });

    const avgSelf = validMetricsCount > 0 ? (totalSelf / validMetricsCount) : 0;
    const avgStudent = validMetricsCount > 0 ? (totalStudent / validMetricsCount) : 0;
    const overallGap = avgSelf - avgStudent;

    document.getElementById("selfScore").innerText = (avgSelf * 20).toFixed(0) + "%";
    document.getElementById("studentScore").innerText = (avgStudent * 20).toFixed(0) + "%";
    
    const gapScoreEl = document.getElementById("gapScore");
    const gapPct = (overallGap * 20).toFixed(0);
    gapScoreEl.innerText = (overallGap > 0 ? "+" : "") + gapPct + "%";
    gapScoreEl.style.color = overallGap > 0.2 ? "#d97706" : (overallGap < -0.2 ? "#16a34a" : "#64748b");

    const table = document.getElementById("gapTable");
    table.innerHTML = rows.map(r => `
        <tr>
            <td style="padding-left: 20px; font-weight: 500; color: #334155;">${r.field}</td>
            <td>${(r.selfScore * 20).toFixed(0)}%</td>
            <td>${(r.studentScore * 20).toFixed(0)}%</td>
            <td>${formatGapText(r.gap)}</td>
        </tr>
    `).join("");

    const container = document.getElementById("commentList");
    container.innerHTML = comments.length ? 
        comments.slice(-5).map(text => `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; color: #334155; font-size: 14px; line-height: 1.5;">
                "${text}"
            </div>
        `).join("") : 
        "<p style='color: #64748b; font-style: italic;'>No student comments available for this cycle.</p>";
}
