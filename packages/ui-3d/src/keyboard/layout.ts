export type KeyAction =
    | { kind: "insert"; text: string }
    | { kind: "backspace" }
    | { kind: "enter" }
    | { kind: "goto"; page: string } // sticky page switch
    | { kind: "shift-once" }; // to the "shift" page for one insert, then back to default_page

export interface Key {
    action: KeyAction;
    label?: string | React.ReactNode; // if not provided, will be derived from action
    width?: number; // flex units, default 1 (e.g. space bar is 5, shift is 1.5)
}

// outer array = rows (top to bottom), inner = keys in that row (left to right)
export type KeyboardPage = Key[][];

export interface KeyboardLayout {
    id: {
        locale: string; // e.g. "en"
        variant?: string; // e.g. "qwerty"
    }
    label: string;
    default_page: string;
    pages: Record<string, KeyboardPage>;
}
