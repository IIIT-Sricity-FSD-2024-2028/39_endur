import { getSession } from '../core/session.js';
import { GET } from '../core/api.js';

/**
 * Renders the faculty historical trends page.
 * All data is sourced exclusively from the feedback-responses endpoint
 * filtered by this faculty's ID — no keyword matching or mock history.
 */
export async function renderHistoricalTrends() {
    const user = getSession();
    if (!user) return;

    // Load data in parallel
    let allResponses = [], allCourses = [], allCycles = [];
    try {
        [allResponses, allCourses, allCycles] = await Promise.all([
            GET(`/feedback-responses?facultyId=${encodeURIComponent(user.id)}`),
            GET('/courses'),
            GET('/feedback-cycles'),
        ]);
    } catch (e) {
        console.error('Failed to load historical data', e);
        return;
    }

    const activeCourse = new URLSearchParams(window.location.search).get('courseId');
    const courseLabel  = document.getElementById('trendCourseLabel');
    if (courseLabel) courseLabel.innerText = activeCourse ? `(${activeCourse})` : '(all courses)';

    // Filter to this faculty's responses, optionally scoped to one course
    let myResponses = activeCourse
        ? allResponses.filter(r => r.courseId === activeCourse)
        : allResponses;

    // Visibility Guard: ONLY show responses from fully COMPLETED cycles
    myResponses = myResponses.filter(r => {
        const cycle = allCycles.find(c => c.cycleId === r.cycleId);
        if (!cycle) return false; // unknown cycle — exclude
        return cycle.status === 'closed';
    });

    if (!myResponses.length) {
        document.getElementById('overallScore').innerText = 'No Data Yet';
        clearBars();
        return;
    }

    // Group responses by cycle to build time-series data
    const cycleMap = {};  // cycleId → { cycleName, startDate, responses[] }
    myResponses.forEach(r => {
        if (!cycleMap[r.cycleId]) {
            const cycle = allCycles.find(c => c.cycleId === r.cycleId);
            cycleMap[r.cycleId] = {
                cycleId:   r.cycleId,
                cycleName: cycle?.cycleName || cycle?.name || r.cycleId,
                startDate: cycle?.startTimestamp ?? '',
                responses: [],
            };
        }
        cycleMap[r.cycleId].responses.push(r);
    });

    // Sort cycles chronologically
    const sortedCycles = Object.values(cycleMap).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    // Compute overall weighted average across ALL responses
    const { overallPct, paramAverages } = computeAggregates(myResponses);
    document.getElementById('overallScore').innerText = overallPct > 0 ? `${overallPct.toFixed(1)}%` : 'No Data';

    // Build per-cycle overall scores for the main trend line
    const cycleScores = sortedCycles.map(c => {
        const { overallPct } = computeAggregates(c.responses);
        return { label: c.cycleName, score: overallPct };
    });

    renderMainTrendLine(cycleScores);
    renderParamCharts(paramAverages, sortedCycles);
    renderResponseTable(myResponses, allCourses, allCycles, user);
}

/* ── Aggregate helpers ─────────────────────────────────────────────── */
function computeAggregates(responses) {
    // Collect per-param: { id → { name, weight, sum, count } }
    const paramMap = {};
    responses.forEach(r => {
        if (!Array.isArray(r.ratings)) return;
        r.ratings.forEach(entry => {
            const k = entry.paramId;
            let score = Number(entry.score ?? 0);
            if (score > 5) score = score / 20; // Normalize 0-100 scale to 1-5 scale for calculation

            if (!paramMap[k]) paramMap[k] = { name: entry.paramName ?? k, weight: entry.weight ?? 25, sum: 0, count: 0 };
            paramMap[k].sum   += score;
            paramMap[k].count += 1;
        });
    });

    const paramAverages = Object.entries(paramMap).map(([id, { name, weight, sum, count }]) => ({
        id,
        name,
        weight,
        avgScore:   count > 0 ? sum / count : 0,          // 1-5 scale
        avgPct:     count > 0 ? (sum / count) * 20 : 0,   // % out of 100
        responseCount: count,
    }));

    // Weighted overall
    const totalWeight = paramAverages.reduce((s, p) => s + (p.weight), 0) || 100;
    const overallPct  = paramAverages.reduce((s, p) => s + (p.avgPct * p.weight / totalWeight), 0);

    return { overallPct, paramAverages };
}

/* ── Main trend line ───────────────────────────────────────────────── */
function renderMainTrendLine(cycleScores) {
    const line = document.getElementById('trendLine');
    if (!line) return;
    line.innerHTML = '';
    if (!cycleScores.length) return;

    cycleScores.forEach((cs, idx) => {
        const dotContainer = document.createElement('div');
        dotContainer.title = `${cs.label}: ${cs.score.toFixed(1)}%`;
        dotContainer.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;flex:1;';
        const heightPct = Math.max(4, Math.round(cs.score));
        const isLast    = idx === cycleScores.length - 1;
        dotContainer.innerHTML = `
            <span style="font-size:10px;color:#64748b;margin-bottom:4px;">${cs.score.toFixed(0)}%</span>
            <div style="height:${heightPct}%;width:12px;border-radius:6px 6px 0 0;background:${isLast ? 'var(--primary)' : '#94a3b8'};min-height:8px;"></div>
            <span style="font-size:9px;color:#94a3b8;margin-top:6px;text-align:center;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cs.label}</span>
        `;
        line.appendChild(dotContainer);
    });
}

