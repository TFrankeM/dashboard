import { readFile, writeFile } from "node:fs/promises";
import { parseEdgeConfig } from "./flags-store.js";
import { BUILTIN_LAYOUTS, normalizeLayoutCards } from "./layouts.js";

// Layout storage, same backend split as flags-store.js: Edge Config in the
// cloud, a local JSON file when developing without EDGE_CONFIG, read-only
// builtins otherwise. A store exposes:
//   read()               -> { custom: { [slug]: { label, cards } }, active: slug|null }
//   writeLibrary(custom) -> persist the whole custom-layout map
//   writeActive(active)  -> persist the active slug (or null = static page)

const DEV_STORE_URL = new URL("../../.dev-layouts.json", import.meta.url);
const LIBRARY_KEY = "layouts_library";
const ACTIVE_KEY = "layouts_active";

async function edgeConfigUpsert(key, value) {
    const { id } = parseEdgeConfig(process.env.EDGE_CONFIG);
    const teamId = process.env.VERCEL_TEAM_ID;
    const url = `https://api.vercel.com/v1/edge-config/${id}/items${teamId ? `?teamId=${teamId}` : ""}`;
    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${process.env.VERCEL_API_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: [{ operation: "upsert", key, value }] }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Edge Config write failed (${res.status}): ${detail.slice(0, 200)}`);
    }
}

const edgeConfigStore = {
    name: "edge-config",
    writable: Boolean(process.env.VERCEL_API_TOKEN),

    async read() {
        const { id, token } = parseEdgeConfig(process.env.EDGE_CONFIG);
        const res = await fetch(`https://edge-config.vercel.com/${id}/items?token=${token}`);
        if (!res.ok) throw new Error(`Edge Config read failed (${res.status})`);
        const items = await res.json();
        return { custom: items[LIBRARY_KEY] ?? {}, active: items[ACTIVE_KEY] ?? null };
    },

    writeLibrary(custom) { return edgeConfigUpsert(LIBRARY_KEY, custom); },
    writeActive(active) { return edgeConfigUpsert(ACTIVE_KEY, active); },
};

async function readDevFile() {
    try {
        return JSON.parse(await readFile(DEV_STORE_URL, "utf8"));
    } catch (err) {
        if (err.code === "ENOENT") return {};
        throw err;
    }
}

async function patchDevFile(patch) {
    const raw = { ...(await readDevFile()), ...patch };
    await writeFile(DEV_STORE_URL, JSON.stringify(raw, null, 2) + "\n");
}

const devFileStore = {
    name: "dev-file",
    writable: true,

    async read() {
        const raw = await readDevFile();
        return { custom: raw.custom ?? {}, active: raw.active ?? null };
    },

    writeLibrary(custom) { return patchDevFile({ custom }); },
    writeActive(active) { return patchDevFile({ active }); },
};

const readOnlyError = () => { throw new Error("Layout store not configured (missing EDGE_CONFIG)"); };

const defaultsStore = {
    name: "defaults",
    writable: false,
    async read() { return { custom: {}, active: null }; },
    writeLibrary: readOnlyError,
    writeActive: readOnlyError,
};

export function getLayoutStore() {
    if (process.env.EDGE_CONFIG) return edgeConfigStore;
    if (!process.env.VERCEL) return devFileStore;
    return defaultsStore;
}

// Builtins merged with the store's custom layouts (builtins win on slug
// collision); an active slug pointing at a missing layout resolves to null.
// Cards normalize to 24-column coordinates here, so layouts saved by the
// earlier span-based and 12-column editors keep working without a migration
// pass (the stored "grid" marker tells the shapes apart).
export async function resolveLayouts(store) {
    const { custom, active } = await store.read();
    const library = {};
    for (const [slug, layout] of Object.entries(custom ?? {})) {
        if (slug in BUILTIN_LAYOUTS) continue;
        library[slug] = { label: layout.label ?? slug, cards: normalizeLayoutCards(layout.cards ?? [], layout.grid) };
    }
    Object.assign(library, BUILTIN_LAYOUTS);
    return { library, active: active && library[active] ? active : null };
}
