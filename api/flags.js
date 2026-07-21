import { authorized } from "./_lib/auth.js";
import { MODULE_IDS } from "./_lib/modules.js";
import { getStore, resolveFlags } from "./_lib/flags-store.js";

// GET  /api/flags  -> { source, writable, modules: [{ id, label, status, enabled }] }
//      Public: the dashboard needs it to decide which modules to mount.
// PATCH /api/flags { id, enabled }  -> same shape, after the update.
//      Requires Authorization: Bearer <FLAGS_ADMIN_TOKEN>.

async function state(store) {
    return {
        source: store.name,
        writable: store.writable,
        modules: await resolveFlags(store),
    };
}

export default async function handler(request, response) {
    // Flags must take effect on the next page load: never cache.
    response.setHeader("Cache-Control", "no-store");
    const store = getStore();

    if (request.method === "GET") {
        try {
            return response.status(200).json(await state(store));
        } catch (error) {
            // A broken store must not take the dashboard down with it: report
            // manifest defaults and flag the degradation for the admin panel.
            console.error("flags read error:", error);
            const fallback = await state({ name: "defaults", writable: false, read: async () => ({}) });
            return response.status(200).json({ ...fallback, degraded: true });
        }
    }

    if (request.method === "PATCH") {
        if (!authorized(request)) {
            return response.status(401).json({ error: "Invalid or missing admin token." });
        }
        if (!store.writable) {
            return response.status(503).json({ error: `Flag store "${store.name}" is read-only.` });
        }
        const { id, enabled } = request.body ?? {};
        if (!MODULE_IDS.has(id) || typeof enabled !== "boolean") {
            return response.status(400).json({ error: "Expected { id: <known module>, enabled: boolean }." });
        }
        try {
            await store.write(id, enabled);
            return response.status(200).json(await state(store));
        } catch (error) {
            console.error("flags write error:", error);
            return response.status(502).json({ error: "Failed to persist the flag." });
        }
    }

    response.setHeader("Allow", "GET, PATCH");
    return response.status(405).json({ error: "Method not allowed." });
}
