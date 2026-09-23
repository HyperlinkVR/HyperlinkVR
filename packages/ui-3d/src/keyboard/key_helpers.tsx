import { ArrowBigUp, CornerDownLeft, Delete, Space } from "@react-three/uikit-lucide";



import { Key } from "./layout";


// convenience for character keys, whose label is just the inserted text
export const char = (text: string): Key => ({ action: { kind: "insert", text } });

// a row of plain character keys from a string, e.g. row("qwertyuiop")
export const row = (chars: string): Key[] => chars.split("").map(char);

// functional keys
export const backspace: Key = {
    action: { kind: "backspace" },
    label: <Delete color="white" />,
    width: 1.5
};
export const enter: Key = { action: { kind: "enter" }, label: <CornerDownLeft color="white" />, width: 1.5 };
export const space: Key = {
    action: { kind: "insert", text: " " },
    label: <Space color="white" />,
    width: 5
};

// shift-once caps the next letter then falls back to default_page
export const shift: Key = {
    action: { kind: "shift-once" },
    label: <ArrowBigUp color="white" />,
    width: 1.5
};
// on the shift page the same slot just cancels back to letters
export const unshift: Key = {
    action: { kind: "goto", page: "letters" },
    label: <ArrowBigUp color="white" />,
    width: 1.5
};

// page switches
export const to_letters: Key = {
    action: { kind: "goto", page: "letters" },
    label: "ABC",
    width: 1.5
};
export const to_symbols: Key = {
    action: { kind: "goto", page: "symbols" },
    label: "?123",
    width: 1.5
};
export const to_symbols_num: Key = {
    action: { kind: "goto", page: "symbols" },
    label: "123",
    width: 1.5
};
export const to_symbols2: Key = {
    action: { kind: "goto", page: "symbols2" },
    label: "#+=",
    width: 1.5
};

export const comma = char(",");
export const period = char(".");
