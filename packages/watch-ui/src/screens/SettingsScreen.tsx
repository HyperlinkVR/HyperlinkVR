import { useSettingsTree, useSettingVisible, useSessionMode, useAnySettingVisible } from "@hyperlinkvr/react";
import type { Setting, SettingKey, SettingsTree } from "@hyperlinkvr/types";
import { Container, Text } from "@react-three/uikit";
import type { ComponentRef } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Crossfader } from "../animation/Crossfader";
import { useFocusable } from "../contexts/FocusNavContext";
import { WatchSettingWidget } from "../settings/WatchSettingWidget";
import type { ScreenProps } from "./index";
import { collect_settings_in_tree } from "@hyperlinkvr/core";


const SettingRenderSlot = ({ setting }: { setting: Setting<any> }) => {
    const mode = useSessionMode();
    const visible = useSettingVisible(setting.key as SettingKey, "watch", mode);
    if (!visible) return null;

    return <WatchSettingWidget setting_key={setting.key as SettingKey} />;
};

const SettingsSectionSlot = ({label, subtree}: {label: string, subtree: SettingsTree}) => {
    const mode = useSessionMode();
    const visible = useAnySettingVisible(collect_settings_in_tree(subtree).map(s => s.key as SettingKey), "watch", mode);
    if (!visible) return null;

    return (
        <Container
            flexDirection="column"
            gap={8}
            width="48%"
            minWidth={250}
        >
            <Text fontSize={18} fontWeight="bold" color="white" marginBottom={8}>
                {label}
            </Text>
            <SettingSubtree tree={subtree} />
        </Container>
    )
};

const SettingSubtree = ({
    tree,
    is_root = false
}: {
    tree: SettingsTree;
    is_root?: boolean;
}) => {
    return (
        <Container
            flexDirection="row"
            flexWrap="wrap"
            gap={16}
            alignItems="stretch" // Ensures all panels in a row are the same height
            width="100%"
            // If it's a nested subtree, style the grid container itself as a panel
            {...(!is_root ? {
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.2)",
                padding: 16,
                borderRadius: 6,
                backgroundColor: "rgba(0, 0, 0, 0.2)"
            } : {})}
        >
            {/* TILE 1: Top-level settings (if any) */}
            {tree.settings && tree.settings.length > 0 && (
                <Container
                    flexDirection="column"
                    gap={16}
                    // Force it to act like a grid column
                    width="48%"
                    minWidth={250} // Prevent it from getting too squished
                >
                    {tree.settings.map(setting => (
                        <SettingRenderSlot key={setting.key} setting={setting} />
                    ))}
                </Container>
            )}

            {/* TILES 2+: Each nested subtree gets its own panel */}
            {tree.subtrees && Object.keys(tree.subtrees).length > 0 && (
                Object.entries(tree.subtrees).map(([label, subtree]) => (
                    <SettingsSectionSlot key={label} label={label} subtree={subtree} />
                ))
            )}
        </Container>
    );
};

const TabButton = ({ label, subtree, active, on_click }: { label: string; subtree?: SettingsTree; active: boolean; on_click: () => void; }) => {
    const ref = useRef<ComponentRef<typeof Container>>(null);
    const {is_focused, grab_focus} = useFocusable(ref, {on_accept: on_click}, undefined);

    // when active state changes, grab focus
    useEffect(() => {
        if (active) {
            grab_focus();
        }
    }, [active, grab_focus]);

    const under_subtree = useMemo(() => subtree ? collect_settings_in_tree(subtree).map(s => s.key) : [], [subtree]) as SettingKey[];
    const mode = useSessionMode();
    const visible = useAnySettingVisible(under_subtree, "watch", mode);

    if (subtree && !visible) return null;
    // TODO: handle redirect if current tab becomes invisible due to conditions

    return (
        <Container
            ref={ref}
            cursor="pointer"
            paddingX={16}
            paddingY={8}
            borderTopRadius={6}
            borderWidth={is_focused ? 1 : 0}
            borderColor={is_focused ? "white" : "transparent"}
            backgroundColor={active ? "#2563eb" : "#374151"}
            hover={{ backgroundColor: active ? "#2563eb" : "#4b5563" }}
            onPointerDown={on_click}
        >
            <Text fontSize={20} color={active ? "white" : "#d1d5db"}>
                {label}
            </Text>
        </Container>
    );
};

export const SettingsScreen = ({}: ScreenProps) => {
    const tree = useSettingsTree("watch");

    const [tab, setTab] = useState("General");
    const tab_tree = useMemo(() => tree.subtrees[tab], [tree, tab]);

    return (
        <Container width="100%" flexDirection="column">
            <Container flexDirection="row" gap={8} flexShrink={0}>
                {Object.entries(tree.subtrees).map(([name, subtree]) => (
                    <TabButton
                        key={name}
                        label={name}
                        subtree={subtree}
                        active={tab === name}
                        on_click={() => setTab(name)}
                    />
                ))}
            </Container>

            <Container
                width="100%"
                backgroundColor="rgba(0, 0, 0, 0.2)"
                padding={16}
                borderBottomRadius={6}
                borderWidth={1}
                borderColor="rgba(255, 255, 255, 0.2)"
            >
                <Crossfader content_key={tab} duration={150} width="100%" maxHeight="100%" overflow="scroll">
                    {tab_tree ? <SettingSubtree tree={tab_tree} is_root /> : (
                        <Container width="100%" height="100%" justifyContent="center" alignItems="center">
                            <Text fontSize={18} color="white">
                                No settings available for this tab.
                            </Text>
                        </Container>
                    )}
                </Crossfader>
            </Container>
        </Container>
    );
};
