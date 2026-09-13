import { serve } from "@hono/node-server";

import { create_app } from "./app";
import { seed } from "./seed";
import { MemorySiteStore } from "./store";

const PORT = 8787;

const store = new MemorySiteStore();
await seed(store);

const app = create_app({ store });

serve({ fetch: app.fetch, port: PORT }, (info) => {
    const origin = `http://localhost:${info.port}`;
    console.log(`hypergram dev host on ${origin}`);
    console.log(`  manifest: ${origin}/v1/manifest.json`);
    console.log(`  recent:   ${origin}/v1/feeds/recent.json`);
});