/* ── Per-parameter bar charts ──────────────────────────────────────── */
function renderParamCharts(paramAverages, sortedCycles) {
    // Update overall score pills if present
    paramAverages.forEach(p => {
        const el = document.getElementById(`score_${p.id}`);
        if (el) el.innerText = `${p.avgPct.toFixed(1)}%`;
        // Build per-cycle history bars for this param
        const barContainerId = `${p.id}Bars`;
        const history = sortedCycles.map(c => {
            const { paramAverages: pa } = computeAggregates(c.responses);
            const match = pa.find(x => x.id === p.id);
            return match ? match.avgPct : 0;
        });
        // Pad to at least 4 bars
        while (history.length < 4) history.unshift(0);
        createBars(barContainerId, history.slice(-4));
    });

    // If no dedicated elements, build dynamic param chart grid
    const chartGrid = document.getElementById('paramChartGrid');
    if (chartGrid) {
        const iconMap = ['📖', '🏗️', '💡', '⚖️', '📊', '🎯'];
        chartGrid.innerHTML = paramAverages.map((p, i) => {
            const safeId = p.id.replace(/[^a-zA-Z0-9]/g, '');
            return `
            <div class="chart-card">
                <h3>${iconMap[i % iconMap.length]} ${p.name}</h3>
                <p class="chart-sub">Avg: <strong>${p.avgPct.toFixed(1)}%</strong> — ${p.responseCount} response${p.responseCount !== 1 ? 's' : ''}</p>
                <canvas id="chart_${safeId}"></canvas>
            </div>
            `;
        }).join('');

        // Render chart bars after DOM update
        setTimeout(() => {
            paramAverages.forEach(p => {
                const safeId = p.id.replace(/[^a-zA-Z0-9]/g, '');
                const history = sortedCycles.map(c => {
                    const { paramAverages: pa } = computeAggregates(c.responses);
                    return pa.find(x => x.id === p.id)?.avgPct ?? 0;
                });
                while (history.length < 4) history.unshift(0);
                renderChartCanvas(`chart_${safeId}`, p.name, history.slice(-4), sortedCycles.slice(-4).map(c => c.cycleName));
            });
        }, 0);
    }
}

/* ── Canvas bar chart helper ────────────────────────────────────────── */
function renderChartCanvas(canvasId, label, values, labels) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    new window.Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : values.map((_, i) => `C${i + 1}`),
            datasets: [{ label, data: values, backgroundColor: values.map((_, i) => i === values.length - 1 ? 'rgba(99,102,241,0.8)' : 'rgba(148,163,184,0.5)'), borderRadius: 4 }],
        },
        options: { responsive: true, scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } }, plugins: { legend: { display: false } } },
    });
}

function createBars(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    data.forEach((value, index) => {
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.title     = `${value.toFixed(1)}%`;
        bar.style.cssText = `height:${Math.max(4, value)}%;width:22%;background:${index === data.length - 1 ? 'var(--primary)' : '#cbd5e1'};border-radius:4px 4px 0 0;transition:height 0.5s ease;`;
        el.appendChild(bar);
    });
}

function clearBars() {
    ['clarityBars','structureBars','engagementBars','difficultyBars'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

/* ── Recent responses table ─────────────────────────────────────────── */
function renderResponseTable(responses, allCourses, allCycles, user) {
    const container = document.getElementById('recentResponsesTable') || document.getElementById('responseList');
    if (!container) return;

    const sorted = [...responses].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const recent = sorted.slice(0, 20);

    container.innerHTML = recent.map(r => {
        const course    = allCourses.find(c => c.id === r.courseId);
        const cycle     = allCycles.find(c  => c.cycleId === r.cycleId);
        const { overallPct } = computeAggregates([r]);
        const date      = r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—';
        const ratingRows = Array.isArray(r.ratings) ? r.ratings.map(rt => {
            let score = Number(rt.score ?? 0);
            if (score > 5) score = score / 20;
            return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;"><span style="color:#64748b">${rt.paramName ?? rt.paramId}</span><span><strong>${score.toFixed(1)}/5</strong>${rt.comment ? ` — <em style="color:#94a3b8">"${rt.comment}"</em>` : ''}</span></div>`;
        }).join('') : '';

        return `
            <tr>
                <td><strong>${course?.name ?? r.courseId}</strong><br><span style="font-size:11px;color:#94a3b8">${r.courseId}</span></td>
                <td><span class="badge neutral" style="font-size:10px">${cycle?.cycleName ?? r.cycleId}</span></td>
                <td style="font-size:13px">${date}</td>
                <td><strong style="color:var(--primary)">${overallPct.toFixed(1)}%</strong></td>
                <td>
                    <div style="min-width:200px">${ratingRows}</div>
                </td>
            </tr>
        `;
    }).join('');
}
