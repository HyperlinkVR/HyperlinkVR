import {useAnySettingVisible, useDiscordRPCEngineOptional, useSetting, useSettingsTree, useSettingVisible} from "@hyperlinkvr/react";
import {collect_settings_in_tree} from "@hyperlinkvr/core";
import type {Setting, SettingKey, SettingsTree } from "@hyperlinkvr/types";
import { FlatSettingWidget } from "@hyperlinkvr/ui-dom/settings";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";


const bg = new URL("../node_modules/@hyperlinkvr/assets/bg.webp", import.meta.url).href;

// need a special override for discord rpc setting, as permission prompts in extensions typically require direct gesture response, not an effect
const DiscordRPCSettingWidget = () => {
    const [discord_rpc, setDiscordRPC] = useSetting("discord_rpc");
    const discord_rpc_engine = useDiscordRPCEngineOptional();

    const [show_setup, setShowSetup] = useState(false);

    const [has_permission, setHasPermission] = useState(false);
    useEffect(() => {
        discord_rpc_engine?.has_permission().then(setHasPermission);
    }, [discord_rpc_engine]);

    const intercept_gesture = async (
        event: React.MouseEvent | React.FormEvent
    ) => {
        const target = event.target as HTMLInputElement;
        const target_state = target.type === "checkbox" ? target.checked : !discord_rpc;

        if (target_state === true && discord_rpc_engine && !has_permission) {
            event.preventDefault();
            event.stopPropagation();

            if (discord_rpc_engine.setup) {
                // show setup steps first
                setShowSetup(true);
            } else {
                // request permission immeidately
                const granted = await discord_rpc_engine.request_permission();
                console.log("Discord RPC permission granted", granted);

                if (!granted) {
                    alert(
                        "Discord RPC permission was denied. Discord RPC will not be enabled."
                    );
                } else {
                    setDiscordRPC(true);
                    setHasPermission(true);
                }
            }
        } else if (target_state === false) {
            // disconnect rpc if connected
            if (await discord_rpc_engine?.is_connected()) {
                discord_rpc_engine?.disconnect();
            }
        }
    };

    const confirm_setup = async () => {
        const granted = await discord_rpc_engine!.request_permission();
        setShowSetup(false);
        if (!granted) {
            alert("Discord RPC permission was denied. Discord RPC will not be enabled.");
        } else {
            setDiscordRPC(true);
            setHasPermission(true);
        }
    };
    const cancel_setup = () => {
        setShowSetup(false);
    };

    // disables setting if engine is not available
    return (
        <>
            <div
                onClickCapture={intercept_gesture}
                onChangeCapture={intercept_gesture}
            >
                <FlatSettingWidget setting_key="discord_rpc" enabled={!!discord_rpc_engine} />
            </div>

            {show_setup && discord_rpc_engine?.setup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="max-w-md w-full mx-4 rounded-lg border border-white/20 bg-gray-900 p-6 text-white shadow-xl">
                        <h2 className="text-xl font-semibold mb-4">Set up Discord Rich Presence</h2>

                        {discord_rpc_engine.setup.text && (
                            <p className="whitespace-pre-line text-sm text-gray-200 mb-4">
                                {discord_rpc_engine.setup.text}
                            </p>
                        )}

                        {discord_rpc_engine.setup.download && (
                            <div className="flex justify-center mb-8">
                                <a
                                    href={discord_rpc_engine.setup.download}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="flex gap-2 px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-lg"
                                >
                                    <Download />
                                    Download
                                </a>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <button onClick={cancel_setup} className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm cursor-pointer">
                                Cancel
                            </button>
                            <button onClick={confirm_setup} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-sm cursor-pointer">
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const SettingRenderSlot = ({setting}: {setting: Setting<any>}) => {
    const visible = useSettingVisible(setting.key as SettingKey, "flat");
    if (!visible) return null;

    return (
        setting.key !== "discord_rpc" ? <FlatSettingWidget key={setting.key} setting_key={setting.key as SettingKey} /> : <DiscordRPCSettingWidget key={setting.key} />
    );
}

const SettingsSectionSlot = ({label, subtree}: {label: string, subtree: SettingsTree}) => {
    const visible = useAnySettingVisible(collect_settings_in_tree(subtree).map(s => s.key as SettingKey), "flat");
    if (!visible) return null;

    return (
        <div className="flex flex-col gap-2 h-full">
            <h3 className="text-lg font-semibold text-white mb-2">{label}</h3>

            <SettingSubtree tree={subtree} />
        </div>
    );
}

const SettingSubtree = ({tree, is_root = false}: {tree: SettingsTree, is_root?: boolean}) => {
    return (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 items-start justify-stretch h-full ${is_root ? "": "border border-white/20 p-4 rounded-md bg-black/20 backdrop-blur-md"}`}>
            {tree.settings && tree.settings.length > 0 && (
                <div className="flex flex-col gap-4">
                    {tree.settings.map(setting => <SettingRenderSlot setting={setting} key={setting.key} />)}
                </div>
            )}

            {tree.subtrees && Object.keys(tree.subtrees).length > 0 && (
                Object.entries(tree.subtrees).map(([label, subtree]) => (
                    <SettingsSectionSlot key={label} label={label} subtree={subtree} />
                ))
            )}
        </div>
    )
}

const TabButton = ({label, subtree, active, on_click}: {label: string, subtree?: SettingsTree, active: boolean, on_click: () => void}) => {
    const under_subtree = useMemo(() => subtree ? collect_settings_in_tree(subtree).map(s => s.key) : [], [subtree]) as SettingKey[];
    const visible = useAnySettingVisible(under_subtree, "flat");

    if (subtree && !visible) return null;
    // TODO: handle redirect if current tab becomes invisible due to conditions

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

    const tab_tree = useMemo(() => tree.subtrees[tab], [tree, tab]);

    return (
        <main style={{backgroundImage: `url(${bg})`}} className="w-screen h-screen bg-cover bg-center">
            <div className="w-full h-full p-6 bg-black/50 backdrop-blur-md">
                <h1 className="text-white text-3xl font-title mb-8">Settings</h1>

                <div className="flex gap-2">
                    {Object.entries(tree.subtrees).map(([name, subtree]) => (
                        <TabButton
                            key={name}
                            label={name}
                            subtree={subtree}
                            active={tab === name}
                            on_click={() => setTab(name)}
                        />
                    ))}
                </div>

                <div className="text-white bg-black/20 p-4 rounded-b-md backdrop-blur-md border border-white/20">
                    {tab_tree ? <SettingSubtree tree={tab_tree} is_root /> : <p className="text-gray-300">No settings available for this section.</p>}
                </div>
            </div>
        </main>
    );
}
