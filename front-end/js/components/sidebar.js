import { getSession } from "../../js/core/session.js";

export function loadSidebar(activePage) {

    const user = getSession();

    document.getElementById("userName").innerText =
        user.name;

    document.getElementById("userDept").innerText =
        user.department;

    document.getElementById("roleLabel").innerText =
        `${user.role} portal`;


    /* avatar initials */

    const initials =
        user.name
            .split(" ")
            .map(n => n[0])
            .join("");

    document.getElementById("avatar").innerText =
        initials;


    /* active menu highlight */

    document
        .querySelectorAll("[data-link]")
        .forEach(link => {

            if (link.dataset.link === activePage) {

                link.classList.add("active");

            }

        });

}
