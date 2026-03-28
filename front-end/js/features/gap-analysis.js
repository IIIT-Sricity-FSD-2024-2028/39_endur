import { get } from "../core/storage.js";


export function renderGapAnalysis() {

    const studentData =
        get("submittedFeedback") || [];


    const reflectionData =
        get("selfReflection") || [];


    const user =
        get("endurSession");


    /* latest reflection */

    const reflection =
        reflectionData
            .filter(
                r => r.userId === user.id
            )
            .pop();


    if (!reflection) {

        alert("No reflection found");

        return;

    }


    /* simulate student averages */

    const studentAvg = {

        clarity: 4.2,

        engagement: 3.8,

        assessment: 3.0

    };


    /* calculate */

    const rows = [];


    let totalSelf = 0;

    let totalStudent = 0;


    Object.keys(reflection.ratings)
        .forEach(field => {


            const selfScore =
                reflection.ratings[field];


            const studentScore =
                studentAvg[field];


            const gap =
                selfScore - studentScore;


            rows.push({

                field,

                selfScore,

                studentScore,

                gap

            });


            totalSelf += selfScore;

            totalStudent += studentScore;

        });


    /* averages */

    const avgSelf =
        (
            totalSelf /
            rows.length *
            20
        ).toFixed(0);


    const avgStudent =
        (
            totalStudent /
            rows.length *
            20
        ).toFixed(0);


    const gapScore =
        (avgSelf - avgStudent)
            .toFixed(0);



    document.getElementById(
        "selfScore"
    ).innerText =
        avgSelf + "%";


    document.getElementById(
        "studentScore"
    ).innerText =
        avgStudent + "%";


    document.getElementById(
        "gapScore"
    ).innerText =
        gapScore + "%";



    /* table */

    const table =
        document.getElementById("gapTable");


    rows.forEach(r => {


        const tr =
            document.createElement("tr");


        tr.innerHTML = `

<td>

${r.field}

</td>


<td>

${(r.selfScore * 20).toFixed(0)}%

</td>


<td>

${(r.studentScore * 20).toFixed(0)}%

</td>


<td>

${(r.gap * 20).toFixed(0)}%

</td>

`;


        table.appendChild(tr);

    });



    /* mock comments */

    const comments = [

        "Concept explanations were sometimes rushed",

        "Assignments were very helpful",

        "Would appreciate more examples",

        "Good engagement in lectures"

    ];


    const container =
        document.getElementById("commentList");


    comments.forEach(text => {


        const div =
            document.createElement("div");


        div.className = "card";


        div.innerText = text;


        container.appendChild(div);

    });


}
