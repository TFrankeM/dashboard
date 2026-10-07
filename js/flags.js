// Feature-flag bootstrap for the dashboard modules.
//
// dashboard.js awaits initModuleFlags() before touching the DOM: disabled
// modules are REMOVED from the document (not hidden), so the rest of the code
// finds the same world it already handles when a card simply doesn't exist in
// the HTML.

const FLAGS_ENDPOINT = "/api/flags";
const FETCH_TIMEOUT_MS = 3000;

async function fetchFlags() {
    const res = await fetch(FLAGS_ENDPOINT, {
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`flags request failed (${res.status})`);
    return res.json();
}

// Drop nav dots whose target section no longer exists, and module groups left
// without any module. Exported because layout.js re-syncs after composing.
export function syncModuleChrome() {
    document.querySelectorAll("[data-module-group]").forEach(group => {
        const remaining = group.querySelectorAll("[data-module]").length;
        if (remaining === 0) return group.remove();
        // Metric cards drive the column count of the static grid (see
        // dashboard.css); full-width sections span all columns regardless.
        group.dataset.moduleCount = group.querySelectorAll(".metric-card[data-module]").length;
    });
    document.querySelectorAll(".side-nav .nav-dot").forEach(dot => {
        const target = (dot.getAttribute("href") || "").slice(1);
        if (!target) return;
        const targetEl = document.getElementById(target);
        if (!targetEl) {
            dot.remove();
            return;
        }
        // Section specific: #metrics represents the metric-card cluster.
        // If no metric cards are displayed, this section's nav-dot must not appear.
        if (target === "metrics" && targetEl.querySelectorAll(".metric-card[data-module]").length === 0) {
            dot.remove();
            return;
        }
        // If target element is itself a module container with no displayed modules
        if (targetEl.hasAttribute("data-module") && !document.body.contains(targetEl)) {
            dot.remove();
            return;
        }
    });

    // If only one dot remains (e.g. only #top), hide the side-nav as navigation is meaningless
    const remainingDots = document.querySelectorAll(".side-nav .nav-dot");
    if (remainingDots.length <= 1) {
        document.querySelector(".side-nav")?.classList.add("hidden");
    } else {
        document.querySelector(".side-nav")?.classList.remove("hidden");
    }
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
    for (const mod of flags.modules) {
        if (mod.enabled) continue;
        document.querySelector(`[data-module="${mod.id}"]`)?.remove();
    }
    syncModuleChrome();
}
