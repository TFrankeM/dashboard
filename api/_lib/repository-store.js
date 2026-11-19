import { readFile, writeFile } from "node:fs/promises";
import { parseEdgeConfig } from "./flags-store.js";
import { edgeConfigUpsert } from "./layouts-store.js";
import { SEED_CATALOG } from "./repository.js";

// Repository catalog storage, same backend split as layouts-store.js: Edge
// Config in the cloud, a local JSON file when developing without EDGE_CONFIG,
// read-only seeds otherwise. A store exposes:
//   read()      -> array of docs, or null when nothing was ever written
//   write(docs) -> persist the whole ordered list
// The stored list is the authority once it exists; the code seeds only serve
// a store that was never written (the first write materializes them).

const DEV_STORE_URL = new URL("../../.dev-repository.json", import.meta.url);
const CATALOG_KEY = "repository_catalog";

const edgeConfigStore = {
    name: "edge-config",
    writable: Boolean(process.env.VERCEL_API_TOKEN),

    async read() {
        const { id, token } = parseEdgeConfig(process.env.EDGE_CONFIG);
        const res = await fetch(`https://edge-config.vercel.com/${id}/item/${CATALOG_KEY}?token=${token}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Edge Config read failed (${res.status})`);
        const value = await res.json();
        return Array.isArray(value) ? value : null;
    },

    write(docs) { return edgeConfigUpsert(CATALOG_KEY, docs); },
};

const devFileStore = {
    name: "dev-file",
    writable: true,

    async read() {
        try {
            const raw = JSON.parse(await readFile(DEV_STORE_URL, "utf8"));
            return Array.isArray(raw.docs) ? raw.docs : null;
        } catch (err) {
            if (err.code === "ENOENT") return null;
            throw err;
        }
    },

    write(docs) { return writeFile(DEV_STORE_URL, JSON.stringify({ docs }, null, 2) + "\n"); },
};

const defaultsStore = {
    name: "defaults",
    writable: false,
    async read() { return null; },
    write() { throw new Error("Repository store not configured (missing EDGE_CONFIG)"); },
};

export function getRepositoryStore() {
    if (process.env.EDGE_CONFIG) return edgeConfigStore;
    if (!process.env.VERCEL) return devFileStore;
    return defaultsStore;
}

export async function resolveCatalog(store) {
    const stored = await store.read();
    return stored ?? SEED_CATALOG.map(doc => ({ ...doc }));
}
