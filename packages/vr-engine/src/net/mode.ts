import type { WorldMetadata } from "@hyperlinkvr/vr-engine-schemas";

export type MultiplayerMode = "solo" | "shared";

export const derive_mode = (metadata: WorldMetadata | null): MultiplayerMode =>
    metadata && metadata.max_players > 1 ? "shared" : "solo";
