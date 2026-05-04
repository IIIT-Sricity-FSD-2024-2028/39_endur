export function getSession() {

    return JSON.parse(
        localStorage.getItem("endurSession")
    );

}


export function requireAuth(allowedRole = null) {
    const session = getSession();

    if (!session) {
        window.location.replace("../../login.html");
        return null;
    }

    // Role Guard
    if (allowedRole && session.role !== allowedRole) {
        // If they have a role but it's not the right one, send them to their own dashboard
        const dashboardMap = {
            'student': '../student/dashboard.html',
            'faculty': '../faculty/dashboard.html',
            'hod':     '../hod/dashboard.html',
            'dean':    '../dean/dashboard.html',
            'admin':   '../admin/dashboard.html',
            'superuser': '../superuser/dashboard.html'
        };
        const target = dashboardMap[session.role] || '../../login.html';
        window.location.replace(target);
        return null;
    }

    // SPA Guard against Back-button via bfcache
    if (!window._bfcacheGuardAttached) {
        window.addEventListener("pageshow", function (event) {
            if (event.persisted && !getSession()) {
                window.location.replace("../../login.html");
            }
        });
        window._bfcacheGuardAttached = true;
    }

    const setAvatars = () => {
        const initials = session.name.split(" ").map(n => n[0]).join("").toUpperCase();
        document.querySelectorAll(".avatar, #avatar").forEach(el => {
            if (!el.innerText) el.innerText = initials;
        });
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setAvatars);
    } else {
        setAvatars();
    }

    return session;
}
