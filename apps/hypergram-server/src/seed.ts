import { publish_site, type SiteStore } from "@hyperlinkvr/hypergram-host";
import type { Post } from "@hyperlinkvr/hypergram-schemas/v1";

export const DEV_BASE_URL = "http://localhost:8787/";

// a few posts so feeds and posts have something to return. images point at picsum so the frontend shows real pixels.
const sample_posts = (): Post[] => {
    const base_ts = Date.UTC(2026, 8, 12, 12, 0, 0);
    const seeds: { id: string; author: string; seed: string; caption?: string }[] = [
        { id: "01K5ABCDEFGH23JKMNPQRSTVWX", author: "ada@example.com", seed: "hypergram1", caption: "first light" },
        { id: "02K5ABCDEFGH23JKMNPQRSTVWX", author: "ada@example.com", seed: "hypergram2" },
        { id: "03K5ABCDEFGH23JKMNPQRSTVWX", author: "grace@example.com", seed: "hypergram3", caption: "from the workshop" },
        {id: "04K5ABCDEFGH23JKMNPQRSTVWX", author: "john@example.com", seed: "hypergram4", caption: "a day in the life" },
        {id: "05K5ABCDEFGH23JKMNPQRSTVWX", author: "grace@example.com", seed: "hypergram5" }
    ];

    return seeds.map((s, i) => ({
        id: s.id,
        author: s.author,
        ts: base_ts + i * 60_000,
        image_url: `https://picsum.photos/seed/${s.seed}/1080`,
        thumb_url: `https://picsum.photos/seed/${s.seed}/320`,
        caption: s.caption
    }));
};

const sample_pictures = () => {
    const seeds: { author: string; seed: string }[] = [
        { author: "ada@example.com", seed: "ada" },
        { author: "grace@example.com", seed: "grace" },
        { author: "john@example.com", seed: "john" }
    ];

    return seeds.map((s) => ({
        author: s.author,
        high_res_url: `https://picsum.photos/seed/${s.seed}/512`,
        low_res_url: `https://picsum.photos/seed/${s.seed}/64`
    }));
};

export const seed = async (store: SiteStore) => {
    const posts = sample_posts();
    const pictures = sample_pictures();
    await publish_site(DEV_BASE_URL, store, { posts, pictures });
    return { posts, pictures };
};
