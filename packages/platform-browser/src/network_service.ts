import type { NetworkEngine, NetworkRoom, PeerHello, RoomKey } from "@hyperlinkvr/core";
import { WSNetworkEngine } from "./network_ws";

export type MultiplayerServiceKind = "single_node" | "network";

export interface ServiceNetworkOptions {
    kind: MultiplayerServiceKind;
    url: string;
}

interface DiscoveryResponse {
    endpoints: { ws: string; webtransport?: string };
}

export class ServiceNetworkEngine implements NetworkEngine {
    readonly #kind: MultiplayerServiceKind;
    readonly #url: string;

    constructor(options: ServiceNetworkOptions) {
        this.#kind = options.kind;
        this.#url = options.url;
    }

    async join(key: RoomKey, hello: PeerHello): Promise<NetworkRoom> {
        const endpoint = this.#kind === "network" ? await this.#discover() : this.#url;
        return new WSNetworkEngine({ url: endpoint }).join(key, hello);
    }

    async #discover(): Promise<string> {
        const response = await fetch(this.#url);
        if (!response.ok) {
            throw new Error(`multiplayer discovery failed: ${response.status}`);
        }
        const descriptor = (await response.json()) as DiscoveryResponse;
        const endpoint = descriptor.endpoints?.ws;
        if (!endpoint) {
            throw new Error("multiplayer discovery returned no ws endpoint");
        }
        return endpoint;
    }
}
