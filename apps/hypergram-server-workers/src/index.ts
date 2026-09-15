import {
    create_app,
    create_signature_auth
} from "@hyperlinkvr/hypergram-server-lib";
import { R2SiteStore } from "./r2_store";

export default {
    async fetch(request: Request, env: CloudflareBindings, ctx: ExecutionContext): Promise<Response> {
        const base_url = new URL(request.url).origin;

        if (!env.TOKEN_SECRET) {
            return new Response("TOKEN_SECRET must be set in the environment", { status: 500 });
        }

        if (!env.ALLOWED_HOSTS) {
            return new Response("ALLOWED_HOSTS must be set in the environment", { status: 500 });
        }

        const store = new R2SiteStore(env.SITE_BUCKET, env.SITE_BUCKET_ROOT ?? "", ctx);

        const app = await create_app({
            store,
            base_url,
            name: env.NAME ?? "Hypergram",
            // only accepts game signature auth currently, no web auth adapter implemented
            auth: create_signature_auth({ token_secret: env.TOKEN_SECRET, allowed_hosts: env.ALLOWED_HOSTS.split(",") })
        });


        try {
            return app.fetch(request, env, ctx);
        } catch (err: any) {
            if (err.message.startsWith("IP_RATE_LIMIT_EXCEEDED")) {
                return new Response("Too Many Requests", { status: 429 });
            }
            if (err.message.startsWith("GLOBAL_RATE_LIMIT_EXCEEDED")) {
                return new Response("Service Temporarily Overloaded", { status: 503 });
            }
            return new Response("Internal Error", { status: 500 });
        }
    }
}
