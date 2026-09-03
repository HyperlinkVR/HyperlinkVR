export const ellipsis_truncate = (text: string, max_length: number) => {
    if (text.length <= max_length) {
        return text;
    }
    return text.slice(0, max_length - 3) + "...";
};
