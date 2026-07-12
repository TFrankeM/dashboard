// Feature-flag bootstrap for the dashboard modules.
//
// dashboard.js awaits initModuleFlags() before touching the DOM: disabled
// modules are REMOVED from the document (not hidden), so the rest of the code
// finds the same world it already handles when a card simply doesn't exist in
// the HTML. In lab mode (?lab=1) nothing is removed; disabled modules stay
// visible with an "in development" badge so the full inventory can be reviewed.

const FLAGS_ENDPOINT = "/api/flags";
const FETCH_TIMEOUT_MS = 3000;

export function isLabMode() {
    return new URLSearchParams(window.location.search).has("lab");
}

async function fetchFlags() {
    const res = await fetch(FLAGS_ENDPOINT, {
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`flags request failed (${res.status})`);
    return res.json();
}

function addPreviewBadge(el) {
    el.classList.add("module-preview");
    const badge = document.createElement("span");
    badge.className = "module-badge";
    badge.setAttribute("data-i18n", "flag_preview_badge");
    badge.textContent = "Em desenvolvimento";
    el.prepend(badge);
}

// Drop nav dots whose target section no longer exists, and module groups
// (e.g. the metrics row) left without any module.
function pruneEmptyContainers() {
    document.querySelectorAll("[data-module-group]").forEach(group => {
        const remaining = group.querySelectorAll("[data-module]").length;
        if (remaining === 0) group.remove();
        // Lets the grid reflow to the surviving cards (see dashboard.css).
        else group.dataset.moduleCount = remaining;
    });
    document.querySelectorAll(".side-nav .nav-dot").forEach(dot => {
        const target = (dot.getAttribute("href") || "").slice(1);
        if (target && !document.getElementById(target)) dot.remove();
    });
}

export async function initModuleFlags() {
    let flags;
    try {
        flags = await fetchFlags();
    } catch (error) {
        // Fail-safe: without flags the page keeps its static (all-production)
        // shape instead of going blank.
        console.error("feature flags unavailable, using page defaults:", error);
        return;
    }
    const lab = isLabMode();
    for (const mod of flags.modules) {
        if (mod.enabled) continue;
        const el = document.querySelector(`[data-module="${mod.id}"]`);
        if (!el) continue;
        if (lab) addPreviewBadge(el);
        else el.remove();
    }
    if (!lab) pruneEmptyContainers();
}
