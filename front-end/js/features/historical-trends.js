export function renderHistoricalTrends(){

/* mock semester data */

const semesters =
[74,81,85,88];


document.getElementById(
"overallScore"
).innerText =
semesters[semesters.length-1] + "%";



/* simple line */

const line =
document.getElementById("trendLine");


semesters.forEach(score=>{

const dot =
document.createElement("div");

dot.className="trend-dot";

dot.style.bottom =
score+"%";


line.appendChild(dot);

});



/* mini charts */

createBars(
"clarityBars",
[60,70,78,85]
);


createBars(
"engagementBars",
[55,68,75,82]
);


createBars(
"assessmentBars",
[72,80,83,90]
);

}



function createBars(container,data){

const el =
document.getElementById(container);


data.forEach(value=>{

const bar =
document.createElement("div");

bar.className="bar";

bar.style.height =
value+"%";


el.appendChild(bar);

});

}
