import { GET, POST, PATCH, DELETE, getSession } from '../core/api.js';
import { showToast } from './admin-utils.js';

const THUMBNAILS = ['img_backtoschool.jpg', 'img_bookclub.jpg', 'img_breakfast.jpg', 'img_learnlanguage.jpg', 'img_read.jpg'];

let courses = [];
let users = [];
let departments = [];
let session = null;
let currentModalThumb = THUMBNAILS[0];

export async function initSuperuserCourses() {
    session = getSession();
    try {
        [courses, users, departments] = await Promise.all([GET('/courses'), GET('/users'), GET('/departments')]);
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
    const dataList = document.getElementById('courseDeptSelect');
    if (!dataList) return;
    
    dataList.innerHTML = '<option value="">Select Department</option>' + 
        departments.map(d => `<option value="${d.name}" data-id="${d.id}">${d.name}</option>`).join('');
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
                    users = await GET('/users');
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
                    users = await GET('/users');
                }
            }
        }
        showToast('Course saved successfully.', 'success');
        renderCourseTable();
        closeCourseModal();
    } catch (err) { showToast(err.message || 'Failed to save course.', 'error'); }
}

export async function deleteCourse(id) {
    const c = courses.find(c => c.id === id);
    if (!c || !confirm(`Delete course "${c.name}"?`)) return;
    try {
        await DELETE(`/courses/${id}`);
        courses = courses.filter(c => c.id !== id);
        showToast('Course deleted.', 'info');
        renderCourseTable();
    } catch (err) { showToast(err.message, 'error'); }
}

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

export async function saveAssignments() {
    const courseId = document.getElementById('assignCourseId').value;
    const selectedStudents = Array.from(document.querySelectorAll('input[name="assignStudent"]:checked')).map(cb => cb.value);
    try {
        const updated = await POST(`/courses/${courseId}/enroll`, { studentIds: selectedStudents });
        const courseIdx = courses.findIndex(c => c.id === courseId);
        if (courseIdx > -1) courses[courseIdx] = updated;
        users = await GET('/users');
        showToast(`Assignments updated for ${courseId}.`, 'success');
        renderCourseTable();
        closeAssignModal();
    } catch (err) { showToast(err.message, 'error'); }
}

export function closeCourseModal() { document.getElementById('courseModal').classList.remove('active'); }
export function closeAssignModal() { document.getElementById('assignModal').classList.remove('active'); }

// Bind search
document.getElementById('courseSearch')?.addEventListener('input', (e) => renderCourseTable(e.target.value.toLowerCase()));

// ===== BULK IMPORT =====
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        if (obj.enrolled) obj.enrolled = Number(obj.enrolled) || 0;
        return obj;
    });
}

export function openCourseBulkModal() {
    document.getElementById('courseBulkModal')?.classList.add('active');
    document.getElementById('courseBulkPreviewSection').style.display = 'none';
    document.getElementById('courseBulkFileInput').value = '';
}

export function closeCourseBulkModal() {
    document.getElementById('courseBulkModal')?.classList.remove('active');
}

export async function previewCourseBulkFile() {
    const file = document.getElementById('courseBulkFileInput')?.files[0];
    if (!file) { showToast('Please select a file first.', 'error'); return; }
    const text = await file.text();
    let parsed = [];
    try {
        if (file.name.endsWith('.json')) { const raw = JSON.parse(text); parsed = Array.isArray(raw) ? raw : raw.courses || []; }
        else if (file.name.endsWith('.csv')) { parsed = parseCSV(text); }
        else { showToast('Only .json and .csv files are supported.', 'error'); return; }
    } catch (err) { showToast('Failed to parse file: ' + err.message, 'error'); return; }

    if (!parsed.length) { showToast('No valid data found.', 'error'); return; }

    const missing = parsed.filter(c => !c.id || !c.name || !c.facultyId);
    if (missing.length) { showToast(`${missing.length} rows missing required fields (id, name, facultyId).`, 'error'); return; }

    window.__bulkCourseData = parsed;
    const preview = document.getElementById('courseBulkPreviewBody');
    if (preview) preview.innerHTML = parsed.slice(0, 20).map(c => `<tr><td><code>${c.id}</code></td><td>${c.name}</td><td>${c.facultyId}</td><td>${c.department || '—'}</td></tr>`).join('');
    const section = document.getElementById('courseBulkPreviewSection');
    if (section) { section.style.display = 'block'; document.getElementById('courseBulkPreviewCount').textContent = `${parsed.length} courses to import`; }
}

export async function commitCourseBulkImport() {
    const data = window.__bulkCourseData;
    if (!data?.length) { showToast('No data to import.', 'error'); return; }
    const btn = document.getElementById('commitCourseBulkBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    try {
        const result = await POST('/courses/bulk', { courses: data });
        const { success, failed, total } = result;
        courses.unshift(...success);
        renderCourseTable();
        showToast(`Imported ${success.length}/${total} courses. ${failed.length ? failed.length + ' failed.' : ''}`, success.length > 0 ? 'success' : 'error');
        closeCourseBulkModal();
    } catch (err) { showToast('Bulk import failed: ' + err.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Confirm Import'; } }
}
