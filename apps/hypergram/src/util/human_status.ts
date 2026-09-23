export const human_status = (status: number): string => {
    if (status >= 200 && status < 300) {
        return "Success";
    }

    switch (status) {
        case 400:
            return "Bad request";
        case 401:
            return "You need to log in to do that!";
        case 403:
            return "You aren't allowed to do that!";
        case 404:
            return "We're scratching our heads, we can't find that!";
        case 429:
            return "You're doing that too much, please slow down!";
        case 500:
            return "Something went wrong on our end, please try again later!";
        case 503:
            return "We're temporarily unavailable, please try again later!";
        default:
            return `Error ${status}`;
    }
}
