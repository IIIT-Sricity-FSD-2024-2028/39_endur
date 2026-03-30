export function getSession() {

    return JSON.parse(
        localStorage.getItem("endurSession")
    );

}


export function requireAuth() {

    const session = getSession();

    if (!session) {

        window.location.href =
            "../../login.html";

        return null;

    }

    return session;

}
