/* store rating selections */

const ratings = {};


/* star click */

function setRating(field, value) {

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


    /* save draft */

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



/* submit */

function submitFeedback() {

    const course = localStorage.getItem("activeCourse");

    /* load previous submissions */

    let submitted =
        JSON.parse(
            localStorage.getItem("submittedFeedback")
        ) || [];


    /* simulate CRUD create */

    submitted.push({

        course,
        ratings,
        date: new Date().toISOString(),

        status: "processed"

    });


    localStorage.setItem(
        "submittedFeedback",
        JSON.stringify(submitted)
    );

    if (Object.keys(ratings).length < 4) {

        alert(
            "Please answer all questions before submitting."
        );

        return;

    }
    /* clear draft */

    localStorage.removeItem("feedbackDraft");


    window.location.href =
        "feedback-success.html";

}



/* load draft if resume */

function loadDraft() {

    const draft =
        JSON.parse(
            localStorage.getItem("feedbackDraft")
        );

    if (!draft) return;

    Object.assign(ratings, draft);

}


loadDraft();
