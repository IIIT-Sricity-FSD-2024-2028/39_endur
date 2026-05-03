import { requireAuth } from "../core/session.js";

export function loadUser(){
    const user = requireAuth();
    const nameEl = document.getElementById("userName");
    const deptEl = document.getElementById("userDept");
    
    if (nameEl) nameEl.innerText = user.name || "User";
    if (deptEl) deptEl.innerText = user.department || "General";
}
