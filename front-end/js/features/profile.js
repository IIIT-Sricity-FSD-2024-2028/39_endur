import { get, set, remove } from "../core/storage.js";

export async function initProfile() {
    const user = get("endurSession");
    if (!user) return;

    // Populate UI
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setText("userName", user.name);
    setText("userDept", user.department);
    setText("profileName", user.name);
    setText("profileId", user.id);
    setText("profileDept", user.department);
    setText("profileEmail", user.email || `${user.id.toLowerCase()}@endur.edu`);

    const avatar = document.getElementById("avatar");
    if (avatar) {
        avatar.innerText = user.name.split(" ").map(n => n[0]).join("");
    }

    // Role Switching Logic
    const deanRow = document.getElementById("deanSwitchRow");
    const hodRow = document.getElementById("hodSwitchRow");

    // Show Dean switch if current user is HOD/Faculty with Dean status
    if (deanRow && user.secondaryRoles && user.secondaryRoles.includes("dean")) {
        deanRow.style.display = "flex";
    }

    // Show HOD switch if current user is Faculty with HOD status
    if (hodRow && user.secondaryRoles && user.secondaryRoles.includes("hod")) {
        hodRow.style.display = "flex";
    }

    window.logout = logout;
    window.switchRole = switchRole;
}

function logout() {
    remove("endurSession");
    window.location.href = "../../login.html";
}

async function switchRole(targetRole) {
    const currentUser = get("endurSession");
    
    // 1. Fetch users to find the specific ID for the target role
    const res = await fetch("../../js/mock-data/users.json");
    const allUsers = await res.json();

    // 2. Find the user object that matches the NAME but has the TARGET ROLE
    // This allows switching between H101 (HOD) and F104 (Faculty) for the same person.
    const targetUser = allUsers.find(u => u.name === currentUser.name && u.role === targetRole);

    if (targetUser) {
        set("endurSession", targetUser);
        window.location.href = `../${targetRole}/dashboard.html`;
    } else {
        // Fallback: If no dedicated account exists, just swap the role string 
        // (Useful for Dean/Admin who don't have secondary Faculty accounts)
        currentUser.role = targetRole;
        set("endurSession", currentUser);
        window.location.href = `../${targetRole}/dashboard.html`;
    }
}
