import { useSyncExternalStore } from "react";

import { hole_info_store } from "../../game_state";

export const useHoleInfo = () => {
    return useSyncExternalStore(
        hole_info_store.subscribe,
        hole_info_store.get_snapshot
    );
};
