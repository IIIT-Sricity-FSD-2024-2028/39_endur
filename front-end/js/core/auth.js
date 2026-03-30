async function loginUser(event) {
    event.preventDefault();

    const id = document.getElementById("userId").value.trim();
    const password = document.getElementById("password").value;

    try {
        // Fetch from root directory path
        const response = await fetch("./js/mock-data/users.json");
        const users = await response.json();

        // Find user by ID and Password
        const user = users.find(u => u.id === id && u.password === password);

        if (!user) {
            showError("Invalid Institutional ID or password.");
            return;
        }

        // Save session to Local Storage
        localStorage.setItem("endurSession", JSON.stringify(user));

        // Redirect based on role
        redirectUser(user.role);

    } catch (error) {
        console.error("Login Error:", error);
        showError("System error connecting to user database.");
    }
}

function redirectUser(role) {
    const routes = {
        student: "pages/student/dashboard.html",
        faculty: "pages/faculty/dashboard.html",
        hod: "pages/hod/dashboard.html",
        dean: "pages/dean/dashboard.html",
        admin: "pages/admin/dashboard.html",
        superuser: "pages/superuser/dashboard.html"
    };

    if (routes[role]) {
        window.location.href = routes[role];
    } else {
        showError("Invalid role assignment. Contact Admin.");
    }
}

function showError(msg) {
    const errorEl = document.getElementById("errorMsg");
    if (errorEl) {
        errorEl.innerText = msg;
        errorEl.style.display = "block";
    }
}

// Bind the form submission
const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", loginUser);
}
