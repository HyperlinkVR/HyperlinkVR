import { type KeyboardLayout } from "../layout";
import {
    backspace,
    char,
    comma,
    enter,
    period,
    row,
    shift,
    space,
    to_letters,
    to_symbols,
    to_symbols_num,
    to_symbols2,
    unshift,
} from "../key_helpers";

export const en_gb: KeyboardLayout = {
    id: { locale: "en-GB", variant: "qwerty" },
    label: "English (UK)",
    default_page: "letters",
    pages: {
        letters: [
            row("qwertyuiop"),
            row("asdfghjkl"),
            [shift, ...row("zxcvbnm"), backspace],
            [to_symbols, comma, space, period, enter]
        ],
        shift: [
            row("QWERTYUIOP"),
            row("ASDFGHJKL"),
            [unshift, ...row("ZXCVBNM"), backspace],
            [to_symbols, comma, space, period, enter]
        ],
        symbols: [
            row("1234567890"),
            ["-", "/", ":", ";", "(", ")", "£", "&", "@", '"'].map(char),
            [
                to_symbols2,
                char("."),
                char(","),
                char("?"),
                char("!"),
                char("'"),
                backspace
            ],
            [to_letters, space, enter]
        ],
        symbols2: [
            ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="].map(char),
            ["_", "\\", "|", "~", "<", ">", "€", "£", "$", "•"].map(char),
            [
                to_symbols_num,
                char("."),
                char(","),
                char("?"),
                char("!"),
                char("'"),
                backspace
            ],
            [to_letters, space, enter]
        ]
    }
};

export const en_us: KeyboardLayout = {
    id: { locale: "en-US", variant: "qwerty" },
    label: "English (US)",
    default_page: "letters",
    pages: {
        letters: [
            row("qwertyuiop"),
            row("asdfghjkl"),
            [shift, ...row("zxcvbnm"), backspace],
            [to_symbols, comma, space, period, enter]
        ],
        shift: [
            row("QWERTYUIOP"),
            row("ASDFGHJKL"),
            [unshift, ...row("ZXCVBNM"), backspace],
            [to_symbols, comma, space, period, enter]
        ],
        symbols: [
            row("1234567890"),
            ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""].map(char),
            [to_symbols2, char("."), char(","), char("?"), char("!"), char("'"), backspace],
            [to_letters, space, enter]
        ],
        symbols2: [
            ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="].map(char),
            ["_", "\\", "|", "~", "<", ">", "€", "£", "$", "•"].map(char),
            [to_symbols_num, char("."), char(","), char("?"), char("!"), char("'"), backspace],
            [to_letters, space, enter]
        ]
    }
};

// TODO: fix missing symbols (might need lucide, or just a better font file)
