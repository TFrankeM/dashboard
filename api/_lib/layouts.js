// Layout registry. A layout is a set of cards placed freely on a 24-column
// grid: {id, x, y, w, h}, all in grid units (columns 1..24, rows 1..N). The
// dashboard renders rows at a fixed 65px unit (+20px gap), so h also fixes
// the card height deterministically (h=4 -> 320px, the static metric-card
// height) — the anti-blink fixed-height mechanism depends on that.
//
// Every layout is an ordinary, editable entry in the layout store (see
// layouts-store.js); SEED_LAYOUTS below only fill the gaps until the store
// has its own entry for their slug. Two older stored shapes convert on read:
// the span-based flow editor ("1x1"/"2x1"/"3x1") and the short-lived
// 12-column coordinate grid (coordinates without a grid marker). Writes
// stamp grid: 24.

import { MODULE_IDS } from "./modules.js";

export const GRID_COLS = 24;
export const MAX_CARD_H = 12;
export const MAX_ROWS = 80;
export const MAX_CARDS = 24;

// Per-module sizing: "preset" is what the editor drops on the canvas, "min"
// is the legibility floor enforced on save. There is deliberately no ceiling —
// any card can be stretched as far as the grid allows.
export const MODULE_SIZES = {
    "grades-histogram":  { min: { w: 6, h: 4 },  preset: { w: 8, h: 4 } },
    "news-volume":       { min: { w: 6, h: 4 },  preset: { w: 8, h: 4 } },
    "gauge-thermometer": { min: { w: 4, h: 4 },  preset: { w: 8, h: 4 } },
    "gauge-speedometer": { min: { w: 6, h: 4 },  preset: { w: 8, h: 4 } },
    "evolution":         { min: { w: 12, h: 4 }, preset: { w: 24, h: 6 } },
    "newsstand":         { min: { w: 16, h: 6 }, preset: { w: 24, h: 8 } },
};

const FALLBACK_SIZES = { min: { w: 2, h: 2 }, preset: { w: 8, h: 4 } };

export function moduleSizes(id) {
    return MODULE_SIZES[id] ?? FALLBACK_SIZES;
}

// Seed layouts: ordinary, EDITABLE grid layouts that ship with the code. They
// appear in the library only while the store has no entry for their slug —
// editing one materializes it in the store (and it evolves from there);
// deleting one leaves a tombstone so it stays gone. Both start favorited.
export const SEED_LAYOUTS = {
    // Grid rendition of the classic page: three metric cards, then the
    // evolution chart, then the newsstand.
    padrao: {
        label: "Padrão",
        favorite: true,
        cards: [
            { id: "grades-histogram", x: 1, y: 1, w: 8, h: 4 },
            { id: "news-volume", x: 9, y: 1, w: 8, h: 4 },
            { id: "gauge-thermometer", x: 17, y: 1, w: 8, h: 4 },
            { id: "evolution", x: 1, y: 5, w: 24, h: 6 },
            { id: "newsstand", x: 1, y: 11, w: 24, h: 8 },
        ],
    },
    // Indicator beside the evolution chart, no histogram/volume cards.
    compacto: {
        label: "Compacto",
        favorite: true,
        cards: [
            { id: "evolution", x: 1, y: 1, w: 16, h: 6 },
            { id: "gauge-thermometer", x: 17, y: 1, w: 8, h: 6 },
            { id: "newsstand", x: 1, y: 7, w: 24, h: 8 },
        ],
    },
};

// Converts a span-based layout (ordered flow of "1x1"/"2x1"/"3x1" cards) to
// coordinates, reproducing the flow renderer's reading order: cards fill a row
// left to right, and every card in a flow row gets the row's height (the tall
// neighbor stretched the whole row in the old model). "blank" spacers reserve
// their cells and are then dropped — emptiness is just empty now.
function fromLegacy(cards) {
    const SPAN = { "1x1": 8, "2x1": 16, "3x1": 24 };
    const out = [];
    let x = 1, y = 1, row = [];
    const flush = () => {
        if (!row.length) { x = 1; return; }
        const h = Math.max(...row.map(c => moduleSizes(c.id).preset.h));
        for (const c of row) out.push({ id: c.id, x: c.x, y, w: c.w, h });
        y += h;
        x = 1;
        row = [];
    };
    for (const card of cards ?? []) {
        if (!card || typeof card !== "object") continue;
        const w = SPAN[card.size] ?? 8;
        if (x + w > GRID_COLS + 1) flush();
        row.push({ id: card.id, x, w });
        x += w;
        if (x > GRID_COLS) flush();
    }
    flush();
    return out.filter(c => c.id !== "blank" && MODULE_IDS.has(c.id));
}

// Doubles a 12-column-era card into the 24-column grid (rows doubled too:
// back then the row unit was 150px, now two 65px rows + gap cover the same).
function fromTwelveCol(cards) {
    return cards.map(card => (card && typeof card === "object")
        ? { id: card.id, x: 2 * card.x - 1, y: 2 * card.y - 1, w: 2 * card.w, h: 2 * card.h }
        : {});
}

// Maps any stored or submitted cards array to the 24-column coordinate shape,
// stripping client extras. "grid" is the layout's stored marker: absent means
// the cards predate the 24-column grid. Non-numeric fields survive as NaN for
// validation to reject.
export function normalizeLayoutCards(cards, grid) {
    if (!Array.isArray(cards)) return [];
    if (cards.some(c => c && typeof c === "object" && c.size !== undefined && c.x === undefined)) {
        return fromLegacy(cards);
    }
    if (grid !== GRID_COLS) return fromTwelveCol(cards);
    return cards.map(card => (card && typeof card === "object")
        ? { id: card.id, x: card.x, y: card.y, w: card.w, h: card.h }
        : {});
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

// Validates a custom-layout upsert (cards already normalized); returns null
// when valid, otherwise a short problem description safe to echo back to the
// admin client.
export function validateLayoutInput(slug, label, cards) {
    if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
        return "slug must match [a-z0-9][a-z0-9-]{0,31}";
    }
    if (label !== undefined && (typeof label !== "string" || !label.trim() || label.trim().length > 40)) {
        return "label must be a non-empty string of up to 40 characters";
    }
    if (!Array.isArray(cards) || cards.length === 0 || cards.length > MAX_CARDS) {
        return `cards must be a non-empty array of up to ${MAX_CARDS} entries`;
    }
    const seenIds = new Set();
    for (const card of cards) {
        if (!card || typeof card !== "object") return "each card must be an object";
        if (!MODULE_IDS.has(card.id)) return `unknown module "${card.id}"`;
        if (seenIds.has(card.id)) return `duplicate module "${card.id}"`;
        seenIds.add(card.id);
        for (const key of ["x", "y", "w", "h"]) {
            if (!Number.isInteger(card[key]) || card[key] < 1) {
                return `"${card.id}": ${key} must be a positive integer`;
            }
        }
        if (card.x + card.w > GRID_COLS + 1) {
            return `"${card.id}" spills past the ${GRID_COLS}-column grid`;
        }
        if (card.h > MAX_CARD_H) return `"${card.id}": height caps at ${MAX_CARD_H} rows`;
        if (card.y + card.h > MAX_ROWS + 1) return `"${card.id}" sits below row ${MAX_ROWS}`;
        const { min } = moduleSizes(card.id);
        if (card.w < min.w || card.h < min.h) {
            return `"${card.id}" needs at least ${min.w}×${min.h}`;
        }
    }
    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            const a = cards[i], b = cards[j];
            if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
                return `"${a.id}" and "${b.id}" overlap`;
            }
        }
    }
    return null;
}
