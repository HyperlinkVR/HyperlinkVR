import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/.output/**",
            "**/.wxt/**",
            "**/.turbo/**",
            "patches/**",
            "schemas/**",
            "**/*.gen.ts",
            "**/*.d.ts"
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
        plugins: { "react-hooks": reactHooks },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.webextensions
            }
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { prefer: "type-imports", fixStyle: "separate-type-imports" }
            ],
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }
            ],
            "@typescript-eslint/no-unsafe-function-type": "off",
            "no-empty": ["error", { allowEmptyCatch: true }]
        }
    }
);
