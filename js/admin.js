// Admin panel: gallery + free-placement editor for the page layouts
// (/api/layouts). Cards live on a 12-column grid as {id, x, y, w, h}; the
// editor lets them be dropped anywhere, moved and stretched (drop on another
// card is invalid), with per-module minimum sizes mirrored from the API.
// Nothing renders before the admin token is validated against the server; the
// token lives in memory only — closing the tab forgets it.

const LAYOUTS_ENDPOINT = "/api/layouts";

const metaEl = document.getElementById("admin-meta");
const gateEl = document.getElementById("auth-gate");
const authFormEl = document.getElementById("auth-form");
const authSubmitEl = document.getElementById("auth-submit");
const authErrorEl = document.getElementById("auth-error");
const tokenInputEl = document.getElementById("admin-token");
const mainEl = document.getElementById("admin-main");
const galleryEl = document.getElementById("layout-gallery");
const feedbackEl = document.getElementById("admin-feedback");
const editorEl = document.getElementById("layout-editor");
const editorTitleEl = document.getElementById("editor-title");
const editorLabelEl = document.getElementById("editor-label");
const editorSlugEl = document.getElementById("editor-slug");
const editorTrayEl = document.getElementById("editor-tray");
const canvasEl = document.getElementById("editor-canvas");

const SOURCE_LABELS = {
    "edge-config": "Edge Config (produção)",
    "dev-file": "arquivo local (desenvolvimento)",
    "defaults": "padrões do código (somente leitura)",
};

// Grid contract — keep in sync with api/_lib/layouts.js (the API is the
// authority; these mirrors only drive the editor UX).
const GRID_COLS = 24;
const MAX_CARD_H = 12;
const MAX_ROWS = 80;
const CANVAS_MIN_ROWS = 12;
const CANVAS_SPARE_ROWS = 2;
const DRAG_THRESHOLD_PX = 6;

const MODULE_META = {
    "grades-histogram":  { label: "Distribuição de notas",  min: { w: 6, h: 4 },  preset: { w: 8, h: 4 } },
    "news-volume":       { label: "Quantidade de notícias", min: { w: 6, h: 4 },  preset: { w: 8, h: 4 } },
    "gauge-thermometer": { label: "Indicador (termômetro)", min: { w: 4, h: 4 },  preset: { w: 8, h: 4 } },
    "gauge-speedometer": { label: "Indicador (acelerador)", min: { w: 6, h: 4 },  preset: { w: 8, h: 4 } },
    "evolution":         { label: "Evolução temporal",      min: { w: 12, h: 4 }, preset: { w: 24, h: 6 } },
    "newsstand":         { label: "Notícias do ponto",      min: { w: 16, h: 6 }, preset: { w: 24, h: 8 } },
};

