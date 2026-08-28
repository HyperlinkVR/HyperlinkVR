import { visit } from "unist-util-visit";





export type TagParserType = "list" | "text" | "none";
export type TagStyleType = "block" | "modifier";

export interface TagDefinition {
    component: string;
    parser: TagParserType;
    style: TagStyleType;
}

export const tag_definitions: Record<string, TagDefinition> = {
    channels: {
        component: "ChannelList",
        parser: "list",
        style: "block"
    },
    bindable: {
        component: "BindableBadge",
        parser: "text",
        style: "block"
    }
};

// Derived helper exports for TypeDoc config compatibility
export const custom_block_tags = Object.keys(tag_definitions).filter(
    (tag) => tag_definitions[tag].style === "block"
);
export const custom_modifier_tags = Object.keys(tag_definitions).filter(
    (tag) => tag_definitions[tag].style === "modifier"
);

// Extract plain text recursively from nested AST nodes (e.g., p > strong > code)
const get_node_text = (node: any): string => {
    if (!node) return "";
    if (typeof node.value === "string") return node.value;
    if (Array.isArray(node.children)) {
        return node.children.map(get_node_text).join("");
    }
    return "";
};

// Check if node text matches or starts with one of our defined tags
const find_matching_tag = (node_text: string): string | null => {
    const clean_text = node_text.trim().toLowerCase();
    for (const tag of Object.keys(tag_definitions)) {
        const lower_tag = tag.toLowerCase();
        if (
            clean_text === lower_tag ||
            clean_text.startsWith(`${lower_tag} `) ||
            clean_text.startsWith(`${lower_tag}:`)
        ) {
            return tag;
        }
    }
    return null;
};

// Step 1: Extract payload into MDX attributes based on parser strategy
// Step 1: Extract payload into MDX attributes based on parser strategy
const parse_payload = (
    index: number,
    parent: any,
    tag: string,
    parser: TagParserType,
    raw_node_text: string
) => {
    if (parser === "list") {
        const next_node = parent.children[index + 1];
        if (next_node && next_node.type === "list") {
            const items = next_node.children.map((li: any) => {
                const text = get_node_text(li);
                const [name, ...desc_parts] = text.split("-");
                return {
                    name: name.replace(/`/g, "").trim(),
                    desc: desc_parts.join("-").trim()
                };
            });

            return {
                attributes: [
                    {
                        type: "mdxJsxAttribute",
                        name: "items",
                        value: JSON.stringify(items)
                    }
                ],
                nodes_to_remove: 2
            };
        }
    }

    if (parser === "text") {
        const tag_regex = new RegExp(`^${tag}[:\\s]*`, "i");
        const inline_text = raw_node_text.trim().replace(tag_regex, "").trim();

        // 1. Inline text on the same node
        if (inline_text) {
            return {
                attributes: [
                    {
                        type: "mdxJsxAttribute",
                        name: "text",
                        value: inline_text
                    }
                ],
                nodes_to_remove: 1
            };
        }

        // 2. Consume all sibling nodes until the next heading or tag
        const payload_parts: string[] = [];
        let nodes_to_remove = 1;

        for (let i = index + 1; i < parent.children.length; i++) {
            const sibling = parent.children[i];

            // Stop if we hit a heading or another tag
            if (sibling.type === "heading") break;

            const text = get_node_text(sibling).trim();
            if (text && find_matching_tag(text)) break;

            if (text) {
                payload_parts.push(text);
            }
            nodes_to_remove++;
        }

        if (payload_parts.length > 0) {
            // Join sibling parts and normalize colon spacing ("api :" -> "api:")
            const combined_text = payload_parts
                .join(" ")
                .replace(/\s*:\s*/g, ":")
                .trim();

            return {
                attributes: [
                    {
                        type: "mdxJsxAttribute",
                        name: "text",
                        value: combined_text
                    }
                ],
                nodes_to_remove
            };
        }

        return { attributes: [], nodes_to_remove: 1 };
    }

    return { attributes: [], nodes_to_remove: 1 };
};

// Step 2: Apply AST transformation based on style strategy
const apply_ast_transform = (
    index: number,
    parent: any,
    component_name: string,
    style: TagStyleType,
    attributes: any[],
    nodes_to_remove: number
) => {
    if (style === "modifier") {
        let target_heading: any = null;
        for (let i = index - 1; i >= 0; i--) {
            if (parent.children[i].type === "heading") {
                target_heading = parent.children[i];
                break;
            }
        }

        if (target_heading) {
            target_heading.children.push({
                type: "mdxJsxTextElement",
                name: component_name,
                attributes,
                children: []
            });
            parent.children.splice(index, nodes_to_remove);
            return index;
        }
    }

    // Default / Block style replacement
    parent.children.splice(index, nodes_to_remove, {
        type: "mdxJsxFlowElement",
        name: component_name,
        attributes,
        children: []
    });
    return index;
};

export const remark_custom_jsdoc_tags = () => {
    return (tree: any) => {
        visit(
            tree,
            ["heading", "paragraph"],
            (node: any, index: number, parent: any) => {
                const node_text = get_node_text(node);
                const matching_tag = find_matching_tag(node_text);

                if (!matching_tag) return;

                const config = tag_definitions[matching_tag];
                const { attributes, nodes_to_remove } = parse_payload(
                    index,
                    parent,
                    matching_tag,
                    config.parser,
                    node_text
                );

                return apply_ast_transform(
                    index,
                    parent,
                    config.component,
                    config.style,
                    attributes,
                    nodes_to_remove
                );
            }
        );
    };
};
