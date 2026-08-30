import { Graphviz } from "@hpcc-js/wasm";
import { visit } from "unist-util-visit";





export const remark_graphviz = () => {
    return async (ast: any) => {
        const nodes_to_process: {
            node: any;
            index: number | undefined;
            parent: any;
        }[] = [];

        // find dot code blocks in the AST
        visit(ast, "code", (node, index, parent) => {
            if (node.lang === "dot") {
                nodes_to_process.push({ node, index, parent });
            }
        });

        if (nodes_to_process.length === 0) return;
        const graphviz = await Graphviz.load();

        for (const { node, index, parent } of nodes_to_process) {
            try {
                let svg = graphviz.layout(node.value, "svg", "dot");

                // replace the code block with an MDX JSX element that renders the SVG
                parent.children[index!] = {
                    type: "mdxJsxFlowElement",
                    name: "div",
                    attributes: [
                        {
                            type: "mdxJsxAttribute",
                            name: "className",
                            value: "graphviz-diagram"
                        },
                        {
                            type: "mdxJsxAttribute",
                            name: "dangerouslySetInnerHTML",
                            value: {
                                type: "mdxJsxAttributeValueExpression",
                                value: `{ __html: ${JSON.stringify(svg)} }`,
                                data: {
                                    estree: {
                                        type: "Program",
                                        body: [
                                            {
                                                type: "ExpressionStatement",
                                                expression: {
                                                    type: "ObjectExpression",
                                                    properties: [
                                                        {
                                                            type: "Property",
                                                            method: false,
                                                            shorthand: false,
                                                            computed: false,
                                                            key: { type: "Identifier", name: "__html" },
                                                            value: {
                                                                type: "Literal",
                                                                value: svg,
                                                                raw: JSON.stringify(svg)
                                                            },
                                                            kind: "init"
                                                        }
                                                    ]
                                                }
                                            }
                                        ],
                                        sourceType: "module"
                                    }
                                }
                            }
                        }
                    ],
                    children: []
                };
            } catch (err) {
                console.error("Failed to parse Graphviz DOT code:", err);
            }
        }
    };
}
