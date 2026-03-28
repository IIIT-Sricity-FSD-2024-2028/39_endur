export async function renderFacultyReports(){

const res =
await fetch("../../js/mock-data/faculty-feedback-summary.json");

const data =
await res.json();



document.getElementById(
"avgRating"
).innerText =
`${data.current.avgRating}/5`;


document.getElementById(
"actionCourse"
).innerText =
data.actionRequired.course;


document.getElementById(
"actionDeadline"
).innerText =
data.actionRequired.deadline;


/* simple chart bars */

const chart =
document.getElementById("trendChart");


data.history.forEach(item=>{

const bar =
document.createElement("div");

bar.className =
"chart-bar";

bar.style.height =
(item.rating * 20) + "px";


chart.appendChild(bar);

});

}



window.openCurrentFeedback = function(){

alert("Opens detailed feedback table (next phase)");

};


window.viewArchive = function(){

alert("Shows semester comparison view");

};


window.startActionReport = function(){

window.location.href =
"action-report.html";

};