// Hand-drawn miniatures of each chart type: instant, theme-aware and never
// dependent on live data (a screenshot or a real mini-chart would be both).
const MODULE_GLYPHS = {
    "grades-histogram": `<svg viewBox="0 0 64 32" aria-hidden="true">
        <rect x="2" y="24" width="6" height="6" rx="1" fill="#b91c1c"/>
        <rect x="11" y="18" width="6" height="12" rx="1" fill="#ea580c"/>
        <rect x="20" y="12" width="6" height="18" rx="1" fill="#f59e0b"/>
        <rect x="29" y="4" width="6" height="26" rx="1" fill="#94a3b8"/>
        <rect x="38" y="10" width="6" height="20" rx="1" fill="#84cc16"/>
        <rect x="47" y="16" width="6" height="14" rx="1" fill="#22c55e"/>
        <rect x="56" y="22" width="6" height="8" rx="1" fill="#15803d"/>
    </svg>`,
    "news-volume": `<svg viewBox="0 0 64 32" aria-hidden="true">
        <polyline points="2,26 6,14 10,24 14,8 18,22 22,12 26,25 30,6 34,20 38,10 42,24 46,14 50,26 54,9 58,21 62,16"
                  fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <line x1="2" y1="29" x2="62" y2="29" stroke="currentColor" opacity="0.3"/>
    </svg>`,
    "gauge-thermometer": `<svg viewBox="0 0 64 32" aria-hidden="true">
        <rect x="28" y="2" width="8" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <rect x="30.4" y="9" width="3.2" height="12" fill="var(--fgv-blue-light, #008BC9)"/>
        <circle cx="32" cy="25" r="5.5" fill="var(--fgv-blue-light, #008BC9)"/>
        <line x1="40" y1="6" x2="44" y2="6" stroke="currentColor" opacity="0.4"/>
        <line x1="40" y1="12" x2="44" y2="12" stroke="currentColor" opacity="0.4"/>
        <line x1="40" y1="18" x2="44" y2="18" stroke="currentColor" opacity="0.4"/>
    </svg>`,
    "gauge-speedometer": `<svg viewBox="0 0 64 32" aria-hidden="true">
        <path d="M8 28 A24 24 0 0 1 20 7.2" fill="none" stroke="#dc2626" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M20 7.2 A24 24 0 0 1 44 7.2" fill="none" stroke="#94a3b8" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M44 7.2 A24 24 0 0 1 56 28" fill="none" stroke="#16a34a" stroke-width="4.5" stroke-linecap="round"/>
        <line x1="32" y1="28" x2="21" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="32" cy="28" r="2.5" fill="currentColor"/>
    </svg>`,
    "evolution": `<svg viewBox="0 0 64 32" aria-hidden="true">
        <polyline points="2,20 8,18 14,22 20,16 26,19 32,13 38,17 44,12 50,15 56,10 62,13"
                  fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="32" cy="13" r="2" fill="currentColor"/>
        <line x1="2" y1="28" x2="62" y2="28" stroke="currentColor" opacity="0.3"/>
    </svg>`,
    "newsstand": `<svg viewBox="0 0 64 32" aria-hidden="true">
        <rect x="3" y="4" width="16" height="4" rx="1" fill="#16a34a"/>
        <rect x="3" y="12" width="16" height="2" rx="1" fill="currentColor" opacity="0.45"/>
        <rect x="3" y="17" width="16" height="2" rx="1" fill="currentColor" opacity="0.45"/>
        <rect x="3" y="22" width="11" height="2" rx="1" fill="currentColor" opacity="0.45"/>
        <rect x="24" y="4" width="16" height="4" rx="1" fill="#94a3b8"/>
        <rect x="24" y="12" width="16" height="2" rx="1" fill="currentColor" opacity="0.45"/>
        <rect x="24" y="17" width="16" height="2" rx="1" fill="currentColor" opacity="0.45"/>
        <rect x="24" y="22" width="12" height="2" rx="1" fill="currentColor" opacity="0.45"/>
        <rect x="45" y="4" width="16" height="4" rx="1" fill="#dc2626"/>
        <rect x="45" y="12" width="16" height="2" rx="1" fill="currentColor" opacity="0.45"/>
        <rect x="45" y="17" width="16" height="2" rx="1" fill="currentColor" opacity="0.45"/>
        <rect x="45" y="22" width="10" height="2" rx="1" fill="currentColor" opacity="0.45"/>
    </svg>`,
};

// Same funnel-and-fields drawing used by the editor's fixed strip.
const FILTERS_STRIP_SVG = `<svg viewBox="0 0 64 12" aria-hidden="true">
    <path d="M4 2 L14 2 L10.5 7 L10.5 10 L7.5 10 L7.5 7 Z" fill="currentColor" opacity="0.8"/>
    <rect x="19" y="3" width="12" height="6" rx="2" fill="none" stroke="currentColor" opacity="0.55"/>
    <rect x="34" y="3" width="12" height="6" rx="2" fill="none" stroke="currentColor" opacity="0.55"/>
    <rect x="49" y="3" width="12" height="6" rx="2" fill="none" stroke="currentColor" opacity="0.55"/>
</svg>`;

function moduleGlyph(id) {
    const glyph = document.createElement("span");
    glyph.className = "module-glyph";
    glyph.innerHTML = MODULE_GLYPHS[id] || "";
    return glyph;
}

let token = null;
let layoutState = null;
let busy = false;
let draft = null;
let feedbackTimer = null;

function moduleLabel(id) {
    return MODULE_META[id]?.label || id;
}

function moduleMin(id) {
    return MODULE_META[id]?.min ?? { w: 1, h: 1 };
}

function modulePreset(id) {
    return MODULE_META[id]?.preset ?? { w: 8, h: 4 };
}

function clamp(value, lo, hi) {
    return Math.min(Math.max(value, lo), hi);
}

