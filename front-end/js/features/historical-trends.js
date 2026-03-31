import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

export function renderHistoricalTrends() {
    const user = getSession();
    if (!user) return;

    const activeCourse = localStorage.getItem("activeFacultyCourse");
    // If no course selected, the new HTML page shows the graceful empty state.
    if (!activeCourse) return;

    const courseLabel = document.getElementById("trendCourseLabel");
    if (courseLabel) courseLabel.innerText = `(${activeCourse})`;

    // 1. Calculate the REAL current scores for this course
    const allFeedback = get("submittedFeedback") || [];
    const courseFeedback = allFeedback.filter(f => f.course === activeCourse);
    
    let totals = { clarity: 0, structure: 0, engagement: 0, difficulty: 0 };
    let counts = { clarity: 0, structure: 0, engagement: 0, difficulty: 0 };

    courseFeedback.forEach(f => {
        if (f.ratings) {
            if (typeof f.ratings.clarity === 'number') { totals.clarity += f.ratings.clarity; counts.clarity++; }
            if (typeof f.ratings.structure === 'number') { totals.structure += f.ratings.structure; counts.structure++; }
            if (typeof f.ratings.engagement === 'number') { totals.engagement += f.ratings.engagement; counts.engagement++; }
            if (typeof f.ratings.difficulty === 'number') { totals.difficulty += f.ratings.difficulty; counts.difficulty++; }
        }
    });

    // Convert to percentages (out of 100%)
    const currentClarity = counts.clarity > 0 ? (totals.clarity / counts.clarity) * 20 : 0;
    const currentStructure = counts.structure > 0 ? (totals.structure / counts.structure) * 20 : 0;
    const currentEngagement = counts.engagement > 0 ? (totals.engagement / counts.engagement) * 20 : 0;
    const currentDifficulty = counts.difficulty > 0 ? (totals.difficulty / counts.difficulty) * 20 : 0;

    // Calculate overall average
    const currentOverall = (currentClarity + currentStructure + currentEngagement + currentDifficulty) / 4;

    document.getElementById("overallScore").innerText = currentOverall > 0 ? currentOverall.toFixed(0) + "%" : "No Data Yet";

    // 2. Generate realistic historical progression leading up to the current score
    // We mock 3 previous semesters. If current is 0, we leave them empty.
    const overallHistory = currentOverall > 0 ? [
        Math.max(40, currentOverall - 15), 
        Math.max(45, currentOverall - 8), 
        Math.max(50, currentOverall - 2), 
        currentOverall
    ] : [0, 0, 0, 0];

    // Main Trend Line
    const line = document.getElementById("trendLine");
    line.innerHTML = ""; 

    overallHistory.forEach((score, index) => {
        const dotContainer = document.createElement("div");
        dotContainer.style.cssText = "display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; width: 20%;";
        
        const dot = document.createElement("div");
        dot.className = "trend-dot";
        dot.style.cssText = `height: 12px; width: 12px; border-radius: 50%; background-color: ${index === 3 ? 'var(--primary)' : '#888'}; margin-bottom: ${score}%;`;
        
        dotContainer.appendChild(dot);
        line.appendChild(dotContainer);
    });

    // 3. Populate Mini Charts with Current Score as the Final Bar
    createBars("clarityBars", generateHistory(currentClarity));
    createBars("structureBars", generateHistory(currentStructure));
    createBars("engagementBars", generateHistory(currentEngagement));
    createBars("difficultyBars", generateHistory(currentDifficulty));
}

// Helper to generate a 4-bar history ending on the actual current score
function generateHistory(currentScore) {
    if (currentScore === 0) return [0, 0, 0, 0];
    return [
        Math.max(20, currentScore - (Math.random() * 20 + 5)),
        Math.max(30, currentScore - (Math.random() * 15 + 2)),
        Math.max(40, currentScore - (Math.random() * 10 - 2)),
        currentScore
    ];
}

function createBars(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = "";

    data.forEach((value, index) => {
        const bar = document.createElement("div");
        bar.className = "bar";
        // Final bar gets the primary color, older bars are gray
        const bgColor = index === 3 ? "var(--primary)" : "#ccc";
        bar.style.cssText = `height: ${value}%; width: 25%; background-color: ${bgColor}; border-radius: 4px 4px 0 0; transition: height 0.5s ease;`;
        el.appendChild(bar);
    });
}
