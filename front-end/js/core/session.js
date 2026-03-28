function getSession(){

return JSON.parse(
localStorage.getItem("endurSession")
);

}


function requireAuth(){

const session = getSession();

if(!session){

window.location.href =
"../../login.html";

}

return session;

}
