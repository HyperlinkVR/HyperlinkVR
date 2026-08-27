import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// docusaurus-plugin-typedoc writes these cjs files (clean labels + @group/@category
// tree that the raw markdown frontmatter lacks). Bust the require cache first: in a
// long-running dev server the first load can happen before/while typedoc writes,
// and Node would otherwise pin that stale (empty) result for the whole process.
const load = (path: string): SidebarItem[] => {
    delete require.cache[require.resolve(path)];
    return require(path);
};

type SidebarItem = {
    type?: string;
    label?: string;
    items?: SidebarItem[];
    [k: string]: unknown;
};

// With categorizeByGroup, any member without an @category lands in TypeDoc's
// default "Other" bucket, which shows as an extra sidebar level. We don't want
// that: hoist each "Other" category's children into its parent (in place),
// keeping named subcategories like "Raycasts" nested. So e.g. Interactions ends
// up as [<the uncategorised builders...>, Raycasts › [...]] instead of
// Interactions › [Other › [...], Raycasts › [...]].
const hoistOther = (items: SidebarItem[]): SidebarItem[] => {
    const out: SidebarItem[] = [];
    for (const item of items) {
        const next = item.items ? { ...item, items: hoistOther(item.items) } : item;
        if (next.type === "category" && next.label === "Other" && next.items) {
            out.push(...next.items); // splice children in place of the bucket
        } else {
            out.push(next);
        }
    }
    return out;
};

const sdk = hoistOther(load("./docs/sdk/typedoc-sidebar.cjs"));
const engineSchemas = hoistOther(load("./docs/engine-schemas/typedoc-sidebar.cjs"));

// Each sidebar starts at its OWN generated overview page so the two navbar
// docSidebar links resolve to distinct routes (/sdk vs /engine-schemas) and each
// package's root page is reachable in-nav. The site root (index.mdx, route "/")
// is the home page, linked by the navbar logo/title, and intentionally not part
// of either API sidebar.
const sidebars: SidebarsConfig = {
    sdkSidebar: [{ type: "doc", id: "sdk/index", label: "Overview" }, ...sdk],
    engineSchemasSidebar: [
        { type: "doc", id: "engine-schemas/index", label: "Overview" },
        ...engineSchemas
    ]
};

export default sidebars;
