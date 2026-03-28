/* =========================
   GLOBAL STATE
========================= */

const ratings = {};

window.ratings = ratings;


/* =========================
   STAR CLICK
========================= */

window.setRating = function(field,value){

ratings[field] = value;


/* highlight stars */

const stars =
document.querySelectorAll(

`[onclick*="${field}"]`

);


stars.forEach((star,index)=>{

star.classList.toggle(

"active",

index < value

);

});


saveDraft();

};



/* =========================
   SAVE DRAFT
========================= */

function saveDraft(){

const course =
localStorage.getItem("activeCourse");


let drafts =
JSON.parse(
localStorage.getItem("feedbackDraft")
) || {};


drafts[course] = ratings;


localStorage.setItem(

"feedbackDraft",

JSON.stringify(drafts)

);

}



/* =========================
   LOAD DRAFT
========================= */

function loadDraft(){

const course =
localStorage.getItem("activeCourse");


let drafts =
JSON.parse(
localStorage.getItem("feedbackDraft")
) || {};


if(!drafts[course]) return;


Object.assign(

ratings,

drafts[course]

);


/* re-highlight stars */

Object.entries(ratings)
.forEach(([field,value])=>{

const stars =
document.querySelectorAll(

`[onclick*="${field}"]`

);


stars.forEach((star,index)=>{

star.classList.toggle(

"active",

index < value

);

});

});

}


loadDraft();



/* =========================
   SUBMIT
========================= */

window.submitFeedback = function(){

if(Object.keys(ratings).length < 4){

alert(
"Please answer all questions before submitting."
);

return;

}


const course =
localStorage.getItem("activeCourse");


let submitted =
JSON.parse(
localStorage.getItem("submittedFeedback")
) || [];


submitted.push({

course,

ratings,

date:new Date().toISOString(),

status:"processed"

});


localStorage.setItem(

"submittedFeedback",

JSON.stringify(submitted)

);


/* remove draft */

let drafts =
JSON.parse(
localStorage.getItem("feedbackDraft")
) || {};


delete drafts[course];


localStorage.setItem(

"feedbackDraft",

JSON.stringify(drafts)

);


window.location.href =
"feedback-success.html";

};



/* =========================
   CLOSE BUTTON
========================= */

window.goBack = function(){

window.history.back();

};
