import { HomeScreen } from "./HomeScreen";
import { SettingsScreen } from "./SettingsScreen";
import { WorldScreen } from "./WorldScreen";

export const screen_names = ["home", "settings", "world"] as const;
export type ScreenName = (typeof screen_names)[number];

export type ScreenArguments = Record<string, any>;

export interface ScreenProps {
    args: ScreenArguments;
}

export const screens: Record<ScreenName, React.ComponentType<ScreenProps>> = {
    home: HomeScreen,
    settings: SettingsScreen,
    world: WorldScreen
} as const;

export const screen_titles: Record<ScreenName, string> = {
    home: "Home",
    settings: "Settings",
    world: "World"
} as const;

// TODO: in regards to that, prob useful to remember a back state in the controller and send that to allow change_screen to go back
