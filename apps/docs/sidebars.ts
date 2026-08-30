import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

import path from "path";
import fs from "fs";

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

const iterate_docs = (dir: string): SidebarItem[] => {
    const dir_name = path.basename(dir);

    const items: SidebarItem[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full_path = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const sub_items = iterate_docs(full_path);
            if (sub_items.length > 0) {
                items.push({
                    type: "category",
                    label: entry.name,
                    items: sub_items
                });
            }
        } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
            // find the first h1 heading in the file to use as the label, or fallback to the filename
            const content = fs.readFileSync(full_path, "utf8");
            const match = content.match(/^#\s+(.*)$/m);
            const label = match ? match[1].trim() : entry.name.replace(/\.mdx$/, "");

            // check the frontmatter for a requested position, and if present, insert the item at that index instead of pushing to the end
            const frontmatter_match = content.match(/^---\n([\s\S]*?)\n---/);
            let position: number | undefined;
            if (frontmatter_match) {
                const frontmatter = frontmatter_match[1];
                const position_match = frontmatter.match(/position:\s*(\d+)/);
                if (position_match) {
                    position = parseInt(position_match[1], 10);
                }
            }

            const item = {
                type: "doc",
                id: dir_name + "/" + path.relative("./docs/guides", full_path).replace(/\.mdx$/, ""),
                label
            };

            if (position !== undefined && position >= 0 && position < items.length) {
                items.splice(position, 0, item);
            } else {
                items.push(item);
            }
        }
    }
    return items;
}

const sdk = hoistOther(load("./docs/sdk/typedoc-sidebar.cjs"));
const engineSchemas = hoistOther(load("./docs/engine-schemas/typedoc-sidebar.cjs"));
const guides = iterate_docs("./docs/guides");

// generate guides sidebar by iterating all the docs in the /guides folder

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
    ],
    guidesSidebar: guides
};

export default sidebars;
