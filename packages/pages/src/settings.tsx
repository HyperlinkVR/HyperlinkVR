import { useSettingsTree } from "@hyperlinkvr/react";
import type { SettingKey, SettingsTree } from "@hyperlinkvr/types";
import { FlatSettingWidget } from "@hyperlinkvr/ui-dom/settings";
import { useMemo, useState } from "react";

const bg = new URL("../node_modules/@hyperlinkvr/assets/bg.webp", import.meta.url).href;

const SettingSubtree = ({index, tree, is_root = false}: {index: string, tree: SettingsTree, is_root?: boolean}) => {
    const subtree = useMemo(() => tree.subtrees[index], [index, tree]);

    if (!subtree) return null;

    return (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 items-start justify-stretch h-full ${is_root ? "": "border border-white/20 p-4 rounded-md bg-black/20 backdrop-blur-md"}`}>
            {subtree.settings && subtree.settings.length > 0 && (
                <div className="flex flex-col gap-4">
                    {subtree.settings.map(setting => (
                        <FlatSettingWidget key={setting.key} setting_key={setting.key as SettingKey} />
                    ))}
                </div>
            )}

            {subtree.subtrees && Object.keys(subtree.subtrees).length > 0 && (
                Object.keys(subtree.subtrees).map(subtab => (
                    <div key={subtab} className="flex flex-col gap-2 h-full">
                        <h3 className="text-lg font-semibold text-white mb-2">{subtab}</h3>

                        <SettingSubtree index={subtab} tree={subtree} />
                    </div>
                ))
            )}
        </div>
    )
}

const TabButton = ({label, active, on_click}: {label: string, active: boolean, on_click: () => void}) => {
    return (
        <button
            className={`cursor-pointer px-4 py-2 rounded-t-md text-xl ${active ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
            onClick={on_click}
        >
            {label}
        </button>
    );
};

export const SettingsPage = () => {
    const tree = useSettingsTree("flat");

    // rather than using nested breadcrumbs, its nicer UX to just tab the first level then add the rest as sections (imo)
    // if sections get expansive then will see. right now there are only 2 breadcrumb levels in use. i think 3 levels will be fine, just add subsections
    // but any more and it may be best to intelligently fall back to a nested view somehow, but thats a problem for future me
    const [tab, setTab] = useState("General");

    // read from url hash to set initial tab, if present
    useMemo(() => {
        const hash = window.location.hash.slice(1);
        if (hash && Object.keys(tree.subtrees).includes(hash)) {
            setTab(hash);
        }
    }, [tree]);

    return (
        <main style={{backgroundImage: `url(${bg})`}} className="w-screen h-screen bg-cover bg-center">
            <div className="w-full h-full p-6 bg-black/50 backdrop-blur-md">
                <h1 className="text-white text-3xl font-title mb-8">Settings</h1>

                <div className="flex gap-2">
                    {Object.keys(tree.subtrees).map(subtab => (
                        <TabButton
                            key={subtab}
                            label={subtab}
                            active={tab === subtab}
                            on_click={() => setTab(subtab)}
                        />
                    ))}
                </div>

                <div className="text-white bg-black/20 p-4 rounded-b-md backdrop-blur-md border border-white/20">
                    <SettingSubtree index={tab} tree={tree} is_root />
                </div>
            </div>
        </main>
    );
}
