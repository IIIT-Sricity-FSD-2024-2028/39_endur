import { get,set } from "../core/storage.js";

const ratings = {};


export function initSelfReflection(){

createStars("clarityRating","clarity");

createStars("engagementRating","engagement");

createStars("assessmentRating","assessment");

loadDraft();

bindTextDraft();

}



function createStars(containerId,field){

const container =
document.getElementById(containerId);


for(let i=1;i<=5;i++){

const star =
document.createElement("span");

star.innerText="★";


star.onclick=()=>{

ratings[field]=i;

highlight(container,i);

saveDraft();

};


container.appendChild(star);

}

}



function highlight(container,value){

const stars =
container.querySelectorAll("span");


stars.forEach((s,index)=>{

s.classList.toggle(

"active",

index<value

);

});

}



function saveDraft(){

const user =
get("endurSession");


let drafts =
get("selfReflectionDraft") || {};


drafts[user.id]={

ratings,

text:
document.getElementById(
"reflectionText"
).value

};


set(
"selfReflectionDraft",
drafts
);

}



function loadDraft(){

const user =
get("endurSession");


let drafts =
get("selfReflectionDraft") || {};


if(!drafts[user.id]) return;


Object.assign(
ratings,
drafts[user.id].ratings
);


document.getElementById(
"reflectionText"
).value =
drafts[user.id].text || "";


/* re-highlight */

Object.entries(ratings)
.forEach(([field,value])=>{

highlight(

document.getElementById(
field+"Rating"
),

value

);

});

}



function bindTextDraft(){

document
.getElementById("reflectionText")
.addEventListener(

"input",

saveDraft

);

}



window.submitSelfReflection=function(){

if(Object.keys(ratings).length<3){

alert(
"Please complete all ratings"
);

return;

}


const user =
get("endurSession");


let stored =
get("selfReflection") || [];


stored.push({

userId:user.id,

ratings,

text:
document.getElementById(
"reflectionText"
).value,

date:new Date().toISOString()

});


set(
"selfReflection",
stored
);


let drafts =
get("selfReflectionDraft") || {};


delete drafts[user.id];


set(
"selfReflectionDraft",
drafts
);



window.location.href="gap-analysis.html";
};
