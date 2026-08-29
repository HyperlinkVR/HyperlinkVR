declare module "__COMPONENT_PATH__" {
    const Component: any;
    export default Component;
}

declare module "__CSS_PATH__?inline" {
    const styles: string;
    export default styles;
}

declare module "__CSS_PATH__" {
    const styles: any;
    export default styles;
}

declare const __EXPORT_NAME__: string;
