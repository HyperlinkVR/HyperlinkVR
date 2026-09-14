export interface AuthAdapter {
    // resolve an incoming request's credential (the Authorization Bearer token) to an identity, or null if unauthenticated
    authenticate(request: Request): Promise<string | null>;

    login_game(request: Request): Promise<string | null>;
    login_web?(redirect_uri: string): Promise<string>;
    logout?(request: Request): Promise<void>;
}