function feedback(message, isError = false) {
    clearTimeout(feedbackTimer);
    feedbackEl.textContent = message;
    feedbackEl.classList.toggle("is-error", isError);
    feedbackEl.classList.add("show");
    feedbackTimer = setTimeout(() => feedbackEl.classList.remove("show"), 5000);
}

function renderMeta() {
    if (!layoutState) return;
    const { source, writable, degraded, active, layouts } = layoutState;
    const liveLabel = active && layouts?.[active]
        ? `"${layouts[active].label || active}"`
        : "página estática";
    metaEl.textContent = `Fonte: ${SOURCE_LABELS[source] || source}` +
        (degraded ? " — indisponível" : "") +
        (writable ? "" : " — somente leitura") +
        ` · No ar: ${liveLabel}`;
}

/* ---- Auth gate ---- */

authFormEl.addEventListener("submit", async event => {
    event.preventDefault();
    const candidate = tokenInputEl.value.trim();
    if (!candidate) return;
    authErrorEl.textContent = "";
    authSubmitEl.disabled = true;
    try {
        const res = await fetch(LAYOUTS_ENDPOINT, {
            cache: "no-store",
            headers: { "Authorization": `Bearer ${candidate}` },
        });
        if (!res.ok) throw new Error(`GET → ${res.status}`);
        const payload = await res.json();
        if (!payload.authorized) {
            authErrorEl.textContent = "Token inválido.";
            tokenInputEl.select();
            return;
        }
        token = candidate;
        layoutState = payload;
        gateEl.hidden = true;
        mainEl.hidden = false;
        renderMeta();
        renderGallery();
    } catch (error) {
        authErrorEl.textContent = `Não foi possível validar o token: ${error.message}`;
    } finally {
        authSubmitEl.disabled = false;
    }
});

/* ---- Requests ---- */

async function layoutRequest(method, body, successMessage) {
    busy = true;
    renderGallery();
    try {
        const res = await fetch(LAYOUTS_ENDPOINT, {
            method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || `${method} → ${res.status}`);
        layoutState = payload;
        renderMeta();
        feedback(successMessage);
        return true;
    } catch (error) {
        feedback(error.message, true);
        return false;
    } finally {
        busy = false;
        renderGallery();
    }
}

function setActiveLayout(slug) {
    const label = layoutState.layouts[slug]?.label || slug;
    return layoutRequest("PATCH", { active: slug },
        `Layout "${label}" ativado — já vale para quem abrir o site.`);
}

function deleteLayout(slug) {
    const label = layoutState.layouts[slug]?.label || slug;
    return layoutRequest("DELETE", { slug }, `Layout "${label}" excluído.`);
}

/* ---- Gallery ---- */

function plainButton(label, onClick, className = "btn-ghost") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    btn.disabled = busy;
    btn.addEventListener("click", onClick);
    return btn;
}

// Two-step control replacing confirm(): first click arms it, second click
// within 4s runs the action.
function armedButton(label, confirmLabel, onConfirm, className = "btn-ghost") {
    const btn = plainButton(label, () => {});
    btn.className = className;
    let timer = null;
    btn.addEventListener("click", () => {
        if (btn.dataset.armed) {
            clearTimeout(timer);
            onConfirm();
        } else {
            btn.dataset.armed = "1";
            btn.textContent = confirmLabel;
            timer = setTimeout(() => {
                delete btn.dataset.armed;
                btn.textContent = label;
            }, 4000);
        }
    });
    return btn;
}

function placedCards(cards) {
    return (cards ?? []).filter(card =>
        card && [card.x, card.y, card.w, card.h].every(Number.isInteger));
}

function layoutThumb(cards) {
    const thumb = document.createElement("div");
    thumb.className = "layout-thumb";
    // Every layout starts with the mandatory filter bar.
    const filters = document.createElement("span");
    filters.className = "thumb-filters";
    filters.title = "Barra de filtros (fixa)";
    filters.innerHTML = FILTERS_STRIP_SVG;

    const grid = document.createElement("div");
    grid.className = "thumb-grid";
    for (const card of placedCards(cards)) {
        const cell = document.createElement("span");
        cell.className = "thumb-cell";
        cell.style.gridArea = `${card.y} / ${card.x} / span ${card.h} / span ${card.w}`;
        cell.append(moduleGlyph(card.id));
        if (card.w >= 8) {
            const label = document.createElement("span");
            label.className = "thumb-label";
            label.textContent = moduleLabel(card.id).replace("Indicador ", "");
            cell.append(label);
        }
        grid.append(cell);
    }
    thumb.append(filters, grid);
    return thumb;
}

