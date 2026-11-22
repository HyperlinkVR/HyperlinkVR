import { HomeScreen } from "./HomeScreen";
import { SettingsScreen } from "./SettingsScreen";
import { WorldNavigateModalScreen } from "./WorldNavigateModalScreen";
import { WorldScreen } from "./WorldScreen";


export const screen_names = [
    "home",
    "settings",
    "world",
    "world_navigate_modal"
] as const;
export type ScreenName = (typeof screen_names)[number];

export type ScreenArguments = Record<string, any>;

export interface ScreenProps {
    args: ScreenArguments;
}

export const screens: Record<ScreenName, React.ComponentType<ScreenProps>> = {
    home: HomeScreen,
    settings: SettingsScreen,
    world: WorldScreen,
    world_navigate_modal: WorldNavigateModalScreen
} as const;

export const screen_titles: Record<ScreenName, string> = {
    home: "Home",
    settings: "Settings",
    world: "World",
    world_navigate_modal: "World Navigation Request"
} as const;

// TODO: in regards to that, prob useful to remember a back state in the controller and send that to allow change_screen to go back
