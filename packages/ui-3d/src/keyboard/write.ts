import type { KeyboardTarget } from "./store";

const notify = (el: KeyboardTarget) => el.dispatchEvent(new Event("input", { bubbles: true }));

const caret = (el: KeyboardTarget): [number, number] => {
    // number inputs don't expose a selection range; fall back to the end of the value
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    return [start, end];
};

const set_caret = (el: KeyboardTarget, index: number) => {
    try {
        el.setSelectionRange(index, index);
    } catch {
        // setSelectionRange throws for input types that don't support it (e.g. number); ignore
    }
};

export const insert_text = (el: KeyboardTarget, text: string) => {
    const [start, end] = caret(el);
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    set_caret(el, start + text.length);
    notify(el);
};

export const backspace = (el: KeyboardTarget) => {
    const [start, end] = caret(el);
    if (start === end) {
        if (start === 0) return;
        el.value = el.value.slice(0, start - 1) + el.value.slice(end);
        set_caret(el, start - 1);
    } else {
        // a selection is active: delete it
        el.value = el.value.slice(0, start) + el.value.slice(end);
        set_caret(el, start);
    }
    notify(el);
};

export const submit = (el: KeyboardTarget) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
};