function toggleFavorite(slug) {
    const layout = layoutState.layouts[slug];
    const value = !layout.favorite;
    return layoutRequest("PATCH", { favorite: { slug, value } },
        value ? `"${layout.label || slug}" favoritado.` : `"${layout.label || slug}" desfavoritado.`);
}

function galleryCard(slug, layout, { active, writable }) {
    const isLive = active === slug;

    const card = document.createElement("article");
    card.className = "layout-card" + (isLive ? " is-live" : "");

    const head = document.createElement("div");
    head.className = "layout-card-head";

    // ★ favorito: fica nas primeiras posições da galeria.
    const fav = document.createElement("button");
    fav.type = "button";
    fav.className = "layout-fav" + (layout.favorite ? " is-fav" : "");
    fav.textContent = layout.favorite ? "★" : "☆";
    fav.title = layout.favorite ? "Remover dos favoritos" : "Favoritar (aparece primeiro)";
    fav.disabled = !writable || busy;
    fav.addEventListener("click", () => toggleFavorite(slug));
    head.append(fav);

    const name = document.createElement("h3");
    name.textContent = layout.label || slug;
    head.append(name);
    if (isLive) {
        const live = document.createElement("span");
        live.className = "layout-badge is-live";
        live.textContent = "no ar";
        head.append(live);
    }

    const actions = document.createElement("div");
    actions.className = "layout-actions";
    const preview = document.createElement("a");
    preview.className = "btn-ghost";
    preview.href = `dashboard.html?layout=${encodeURIComponent(slug)}`;
    preview.target = "_blank";
    preview.rel = "noopener";
    preview.textContent = "Prévia";
    const arrow = document.createElement("span");
    arrow.className = "ext-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    preview.append(arrow);
    actions.append(preview);
    actions.append(plainButton("Editar", () => openEditor({
        slug, label: layout.label, cards: layout.cards, favorite: layout.favorite,
    })));
    actions.append(plainButton("Duplicar", () => openEditor({ cards: layout.cards })));
    if (!isLive && writable) {
        actions.append(armedButton("Ativar", "Confirmar? Muda o site no ar", () => setActiveLayout(slug), "btn-primary"));
    }
    if (writable && !isLive) {
        actions.append(armedButton("Excluir", "Confirmar exclusão?", () => deleteLayout(slug), "btn-danger"));
    }

    card.append(head, layoutThumb(layout.cards || []), actions);
    return card;
}

function renderGallery() {
    if (!layoutState) return;
    const { active, writable, layouts } = layoutState;

    const add = document.createElement("button");
    add.type = "button";
    add.className = "layout-add";
    const plus = document.createElement("span");
    plus.className = "layout-add-plus";
    plus.textContent = "+";
    const addLabel = document.createElement("span");
    addLabel.textContent = "Criar novo layout";
    add.append(plus, addLabel);
    add.addEventListener("click", () => openEditor());

    // Order: live layout first, then favorites, then the rest by creation
    // order (the library object keeps insertion order; editing an existing
    // slug does not move it, only brand-new layouts append at the end).
    const slugs = Object.keys(layouts);
    const order = [];
    if (active && layouts[active]) order.push(active);
    for (const slug of slugs) {
        if (!order.includes(slug) && layouts[slug].favorite) order.push(slug);
    }
    for (const slug of slugs) {
        if (!order.includes(slug)) order.push(slug);
    }
    galleryEl.replaceChildren(add, ...order.map(slug =>
        galleryCard(slug, layouts[slug], { active, writable })));
}

/* ---- Layout editor: free placement on the 12-column canvas ---- */

function slugify(label) {
    return label.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "").slice(0, 32) || null;
}

function openEditor({ slug = null, label = "", cards = [], favorite = false } = {}) {
    draft = {
        fixedSlug: slug,
        favorite,
        cards: placedCards(cards).map(c => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h })),
    };
    editorTitleEl.textContent = slug ? `Editar "${slug}"` : "Novo layout";
    editorLabelEl.value = label;
    trayQuery = "";
    traySearchEl.value = "";
    editorEl.hidden = false;
    renderEditor();
    editorEl.scrollIntoView({ behavior: "smooth", block: "start" });
    editorLabelEl.focus();
}

