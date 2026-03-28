import { requireAuth } from "../core/session.js";

export function loadUser(){

const user = requireAuth();

document.getElementById("userName").innerText =
user.name || "Student";

document.getElementById("userDept").innerText =
user.department || "Computer Science";

}
