import { get, set, remove } from "../core/storage.js";

export function initProfile() {
    const user = get("endurSession");
    if (!user) return;

    // Helper to safely set text without crashing if the ID doesn't exist
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    /* sidebar & generic profile info */
    setText("userName", user.name);
    setText("userDept", user.department);
    setText("profileName", user.name);
    setText("profileId", user.id);
    setText("profileDept", user.department);
    setText("profileEmail", user.email || `${user.id.toLowerCase()}@endur.edu`);

    /* avatar initials */
    const avatar = document.getElementById("avatar");
    if (avatar) {
        avatar.innerText = user.name.split(" ").map(n => n[0]).join("");
    }

    /* Multi-Role Visibility Logic */
    const hodRow = document.getElementById("hodSwitchRow");
    const deanRow = document.getElementById("deanSwitchRow");

    // Check if user has secondaryRoles array in users.json
    if (user.secondaryRoles && Array.isArray(user.secondaryRoles)) {
        if (hodRow && user.secondaryRoles.includes("hod")) {
            hodRow.style.display = "flex"; // Unhide HOD row
        }
        if (deanRow && user.secondaryRoles.includes("dean")) {
            deanRow.style.display = "flex"; // Unhide Dean row
        }
    }

    /* expose actions to window so HTML onclicks work */
    window.logout = logout;
    window.switchRole = switchRole;
}

function logout() {
    remove("endurSession");
    window.location.href = "../../login.html";
}

/* simulate multi-role switching */
function switchRole(role) {
    const user = get("endurSession");
    
    // We update the active role in the session and re-save
    user.role = role;
    set("endurSession", user);

    // Redirect to the appropriate dashboard
    window.location.href = `../${role}/dashboard.html`;
}