function closeEditor() {
    draft = null;
    editorEl.hidden = true;
}

function draftSlug() {
    return draft.fixedSlug || slugify(editorLabelEl.value.trim());
}

function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function collides(rect, exceptIndex = -1) {
    return draft.cards.some((card, index) => index !== exceptIndex && overlaps(rect, card));
}

function firstFit(w, h) {
    for (let y = 1; y <= MAX_ROWS - h + 1; y++) {
        for (let x = 1; x <= GRID_COLS - w + 1; x++) {
            if (!collides({ x, y, w, h })) return { x, y };
        }
    }
    return null;
}

function addAtFirstFit(id) {
    const { w, h } = modulePreset(id);
    const spot = firstFit(w, h);
    if (!spot) return feedback("Sem espaço livre para este gráfico.", true);
    draft.cards.push({ id, x: spot.x, y: spot.y, w, h });
    renderEditor();
}

function canvasRows() {
    const extent = Math.max(0, ...draft.cards.map(c => c.y + c.h - 1));
    return Math.min(MAX_ROWS, Math.max(CANVAS_MIN_ROWS, extent + CANVAS_SPARE_ROWS));
}

// Rows currently rendered on the canvas. Dragging toward the bottom edge
// grows this live (new cell rows appear under the pointer) WITHOUT rebuilding
// the canvas — a rebuild would destroy the pointer-captured element and kill
// the drag. renderEditor() shrinks it back to extent + spare after the drop.
let canvasRowCount = 0;

function growCanvasRows(target) {
    target = Math.min(MAX_ROWS, target);
    if (target <= canvasRowCount) return;
    for (let r = canvasRowCount + 1; r <= target; r++) {
        for (let c = 1; c <= GRID_COLS; c++) {
            const cell = document.createElement("div");
            cell.className = "canvas-cell";
            cell.style.gridArea = `${r} / ${c}`;
            canvasEl.append(cell);
        }
    }
    canvasRowCount = target;
}

/* Pointer-driven drag state: adding from the tray, moving a placed card or
   resizing via the edge handles. The ghost previews the landing area; red
   means the drop is invalid (over another card) and will be rejected. */
let drag = null;
let ghostEl = null;

function cellGeom() {
    const cells = canvasEl.querySelectorAll(".canvas-cell");
    if (cells.length <= GRID_COLS) return null;
    const a = cells[0].getBoundingClientRect();
    return {
        left: a.left,
        top: a.top,
        colPitch: cells[1].getBoundingClientRect().left - a.left,
        rowPitch: cells[GRID_COLS].getBoundingClientRect().top - a.top,
    };
}

function cellFromPoint(clientX, clientY) {
    const geom = cellGeom();
    if (!geom) return null;
    const rect = canvasEl.getBoundingClientRect();
    return {
        inside: clientX >= rect.left && clientX <= rect.right &&
                clientY >= rect.top && clientY <= rect.bottom,
        col: clamp(Math.floor((clientX - geom.left) / geom.colPitch) + 1, 1, GRID_COLS),
        row: clamp(Math.floor((clientY - geom.top) / geom.rowPitch) + 1, 1, canvasRowCount || canvasRows()),
    };
}

function showGhost(gx, gy, gw, gh, valid) {
    if (!ghostEl) {
        ghostEl = document.createElement("div");
        ghostEl.className = "editor-ghost";
        canvasEl.append(ghostEl);
    }
    ghostEl.style.gridArea = `${gy} / ${gx} / span ${gh} / span ${gw}`;
    ghostEl.textContent = `${gw}×${gh}`;
    ghostEl.classList.toggle("is-invalid", !valid);
}

function clearGhost() {
    ghostEl?.remove();
    ghostEl = null;
}

function beginDrag(event, spec) {
    if (drag) return;
    drag = {
        ...spec,
        el: event.currentTarget,
        sx: event.clientX,
        sy: event.clientY,
        active: spec.active ?? false,
        gx: null, gy: null, gw: spec.w, gh: spec.h,
        valid: false,
    };
    drag.el.setPointerCapture(event.pointerId);
    drag.el.addEventListener("pointermove", onDragMove);
    drag.el.addEventListener("pointerup", onDragEnd, { once: true });
    drag.el.addEventListener("pointercancel", onDragCancel, { once: true });
    event.preventDefault();
}

