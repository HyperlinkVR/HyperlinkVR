import {send_via_rtc} from "./messenger";
import {whoami} from "./auth";

export class Player {
    readonly #selected_username: string | null = null;

    // null targets the local player (currently the only one, but thinking ahead to multiplayer)
    constructor(username: string | null = null) {
        if (username !== null) {
            throw new Error("Selecting other players is not supported yet");
        }
        this.#selected_username = username;
    }

    get_selected_username(): string | null {
        return this.#selected_username;
    }

    async get_username(): Promise<string> {
        if (this.#selected_username !== null) {
            return this.#selected_username;
        }

        const res = await whoami();
        if (!res || !res.info || !res.info.identity) {
            throw new Error("Failed to get player identity");
        }

        const {identity} = res.info;
        return `${identity.name}@${identity.host}`;
    }

    async get_position() {
        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_GET_POSITION",
            target_username: this.#selected_username
        });

        if (!res || res.position === undefined || res.yaw === undefined) {
            throw new Error("Failed to get player position");
        }

        return {
            position: res.position,
            yaw: res.yaw,
        }
    }

    async teleport_to(position?: [number, number, number], yaw?: number) {
        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_TELEPORT_TO",
            target_username: this.#selected_username,
            position,
            yaw
        });

        if (!res) {
            throw new Error("Failed to teleport player");
        }

        return {
            new_position: res.new_position,
            new_yaw: res.new_yaw,
        }
    }

    async send_to_world(url: string, prompt: "show" | "try_skip" | "skip_or_fail" = "show") {
        // validate url
        try {
            new URL(url);
        } catch (e) {
            throw new Error(`Invalid URL: ${url}`);
        }

        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_SEND_TO_WORLD",
            target_username: this.#selected_username,
            url,
            prompt
        });

        if (!res) {
            throw new Error("Failed to send player to world");
        }

        return res.going;
    }
}

export const get_current_player = () => {
    return new Player();
}
