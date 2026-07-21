// Layout composition: reorders, resizes and prunes the module cards inside the
// page grid according to the active saved layout, or to the ?layout=<slug>
// preview parameter (which wins and lets a layout be reviewed without
// activating it).
//
// Returns true when a layout was applied — the caller then SKIPS the module
// flags, because an applied layout is authoritative about which cards exist
// (a layout may include modules the flags disable, e.g. the retired
// speedometer). Returns false to fall back to the flags path: static page,
// lab mode (?lab=1, full inventory) and any /api/layouts failure.

import { syncModuleChrome } from "./flags.js";

const LAYOUTS_ENDPOINT = "/api/layouts";
const FETCH_TIMEOUT_MS = 3000;
const VALID_SIZES = new Set(["1x1", "2x1", "3x1"]);

export async function initLayoutComposition() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("lab")) return false;

    let data;
    try {
        const res = await fetch(LAYOUTS_ENDPOINT, {
            cache: "no-store",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`layouts request failed (${res.status})`);
        data = await res.json();
    } catch (error) {
        console.error("layouts unavailable, keeping the static page:", error);
        return false;
    }

    const slug = params.get("layout") || data.active;
    const layout = slug ? data.layouts?.[slug] : null;
    if (!layout || layout.static) return false;

    const grid = document.querySelector("[data-module-group]");
    if (!grid) return false;

    // Appending in layout order both sorts the listed cards and leaves the
    // unlisted ones at the front, where the prune below picks them up. "blank"
    // entries are spacers: repeatable, materialized here as empty grid items.
    const listed = new Set();
    for (const card of layout.cards ?? []) {
        if (!card?.id) continue;
        const size = VALID_SIZES.has(card.size) ? card.size : "1x1";
        if (card.id === "blank") {
            const spacer = document.createElement("div");
            spacer.className = "layout-blank";
            spacer.dataset.module = "blank";
            spacer.dataset.size = size;
            grid.appendChild(spacer);
            continue;
        }
        if (listed.has(card.id)) continue;
        const el = grid.querySelector(`:scope > [data-module="${card.id}"]`);
        if (!el) continue; // module unknown to this build of the page
        listed.add(card.id);
        el.dataset.size = size;
        grid.appendChild(el);
    }
    grid.querySelectorAll(":scope > [data-module]").forEach(el => {
        if (el.dataset.module !== "blank" && !listed.has(el.dataset.module)) el.remove();
    });

    grid.dataset.layoutMode = "custom";
    grid.dataset.layoutName = slug;
    syncModuleChrome();
    return true;
}