function onDragMove(event) {
    if (!drag) return;
    if (!drag.active) {
        if (Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) < DRAG_THRESHOLD_PX) return;
        drag.active = true;
        document.body.classList.add("is-dragging");
        if (drag.kind === "move") drag.cardEl?.classList.add("is-moving");
    }
    const pt = cellFromPoint(event.clientX, event.clientY);
    if (!pt) return;
    if (!pt.inside && drag.kind !== "resize") {
        drag.gx = null;
        drag.valid = false;
        clearGhost();
        return;
    }
    // Nearing the bottom edge? Grow the canvas under the pointer, so a tall
    // card can be dropped past the current last row without dropping first.
    if (pt.row + (drag.gh || drag.h || 1) - 1 >= canvasRowCount - 1) {
        growCanvasRows(canvasRowCount + 2);
    }
    const rows = canvasRowCount || canvasRows();
    if (drag.kind === "add" || drag.kind === "move") {
        const grabDX = drag.grabDX ?? Math.floor(drag.w / 2);
        const grabDY = drag.grabDY ?? 0;
        drag.gx = clamp(pt.col - grabDX, 1, GRID_COLS - drag.w + 1);
        drag.gy = clamp(pt.row - grabDY, 1, Math.max(1, rows - drag.h + 1));
        drag.gw = drag.w;
        drag.gh = drag.h;
    } else { // resize
        const card = draft.cards[drag.index];
        const min = moduleMin(card.id);
        let gx = card.x, gw = card.w;
        if (drag.dir.includes("e")) {
            gw = clamp(pt.col - card.x + 1, min.w, GRID_COLS - card.x + 1);
        } else if (drag.dir.includes("w")) {
            // Left edge moves; the right edge stays anchored.
            const right = card.x + card.w;
            gx = clamp(pt.col, 1, right - min.w);
            gw = right - gx;
        }
        drag.gx = gx;
        drag.gy = card.y;
        drag.gw = gw;
        drag.gh = drag.dir.includes("s")
            ? clamp(pt.row - card.y + 1, min.h, MAX_CARD_H)
            : card.h;
    }
    drag.valid = !collides(
        { x: drag.gx, y: drag.gy, w: drag.gw, h: drag.gh },
        drag.kind === "add" ? -1 : drag.index);
    showGhost(drag.gx, drag.gy, drag.gw, drag.gh, drag.valid);
}

function endDragCleanup() {
    document.body.classList.remove("is-dragging");
    drag?.el?.removeEventListener("pointermove", onDragMove);
    drag?.cardEl?.classList.remove("is-moving");
    clearGhost();
}

function onDragEnd() {
    const d = drag;
    endDragCleanup();
    drag = null;
    if (!d) return;
    if (!d.active) {
        // A plain click (no real drag) on a tray item still adds the module.
        if (d.kind === "add") addAtFirstFit(d.id);
        return;
    }
    if (d.gx === null || !d.valid) return;
    if (d.kind === "add") {
        draft.cards.push({ id: d.id, x: d.gx, y: d.gy, w: d.gw, h: d.gh });
    } else {
        const card = draft.cards[d.index];
        card.x = d.gx;
        card.y = d.gy;
        card.w = d.gw;
        card.h = d.gh;
    }
    renderEditor();
}

function onDragCancel() {
    endDragCleanup();
    drag = null;
}

