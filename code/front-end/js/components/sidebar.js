import { getSession } from "../core/session.js";

export function loadSidebar(activePage){

const user = getSession();

document.getElementById("userName").innerText =
user.name;

document.getElementById("userDept").innerText =
user.department;


/* optional role label */

const roleLabel =
document.getElementById("roleLabel");

if(roleLabel){

roleLabel.innerText =
`${user.role} portal`;

}


/* avatar initials */

const avatar =
document.getElementById("avatar");

if(avatar){

const initials =
user.name
.split(" ")
.map(n=>n[0])
.join("");

avatar.innerText = initials;

}


/* active link */

document
.querySelectorAll("[data-link]")
.forEach(link=>{

if(link.dataset.link === activePage){

link.classList.add("active");

}

});

}
