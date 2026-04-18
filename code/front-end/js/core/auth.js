import { POST, setSession } from './api.js';

async function loginUser(event) {
    event.preventDefault();

    const id = document.getElementById('userId').value.trim();
    const password = document.getElementById('password').value;

    try {
        // Call backend login endpoint
        const user = await POST('/auth/login', { id, password });

        // Save session
        setSession(user);

        // Redirect based on role
        redirectUser(user.role);

    } catch (error) {
        if (error.status === 401) {
            showError('Invalid Institutional ID or password.');
        } else {
            console.error('Login Error:', error);
            showError('System error. Make sure the backend server is running.');
        }
    }
}

function redirectUser(role) {
    const routes = {
        student:    'pages/student/dashboard.html',
        faculty:    'pages/faculty/dashboard.html',
        hod:        'pages/hod/dashboard.html',
        dean:       'pages/dean/dashboard.html',
        admin:      'pages/admin/dashboard.html',
        superuser:  'pages/superuser/dashboard.html',
    };

    if (routes[role]) {
        window.location.href = routes[role];
    } else {
        showError('Invalid role assignment. Contact Admin.');
    }
}

function showError(msg) {
    const errorEl = document.getElementById('errorMsg');
    if (errorEl) {
        errorEl.innerText = msg;
        errorEl.style.display = 'block';
    }
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', loginUser);
}
