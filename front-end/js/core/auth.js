async function loginUser(event){

event.preventDefault();

const id = document.getElementById("userId").value;

const password = document.getElementById("password").value;


const response = await fetch("./js/mock-data/users.json");

const users = await response.json();


const user = users.find(

u => u.id === id && u.password === password

);


if(!user){

showError("Invalid ID or password");

return;

}


/* save session */

localStorage.setItem(

"endurSession",

JSON.stringify(user)

);


/* redirect based on role */

redirectUser(user.role);

}



function redirectUser(role){

const routes = {

student: "pages/student/dashboard.html",

faculty: "pages/faculty/dashboard.html",

hod: "pages/hod/dashboard.html",

dean: "pages/dean/dashboard.html",

admin: "pages/admin/dashboard.html",

superuser: "pages/superuser/dashboard.html"

};


window.location.href = routes[role];

}



function showError(msg){

document.getElementById("errorMsg").innerText = msg;

}



document
.getElementById("loginForm")
.addEventListener("submit", loginUser);



function goHome(){

window.location.href = "index.html";

}
