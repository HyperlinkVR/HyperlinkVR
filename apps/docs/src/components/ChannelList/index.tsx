import { ComponentProps, useMemo } from "react";
import { Radio } from "lucide-react";

import styles from "./styles.module.css";
import Heading from "@theme/Heading";
import Link from "@docusaurus/Link";
import MDXA from "@theme/MDXComponents/A";

type MaybeStringified<T> = T | string;

export const ChannelList = (
    props: ComponentProps<"div"> & { items: MaybeStringified<{ name: string; desc: string }[]> }
) => {
    const items = useMemo(() => {
        if (typeof props.items === "string") {
            try {
                return JSON.parse(props.items) as { name: string; desc: string }[];
            } catch (e) {
                console.error("Failed to parse items:", e);
                return [];
            }
        }
        return props.items;
    }, [props.items]);

    // TODO: get the animated hash thingy the main headings use
    return (
        <div className={styles.element}>
            <MDXA href="#channels">
                <Heading as="h3">Animation Channels</Heading>
            </MDXA>
            <p>These channels can be animated with an <Link to="/docs/sdk/@hyperlinkvr/namespaces/builders/classes/AnimationBuilder">Animation</Link>.</p>
            <ul className={styles.list}>
                {items.map((item, index) => (
                    <li key={index} className={styles.list_item}>
                        <Radio />
                        <code>{item.name}</code>: {item.desc}
                    </li>
                ))}
            </ul>
        </div>
    );
};
