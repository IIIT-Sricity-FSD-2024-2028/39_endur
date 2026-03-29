import { get,set,remove }
from "../core/storage.js";


export function initProfile(){

const user =
get("endurSession");


/* sidebar */

document.getElementById(
"userName"
).innerText =
user.name;


document.getElementById(
"userDept"
).innerText =
user.department;



/* avatar initials */

document.getElementById(
"avatar"
).innerText =
user.name
.split(" ")
.map(n=>n[0])
.join("");



/* profile info */

document.getElementById(
"profileName"
).innerText =
user.name;


document.getElementById(
"profileId"
).innerText =
user.id;


document.getElementById(
"profileDept"
).innerText =
user.department;


document.getElementById(
"profileEmail"
).innerText =
user.email
|| `${user.id.toLowerCase()}@endur.edu`;



/* expose actions */

window.logout = logout;

window.switchRole = switchRole;

}



function logout(){

remove("endurSession");

window.location.href =
"../../login.html";

}



/* simulate multi-role */

function switchRole(role){

const user =
get("endurSession");


user.role = role;


set(
"endurSession",
user
);


window.location.href =
`../${role}/dashboard.html`;

}
