export interface Identity {
    name: string;
    host: string;
}

export interface PublicAuthInfo {
    identity: Identity;
    public_key: JsonWebKey;
    // stable account id (from the identity record); the durable id the app keys players by
    uuid?: string;
    avatar_url?: string;
}

export interface PrivateAuthInfo extends PublicAuthInfo {
    authed_at: number;
}
