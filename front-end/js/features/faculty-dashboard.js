export async function renderFacultyDashboard(){

const res =
await fetch("../../js/mock-data/faculty-courses.json");

const courses =
await res.json();


const table =
document.getElementById("facultyCourses");


let totalRating = 0;

let activeCourses = 0;

let completedCourses = 0;


courses.forEach(course=>{


if(course.status==="active"){

activeCourses++;

}


if(course.status==="completed"){

completedCourses++;

}


totalRating += course.avgRating;


const row =
document.createElement("tr");


row.innerHTML = `

<td>

${course.id}

</td>


<td>

${course.name}

</td>


<td>

${course.enrolled}

</td>


<td>

<span class="badge ${course.status}">

${course.status}

</span>

</td>


<td>

${course.avgRating.toFixed(1)}

</td>

`;


table.appendChild(row);

});


/* stats */

const avgRating =
(totalRating / courses.length)
.toFixed(1);


document.getElementById(
"statSatisfaction"
).innerText =
avgRating * 20;


document.getElementById(
"statResponse"
).innerText =
Math.round(
85 + Math.random()*10
) + "%";


document.getElementById(
"statPending"
).innerText =
activeCourses;


document.getElementById(
"statGap"
).innerText =
"-0.2%";

}
