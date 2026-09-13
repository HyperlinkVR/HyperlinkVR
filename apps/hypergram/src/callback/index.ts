const hash_params = new URLSearchParams(location.hash.substring(1));
const token = hash_params.get("token") || location.hash.replace("#", "");

if (token) {
    localStorage.setItem("hypergram_auth_token", token);
    history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
    );

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
    document.body.innerText = "No token found in URL! Please try logging in again. Redirecting to home page in 5 seconds...";

    setTimeout(() => {
        location.href = "/";
    }, 5000);
}
