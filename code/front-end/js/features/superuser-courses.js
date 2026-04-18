import { GET, POST, PATCH, DELETE, getSession } from '../core/api.js';
import { showToast } from './admin-utils.js';

const THUMBNAILS = ['img_backtoschool.jpg', 'img_bookclub.jpg', 'img_breakfast.jpg', 'img_learnlanguage.jpg', 'img_read.jpg'];

let courses = [];
let users = [];
let session = null;
let currentModalThumb = THUMBNAILS[0];

export async function initSuperuserCourses() {
    session = getSession();
    try {
        [courses, users] = await Promise.all([GET('/courses'), GET('/users')]);
    } catch (e) {
        showToast('Failed to load data from server.', 'error');
        courses = []; users = [];
    }
    renderCourseTable();
    populateDeptSelect();
    populateFacultySelect();
    populateStudentSelect();
}

function updateModalThumbPreview(thumb) {
    currentModalThumb = thumb || THUMBNAILS[Math.floor(Math.random() * THUMBNAILS.length)];
    const preview = document.getElementById('modalThumbPreview');
    if (preview) preview.src = `../../assets/images/${currentModalThumb}`;
}

export function shuffleCourseImage() { updateModalThumbPreview(); }
window.shuffleCourseImage = shuffleCourseImage;

function renderCourseTable(filter = '') {
    const tbody = document.getElementById('courseTableBody');
    if (!tbody) return;

    const list = filter
        ? courses.filter(c =>
            c.name.toLowerCase().includes(filter) ||
            c.id.toLowerCase().includes(filter) ||
            (c.faculty || '').toLowerCase().includes(filter) ||
            (c.department || '').toLowerCase().includes(filter))
        : courses;

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">The curriculum is currently empty.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(c => `
        <tr>
            <td style="display:flex;align-items:center;gap:12px;">
                <img src="../../assets/images/${c.thumbnail || THUMBNAILS[0]}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;">
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
                    <button class="btn-small btn-danger-soft" onclick="deleteCourse('${c.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function populateDeptSelect() {
    const dataList = document.getElementById('courseDeptList');
    if (!dataList) return;
    const depts = [...new Set(users.map(u => u.department).filter(Boolean))].sort();
    dataList.innerHTML = depts.map(d => `<option value="${d}">`).join('');
}

function populateFacultySelect() {
    const select = document.getElementById('courseFaculty');
    if (!select) return;
    const faculty = users.filter(u => u.role === 'faculty' || u.role === 'hod' || u.role === 'dean');
    select.innerHTML = '<option value="">Select Faculty</option>' + faculty.map(f => `
        <option value="${f.id}" data-name="${f.name}" data-dept="${f.department}">${f.name} (${f.department || ''})</option>
    `).join('');
}

