export function getSession() {

    return JSON.parse(
        localStorage.getItem("endurSession")
    );

}


export function requireAuth() {
    const session = getSession();

    if (!session) {
        window.location.replace("../../login.html");
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
