import { get } from "../core/storage.js";


async function getCourses(){

const res =
await fetch("../../js/mock-data/courses.json");

return await res.json();

}



export async function renderFacultyDashboard(){

const user =
get("endurSession");


const courses =
await getCourses();


const myCourses =
courses.filter(
c => c.facultyId === user.id
);



const submissions =
get("submittedFeedback") || [];


/* metrics */

let totalScore = 0;
let totalResponses = 0;
let totalStudents = 0;

let pendingReflection = 0;



const table =
document.getElementById("courseTable");


table.innerHTML = "";



myCourses.forEach(course=>{


const courseFeedback =
submissions.filter(
f => f.course === course.id
);


/* responses */

const responses =
courseFeedback.length;


/* avg rating */

let avgRating = 0;


if(responses>0){

let sum = 0;

courseFeedback.forEach(f=>{

const avg =
Object.values(f.ratings)
.reduce((a,b)=>a+b,0)

/

Object.keys(f.ratings).length;


sum += avg;

});


avgRating =
(sum / responses) * 20;


totalScore += avgRating;

}


totalResponses += responses;

totalStudents += course.enrolled || 50;


/* reflection placeholder */

const reflections =
get("selfReflection") || [];


const hasReflection =
reflections.find(
r =>
r.course === course.id &&
r.userId === user.id
);


if(!hasReflection){

pendingReflection++;

}



/* table row */

table.innerHTML +=

`
<tr>

<td>

${course.id}

</td>


<td>

${course.name}

</td>


<td>

${course.enrolled || 0}

</td>


<td>

<span class="badge">

${responses>0
? "Active"
: "Waiting"}

</span>

</td>


<td>

${avgRating.toFixed(0)}%

</td>

</tr>

`;

});



/* stats */

document.getElementById("avgScore").innerText =

myCourses.length
? (totalScore / myCourses.length).toFixed(0)
: 0;



document.getElementById("responseRate").innerText =

totalStudents
? Math.round(
(totalResponses / totalStudents) * 100
) + "%"
: "0%";



document.getElementById("pendingReflection").innerText =
pendingReflection;



document.getElementById("gapScore").innerText =
"0";

}
