import type * as Preset from '@docusaurus/preset-classic';
import type { Config, PluginConfig } from "@docusaurus/types";
import { themes as prismThemes } from 'prism-react-renderer';
import { OptionDefaults } from "typedoc";



import { custom_block_tags, custom_modifier_tags, remark_custom_jsdoc_tags } from "./plugins/remark_custom_jsdoc_tags";


const typedoc = (
    pkg: string,
    out_alias?: string,
    extra?: Record<string, unknown>
): PluginConfig => [
    "docusaurus-plugin-typedoc",
    {
        id: `docs-${pkg}`,
        entryPoints: [`../../packages/${pkg}/src/index.ts`],
        tsconfig: `../../packages/${pkg}/tsconfig.json`,
        out: `docs/${out_alias || pkg}`,
        watch: process.env.TYPEDOC_WATCH === "true",

        readme: "none",

        excludeInternal: true,
        excludeExternals: true,
        entryPointStrategy: "resolve",

        parametersFormat: "table",
        propertiesFormat: "table",
        enumMembersFormat: "table",
        typeDeclarationFormat: "table",
        categorizeByGroup: true,

        sidebar: {
            autoConfiguration: true,
            pretty: true
        },

        blockTags: [
            ...OptionDefaults.blockTags,
            ...custom_block_tags.map((tag) => `@${tag}`),
        ],

        modifierTags: [
            ...OptionDefaults.modifierTags,
            ...custom_modifier_tags.map((tag) => `@${tag}`),
        ],

        ...extra
    }
];


// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
    title: "HyperlinkVR Docs",
    tagline: "API reference for the HyperlinkVR Web SDK and engine schemas",
    favicon: "img/favicon.ico",

    // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
    future: {
        v4: true, // Improve compatibility with the upcoming Docusaurus v4
        faster: true
    },

    // Set the production url of your site here
    url: "https://hyperlink.surf",
    // Set the /<baseUrl>/ pathname under which your site is served
    // For GitHub pages deployment, it is often '/<projectName>/'
    baseUrl: "/docs/",

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: "obfuscatedgenerated", // Usually your GitHub org/user name.
    projectName: "HyperlinkVR", // Usually your repo name.

    onBrokenLinks: "throw",

    // Even if you don't use internationalization, you can use this field to set
    // useful metadata like html lang. For example, if your site is Chinese, you
    // may want to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: "en",
        locales: ["en"]
    },

    presets: [
        [
            "classic",
            {
                docs: {
                    routeBasePath: "/",
                    sidebarPath: "./sidebars.ts",
                    remarkPlugins: [remark_custom_jsdoc_tags]
                },
                blog: false,
                theme: {
                    customCss: "./src/css/custom.css"
                }
            } satisfies Preset.Options
        ]
    ],

    themeConfig: {
        // Replace with your project's social card
        image: "img/docusaurus-social-card.jpg",
        colorMode: {
            respectPrefersColorScheme: true
        },
        navbar: {
            title: "HyperlinkVR",
            logo: {
                alt: "HyperlinkVR Logo",
                src: "img/logo.svg"
            },
            items: [
                {
                    type: "docSidebar",
                    sidebarId: "sdkSidebar",
                    position: "left",
                    label: "Web SDK Reference"
                },
                {
                    type: "docSidebar",
                    sidebarId: "engineSchemasSidebar",
                    position: "left",
                    label: "Engine Schemas"
                },
                {
                    href: "https://github.com/obfuscatedgenerated/HyperlinkVR",
                    label: "GitHub",
                    position: "right"
                }
            ]
        },
        footer: {
            style: "dark",
            links: [
                {
                    title: "Reference",
                    items: [
                        { label: "Web SDK Reference", to: "/sdk" },
                        { label: "Engine Schemas", to: "/engine-schemas" }
                    ]
                },
                {
                    title: "More",
                    items: [
                        {
                            label: "GitHub",
                            href: "https://github.com/obfuscatedgenerated/HyperlinkVR"
                        }
                    ]
                }
            ],
            copyright: `Copyright © ${new Date().getFullYear()} HyperlinkVR. Built with Docusaurus.`
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula
        }
    } satisfies Preset.ThemeConfig,
    plugins: [
        typedoc("web-sdk", "sdk", {
            externalPattern: ["**/node_modules/**", "**/vr-engine-schemas/**"],
            externalSymbolLinkMappings: {
                "@hyperlinkvr/vr-engine-schemas": {
                    "*": "/docs/engine-schemas/"
                }
            },
            groupOrder: [
                "Prefabs",
                "Interactions",
                "Command APIs",
                "Physics",
                "Rigid Bodies",
                "Object Monitors",
                "Input Monitors",
                "HUD",
                "Triggers",
                "Objects",
                "World Environment",
                "Animation",
                "VFX",
                "Classes",
                "Interfaces",
                "Type Aliases",
                "Variables",
                "Functions",
                "*"
            ]
        }),
        typedoc("vr-engine-schemas", "engine-schemas")
    ]
};

export default config;
