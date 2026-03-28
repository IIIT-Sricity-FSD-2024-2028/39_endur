/* =========================
GLOBAL STATE
========================= */

const ratings = {};

window.ratings = ratings;


/* =========================
STAR CLICK
========================= */

window.setRating =
   function (field, value) {

      ratings[field] = value;


      /* highlight stars */

      const stars =
         document.querySelectorAll(
            `[onclick*="${field}"]`
         );


      stars.forEach((star, index) => {

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

function saveDraft() {

   const course =
      localStorage.getItem("activeCourse");


   let drafts =
      JSON.parse(
         localStorage.getItem("feedbackDraft")
      ) || {};


   const user =
      JSON.parse(
         localStorage.getItem("endurSession")
      );


   if (!drafts[user.id]) {

      drafts[user.id] = {};

   }


   drafts[user.id][course] = {

      ratings,

      comment:
         document.getElementById(
            "commentBox"
         ).value

   };


   localStorage.setItem(
      "feedbackDraft",
      JSON.stringify(drafts)
   );

}



/* =========================
LOAD DRAFT
========================= */

function loadDraft() {

   const course =
      localStorage.getItem("activeCourse");


   let drafts =
      JSON.parse(
         localStorage.getItem("feedbackDraft")
      ) || {};


   const user =
      JSON.parse(
         localStorage.getItem("endurSession")
      );


   if (
      !drafts[user.id] ||
      !drafts[user.id][course]
   ) return;


   const saved =
      drafts[user.id][course];

   Object.assign(
      ratings,
      saved.ratings || {}
   );

   /* restore comment */

   document.getElementById(
      "commentBox"
   ).value =
      saved.comment || "";


   /* highlight stars */

   Object.entries(ratings)
      .forEach(([field, value]) => {

         const stars =
            document.querySelectorAll(
               `[onclick*="${field}"]`
            );


         stars.forEach((star, index) => {

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

window.submitFeedback =
   function () {

      if (
         Object.keys(ratings).length < 4
      ) {

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


      const user =
         JSON.parse(
            localStorage.getItem("endurSession")
         );


      submitted.push({

         userId: user.id,

         course,

         ratings,

         comment:
            document.getElementById(
               "commentBox"
            ).value,

         date: new Date().toISOString(),

         status: "processed"

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


      if (
         drafts[user.id]
      ) {

         delete drafts[user.id][course];

      }


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

window.goBack =
   function () {

      window.history.back();

   };

document
   .getElementById("commentBox")
   .addEventListener(

      "input",

      saveDraft

   );