function populateStudentSelect() {
    const container = document.getElementById('studentSelectContainer');
    if (!container) return;
    const students = users.filter(u => u.role === 'student');
    container.innerHTML = students.map(s => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:0.9rem;">
            <input type="checkbox" name="assignStudent" value="${s.id}" id="s_${s.id}">
            <label for="s_${s.id}">${s.name} <small style="color:var(--text-muted)">(${s.id})</small></label>
        </div>
    `).join('');
}

export async function saveCourse() {
    const form = document.getElementById('courseForm');
    const id = document.getElementById('courseId').value.trim();
    const name = document.getElementById('courseName').value.trim();
    const facultySelect = document.getElementById('courseFaculty');
    const facultyId = facultySelect.value;
    const facultyOption = facultySelect.options[facultySelect.selectedIndex];
    const facultyName = facultyOption?.dataset?.name || '';
    const deptSelect = document.getElementById('courseDeptSelect');
    const dept = deptSelect.value || facultyOption?.dataset?.dept || '';
    const shouldAutoEnroll = document.getElementById('autoEnrollDept')?.checked;

    if (!id || !name || !facultyId) { showToast('ID, Name, and Faculty are required.', 'error'); return; }
    
    if (!/^[a-zA-Z0-9]+$/.test(id)) { showToast('Course ID cannot contain special characters.', 'error'); return; }

    const editId = form.dataset.editId;
    const payload = { name, faculty: facultyName, facultyId, department: dept, thumbnail: currentModalThumb };

    try {
        if (editId) {
            const updated = await PATCH(`/courses/${editId}`, payload);
            const idx = courses.findIndex(c => c.id === editId);
            if (idx > -1) courses[idx] = updated;

            if (shouldAutoEnroll) {
                const deptStudents = users.filter(u => u.role === 'student' && u.department === dept).map(u => u.id);
                if (deptStudents.length) {
                    const enrolledUpdated = await POST(`/courses/${editId}/enroll`, { studentIds: deptStudents });
                    courses[idx] = enrolledUpdated;
                    users = await GET('/users'); // Refresh local students state
                }
            }
        } else {
            payload.id = id;
            const created = await POST('/courses', payload);
            courses.unshift(created);

            if (shouldAutoEnroll) {
                const deptStudents = users.filter(u => u.role === 'student' && u.department === dept).map(u => u.id);
                if (deptStudents.length) {
                    const updated = await POST(`/courses/${id}/enroll`, { studentIds: deptStudents });
                    const idx = courses.findIndex(c => c.id === id);
                    if (idx > -1) courses[idx] = updated;
                    users = await GET('/users'); // Refresh local students state
                }
            }
        }
        showToast('Course saved successfully.', 'success');
        renderCourseTable();
        closeCourseModal();
    } catch (err) {
        showToast(err.message || 'Failed to save course.', 'error');
    }
}
window.saveCourse = saveCourse;

window.deleteCourse = async (id) => {
    const c = courses.find(c => c.id === id);
    if (!c || !confirm(`Delete course "${c.name}"?`)) return;
    try {
        await DELETE(`/courses/${id}`);
        courses = courses.filter(c => c.id !== id);
        showToast('Course deleted.', 'info');
        renderCourseTable();
    } catch (err) { showToast(err.message, 'error'); }
};

export function openAddCourse() {
    const form = document.getElementById('courseForm');
    form.reset();
    if (document.getElementById('autoEnrollDept')) document.getElementById('autoEnrollDept').checked = false;
    if (document.getElementById('courseDeptSelect')) document.getElementById('courseDeptSelect').value = '';
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
    if (document.getElementById('autoEnrollDept')) document.getElementById('autoEnrollDept').checked = false;
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
    const checkboxed = document.querySelectorAll('input[name="assignStudent"]');
    checkboxed.forEach(cb => {
        const student = users.find(u => u.id === cb.value);
        cb.checked = student?.enrolledCourses?.includes(id) || false;
    });
    document.getElementById('assignModal').classList.add('active');
}
window.openAssignStudents = openAssignStudents;

export async function saveAssignments() {
    const courseId = document.getElementById('assignCourseId').value;
    const selectedStudents = Array.from(document.querySelectorAll('input[name="assignStudent"]:checked')).map(cb => cb.value);
    try {
        const updated = await POST(`/courses/${courseId}/enroll`, { studentIds: selectedStudents });
        const courseIdx = courses.findIndex(c => c.id === courseId);
        if (courseIdx > -1) courses[courseIdx] = updated;
        users = await GET('/users'); // Refresh local students state to reflect new enrollments
        showToast(`Assignments updated for ${courseId}.`, 'success');
        renderCourseTable();
        closeAssignModal();
    } catch (err) { showToast(err.message, 'error'); }
}
window.saveAssignments = saveAssignments;

export function closeCourseModal() { document.getElementById('courseModal').classList.remove('active'); }
window.closeCourseModal = closeCourseModal;

export function closeAssignModal() { document.getElementById('assignModal').classList.remove('active'); }
window.closeAssignModal = closeAssignModal;

document.getElementById('courseSearch')?.addEventListener('input', (e) => renderCourseTable(e.target.value.toLowerCase()));
