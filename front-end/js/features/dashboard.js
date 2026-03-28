import { get } from "../core/storage.js";

const submitted =
get("submittedFeedback") || [];

const draft =
get("feedbackDraft") || [];


/* status logic */

function getStatus(course){

if(course === "reviewOfReviews"){

const stored =
get("reviewOfReviews") || [];

return stored.length > 0
? "completed"
: "pending";

}


if(submitted.find(f=>f.course===course)){

return "completed";

}


if(draft[course]){

return "progress";

}

return "pending";

}



/* render table */

export function updateDashboard(){

const rows =
document.querySelectorAll("[data-course]");


if(rows.length===0){

document.getElementById(
"emptyDashboard"
).style.display="block";

return;

}


rows.forEach(row=>{

const course =
row.dataset.course;


const status =
getStatus(course);


const badge =
row.querySelector(".badge");


const action =
row.querySelector(".action-link");


if(status==="completed"){

badge.innerText="Completed";

badge.className=
"badge complete";


action.innerText="View";


action.onclick=
()=>window.location.href=
"feedback-history.html";

}


else if(status==="progress"){

badge.innerText="In Progress";

badge.className=
"badge progress";


action.innerText="Resume";


action.onclick=
()=>openFeedback(course);

}


else{

badge.innerText="Pending";

badge.className=
"badge pending";


action.innerText="Start";


action.onclick=
()=>openFeedback(course);

}

});

}
