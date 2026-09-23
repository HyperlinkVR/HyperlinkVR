import { join } from "node:path";

import { serve } from "@hono/node-server";
import { create_app, create_signature_auth } from "@hyperlinkvr/hypergram-server-lib";

import { FileSystemSiteStore } from "./fs_store";

const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

const DATA_DIR = join(process.cwd(), ".data");

const store = new FileSystemSiteStore(DATA_DIR);

const allowed_host = process.env.ALLOWED_HOST;
if (!allowed_host) {
    console.warn("ALLOWED_HOST not set. Allowing all hosts to authenticate. This is a bad idea and should only be used for local development.");
}

const token_secret = process.env.TOKEN_SECRET ?? crypto.randomUUID();
if (!process.env.TOKEN_SECRET) {
    console.warn("TOKEN_SECRET not set. Using an ephemeral secret, so existing tokens are invalidated on restart");
}

const app = await create_app({
    store,
    base_url: BASE_URL,
    name: "Hypergram",
    // only accepts game signature auth currently, no web auth adapter implemented
    auth: create_signature_auth({ token_secret, allowed_hosts: [allowed_host ?? "*"] })
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
    const origin = `http://localhost:${info.port}`;
    console.log(`hypergram host on ${origin}`);
    console.log(`  data:     ${DATA_DIR}`);
    console.log(`  manifest: ${origin}/v1/manifest.json`);
    console.log(`  recent:   ${origin}/v1/feeds/recent.json`);
});
