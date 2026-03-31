import { get, set } from '../core/storage.js';
import { showToast, genId, appendAuditLog } from './admin-utils.js';

const THUMBNAILS = [
    'img_backtoschool.jpg',
    'img_bookclub.jpg',
    'img_breakfast.jpg',
    'img_learnlanguage.jpg',
    'img_read.jpg'
];

let courses = [];
let users = [];
let session = null;

export async function initSuperuserCourses() {
    console.debug("[SU-Courses] Initializing system data...");
    const tbody = document.getElementById('courseTableBody');
    
    try {
        const sessionRaw = localStorage.getItem('endurSession');
        session = sessionRaw ? JSON.parse(sessionRaw) : null;

        // Load Courses
        console.debug("[SU-Courses] Loading courses...");
        let storedCourses = get("systemCourses");
        
        // Validation: If storedCourses is not an array, treat as empty
        if (storedCourses && !Array.isArray(storedCourses)) {
            console.warn("[SU-Courses] Invalid course data in storage. Resetting.");
            storedCourses = null;
        }

        if (!storedCourses) {
            console.debug("[SU-Courses] Fetching default courses.json...");
            const res = await fetch('../../js/mock-data/courses.json');
            if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
            courses = await res.json();
            
            // Migration: Add random thumbnails to existing courses
            courses = courses.map(c => ({
                ...c,
                thumbnail: c.thumbnail || THUMBNAILS[Math.floor(Math.random() * THUMBNAILS.length)]
            }));
            set("systemCourses", courses);
        } else {
            courses = storedCourses;
        }

        // Load Users
        console.debug("[SU-Courses] Loading users...");
        let storedUsers = get("systemUsers");
        if (storedUsers && !Array.isArray(storedUsers)) storedUsers = null;

        if (!storedUsers) {
            const res = await fetch('../../js/mock-data/users.json');
            if (!res.ok) throw new Error(`Users fetch failed: ${res.status}`);
            users = await res.json();
            set("systemUsers", users);
        } else {
            users = storedUsers;
        }

        console.debug("[SU-Courses] Data loaded. Rendering UI...");
        renderCourseTable();
        populateDeptSelect();
        populateFacultySelect();
        populateStudentSelect();
        console.debug("[SU-Courses] Initialization complete.");
    } catch (err) {
        console.error("[SU-Courses] Initialization failed:", err);
        showToast("System error: Failed to load data.", "error");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-danger)">
                <strong>Error loading system data.</strong><br>
                <span style="font-size:0.8rem;opacity:0.8">${err.message}</span>
            </td></tr>`;
        }
    }
}

let currentModalThumb = THUMBNAILS[0];

function updateModalThumbPreview(thumb) {
    currentModalThumb = thumb || THUMBNAILS[Math.floor(Math.random() * THUMBNAILS.length)];
    const preview = document.getElementById('modalThumbPreview');
    if (preview) preview.src = `../../assets/images/${currentModalThumb}`;
}

export function shuffleCourseImage() {
    updateModalThumbPreview();
}
window.shuffleCourseImage = shuffleCourseImage;

function renderCourseTable(filter = '') {
    const tbody = document.getElementById('courseTableBody');
    if (!tbody) return;

    const list = filter
        ? courses.filter(c => 
            c.name.toLowerCase().includes(filter) || 
            c.id.toLowerCase().includes(filter) ||
            c.faculty.toLowerCase().includes(filter) ||
            c.department.toLowerCase().includes(filter)
        )
        : courses;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">The curriculum is currently empty.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(c => `
        <tr>
            <td style="display:flex; align-items:center; gap:12px;">
                <img src="../../assets/images/${c.thumbnail}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;">
                <div>
                    <strong>${c.name}</strong><br>
                    <small style="color:var(--text-muted)">${c.id}</small>
                </div>
            </td>
            <td>${c.faculty || '—'}<br><small style="color:var(--text-muted)">${c.facultyId || ''}</small></td>
            <td><span class="badge neutral">${c.department}</span></td>
            <td><strong>${c.enrolled || 0}</strong> Students</td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-small" onclick="openEditCourse('${c.id}')">Edit</button>
                    <button class="btn-small btn-primary" onclick="openAssignStudents('${c.id}')">Students</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function populateDeptSelect() {
    const select = document.getElementById('courseDeptSelect');
    if (!select) return;
    const depts = [...new Set(users.map(u => u.department || u.dept).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Select Department</option>' + depts.map(d => `
        <option value="${d}">${d}</option>
    `).join('');
}

function populateFacultySelect() {
    const select = document.getElementById('courseFaculty');
    if (!select) return;
    const faculty = users.filter(u => u.role === 'faculty');
    select.innerHTML = '<option value="">Select Faculty</option>' + faculty.map(f => `
        <option value="${f.id}" data-name="${f.name}" data-dept="${f.department}">${f.name} (${f.department})</option>
    `).join('');
}

function populateStudentSelect() {
    const container = document.getElementById('studentSelectContainer');
    if (!container) return;
    const students = users.filter(u => u.role === 'student');
    container.innerHTML = students.map(s => `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:0.9rem;">
            <input type="checkbox" name="assignStudent" value="${s.id}" id="s_${s.id}">
            <label for="s_${s.id}">${s.name} <small style="color:var(--text-muted)">(${s.id})</small></label>
        </div>
    `).join('');
}

export function saveCourse() {
    const form = document.getElementById('courseForm');
    const id = document.getElementById('courseId').value.trim();
    const name = document.getElementById('courseName').value.trim();
    const facultySelect = document.getElementById('courseFaculty');
    const facultyId = facultySelect.value;
    const facultyOption = facultySelect.options[facultySelect.selectedIndex];
    const facultyName = facultyOption.dataset.name;
    const deptSelect = document.getElementById('courseDeptSelect');
    const dept = deptSelect.value || facultyOption.dataset.dept;
    const shouldAutoEnroll = document.getElementById('autoEnrollDept').checked;

    if (!id || !name || !facultyId) {
        showToast("ID, Name, and Faculty are required.", "error");
        return;
    }

    const editId = form.dataset.editId;
    const courseEntry = {
        id,
        name,
        faculty: facultyName,
        facultyId: facultyId,
        department: dept,
        thumbnail: currentModalThumb,
        enrolled: editId ? (courses.find(c => c.id === editId)?.enrolled || 0) : 0
    };

    if (shouldAutoEnroll) {
        let enrollmentCount = 0;
        users = users.map(u => {
            if (u.role === 'student' && (u.department === dept || u.dept === dept)) {
                if (!u.enrolledCourses) u.enrolledCourses = [];
                if (!u.enrolledCourses.includes(id)) {
                    u.enrolledCourses.push(id);
                    enrollmentCount++;
                }
            }
            return u;
        });
        courseEntry.enrolled = (courseEntry.enrolled || 0) + enrollmentCount;
        set("systemUsers", users);
    }

    if (editId) {
        const idx = courses.findIndex(c => c.id === editId);
        if (idx > -1) courses[idx] = { ...courses[idx], ...courseEntry };
        appendAuditLog(session, 'superuser', 'UPDATE', 'Courses', `${id} — ${name}`, 'Course details updated.');
    } else {
        if (courses.some(c => c.id === id)) {
            showToast("Course ID already exists.", "error");
            return;
        }
        courses.unshift(courseEntry);
        appendAuditLog(session, 'superuser', 'CREATE', 'Courses', `${id} — ${name}`, 'New course added to system.');
    }

    set("systemCourses", courses);
    showToast("Course saved successfully.", "success");
    renderCourseTable();
    closeCourseModal();
}
window.saveCourse = saveCourse;

export function openAddCourse() {
    const form = document.getElementById('courseForm');
    form.reset();
    document.getElementById('autoEnrollDept').checked = false;
    document.getElementById('courseDeptSelect').value = '';
    delete form.dataset.editId;
    document.getElementById('courseModalTitle').textContent = 'Add Course';
    document.getElementById('courseId').disabled = false;
    document.getElementById('courseFaculty').disabled = false;
    updateModalThumbPreview();
    document.getElementById('courseModal').classList.add('active');
}
window.openAddCourse = openAddCourse;

export function openEditCourse(id) {
    const c = courses.find(c => c.id === id);
    if (!c) return;
    const form = document.getElementById('courseForm');
    document.getElementById('autoEnrollDept').checked = false;
    document.getElementById('courseId').value = c.id;
    document.getElementById('courseId').disabled = true;
    document.getElementById('courseName').value = c.name;
    document.getElementById('courseDeptSelect').value = c.department || '';
    document.getElementById('courseFaculty').value = c.facultyId;
    document.getElementById('courseFaculty').disabled = true;
    updateModalThumbPreview(c.thumbnail);
    form.dataset.editId = id;
    document.getElementById('courseModalTitle').textContent = 'Edit Course';
    document.getElementById('courseModal').classList.add('active');
}
window.openEditCourse = openEditCourse;

export function openAssignStudents(id) {
    const c = courses.find(c => c.id === id);
    if (!c) return;
    document.getElementById('assignCourseId').value = id;
    document.getElementById('assignCourseTitle').textContent = `Assign Students: ${c.name}`;
    
    // Check checkboxes for already enrolled students
    const checkboxed = document.querySelectorAll('input[name="assignStudent"]');
    checkboxed.forEach(cb => {
        const student = users.find(u => u.id === cb.value);
        cb.checked = student?.enrolledCourses?.includes(id);
    });

    document.getElementById('assignModal').classList.add('active');
}
window.openAssignStudents = openAssignStudents;

export function saveAssignments() {
    const courseId = document.getElementById('assignCourseId').value;
    const selectedStudents = Array.from(document.querySelectorAll('input[name="assignStudent"]:checked')).map(cb => cb.value);
    
    // Update Students (Users)
    users = users.map(u => {
        if (u.role !== 'student') return u;
        
        let enrolled = u.enrolledCourses || [];
        if (selectedStudents.includes(u.id)) {
            if (!enrolled.includes(courseId)) enrolled.push(courseId);
        } else {
            enrolled = enrolled.filter(cid => cid !== courseId);
        }
        return { ...u, enrolledCourses: enrolled };
    });

    // Update Course Enrollment Count
    const courseIdx = courses.findIndex(c => c.id === courseId);
    if (courseIdx > -1) {
        courses[courseIdx].enrolled = selectedStudents.length;
    }

    set("systemUsers", users);
    set("systemCourses", courses);
    
    appendAuditLog(session, 'superuser', 'ASSIGN', 'Courses', courseId, `Students assigned to course. Total: ${selectedStudents.length}`);
    showToast(`Assignments updated for ${courseId}.`, "success");
    renderCourseTable();
    closeAssignModal();
}
window.saveAssignments = saveAssignments;

export function closeCourseModal() {
    document.getElementById('courseModal').classList.remove('active');
}
window.closeCourseModal = closeCourseModal;

export function closeAssignModal() {
    document.getElementById('assignModal').classList.remove('active');
}
window.closeAssignModal = closeAssignModal;

document.getElementById('courseSearch')?.addEventListener('input', (e) => renderCourseTable(e.target.value.toLowerCase()));
