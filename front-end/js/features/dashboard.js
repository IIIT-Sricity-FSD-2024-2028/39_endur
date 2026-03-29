import { get } from "../core/storage.js";


/* =============================
LOAD COURSES
============================= */

async function getCourses(){

const res =
await fetch("../../js/mock-data/courses.json");

return await res.json();

}


/* =============================
STATUS LOGIC
============================= */

function getStatus(courseId,userId){

const submitted =
get("submittedFeedback") || [];

const drafts =
get("feedbackDraft") || {};


/* completed */

if(
submitted.find(
f =>
f.course === courseId &&
f.userId === userId
)
){

return "completed";

}


/* in progress */

if(
drafts[userId] &&
drafts[userId][courseId]
){

return "progress";

}


return "pending";

}



/* =============================
DASHBOARD TABLE
============================= */

export async function updateDashboard(){

const courses =
await getCourses();


const user =
get("endurSession");


const table =
document.getElementById("dashboardTable");


table.innerHTML = "";


courses
.filter(
c =>
c.type === "standard" ||
c.type === "review"
)
.forEach(course=>{


const status =
getStatus(course.id,user.id);


/* routing logic */

let actionClick =
"";


if(status==="completed"){

actionClick =
"window.location.href='feedback-history.html'";

}

else{

actionClick =
`openFeedback('${course.id}')`;

}


table.innerHTML +=

`
<tr data-course="${course.id}">

<td>

<strong>${course.name}</strong>

<br>

<span class="sub-text">

${course.id}

</span>

</td>


<td>

<span class="badge ${status}">

${statusLabel(status)}

</span>

</td>


<td>

<span
class="action-link"
onclick="${actionClick}"
>

${statusAction(status)}

</span>

</td>

</tr>

`;

});


if(table.innerHTML===""){

document
.getElementById("emptyDashboard")
.style.display="block";

}

}



/* =============================
STATS
============================= */

export async function updateStats(){

const courses =
await getCourses();


const user =
get("endurSession");


let completed = 0;
let progress = 0;
let pending = 0;


courses.forEach(course=>{

const status =
getStatus(course.id,user.id);

if(status==="completed") completed++;

else if(status==="progress") progress++;

else pending++;

});


document.getElementById("statCompleted").innerText =
completed;


document.getElementById("statProgress").innerText =
progress;


document.getElementById("statPending").innerText =
pending;


document.getElementById("statTotal").innerText =
courses.length;

}



/* =============================
HELPERS
============================= */

function statusLabel(status){

return{

pending:"Pending",

progress:"In Progress",

completed:"Completed"

}[status];

}



function statusAction(status){

return{

pending:"Start",

progress:"Resume",

completed:"View"

}[status];

}
