import { useSyncExternalStore } from "react";
import { game_state_store } from "../../game_state";

export const useGameState = () => {
    return useSyncExternalStore(game_state_store.subscribe, game_state_store.get_snapshot);
}
