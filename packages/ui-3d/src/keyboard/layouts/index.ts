import type { KeyboardLayout } from "../layout";

import * as en from "./en";

// get all layouts keyed by nested locale and variant
export const available_layouts = [
    ...(Object.values(en))
];
const all_layouts: Record<string, Record<string, KeyboardLayout>> = {};
for (const layout of available_layouts) {
    if (!all_layouts[layout.id.locale]) {
        all_layouts[layout.id.locale] = {};
    }

    let variant = layout.id.variant;
    if (!variant) {
       variant = "default";
    }

    all_layouts[layout.id.locale]![variant] = layout;
}

const LOCALE_FALLBACKS: Record<string, string> = {
    "en": "en-GB",
};

// best effort resolution of layouts
// - if locale not found, falls back on some simple rules
// - if locale still not found, falls back to en-GB
// - variant discarded if not found, using the first variant found for the locale
export const choose_layout = (requested_layout: {locale: string, variant?: string}) => {
    const { locale, variant } = requested_layout;

    let resolved_locale = locale;
    if (!all_layouts[resolved_locale]) {
        // try stripping to the base language, e.g. "en-US" -> "en"
        const base_locale = locale.split("-")[0]!;
        if (all_layouts[base_locale]) {
            resolved_locale = base_locale;
        } else if (LOCALE_FALLBACKS[base_locale]) {
            resolved_locale = LOCALE_FALLBACKS[base_locale];
        } else if (LOCALE_FALLBACKS[locale]) {
            resolved_locale = LOCALE_FALLBACKS[locale];
        } else {
            resolved_locale = "en-GB";
        }
    }

    const variants = all_layouts[resolved_locale]!;
    if (variant && variants[variant]) {
        return variants[variant];
    } else {
        // fallback to first variant found
        return Object.values(variants)[0]!;
    }
}
