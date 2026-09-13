const hash_params = new URLSearchParams(location.hash.substring(1));
const token = hash_params.get("token");
const username = hash_params.get("username");

if (token && username) {
    history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
    );

    localStorage.setItem("token", token);
    localStorage.setItem("username", username);

    const search_params = new URLSearchParams(location.search);
    const redirect = search_params.get("redirect");

    // only allow relative redirects to prevent open redirect vulnerabilities
    if (
        redirect &&
        redirect.startsWith("/") &&
        !redirect.startsWith("//")
    ) {
        location.href = redirect;
    } else {
        location.href = "/";
    }
} else {
    document.body.innerText = "No token and/or username found in URL! Please try logging in again. Redirecting to home page in 5 seconds...";

    setTimeout(() => {
        location.href = "/";
    }, 5000);
}
