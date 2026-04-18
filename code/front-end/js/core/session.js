export function getSession() {

    return JSON.parse(
        localStorage.getItem("endurSession")
    );

}


export function requireAuth() {
    const session = getSession();
    if (!session) {
        window.location.href = "../../login.html";
        return null;
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
