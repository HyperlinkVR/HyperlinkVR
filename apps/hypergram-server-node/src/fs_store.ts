import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import type { SiteStore } from "@hyperlinkvr/hypergram-read-host";
export class FileSystemSiteStore implements SiteStore {
    constructor(private readonly root: string) {}

    private full(path: string) {
        return join(this.root, path);
    }

    async get(path: string): Promise<Uint8Array | null> {
        try {
            return new Uint8Array(await readFile(this.full(path)));
        } catch {
            return null; // missing file
        }
    }

    async put(path: string, body: Uint8Array | string): Promise<void> {
        const file = this.full(path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, body);
    }

    async delete(path: string): Promise<void> {
        await rm(this.full(path), { force: true });
    }

    async list(prefix: string): Promise<string[]> {
        const out: string[] = [];

        const walk = async (dir: string) => {
            let entries;
            try {
                entries = await readdir(dir, { withFileTypes: true });
            } catch {
                return; // dir doesn't exist yet
            }
            for (const entry of entries) {
                const child = join(dir, entry.name);
                if (entry.isDirectory()) await walk(child);
                else out.push(relative(this.root, child).split(sep).join("/")); // store paths are always forward-slashed
            }
        };

        await walk(this.root);
        return out.filter((path) => path.startsWith(prefix));
    }
}
