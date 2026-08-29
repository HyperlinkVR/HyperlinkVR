import { useGameState } from "./hooks/useGameState";
import { Splash } from "./components/Splash";
import { Scoreboard } from "./components/Scoreboard";

export const App = () => {
    const {hole} = useGameState();

    return hole === 0 ? <Splash /> : <Scoreboard />;
}

// TODO: create a generic hyperlink splash screen component in ui-dom that points to open the game (or where to get it if they dont have it)
