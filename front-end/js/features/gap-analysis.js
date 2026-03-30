import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export function renderGapAnalysis() {
    const studentData = get("submittedFeedback") || [];
    const reflectionData = get("selfReflection") || [];
    const user = getSession();

    if (!user) return;

    // 1. Get the latest reflection specifically for this faculty member
    const reflection = reflectionData
        .filter(r => r.facultyId === user.id) // Fixed from userId to facultyId
        .pop();

    if (!reflection) {
        alert("No reflection found. Please submit a self-reflection first.");
        window.location.href = "self-reflection.html";
        return;
    }

    const activeCourse = reflection.courseId;
    const courseTitleEl = document.getElementById("courseTitle");
    if (courseTitleEl) {
        courseTitleEl.innerText = `${activeCourse} Gap Analysis`;
    }

    // 2. Dynamically calculate student averages for this specific course
    const courseFeedback = studentData.filter(f => f.course === activeCourse);
    
    let totals = { clarity: 0, structure: 0, engagement: 0, difficulty: 0 };
    let counts = { clarity: 0, structure: 0, engagement: 0, difficulty: 0 };
    let comments = [];

    courseFeedback.forEach(f => {
        if (f.ratings) {
            if (typeof f.ratings.clarity === 'number') { totals.clarity += f.ratings.clarity; counts.clarity++; }
            if (typeof f.ratings.structure === 'number') { totals.structure += f.ratings.structure; counts.structure++; }
            if (typeof f.ratings.engagement === 'number') { totals.engagement += f.ratings.engagement; counts.engagement++; }
            if (typeof f.ratings.difficulty === 'number') { totals.difficulty += f.ratings.difficulty; counts.difficulty++; }
        }
        // Collect actual student comments
        if (f.comment && f.comment.trim() !== "") {
            comments.push(f.comment);
        }
    });

    const studentAvg = {
        clarity: counts.clarity > 0 ? totals.clarity / counts.clarity : 0,
        structure: counts.structure > 0 ? totals.structure / counts.structure : 0,
        engagement: counts.engagement > 0 ? totals.engagement / counts.engagement : 0,
        difficulty: counts.difficulty > 0 ? totals.difficulty / counts.difficulty : 0
    };

    // 3. Calculate the Gaps
    const rows = [];
    let totalSelf = 0;
    let totalStudent = 0;
    let validMetricsCount = 0;

    const expected = reflection.expectedRatings || {};

    Object.keys(expected).forEach(field => {
        const selfScore = expected[field];
        const studentScore = studentAvg[field];
        
        const gap = selfScore - studentScore; 

        rows.push({ field, selfScore, studentScore, gap });

        totalSelf += selfScore;
        totalStudent += studentScore;
        validMetricsCount++;
    });

    // 4. Calculate Overall Aggregates
    const avgSelf = validMetricsCount > 0 ? (totalSelf / validMetricsCount) : 0;
    const avgStudent = validMetricsCount > 0 ? (totalStudent / validMetricsCount) : 0;
    
    // Applying the exact math formula from your SRS: |Self Reflection - Student Avg|
    const absoluteGapScore = Math.abs(avgSelf - avgStudent);

    // Convert everything to percentages (score out of 5 * 20 = percentage out of 100)
    document.getElementById("selfScore").innerText = (avgSelf * 20).toFixed(0) + "%";
    document.getElementById("studentScore").innerText = (avgStudent * 20).toFixed(0) + "%";
    document.getElementById("gapScore").innerText = (absoluteGapScore * 20).toFixed(0) + "%";

    // 5. Populate the Comparison Table
    const table = document.getElementById("gapTable");
    table.innerHTML = ""; // Clear existing rows

    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-transform: capitalize;">${r.field}</td>
            <td>${(r.selfScore * 20).toFixed(0)}%</td>
            <td>${(r.studentScore * 20).toFixed(0)}%</td>
            <td>${(r.gap * 20).toFixed(0)}%</td>
        `;
        table.appendChild(tr);
    });

    // 6. Populate Real Student Comments
    const container = document.getElementById("commentList");
    container.innerHTML = ""; 
    
    if (comments.length === 0) {
        container.innerHTML = "<p>No written comments provided by students.</p>";
    } else {
        // Show up to the 5 most recent comments so the UI doesn't break if a class has 100 students
        comments.slice(-5).forEach(text => {
            const div = document.createElement("div");
            div.className = "card";
            div.innerText = text;
            container.appendChild(div);
        });
    }
}
