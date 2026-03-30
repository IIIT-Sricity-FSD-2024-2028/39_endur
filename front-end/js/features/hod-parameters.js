import { get, set } from "../core/storage.js";

// Colors for the stacked bar chart
const CHART_COLORS = ["#3b82f6", "#a855f7", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];

// Default state if nothing is in local storage yet
const DEFAULT_PARAMETERS = [
    { id: "p1", name: "Pedagogy", desc: "Effectiveness of teaching methods, clarity of explanation, and course delivery.", weight: 40 },
    { id: "p2", name: "Resources", desc: "Quality and organization of course materials, readings, and assessments.", weight: 30 },
    { id: "p3", name: "Engagement", desc: "Ability to foster an interactive, inclusive, and responsive learning environment.", weight: 30 }
];

export function initParameters() {
    let params = get("evaluationParameters");
    if (!params || params.length === 0) {
        params = DEFAULT_PARAMETERS;
        set("evaluationParameters", params);
    }
    renderAll(params);
}

function renderAll(params) {
    const listContainer = document.getElementById("paramListContainer");
    const stackedBar = document.getElementById("stackedBar");
    const legendContainer = document.getElementById("legendContainer");
    
    listContainer.innerHTML = "";
    stackedBar.innerHTML = "";
    legendContainer.innerHTML = "";

    let totalWeight = 0;

    params.forEach((param, index) => {
        const weightNum = parseInt(param.weight);
        totalWeight += weightNum;
        const color = CHART_COLORS[index % CHART_COLORS.length];

        // 1. Build List Row
        const row = document.createElement("div");
        row.className = "param-row";
        row.innerHTML = `
            <div>
                <strong style="color: #0f172a; font-size: 14px;">${param.name}</strong>
                <p class="param-desc">${param.desc}</p>
            </div>
            <div class="weight-display">
                <div class="mini-bar"><div class="mini-bar-fill" style="width: ${weightNum}%; background: ${color}"></div></div>
                <span>${weightNum}%</span>
            </div>
            <div style="text-align: right;">
                <button class="action-btn" onclick="deleteParameter('${param.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                </button>
            </div>
        `;
        listContainer.appendChild(row);

        // 2. Build Stacked Bar Segment
        const segment = document.createElement("div");
        segment.style.cssText = `height: 100%; width: ${weightNum}%; background-color: ${color};`;
        stackedBar.appendChild(segment);

        // 3. Build Legend Item
        const legend = document.createElement("div");
        legend.className = "legend-item";
        legend.innerHTML = `
            <div><span class="legend-dot" style="background-color: ${color}"></span> ${param.name}</div>
            <strong style="color: #0f172a;">${weightNum}%</strong>
        `;
        legendContainer.appendChild(legend);
    });

    // Update Totals & Warnings
    const totalEl = document.getElementById("totalAssignedText");
    const warningEl = document.getElementById("weightWarning");

    totalEl.innerText = `${totalWeight}%`;
    
    if (totalWeight !== 100) {
        totalEl.style.color = "#dc2626"; // Red text if not 100
        warningEl.style.display = "block";
    } else {
        totalEl.style.color = "#1e3a8a"; // Blue text if perfect
        warningEl.style.display = "none";
    }

    if (params.length === 0) {
        listContainer.innerHTML = `<p style="padding: 20px 0; color: #64748b; text-align: center;">No parameters defined.</p>`;
    }
}

export function deleteParameter(id) {
    let params = get("evaluationParameters") || [];
    params = params.filter(p => p.id !== id);
    set("evaluationParameters", params);
    renderAll(params);
}

export function saveParameter(name, desc, weight) {
    if (!name || !weight) {
        alert("Name and Weightage are required.");
        return;
    }
    
    let params = get("evaluationParameters") || [];
    
    params.push({
        id: "p" + new Date().getTime(),
        name: name,
        desc: desc || "No description provided.",
        weight: parseInt(weight)
    });

    set("evaluationParameters", params);
    
    window.closeParamModal();
    renderAll(params);
}
