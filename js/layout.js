// Layout composition: places, sizes and prunes the module cards inside the
// page grid according to the active saved layout, to the ?layout=<slug>
// preview parameter (which wins and lets a layout be reviewed without
// activating it), or to ?draft=<base64url JSON> — an unsaved editor draft
// previewed straight from the admin, no persistence involved. Cards carry
// free 24-column grid coordinates {x, y, w, h} (the API normalizes older
// stored shapes to this on read).
//
// Returns true when a layout was applied — the caller then SKIPS the module
// flags, because an applied layout is authoritative about which cards exist
// (a layout may include modules the flags disable, e.g. the retired
// speedometer). Returns false to fall back to the flags path: static page
// and any /api/layouts failure.

import { syncModuleChrome } from "./flags.js";

const LAYOUTS_ENDPOINT = "/api/layouts";
const FETCH_TIMEOUT_MS = 3000;

function parseDraft(param) {
    if (!param) return null;
    try {
        const b64 = param.replaceAll("-", "+").replaceAll("_", "/");
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const cards = JSON.parse(new TextDecoder().decode(bytes));
        return Array.isArray(cards) && cards.length ? cards : null;
    } catch {
        return null;
    }
}

function applyCards(rawCards, name) {
    const grid = document.querySelector("[data-module-group]");
    if (!grid) return false;

    const cards = rawCards.filter(card =>
        card && typeof card.id === "string" &&
        [card.x, card.y, card.w, card.h].every(Number.isInteger));
    // DOM order = reading order, so the single-column mobile collapse walks
    // the page top-left to bottom-right. Desktop placement is explicit.
    cards.sort((a, b) => a.y - b.y || a.x - b.x);

    const listed = new Set();
    for (const card of cards) {
        if (listed.has(card.id)) continue;
        const el = grid.querySelector(`:scope > [data-module="${CSS.escape(card.id)}"]`);
        if (!el) continue; // module unknown to this build of the page
        listed.add(card.id);
        el.style.setProperty("--gx", card.x);
        el.style.setProperty("--gy", card.y);
        el.style.setProperty("--gw", card.w);
        el.style.setProperty("--gh", card.h);
        grid.appendChild(el);
    }
    if (!listed.size) return false; // nothing matched: keep the static page

    grid.querySelectorAll(":scope > [data-module]").forEach(el => {
        if (!listed.has(el.dataset.module)) el.remove();
    });

    grid.dataset.layoutMode = "custom";
    grid.dataset.layoutName = name;
    syncModuleChrome();
    return true;
}

export async function initLayoutComposition() {
    const params = new URLSearchParams(window.location.search);

    const draftCards = parseDraft(params.get("draft"));
    if (draftCards) return applyCards(draftCards, "rascunho");

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
    return applyCards(layout.cards ?? [], slug);
}
