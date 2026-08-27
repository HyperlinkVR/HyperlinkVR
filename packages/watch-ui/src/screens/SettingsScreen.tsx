import { Container, Text } from "@react-three/uikit";
import { useSettingsTree } from "@hyperlinkvr/react";
import type {ComponentRef} from "react";
import { useEffect, useMemo, useRef, useState} from "react";
import type { SettingsTree, SettingKey } from "@hyperlinkvr/types";
import { WatchSettingWidget } from "../settings/WatchSettingWidget";
import type { ScreenProps } from "./index";
import {Crossfader} from "../animation/Crossfader";
import {useFocusable} from "../contexts/FocusNavContext";

const SettingSubtree = ({
    index,
    tree,
    is_root = false
}: {
    index: string;
    tree: SettingsTree;
    is_root?: boolean;
}) => {
    const subtree = useMemo(() => tree.subtrees[index], [index, tree]);

    if (!subtree) return null;

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
            {subtree.settings && subtree.settings.length > 0 && (
                <Container
                    flexDirection="column"
                    gap={16}
                    // Force it to act like a grid column
                    width="48%"
                    minWidth={250} // Prevent it from getting too squished
                >
                    {subtree.settings.map(setting => (
                        <WatchSettingWidget key={setting.key} setting_key={setting.key as SettingKey} />
                    ))}
                </Container>
            )}

            {/* TILES 2+: Each nested subtree gets its own panel */}
            {subtree.subtrees && Object.keys(subtree.subtrees).length > 0 && (
                Object.keys(subtree.subtrees).map(subtab => (
                    <Container
                        key={subtab}
                        flexDirection="column"
                        gap={8}
                        // Match the settings tile width
                        width="48%"
                        minWidth={250}
                    >
                        <Text fontSize={18} fontWeight="bold" color="white" marginBottom={8}>
                            {subtab}
                        </Text>
                        {/* Render the next level of the grid inside this panel */}
                        <SettingSubtree index={subtab} tree={subtree} />
                    </Container>
                ))
            )}
        </Container>
    );
};

const TabButton = ({ label, active, on_click }: { label: string; active: boolean; on_click: () => void; }) => {
    const ref = useRef<ComponentRef<typeof Container>>(null);
    const {is_focused, grab_focus} = useFocusable(ref, {on_accept: on_click}, undefined);

    // when active state changes, grab focus
    useEffect(() => {
        if (active) {
            grab_focus();
        }
    }, [active, grab_focus]);

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
    const subtree_keys = useMemo(() => Object.keys(tree.subtrees), [tree]);

    const [tab, setTab] = useState("General");

    return (
        <Container width="100%" flexDirection="column">
            <Container flexDirection="row" gap={8} flexShrink={0}>
                {subtree_keys.map((subtab, idx) => (
                    <TabButton
                        key={subtab}
                        label={subtab}
                        active={tab === subtab}
                        on_click={() => setTab(subtab)}
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
                    {tree.subtrees[tab] && (
                        <SettingSubtree index={tab} tree={tree} is_root />
                    )}
                </Crossfader>
            </Container>
        </Container>
    );
};
