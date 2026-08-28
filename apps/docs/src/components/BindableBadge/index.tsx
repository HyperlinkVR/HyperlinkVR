import Link from "@docusaurus/Link";
import { ChevronsLeftRightEllipsis, Terminal, Zap } from "lucide-react";
import { ComponentProps, useMemo } from "react";



import styles from "./styles.module.css";


export const BindableBadge = (
    props: ComponentProps<"div"> & {text?: string}
) => {
    // if text argument given, try and parse it as the binding attributes
    // format given as api=APITypeName events=EventPayloadTypeName, neither necessary, in any order
    const attributes = useMemo(() => {
        if (!props.text) {
            return {};
        }

        const attributes_obj = {} as Record<any, string>;
        props.text.split(/\s+/).forEach((pair) => {
            const [key, val] = pair.split("=");
            if (key && val) attributes_obj[key] = val;
        });
        return attributes_obj;
    }, [props.text]);

    return (
        <div className={styles.element}>
            <b className={styles.text}><ChevronsLeftRightEllipsis /> Bindable</b>

            <ul className={styles.attribute_list}>
                {"api" in attributes && <li className={styles.attribute}><Terminal /> <Link to={`/docs/sdk/@hyperlinkvr/namespaces/builders/interfaces/${attributes.api}`}>Exposes a command API ({attributes.api})</Link></li>}
                {"events" in attributes && <li className={styles.attribute}><Zap /> <Link to={`/docs/engine-schemas/type-aliases/${attributes.events}`}>Reports events ({attributes.events})</Link></li>}
            </ul>
        </div>
    );
};
