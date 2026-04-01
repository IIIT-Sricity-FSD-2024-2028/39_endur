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

    // Force clear the legacy active mock cycle so testers see an empty tracker
    let cycles = JSON.parse(localStorage.getItem('systemFeedbackCycles')) || [];
    let w4 = cycles.find(c => c.cycleId === 'CYCLE_W4' && c.status === 'active');
    if (w4) {
        w4.status = 'closed';
        w4.phase = 'COMPLETED';
        localStorage.setItem('systemFeedbackCycles', JSON.stringify(cycles));
    }

    // Force global sync of systemCycleState for all generic pages (e.g. students, faculty)
    let activeSync = cycles.find(c => c.status === "active");
    if (activeSync) {
        localStorage.setItem("systemCycleState", JSON.stringify({ 
            id: activeSync.cycleName || activeSync.cycleId, 
            phase: activeSync.phase || "STUDENT_FEEDBACK" 
        }));
    } else {
        localStorage.setItem("systemCycleState", JSON.stringify({ phase: "COMPLETED" }));
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
