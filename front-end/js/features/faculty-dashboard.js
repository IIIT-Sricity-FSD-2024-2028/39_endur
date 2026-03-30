import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

async function getCourses() {
    try {
        const res = await fetch("../../js/mock-data/courses.json");
        return await res.json();
    } catch (e) {
        console.error("Failed to fetch courses", e);
        return [];
    }
}

export async function renderFacultyDashboard() {
    const user = getSession();
    if (!user) return;

    const allCourses = await getCourses();
    const myCourses = allCourses.filter(c => c.facultyId === user.id);

    const submissions = get("submittedFeedback") || [];
    const reflections = get("selfReflection") || [];

    const table = document.getElementById("courseTable");
    if (table) table.innerHTML = "";

    // Metrics for the top cards
    let totalStudentScorePercentage = 0;
    let coursesWithFeedbackCount = 0;
    
    let totalResponses = 0;
    let totalStudentsEnrolled = 0;
    
    let pendingReflectionCount = 0;
    
    let totalGapAccumulator = 0;
    let gapCalculatedCourses = 0;

    myCourses.forEach(course => {
        // 1. Get Feedback for this specific course
        const courseFeedback = submissions.filter(f => f.course === course.id);
        const responses = courseFeedback.length;
        
        let courseAvgPercentage = 0;

        if (responses > 0) {
            let sumOfAverages = 0;

            courseFeedback.forEach(f => {
                let metricSum = 0;
                let metricCount = 0;
                
                // Safely grab only actual numbers
                if (f.ratings) {
                    if (typeof f.ratings.clarity === 'number') { metricSum += f.ratings.clarity; metricCount++; }
                    if (typeof f.ratings.structure === 'number') { metricSum += f.ratings.structure; metricCount++; }
                    if (typeof f.ratings.engagement === 'number') { metricSum += f.ratings.engagement; metricCount++; }
                    if (typeof f.ratings.difficulty === 'number') { metricSum += f.ratings.difficulty; metricCount++; }
                }

                // Average score for this specific student's form (out of 5)
                const studentFormAvg = metricCount > 0 ? (metricSum / metricCount) : 0;
                sumOfAverages += studentFormAvg;
            });

            // Convert to percentage (out of 100%)
            courseAvgPercentage = (sumOfAverages / responses) * 20; 
            
            totalStudentScorePercentage += courseAvgPercentage;
            coursesWithFeedbackCount++;
        }

        totalResponses += responses;
        totalStudentsEnrolled += course.enrolled || 50; // Fallback to 50 if enrolled is missing

        // 2. Check Self-Reflection Status (Using correct schema keys: courseId and facultyId)
        const hasReflection = reflections.find(
            r => r.courseId === course.id && r.facultyId === user.id
        );

        if (!hasReflection) {
            pendingReflectionCount++;
        } else {
            // 3. Calculate Gap for this course if reflection exists
            let selfMetricSum = 0;
            let selfMetricCount = 0;
            const expected = hasReflection.expectedRatings || {};
            
            Object.values(expected).forEach(val => {
                selfMetricSum += val;
                selfMetricCount++;
            });

            const selfAvgPercentage = selfMetricCount > 0 ? (selfMetricSum / selfMetricCount) * 20 : 0;
            const absoluteGap = Math.abs(selfAvgPercentage - courseAvgPercentage);
            
            totalGapAccumulator += absoluteGap;
            gapCalculatedCourses++;
        }

        // 4. Render Table Row
        if (table) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${course.id}</td>
                <td>${course.name}</td>
                <td>${course.enrolled || 0}</td>
                <td>
                    <span class="badge ${responses > 0 ? 'success' : 'neutral'}">
                        ${responses > 0 ? "Active" : "Waiting"}
                    </span>
                </td>
                <td>${courseAvgPercentage.toFixed(0)}%</td>
            `;
            table.appendChild(tr);
        }
    });

    // 5. Update Top Stats Cards
    
    // Overall Student Satisfaction
    const finalAvgScore = coursesWithFeedbackCount > 0 
        ? (totalStudentScorePercentage / coursesWithFeedbackCount).toFixed(0) 
        : 0;
    const avgScoreEl = document.getElementById("avgScore");
    if (avgScoreEl) avgScoreEl.innerText = `${finalAvgScore}%`;

    // Response Rate
    const finalResponseRate = totalStudentsEnrolled > 0 
        ? Math.round((totalResponses / totalStudentsEnrolled) * 100) 
        : 0;
    const responseRateEl = document.getElementById("responseRate");
    if (responseRateEl) responseRateEl.innerText = `${finalResponseRate}%`;

    // Pending Reflections
    const pendingRefEl = document.getElementById("pendingReflection");
    if (pendingRefEl) pendingRefEl.innerText = pendingReflectionCount;

    // Overall Performance Gap
    const finalGapScore = gapCalculatedCourses > 0 
        ? (totalGapAccumulator / gapCalculatedCourses).toFixed(0) 
        : 0;
    const gapScoreEl = document.getElementById("gapScore");
    if (gapScoreEl) gapScoreEl.innerText = `${finalGapScore}%`;

    // Empty State Handling
    const emptyState = document.getElementById("emptyState");
    if (emptyState) {
        emptyState.style.display = myCourses.length === 0 ? "block" : "none";
    }
}
