import { authorized } from "./_lib/auth.js";
import { BUILTIN_LAYOUTS, GRID_COLS, validateLayoutInput, normalizeLayoutCards } from "./_lib/layouts.js";
import { getLayoutStore, resolveLayouts } from "./_lib/layouts-store.js";

// GET    /api/layouts                          -> current state (public)
// PUT    /api/layouts { slug, label?, cards }  -> create/update a custom layout
// PATCH  /api/layouts { active: slug|null }    -> activate a layout (null = static page)
// DELETE /api/layouts { slug }                 -> remove a custom layout
// Write methods require Authorization: Bearer <FLAGS_ADMIN_TOKEN>. Note that
// PUT/DELETE only touch the library; PATCH is the only call that changes what
// visitors see.

// Hobby Edge Config stores cap at ~8KB total (shared with the flag keys), so
// refuse libraries that could not fit.
const MAX_LIBRARY_BYTES = 4096;

async function state(store) {
    const { library, active } = await resolveLayouts(store);
    return { source: store.name, writable: store.writable, active, layouts: library };
}

export default async function handler(request, response) {
    // Layout changes must take effect on the next page load: never cache.
    response.setHeader("Cache-Control", "no-store");
    const store = getLayoutStore();

    if (request.method === "GET") {
        // "authorized" lets the admin panel validate its token without writing
        // anything; the rest of the payload is public either way.
        const auth = authorized(request);
        try {
            return response.status(200).json({ ...await state(store), authorized: auth });
        } catch (error) {
            // A broken store must not take the dashboard down: report the
            // builtin library with nothing active (= static page).
            console.error("layouts read error:", error);
            return response.status(200).json({
                source: "defaults",
                writable: false,
                active: null,
                layouts: BUILTIN_LAYOUTS,
                degraded: true,
                authorized: auth,
            });
        }
    }

    if (!["PUT", "PATCH", "DELETE"].includes(request.method)) {
        response.setHeader("Allow", "GET, PUT, PATCH, DELETE");
        return response.status(405).json({ error: "Method not allowed." });
    }
    if (!authorized(request)) {
        return response.status(401).json({ error: "Invalid or missing admin token." });
    }
    if (!store.writable) {
        return response.status(503).json({ error: `Layout store "${store.name}" is read-only.` });
    }

    try {
        if (request.method === "PUT") {
            const { slug, label, cards, grid } = request.body ?? {};
            // Accepts older card shapes too (span-based, or coordinates
            // without grid: 24 = the 12-column era): normalize converts
            // everything to the current grid, then validation runs on the
            // result. Stored layouts are stamped with the current grid.
            const normalized = normalizeLayoutCards(cards, grid);
            const problem = validateLayoutInput(slug, label, normalized);
            if (problem) return response.status(400).json({ error: problem });

            const { custom } = await store.read();
            custom[slug] = { label: (label ?? slug).trim(), cards: normalized, grid: GRID_COLS };
            if (JSON.stringify(custom).length > MAX_LIBRARY_BYTES) {
                return response.status(413).json({ error: "Layout library is full; delete a layout first." });
            }
            await store.writeLibrary(custom);
            return response.status(200).json(await state(store));
        }

        if (request.method === "PATCH") {
            const { active } = request.body ?? {};
            if (active !== null && typeof active !== "string") {
                return response.status(400).json({ error: "Expected { active: <slug> | null }." });
            }
            if (active !== null) {
                const { library } = await resolveLayouts(store);
                if (!library[active]) return response.status(400).json({ error: `Unknown layout "${active}".` });
            }
            await store.writeActive(active);
            return response.status(200).json(await state(store));
        }

        // DELETE
        const { slug } = request.body ?? {};
        if (typeof slug !== "string") {
            return response.status(400).json({ error: "Expected { slug: <custom layout> }." });
        }
        if (slug in BUILTIN_LAYOUTS) {
            return response.status(400).json({ error: "Builtin layouts cannot be deleted." });
        }
        const { custom, active } = await store.read();
        if (!(slug in custom)) return response.status(404).json({ error: `Unknown layout "${slug}".` });
        if (active === slug) {
            return response.status(409).json({ error: "Layout is active; deactivate it first." });
        }
        delete custom[slug];
        await store.writeLibrary(custom);
        return response.status(200).json(await state(store));
    } catch (error) {
        console.error("layouts write error:", error);
        return response.status(502).json({ error: "Failed to persist the layout change." });
    }
}
