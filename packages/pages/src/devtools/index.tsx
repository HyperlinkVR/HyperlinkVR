import { useMessageEngine, useSetting } from "@hyperlinkvr/react";
import type { SettingKeyReturning, WindowIntent } from "@hyperlinkvr/types";
import { ToggleSwitch } from "@hyperlinkvr/ui-dom/settings";
import { WATCH_UI_HEIGHT, WATCH_UI_WIDTH } from "@hyperlinkvr/watch-ui";

const bg = new URL("../../node_modules/@hyperlinkvr/assets/bg.webp", import.meta.url).href;

const ToolGroup = ({
    title,
    children
}: {
    title: string;
    children: React.ReactNode;
}) => {
    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-white text-xl font-title font-light">
                {title}
            </h2>
            <div className="flex flex-col gap-2 p-4 bg-black/20 rounded-md backdrop-blur-md border border-white/20">
                {children}
            </div>
        </div>
    );
};

const ToolButton = ({
    label,
    on_click
}: {
    label: string;
    on_click: () => void;
}) => {
    return (
        <button
            className="text-gray-300 px-4 py-2 bg-blue-600 rounded-lg hover:not-disabled:bg-blue-700 transition text-lg font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600"
            onClick={on_click}>
            {label}
        </button>
    );
};

// const ToolMessengerButton = ({
//     label,
//     message
// }: {
//     label: string;
//     message: Message;
// }) => {
//     const messenger = useMessageEngine();
//
//     const handle_click = () => {
//         messenger.send(message);
//     };
//
//     return <ToolButton label={label} on_click={handle_click} />;
// };

const ToolWindowButton = ({
    label,
    intent,
    args,
    width,
    height
}: {
    label: string;
    intent: WindowIntent;
    args?: Record<string, any>;
    width: number;
    height: number;
}) => {
    const messenger = useMessageEngine();

    const handle_click = () => {
        messenger.send({
            action: "HVR_CREATE_WINDOW",
            intent,
            args,
            type: "popup",
            width,
            height
        });
    };

    return <ToolButton label={label} on_click={handle_click} />;
};

const ToolSettingSwitch = ({
    label,
    setting_key
}: {
    label: string;
    setting_key: SettingKeyReturning<boolean>
}) => {
    const [enabled, setEnabled] = useSetting(setting_key);

    return (
        <ToggleSwitch
            value={enabled}
            on_change={setEnabled}
            label={label}
        />
    );
};

export const DevToolsPage = () => {
    return (
        <main
            className="text-white w-full h-screen bg-cover bg-center font-sans"
            style={{ backgroundImage: `url(${bg})` }}>
            <div className="w-full h-full p-6 bg-black/50 backdrop-blur-md">
                <h1 className="text-4xl font-bold font-title">
                    HyperlinkVR DevTools
                </h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                    <ToolGroup title="Authentication Hosts">
                        <ToolWindowButton
                            label="Open auth manifest generator"
                            intent="DEVTOOLS_FORM"
                            args={{
                                schema: "AuthManifest",
                                format: "json",
                                filename: "auth-manifest"
                            }}
                            width={400}
                            height={800}
                        />
                    </ToolGroup>

                    <ToolGroup title="UI Inspector">
                        <ToolWindowButton
                            label="Open watch UI"
                            intent="DEVTOOLS_WATCH_UI"
                            width={WATCH_UI_WIDTH}
                            height={WATCH_UI_HEIGHT}
                        />
                    </ToolGroup>

                    <ToolGroup title="Input Interception">
                        <ToolSettingSwitch
                            label="Debug click points"
                            setting_key="debug_clicks"
                        />
                    </ToolGroup>

                    <ToolGroup title="Raycasts (VR)">
                        <ToolSettingSwitch
                            label="Show touch rays"
                            setting_key="debug_touch"
                        />
                        <ToolSettingSwitch
                            label="Show controller ray hits"
                            setting_key="debug_ray_hits"
                        />
                    </ToolGroup>

                    <ToolGroup title="Scene Debug">
                        <ToolSettingSwitch
                            label="Show lights"
                            setting_key="debug_lights"
                        />
                        <ToolSettingSwitch
                            label="Show groups"
                            setting_key="debug_groups"
                        />
                        <ToolSettingSwitch
                            label="Show colliders"
                            setting_key="debug_colliders"
                        />
                        <ToolSettingSwitch
                            label="Show re-renders"
                            setting_key="debug_rerenders"
                        />
                    </ToolGroup>

                    <ToolGroup title="Expressions">
                        <ToolSettingSwitch
                            label="Show expression test UI"
                            setting_key="debug_show_expression_ui"
                        />
                    </ToolGroup>

                    <ToolGroup title="Danger Zone">
                        <ToolSettingSwitch label="Allow remote worlds to load local network assets (dangerous)" setting_key="devtools_dangerously_allow_localhost_fetch" />
                    </ToolGroup>
                </div>
            </div>
        </main>
    );
};

