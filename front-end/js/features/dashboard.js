import { get } from "../core/storage.js";


/* =========================
HELPERS
========================= */

function getUser() {

    return JSON.parse(
        localStorage.getItem("endurSession")
    );

}



/* =========================
STATUS LOGIC
========================= */

function getStatus(course) {

    const submitted =
        get("submittedFeedback") || [];

    const drafts =
        get("feedbackDraft") || {};

    const user = getUser();


    /* reviewOfReviews special case */

    if (course === "reviewOfReviews") {

        const stored =
            get("reviewOfReviews") || [];

        return stored.find(
            r => r.userId === user.id
        )
            ? "completed"
            : "pending";

    }


    /* completed */

    if (
        submitted.find(
            f =>
                f.course === course &&
                f.userId === user.id
        )
    ) {

        return "completed";

    }


    /* progress */

    if (
        drafts[user.id] &&
        drafts[user.id][course]
    ) {

        return "progress";

    }


    return "pending";

}



/* =========================
TABLE RENDER
========================= */

export async function updateDashboard() {

    const res =
        await fetch("../../js/mock-data/courses.json");

    const courses =
        await res.json();


    const table =
        document.getElementById("dashboardTable");


    table.innerHTML = "";


    courses.forEach(course => {


        const status =
            getStatus(course.id);


        const row =
            document.createElement("tr");


        row.innerHTML = `

<td>

${course.name}

</td>


<td>

<span class="badge ${status}">

${status}

</span>

</td>


<td>

<a class="action-link">

${status === "completed"
                ? "View"
                : status === "progress"
                    ? "Resume"
                    : "Start"}

</a>

</td>

`;


        /* action behaviour */

        const action =
            row.querySelector(".action-link");


        action.onclick = () => {

            localStorage.setItem(
                "activeCourse",
                course.id
            );


            if (status === "completed") {

                window.location.href =
                    "feedback-history.html";

                return;

            }


            if (course.type === "review") {

                window.location.href =
                    "review-of-reviews.html";

                return;

            }


            window.location.href =
                "feedback-form.html";

        };


        table.appendChild(row);

    });


    if (courses.length === 0) {

        document
            .getElementById("emptyDashboard")
            .style.display = "block";

    }

}



/* =========================
STATS
========================= */

export async function updateStats() {

    const res =
        await fetch("../../js/mock-data/courses.json");

    const courses =
        await res.json();


    const submitted =
        get("submittedFeedback") || [];

    const drafts =
        get("feedbackDraft") || {};

    const review =
        get("reviewOfReviews") || [];


    const user = getUser();


    let completed = 0;
    let progress = 0;
    let pending = 0;


    courses.forEach(course => {


        /* reviewOfReviews */

        if (course.id === "reviewOfReviews") {

            const done =
                review.find(
                    r => r.userId === user.id
                );

            if (done) {

                completed++;

                return;

            }

            pending++;

            return;

        }


        /* completed */

        if (
            submitted.find(
                f =>
                    f.course === course.id &&
                    f.userId === user.id
            )
        ) {

            completed++;

            return;

        }


        /* progress */

        if (
            drafts[user.id] &&
            drafts[user.id][course.id]
        ) {

            progress++;

            return;

        }


        /* pending */

        pending++;

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
