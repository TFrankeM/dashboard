import { readFile, writeFile } from "node:fs/promises";
import { MODULES, flagKey } from "./modules.js";

// Flag storage backends, picked by environment:
//   - Edge Config (production/preview): reads via the EDGE_CONFIG connection
//     string, writes via the Vercel REST API (VERCEL_API_TOKEN).
//   - Local JSON file (development, no EDGE_CONFIG set): .dev-flags.json at the
//     project root, gitignored, so the whole flow can be exercised offline.
//   - Read-only defaults: deployed without EDGE_CONFIG; toggling is disabled.
//
// A store exposes { name, writable, read(), write(id, enabled) } where read()
// resolves to an override map { [moduleId]: boolean } (missing = use default).

const DEV_STORE_URL = new URL("../../.dev-flags.json", import.meta.url);

function parseEdgeConfig(connectionString) {
    // Format: https://edge-config.vercel.com/<id>?token=<read-token>
    const url = new URL(connectionString);
    const id = url.pathname.replaceAll("/", "");
    const token = url.searchParams.get("token");
    if (!id || !token) throw new Error("Malformed EDGE_CONFIG connection string");
    return { id, token };
}

function overridesFromItems(items) {
    const overrides = {};
    for (const m of MODULES) {
        const value = items[flagKey(m.id)];
        if (typeof value === "boolean") overrides[m.id] = value;
    }
    return overrides;
}

const edgeConfigStore = {
    name: "edge-config",
    writable: Boolean(process.env.VERCEL_API_TOKEN),

    async read() {
        const { id, token } = parseEdgeConfig(process.env.EDGE_CONFIG);
        const res = await fetch(`https://edge-config.vercel.com/${id}/items?token=${token}`);
        if (!res.ok) throw new Error(`Edge Config read failed (${res.status})`);
        return overridesFromItems(await res.json());
    },

    async write(moduleId, enabled) {
        const { id } = parseEdgeConfig(process.env.EDGE_CONFIG);
        const teamId = process.env.VERCEL_TEAM_ID;
        const url = `https://api.vercel.com/v1/edge-config/${id}/items${teamId ? `?teamId=${teamId}` : ""}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${process.env.VERCEL_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                items: [{ operation: "upsert", key: flagKey(moduleId), value: enabled }],
            }),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new Error(`Edge Config write failed (${res.status}): ${detail.slice(0, 200)}`);
        }
    },
};

const devFileStore = {
    name: "dev-file",
    writable: true,

    async read() {
        try {
            const raw = JSON.parse(await readFile(DEV_STORE_URL, "utf8"));
            return overridesFromItems(raw);
        } catch (err) {
            if (err.code === "ENOENT") return {};
            throw err;
        }
    },

    async write(moduleId, enabled) {
        let raw = {};
        try {
            raw = JSON.parse(await readFile(DEV_STORE_URL, "utf8"));
        } catch (err) {
            if (err.code !== "ENOENT") throw err;
        }
        raw[flagKey(moduleId)] = enabled;
        await writeFile(DEV_STORE_URL, JSON.stringify(raw, null, 2) + "\n");
    },
};

const defaultsStore = {
    name: "defaults",
    writable: false,
    async read() { return {}; },
    async write() { throw new Error("Flag store not configured (missing EDGE_CONFIG)"); },
};

export function getStore() {
    if (process.env.EDGE_CONFIG) return edgeConfigStore;
    if (!process.env.VERCEL) return devFileStore;
    return defaultsStore;
}

// Defaults merged with the store's overrides, in manifest order.
export async function resolveFlags(store) {
    const overrides = await store.read();
    return MODULES.map(m => ({
        id: m.id,
        label: m.label,
        status: m.status,
        enabled: overrides[m.id] ?? m.defaultEnabled,
    }));
}
