// Layout registry. A layout is an ordered list of cards, each a module id from
// modules.js plus a predefined size (width in thirds of the page grid; every
// card is one row tall). Built-in layouts ship with the code and cannot be
// edited; custom layouts live in the layout store (see layouts-store.js) and
// are merged over these by slug.

import { MODULE_IDS } from "./modules.js";

export const CARD_SIZES = new Set(["1x1", "2x1", "3x1"]);

export const BUILTIN_LAYOUTS = {
    // The page exactly as authored in dashboard.html (legacy 1:1.5:1 metrics
    // row). "static" means activating it performs no recomposition at all —
    // it is also what the dashboard falls back to when the store is down.
    padrao: {
        label: "Padrão",
        builtin: true,
        static: true,
        cards: [
            { id: "grades-histogram", size: "1x1" },
            { id: "news-volume", size: "1x1" },
            { id: "gauge-thermometer", size: "1x1" },
            { id: "evolution", size: "3x1" },
            { id: "newsstand", size: "3x1" },
        ],
    },
    // The remove-graficos arrangement: indicator beside the evolution chart,
    // no histogram/volume cards.
    compacto: {
        label: "Compacto",
        builtin: true,
        cards: [
            { id: "evolution", size: "2x1" },
            { id: "gauge-thermometer", size: "1x1" },
            { id: "newsstand", size: "3x1" },
        ],
    },
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

// Validates a custom-layout upsert; returns null when valid, otherwise a short
// problem description safe to echo back to the admin client.
export function validateLayoutInput(slug, label, cards) {
    if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
        return "slug must match [a-z0-9][a-z0-9-]{0,31}";
    }
    if (slug in BUILTIN_LAYOUTS) return "builtin layouts cannot be modified";
    if (label !== undefined && (typeof label !== "string" || !label.trim() || label.trim().length > 40)) {
        return "label must be a non-empty string of up to 40 characters";
    }
    if (!Array.isArray(cards) || cards.length === 0 || cards.length > 12) {
        return "cards must be a non-empty array of up to 12 entries";
    }
    const seenIds = new Set();
    for (const card of cards) {
        if (!card || typeof card !== "object") return "each card must be an object";
        if (!CARD_SIZES.has(card.size)) return `invalid size "${card.size}"`;
        if (card.id === "blank") continue; // spacer: repeatable, not a module
        if (!MODULE_IDS.has(card.id)) return `unknown module "${card.id}"`;
        if (seenIds.has(card.id)) return `duplicate module "${card.id}"`;
        seenIds.add(card.id);
    }
    return null;
}

// Strips anything beyond the stored shape so client extras never reach the store.
export function normalizeCards(cards) {
    return cards.map(card => ({ id: card.id, size: card.size }));
}
