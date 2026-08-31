export interface DiscordRPCActivity {
    /** The player's current action/status description (e.g., "In a Match", "Idle") */
    state?: string;

    /** Specific details about what the player is doing (e.g., "Playing Chess", "Hosting a Room") */
    details?: string;

    /** Unix timestamps to display match duration or countdowns */
    timestamps?: {
        /** Epoch time in milliseconds when the activity started */
        start?: number;
        /** Epoch time in milliseconds when the activity will end */
        end?: number;
    };

    /** Visual art assets uploaded to your Discord Developer Portal application */
    assets?: {
        /** The lookup key for the large artwork icon */
        large_image?: string;
        /** Hover text displayed when mouse is over the large artwork icon */
        large_text?: string;
        /** The lookup key for the small overlay artwork icon */
        small_image?: string;
        /** Hover text displayed when mouse is over the small artwork icon */
        small_text?: string;
    };

    /** Information about the player's current multiplayer party or game lobby */
    party?: {
        /** Unique identification string for the specific game lobby instance */
        id?: string;
        /** Current number of players actively inside the lobby */
        size?: number;
        /** Maximum capacity limit allowed for the lobby */
        max?: number;
    };

    /** Cryptographic secret hashes used to handle direct game client integrations */
    secrets?: {
        /** Unique hash for verifying a distinct matched game session */
        match?: string;
        /** Hash required for allowing other users to click "Join" your game */
        join?: string;
        /** Hash required for allowing other users to click "Spectate" your session */
        spectate?: string;
    };

    /** Toggles whether this session is an instanced match context */
    instance?: boolean;

    /** Clickable buttons displayed on the profile (Discord supports up to 2 items) */
    buttons?: Array<{
        /** The text text displayed inside the button */
        label: string;
        /** The URL target opened when clicking the button */
        url: string;
    }>;
}

export interface DiscordRPCEngineSetup {
    text?: string;
    download?: string;
}

export abstract class DiscordRPCEngine {
    abstract request_permission(): Promise<boolean>;
    abstract has_permission(): Promise<boolean>;
    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract is_connected(): Promise<boolean>;
    abstract set_activity(activity: DiscordRPCActivity): Promise<void>;
    abstract clear_activity(): Promise<void>;
    get setup(): DiscordRPCEngineSetup | undefined {
        // override to add setup instructions
        return undefined;
    }
}