function canvasCard(card, index) {
    const el = document.createElement("div");
    el.className = "canvas-card";
    el.style.gridArea = `${card.y} / ${card.x} / span ${card.h} / span ${card.w}`;
    const min = moduleMin(card.id);
    el.title = `${moduleLabel(card.id)} — arraste para mover; mínimo ${min.w}×${min.h}`;

    const label = document.createElement("span");
    label.className = "canvas-card-label";
    label.textContent = moduleLabel(card.id);

    const size = document.createElement("span");
    size.className = "canvas-size";
    size.textContent = `${card.w}×${card.h}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "canvas-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remover ${moduleLabel(card.id)}`);
    remove.addEventListener("click", () => {
        draft.cards.splice(index, 1);
        renderEditor();
    });

    el.append(moduleGlyph(card.id), label, size, remove);
    for (const dir of ["w", "e", "s", "se"]) {
        const handle = document.createElement("span");
        handle.className = `rz rz-${dir}`;
        handle.addEventListener("pointerdown", event => {
            event.stopPropagation();
            beginDrag(event, { kind: "resize", index, dir, active: true, w: card.w, h: card.h });
        });
        el.append(handle);
    }

    el.addEventListener("pointerdown", event => {
        if (event.target.closest(".canvas-remove, .rz")) return;
        const pt = cellFromPoint(event.clientX, event.clientY);
        beginDrag(event, {
            kind: "move",
            index,
            w: card.w,
            h: card.h,
            cardEl: el,
            grabDX: pt ? clamp(pt.col - card.x, 0, card.w - 1) : 0,
            grabDY: pt ? clamp(pt.row - card.y, 0, card.h - 1) : 0,
        });
    });
    return el;
}

function renderCanvas() {
    const rows = canvasRows();
    canvasRowCount = rows;
    const cells = [];
    for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= GRID_COLS; c++) {
            const cell = document.createElement("div");
            cell.className = "canvas-cell";
            cell.style.gridArea = `${r} / ${c}`;
            cells.push(cell);
        }
    }
    ghostEl = null; // replaced along with everything else
    canvasEl.replaceChildren(...cells, ...draft.cards.map(canvasCard));
}

const traySearchEl = document.getElementById("tray-search");
let trayQuery = "";
traySearchEl.addEventListener("input", () => {
    trayQuery = traySearchEl.value;
    renderEditor();
});

function normalizeSearch(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function renderEditor() {
    if (!draft) return;
    editorSlugEl.textContent = draftSlug() || "—";

    const used = new Set(draft.cards.map(c => c.id));
    const query = normalizeSearch(trayQuery.trim());
    const available = Object.keys(MODULE_META)
        .filter(id => !used.has(id))
        .filter(id => !query || normalizeSearch(moduleLabel(id)).includes(query));
    editorTrayEl.classList.toggle("is-filtered-empty", available.length === 0);
    editorTrayEl.replaceChildren(...available.map(id => {
        const li = document.createElement("li");
        const preset = modulePreset(id);
        const label = document.createElement("span");
        label.textContent = moduleLabel(id);
        li.append(moduleGlyph(id), label);
        li.title = `Clique ou arraste para a página (entra com ${preset.w}×${preset.h})`;
        li.tabIndex = 0;
        li.addEventListener("pointerdown", event =>
            beginDrag(event, { kind: "add", id, w: preset.w, h: preset.h }));
        li.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                addAtFirstFit(id);
            }
        });
        return li;
    }));

    renderCanvas();
}

editorLabelEl.addEventListener("input", () => {
    if (draft) editorSlugEl.textContent = draftSlug() || "—";
});

document.getElementById("editor-cancel").addEventListener("click", closeEditor);
document.getElementById("editor-save").addEventListener("click", async () => {
    if (!draft) return;
    const label = editorLabelEl.value.trim();
    if (!label) return feedback("Dê um nome ao layout.", true);
    const slug = draftSlug();
    if (!slug) return feedback("O nome não gera um identificador válido.", true);
    if (!draft.cards.length) return feedback("Adicione ao menos um gráfico à página.", true);
    if (!draft.fixedSlug && layoutState?.layouts[slug]) {
        return feedback(`Já existe um layout "${slug}"; escolha outro nome.`, true);
    }
    const ok = await layoutRequest("PUT",
        { slug, label, cards: draft.cards, grid: GRID_COLS, favorite: draft.favorite },
        `Layout "${label}" salvo.`);
    if (ok) closeEditor();
});

// Preview the unsaved draft: the cards travel to the dashboard inside the URL
// (?draft=base64url JSON), so nothing touches the library until "Salvar".
document.getElementById("editor-preview").addEventListener("click", () => {
    if (!draft?.cards.length) {
        return feedback("Adicione ao menos um gráfico para ver a prévia.", true);
    }
    const json = JSON.stringify(draft.cards);
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
        .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    window.open(`dashboard.html?draft=${b64}`, "_blank", "noopener");
});

/* ---- Boot ---- */

tokenInputEl.focus();
