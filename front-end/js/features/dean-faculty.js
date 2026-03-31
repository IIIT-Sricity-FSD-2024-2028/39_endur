import { get } from "../core/storage.js";
import { getSession } from "../core/session.js";

let allFaculty = [];
let allCourses = [];
let submissions = [];
let activeDepartment = null;

const deptIcons = {
    "Computer Science": "💻",
    "Mathematics": "📐",
    "Physics": "⚛️",
    "Engineering & Tech": "🦾",
    "Sciences": "🔬",
    "Arts & Humanities": "🎨",
    "Business": "📊"
};

export async function initDeanFaculty() {
    const user = getSession();
    if (!user || user.role !== "dean") return;

    const [usersRes, coursesRes] = await Promise.all([
        fetch("../../js/mock-data/users.json"),
        fetch("../../js/mock-data/courses.json")
    ]);
    
    const users = await usersRes.json();
    allCourses = await coursesRes.json();
    submissions = get("submittedFeedback") || [];
    
    allFaculty = users.filter(u => u.role === "faculty" || u.role === "hod");

    const deptCounts = {};
    allFaculty.forEach(f => {
        if (!deptCounts[f.department]) deptCounts[f.department] = 0;
        deptCounts[f.department]++;
    });

    const deptNames = Object.keys(deptCounts).sort();
    if (deptNames.length > 0) activeDepartment = deptNames[0]; 

    const cardsContainer = document.getElementById("deptCardsContainer");
    cardsContainer.innerHTML = "";

    deptNames.forEach(dept => {
        const icon = deptIcons[dept] || "🏛️";
        const count = deptCounts[dept];
        
        const card = document.createElement("div");
        card.className = `dept-card ${dept === activeDepartment ? "active" : ""}`;
        card.onclick = () => {
            activeDepartment = dept;
            document.querySelectorAll(".dept-card").forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            document.getElementById("facultySearch").value = "";
            renderTable();
        };
        card.innerHTML = `
            <div class="dept-icon">${icon}</div>
            <div>
                <strong style="display: block; color: #0f172a; font-size: 14px;">${dept}</strong>
                <span style="color: #64748b; font-size: 12px;">${count} Members</span>
            </div>
        `;
        cardsContainer.appendChild(card);
    });

    renderTable();
}

export function filterFacultyTable() {
    renderTable();
}

function renderTable() {
    const searchQuery = document.getElementById("facultySearch").value.toLowerCase();
    const tableBody = document.getElementById("deanFacultyTableBody");
    tableBody.innerHTML = "";

    let filteredFaculty = allFaculty.filter(f => f.department === activeDepartment);
    
    if (searchQuery) {
        filteredFaculty = filteredFaculty.filter(f => 
            f.name.toLowerCase().includes(searchQuery) || 
            f.id.toLowerCase().includes(searchQuery)
        );
    }

    // ==========================================
    // SORTING LOGIC: Pin HOD to the top!
    // ==========================================
    filteredFaculty.sort((a, b) => {
        if (a.role === "hod" && b.role !== "hod") return -1;
        if (b.role === "hod" && a.role !== "hod") return 1;
        return a.name.localeCompare(b.name); // Alphabetical for the rest
    });

    const getDesignation = (id, role) => {
        if (role === "hod") return "Head of Dept";
        const lastDigit = parseInt(id.slice(-1)) || 0;
        if (lastDigit <= 2) return "Professor";
        if (lastDigit <= 4) return "Associate Prof";
        if (lastDigit <= 7) return "Assistant Prof";
        return "Lecturer";
    };

    filteredFaculty.forEach(faculty => {
        const assignedCourses = allCourses.filter(c => c.facultyId === faculty.id).map(c => c.id);
        const coursesHtml = assignedCourses.length > 0 
            ? assignedCourses.join(", ") 
            : `<span style="color:#94a3b8; font-style:italic;">None</span>`;

        const facultyFeedback = submissions.filter(f => f.facultyId === faculty.id);
        const responseCount = facultyFeedback.length;
        let facultyAvgScore = 0;

        if (responseCount > 0) {
            let sumAverages = 0;
            facultyFeedback.forEach(f => {
                let metricSum = 0, metricCount = 0;
                if (f.ratings) {
                    Object.values(f.ratings).forEach(val => {
                        if (typeof val === 'number') { metricSum += val; metricCount++; }
                    });
                }
                sumAverages += (metricCount > 0 ? (metricSum / metricCount) : 0);
            });
            facultyAvgScore = (sumAverages / responseCount);
        }

        const barWidth = (facultyAvgScore / 5) * 100;
        let barColor = "#10b981"; 
        if (facultyAvgScore < 3.5 && facultyAvgScore > 0) barColor = "#f59e0b"; 
        if (facultyAvgScore < 2.5 && facultyAvgScore > 0) barColor = "#ef4444"; 

        const nameParts = faculty.name.replace("Dr. ", "").replace("Prof. ", "").split(" ");
        const fakeEmail = `${nameParts[0][0].toLowerCase()}.${nameParts[nameParts.length-1].toLowerCase()}@endur.edu`;
        const designation = getDesignation(faculty.id, faculty.role);
        


        // ==========================================
        // VISUAL HIGHLIGHT FOR HOD
        // ==========================================
        const isHod = faculty.role === "hod";
        const rowStyle = isHod ? `background-color: #f8fafc; border-left: 3px solid #1e3a8a;` : ``;
        const hodBadge = isHod ? `<span class="badge primary" style="font-size: 10px; padding: 2px 6px; margin-left: 8px;">HOD</span>` : ``;

        const tr = document.createElement("tr");
        tr.style.cssText = rowStyle;
        tr.innerHTML = `
            <td style="padding-left: ${isHod ? '27px' : '30px'}; padding-top: 16px; padding-bottom: 16px;">
                <div style="display: flex; align-items: center;">
                    <strong style="display: block; color: #0f172a; font-size: 14px;">${faculty.name}</strong>
                    ${hodBadge}
                </div>
                <span style="font-size: 12px; color: #94a3b8;">${fakeEmail}</span>
            </td>
            <td style="color: #64748b; font-size: 14px;">${faculty.id}</td>
            <td><span class="designation-badge" style="${isHod ? 'background: #e0e7ff; color: #3730a3;' : ''}">${designation}</span></td>
            <td style="color: #64748b; font-size: 13px; max-width: 150px;">${coursesHtml}</td>
            <td>
                <strong style="color: #0f172a; font-size: 14px;">${facultyAvgScore > 0 ? facultyAvgScore.toFixed(1) : "N/A"}</strong>
                ${facultyAvgScore > 0 ? `<div class="perf-bar-bg"><div class="perf-bar-fill" style="width: ${barWidth}%; background-color: ${barColor};"></div></div>` : ''}
            </td>

        `;
        tableBody.appendChild(tr);
    });

    if (filteredFaculty.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: #94a3b8;">No faculty members found.</td></tr>`;
    }
}
