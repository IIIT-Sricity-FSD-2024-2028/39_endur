import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export async function renderGapAnalysis() {
    const studentData = get("submittedFeedback") || [];
    const reflectionData = get("selfReflection") || [];
    const user = getSession();

    if (!user) return;

    // READ THE DYNAMIC COURSE
    const activeCourse = localStorage.getItem("activeFacultyCourse");
    
    if (!activeCourse) {
        alert("No active course selected.");
        window.location.href = "reports.html";
        return;
    }

    // 1. Get the reflection specifically for this faculty member AND this course
    const reflection = reflectionData
        .filter(r => r.facultyId === user.id && r.courseId === activeCourse)
        .pop(); // Gets latest if somehow there are multiples

    if (!reflection) {
        alert(`No reflection found for ${activeCourse}. Please submit one first.`);
        window.location.href = "self-reflection.html";
        return;
    }

    const courseTitleEl = document.getElementById("courseTitle");
    if (courseTitleEl) {
        courseTitleEl.innerText = `${activeCourse} Gap Analysis`;
    }

    // 2. Dynamically calculate student averages for THIS course
    const courseFeedback = studentData.filter(f => f.course === activeCourse);
    
    let totals = {};
    let counts = {};
    let comments = [];

    // DYNAMIC MATH: Tally up whatever keys exist in the ratings
    courseFeedback.forEach(f => {
        if (f.ratings) {
            Object.keys(f.ratings).forEach(key => {
                if (typeof f.ratings[key] === 'number') {
                    if (!totals[key]) totals[key] = 0;
                    if (!counts[key]) counts[key] = 0;
                    totals[key] += f.ratings[key];
                    counts[key]++;
                }
            });
        }
        if (f.comment && f.comment.trim() !== "") {
            comments.push(f.comment);
        }
    });

    const expected = reflection.expectedRatings || {};
    const rows = [];
    let totalSelf = 0;
    let totalStudent = 0;
    let validMetricsCount = 0;

    // Helper to fetch readable parameter names
    let allDrafts = get("draftParameters") || {};
    let activeParams = get("activeParameters") || {};
    let deptParams = activeParams[user.department] || allDrafts[user.department] || [];

    function getParamName(id) {
        const param = deptParams.find(p => p.id === id);
        return param ? param.name : id.replace("p", "Parameter ");
    }

    // Helper to format Gap with +/- signs
    const formatGapText = (gapValue) => {
        const pct = (gapValue * 20).toFixed(0);
        if (gapValue > 0) return `<strong style="color: #d97706;">+${pct}%</strong>`; // Overestimated
        if (gapValue < 0) return `<strong style="color: #16a34a;">${pct}%</strong>`;  // Underestimated (negative sign comes naturally)
        return `<strong style="color: #64748b;">0%</strong>`;
    };

    // 3. Calculate the Gaps
    Object.keys(expected).forEach(field => {
        const selfScore = expected[field];
        
        // Calculate student average for this specific field
        const studentScore = (counts[field] && counts[field] > 0) ? (totals[field] / counts[field]) : 0;
        
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

    // 4. Calculate Overall Aggregates
    const avgSelf = validMetricsCount > 0 ? (totalSelf / validMetricsCount) : 0;
    const avgStudent = validMetricsCount > 0 ? (totalStudent / validMetricsCount) : 0;
    const overallGap = avgSelf - avgStudent;

    document.getElementById("selfScore").innerText = (avgSelf * 20).toFixed(0) + "%";
    document.getElementById("studentScore").innerText = (avgStudent * 20).toFixed(0) + "%";
    
    // Overall Gap formatting
    const gapScoreEl = document.getElementById("gapScore");
    const gapPct = (overallGap * 20).toFixed(0);
    if (overallGap > 0) {
        gapScoreEl.innerText = `+${gapPct}%`;
        gapScoreEl.style.color = "#d97706"; // Yellow/Orange warning
    } else if (overallGap < 0) {
        gapScoreEl.innerText = `${gapPct}%`;
        gapScoreEl.style.color = "#16a34a"; // Green (better than expected)
    } else {
        gapScoreEl.innerText = "0%";
    }

    // 5. Populate the Comparison Table
    const table = document.getElementById("gapTable");
    table.innerHTML = ""; 

    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="padding-left: 20px; font-weight: 500; color: #334155;">${r.field}</td>
            <td>${(r.selfScore * 20).toFixed(0)}%</td>
            <td>${(r.studentScore * 20).toFixed(0)}%</td>
            <td>${formatGapText(r.gap)}</td>
        `;
        table.appendChild(tr);
    });

    // 6. Populate Comments
    const container = document.getElementById("commentList");
    container.innerHTML = ""; 
    
    if (comments.length === 0) {
        container.innerHTML = "<p style='color: #64748b; font-style: italic;'>No written comments provided by students for this course.</p>";
    } else {
        comments.slice(-5).forEach(text => {
            const div = document.createElement("div");
            div.style.cssText = "background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; color: #334155; font-size: 14px; line-height: 1.5;";
            div.innerText = `"${text}"`;
            container.appendChild(div);
        });
    }
}
