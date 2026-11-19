// Admin panel, one tab per public screen. Painel: gallery + free-placement
// editor for the page layouts (/api/layouts). Repositório: the document
// catalog (/api/repository). Início and Detalhes are placeholders.
// Layout cards live on a 12-column grid as {id, x, y, w, h}; the
// editor lets them be dropped anywhere, moved and stretched (drop on another
// card is invalid), with per-module minimum sizes mirrored from the API.
// Nothing renders before the admin token is validated against the server; the
// token lives in memory only — closing the tab forgets it.

const LAYOUTS_ENDPOINT = "/api/layouts";

const metaEl = document.getElementById("layouts-meta");
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

// Only abnormal states are worth a line under the gallery (the header no
// longer carries source/live info).
function renderMeta() {
    if (!layoutState) return;
    const { source, writable, degraded } = layoutState;
    metaEl.textContent = degraded
        ? "Fonte indisponível: exibindo os layouts padrão do código (somente leitura)."
        : writable ? "" : `Fonte ${SOURCE_LABELS[source] || source}: somente leitura.`;
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
        restorePanel();
        loadCatalog();
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

/* ---- Screen tabs: one per public page ---- */

const NAV_STORAGE_KEY = "iipex_admin_panel";
const navTabs = [...document.querySelectorAll(".admin-nav-tab")];
const panels = [...document.querySelectorAll(".admin-panel")];

function showPanel(id) {
    if (!panels.some(panel => panel.id === `panel-${id}`)) id = "dashboard";
    navTabs.forEach(tab => tab.classList.toggle("is-active", tab.dataset.panel === id));
    panels.forEach(panel => { panel.hidden = panel.id !== `panel-${id}`; });
    try { sessionStorage.setItem(NAV_STORAGE_KEY, id); } catch { /* storage blocked */ }
}

navTabs.forEach(tab => tab.addEventListener("click", () => showPanel(tab.dataset.panel)));

// ?tab=repository deep-links a screen; otherwise the last one opened wins.
function restorePanel() {
    let id = new URLSearchParams(location.search).get("tab");
    if (!id) {
        try { id = sessionStorage.getItem(NAV_STORAGE_KEY); } catch { id = null; }
    }
    showPanel(id || "dashboard");
}

/* ---- Repository: document catalog (/api/repository) ---- */

const REPOSITORY_ENDPOINT = "/api/repository";
const GITHUB_REPO = "TFrankeM/dashboard";
const GITHUB_FOLDER = "repository";
const GITHUB_UI_LIMIT_MB = 25;

const CATEGORY_LABELS = {
    data: "Bases de dados",
    benchmarks: "Resultados & benchmarks",
    scripts: "Scripts Python",
    prompts: "Prompts de LLM",
    docs: "Documentação",
};

// Mirror of api/_lib/repository.js ICONS (the API is the authority).
const DOC_ICONS = [
    "database", "table", "file-spreadsheet", "file-text", "file-json", "file-archive",
    "bar-chart-3", "pie-chart", "line-chart", "code", "terminal", "braces",
    "list-checks", "message-square-text", "book-open", "file-check", "quote",
    "shield", "scroll-text", "globe", "link", "image", "package", "notebook-pen",
];

const PUBLISH_POLL_MS = 5000;
const PUBLISH_POLL_MAX = 24;   // 2 minutes

const docListEl = document.getElementById("doc-list");
const docAddEl = document.getElementById("doc-add");
const docEditorEl = document.getElementById("doc-editor");
const docEditorTitleEl = document.getElementById("doc-editor-title");
const docOriginFieldEl = document.getElementById("doc-origin-field");
const originButtons = [...document.querySelectorAll("#doc-origin .seg-btn")];
const sizeGuideEl = document.getElementById("size-guide");
const docUploadFieldEl = document.getElementById("doc-upload-field");
const docUploadDropEl = document.getElementById("doc-upload-drop");
const docUploadTextEl = document.getElementById("doc-upload-text");
const docUploadEl = document.getElementById("doc-upload");
const docUploadHintEl = document.getElementById("doc-upload-hint");
const docGithubFieldEl = document.getElementById("doc-github-field");
const docGithubListEl = document.getElementById("doc-github-list");
const docGithubHintEl = document.getElementById("doc-github-hint");
const docNameEl = document.getElementById("doc-name");
const docExtNameFieldEl = document.getElementById("doc-ext-name-field");
const docExtNameEl = document.getElementById("doc-ext-name");
const docUrlFieldEl = document.getElementById("doc-url-field");
const docUrlEl = document.getElementById("doc-url");
const docFixedFieldEl = document.getElementById("doc-fixed-field");
const docFixedNameEl = document.getElementById("doc-fixed-name");
const docCategoryEl = document.getElementById("doc-category");
const docIconsEl = document.getElementById("doc-icons");
const docsMetaEl = document.getElementById("docs-meta");

document.getElementById("doc-github-link").href =
    `https://github.com/${GITHUB_REPO}/tree/main/${GITHUB_FOLDER}`;

let catalogState = null;      // { source, writable, docs, degraded? }
let docDraft = null;          // editor state: { file|null, source, pick, icon, category, url? }
let docBusy = false;
let githubFiles = null;       // [{ name, size }] once listed; [] when it failed
let githubListingFailed = false;
let armedRemoval = null;      // file whose ✕ was clicked (awaiting confirmation)

// Decimal units, same formatting as the public page; "—" when unknown.
function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return "—";
    const n = Number(bytes) || 0;
    if (n < 1000) return `${n} B`;
    if (n < 1e6) return `${(n / 1e3).toFixed(1)} KB`;
    if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
    return `${(n / 1e9).toFixed(1)} GB`;
}

function refreshIcons() {
    if (window.lucide) lucide.createIcons();
}

function lucideIcon(name) {
    const i = document.createElement("i");
    i.setAttribute("data-lucide", name);
    return i;
}

function renderDocsMeta() {
    if (!catalogState) return;
    const { source, writable, degraded } = catalogState;
    docsMetaEl.textContent = degraded
        ? "Fonte indisponível: exibindo a lista padrão do código (somente leitura)."
        : writable ? "" : `Fonte ${SOURCE_LABELS[source] || source}: somente leitura.`;
}

async function loadCatalog() {
    try {
        const res = await fetch(REPOSITORY_ENDPOINT, {
            cache: "no-store",
            headers: { "Authorization": `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`GET → ${res.status}`);
        catalogState = await res.json();
    } catch (error) {
        catalogState = { source: "defaults", writable: false, docs: [], degraded: true };
        feedback(`Não foi possível carregar o catálogo: ${error.message}`, true);
    }
    renderDocsMeta();
    renderDocList();
}

async function catalogRequest(method, body, successMessage) {
    docBusy = true;
    renderDocList();
    try {
        const res = await fetch(REPOSITORY_ENDPOINT, {
            method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || `${method} → ${res.status}`);
        catalogState = payload;
        renderDocsMeta();
        feedback(successMessage);
        return true;
    } catch (error) {
        feedback(error.message, true);
        return false;
    } finally {
        docBusy = false;
        renderDocList();
    }
}

function docButton(label, onClick, className = "btn-ghost") {
    const btn = plainButton(label, onClick, className);
    btn.disabled = docBusy;
    return btn;
}

function docRow(doc, writable) {
    const row = document.createElement("div");
    row.className = `doc-row cat-${doc.category}` + (armedRemoval === doc.file ? " is-armed" : "");

    const icon = document.createElement("span");
    icon.className = "doc-icon";
    icon.append(lucideIcon(doc.icon));

    const name = document.createElement("span");
    name.className = "doc-name";
    name.textContent = doc.file;

    const badge = document.createElement("span");
    badge.className = "doc-badge";
    badge.textContent = CATEGORY_LABELS[doc.category] || doc.category;

    row.append(icon, name, badge);
    if (doc.bytes !== null && doc.bytes !== undefined) {
        const size = document.createElement("span");
        size.className = "doc-size";
        size.textContent = formatBytes(doc.bytes);
        row.append(size);
    }

    if (doc.url) {
        const ext = document.createElement("a");
        ext.className = "doc-ext";
        ext.href = doc.url;
        ext.target = "_blank";
        ext.rel = "noopener";
        ext.title = doc.url;
        ext.textContent = "link externo ↗";
        row.append(ext);
    }

    const actions = document.createElement("div");
    actions.className = "doc-actions";
    if (armedRemoval === doc.file) {
        // The ✕ was clicked: swap the row's controls for an explicit
        // confirmation. A file kept in repository/ is deleted along with its
        // entry when this environment can write to GitHub.
        const deleteFile = !doc.url && Boolean(catalogState.uploads?.enabled);
        actions.append(docButton(deleteFile ? "Apagar arquivo e remover" : "Confirmar remoção",
            () => removeDoc(doc.file, deleteFile), "btn-danger"));
        actions.append(docButton("Cancelar", () => { armedRemoval = null; renderDocList(); }));
    } else {
        actions.append(docButton("Editar", () => openDocEditor(doc)));
        if (writable) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "doc-remove";
            remove.textContent = "✕";
            remove.title = `Remover "${doc.file}" da lista`;
            remove.setAttribute("aria-label", remove.title);
            remove.disabled = docBusy;
            remove.addEventListener("click", () => { armedRemoval = doc.file; renderDocList(); });
            actions.append(remove);
        }
    }
    row.append(actions);
    return row;
}

function renderDocList() {
    if (!catalogState) return;
    const { docs, writable } = catalogState;
    docListEl.replaceChildren(...docs.map(doc => docRow(doc, writable)));
    docAddEl.hidden = !writable;
    docAddEl.disabled = docBusy;
    refreshIcons();
}

async function removeDoc(file, deleteFile) {
    armedRemoval = null;
    const ok = await catalogRequest("DELETE", { file, deleteFile }, deleteFile
        ? `"${file}" removido da lista e apagado do GitHub; some do site em cerca de 20 s.`
        : `"${file}" removido da lista. Se o arquivo existir na pasta do GitHub, ele continua lá.`);
    if (ok && deleteFile && catalogState.fileRemoved === false) {
        feedback(`"${file}" removido da lista; o arquivo não estava na pasta do GitHub.`);
    }
}

// After an upload commits to GitHub the site redeploys; poll the public
// path until it answers so the admin knows when the download is live.
async function waitForPublish(file) {
    const path = `repository/${encodeURIComponent(file)}`;
    for (let attempt = 1; attempt <= PUBLISH_POLL_MAX; attempt++) {
        feedback(`"${file}" enviado ao GitHub. Publicando… (${attempt * PUBLISH_POLL_MS / 1000} s)`);
        await new Promise(resolve => setTimeout(resolve, PUBLISH_POLL_MS));
        try {
            const res = await fetch(path, { method: "HEAD", cache: "no-store" });
            if (res.ok) return feedback(`"${file}" publicado — já pode ser baixado na página Repositório.`);
        } catch { /* keep polling */ }
    }
    feedback(`"${file}" foi enviado, mas ainda não aparece no site. Verifique o deploy na Vercel.`, true);
}

/* ---- Repository: document editor ---- */

const GITHUB_UI_LIMIT_BYTES = GITHUB_UI_LIMIT_MB * 1e6;
const GIT_FILE_LIMIT_BYTES = 100e6;

function uploadMax() { return catalogState?.uploads?.maxBytes ?? 0; }
function uploadMaxLabel() { return `${Math.round(uploadMax() / 1e6)} MB`; }
function uploadsEnabled() { return Boolean(catalogState?.uploads?.enabled); }

// Public listing of the GitHub folder (no token: the repo is public). Gives
// the names and sizes of the files Marlos already uploaded.
async function fetchGithubFiles() {
    if (githubFiles) return githubFiles;
    try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FOLDER}`, {
            headers: { "Accept": "application/vnd.github+json" },
        });
        if (!res.ok) throw new Error(`GitHub → ${res.status}`);
        const items = await res.json();
        githubFiles = items.filter(item => item.type === "file")
            .map(item => ({ name: item.name, size: item.size }));
        githubListingFailed = false;
    } catch (error) {
        console.warn("GitHub listing:", error);
        githubFiles = [];
        githubListingFailed = true;
    }
    return githubFiles;
}

function segButton(label, active, onClick, className = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `seg-btn ${className}` + (active ? " is-active" : "");
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(active));
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
}

function setOrigin(source) {
    docDraft.source = source;
    originButtons.forEach(btn => {
        const on = btn.dataset.source === source;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-checked", String(on));
    });
    syncSourceFields();
}

// Shows the fields of the chosen origin (or the fixed-name block when
// editing) and keeps the size ladder in step.
function syncSourceFields() {
    const existing = Boolean(docDraft?.file);
    const source = existing ? null : docDraft.source;
    docOriginFieldEl.hidden = existing;
    docFixedFieldEl.hidden = !existing;
    docUploadFieldEl.hidden = source !== "upload";
    docGithubFieldEl.hidden = source !== "github";
    docExtNameFieldEl.hidden = source !== "external";
    docUrlFieldEl.hidden = !(source === "external" || (existing && docDraft.url));
    if (existing) docFixedNameEl.textContent = docDraft.file;
    syncUploadHint();
    highlightTier();
}

function tierForBytes(bytes) {
    if (bytes <= uploadMax()) return "upload";
    if (bytes <= GITHUB_UI_LIMIT_BYTES) return "github";
    if (bytes <= GIT_FILE_LIMIT_BYTES) return "terminal";
    return "external";
}

// The ladder highlights the chosen origin's tier; once a file is picked for
// upload, its real size decides (so an oversized pick points at the way out).
function highlightTier() {
    const editingNew = Boolean(docDraft && !docDraft.file);
    sizeGuideEl.hidden = !editingNew;
    let tier = null;
    if (editingNew) {
        const chosen = docDraft.source === "upload" ? docUploadEl.files?.[0] : null;
        tier = chosen ? tierForBytes(chosen.size) : docDraft.source;
    }
    sizeGuideEl.querySelectorAll("li").forEach(li =>
        li.classList.toggle("is-active", li.dataset.tier === tier));
}

function syncUploadHint() {
    const chosen = docUploadEl.files?.[0];
    const max = uploadMax();
    docUploadDropEl.classList.remove("has-file", "is-too-big");
    if (!chosen) {
        docUploadTextEl.textContent = `Clique para escolher um arquivo (até ${uploadMaxLabel()})`;
        docUploadHintEl.textContent = "";
        return;
    }
    const tooBig = chosen.size > max;
    docUploadTextEl.textContent = `${chosen.name} · ${formatBytes(chosen.size)}`;
    docUploadDropEl.classList.toggle("has-file", !tooBig);
    docUploadDropEl.classList.toggle("is-too-big", tooBig);
    docUploadHintEl.textContent = tooBig
        ? `Acima de ${uploadMaxLabel()}: siga o caminho destacado no guia.`
        : `Será publicado como repository/${chosen.name}.`;
}

function renderGithubList() {
    const cataloged = new Set(catalogState.docs.map(doc => doc.file));
    const free = (githubFiles || []).filter(file => !cataloged.has(file.name));
    docGithubListEl.replaceChildren(...free.map(file => {
        const selected = docDraft.pick === file.name;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pick-item" + (selected ? " is-selected" : "");
        btn.setAttribute("role", "radio");
        btn.setAttribute("aria-checked", String(selected));
        const name = document.createElement("span");
        name.className = "pick-name";
        name.textContent = file.name;
        const size = document.createElement("span");
        size.className = "pick-size";
        size.textContent = formatBytes(file.size);
        btn.append(name, size);
        btn.addEventListener("click", () => {
            docDraft.pick = selected ? null : file.name;
            if (docDraft.pick) docNameEl.value = "";
            renderGithubList();
        });
        return btn;
    }));
    docGithubHintEl.textContent = githubListingFailed
        ? "Não foi possível consultar a pasta no GitHub agora. Digite o nome do arquivo abaixo."
        : free.length ? "" : "Todos os arquivos da pasta já estão na lista. Para um arquivo recém-enviado, digite o nome abaixo.";
}

function renderCategorySeg() {
    docCategoryEl.replaceChildren(...Object.entries(CATEGORY_LABELS).map(([value, label]) =>
        segButton(label, docDraft.category === value, () => {
            docDraft.category = value;
            renderCategorySeg();
            renderIconPicker();
        }, `cat-${value}`)));
}

function renderIconPicker() {
    docIconsEl.className = `doc-icons cat-${docDraft.category}`;
    docIconsEl.replaceChildren(...DOC_ICONS.map(name => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "doc-icon" + (name === docDraft.icon ? " is-selected" : "");
        btn.title = name;
        btn.setAttribute("role", "radio");
        btn.setAttribute("aria-checked", String(name === docDraft.icon));
        btn.append(lucideIcon(name));
        btn.addEventListener("click", () => { docDraft.icon = name; renderIconPicker(); });
        return btn;
    }));
    refreshIcons();
}

async function openDocEditor(existing = null) {
    docDraft = existing
        ? { ...existing }
        : { file: null, source: uploadsEnabled() ? "upload" : "github", pick: null, icon: "file-text", category: "docs" };
    armedRemoval = null;
    renderDocList();

    docEditorTitleEl.textContent = existing ? "Editar documento" : "Novo documento";
    docNameEl.value = "";
    docExtNameEl.value = "";
    docUrlEl.value = existing?.url || "";
    docUploadEl.value = "";
    originButtons.forEach(btn => { btn.hidden = btn.dataset.source === "upload" && !uploadsEnabled(); });
    // The ladder's first two tiers quote the upload ceiling.
    document.getElementById("size-guide-upload-max").textContent = `até ${uploadMaxLabel()}`;
    document.getElementById("size-guide-upload-max-2").textContent = String(Math.round(uploadMax() / 1e6));
    docEditorEl.hidden = false;
    docEditorEl.scrollIntoView({ behavior: "smooth", block: "start" });

    renderCategorySeg();
    renderIconPicker();
    if (existing) {
        syncSourceFields();
        return;
    }
    setOrigin(docDraft.source);
    docGithubHintEl.textContent = "Consultando a pasta no GitHub…";
    await fetchGithubFiles();
    if (!docDraft || docDraft.file) return;   // editor closed or switched meanwhile
    renderGithubList();
}

function closeDocEditor() {
    docDraft = null;
    delete docEditorEl.dataset.confirmReplace;
    docEditorEl.hidden = true;
}

originButtons.forEach(btn => btn.addEventListener("click", () => docDraft && setOrigin(btn.dataset.source)));
docUploadEl.addEventListener("change", () => { syncUploadHint(); highlightTier(); });
docNameEl.addEventListener("input", () => {
    if (docDraft && docNameEl.value && docDraft.pick) {
        docDraft.pick = null;
        renderGithubList();
    }
});
docAddEl.addEventListener("click", () => openDocEditor());
document.getElementById("doc-cancel").addEventListener("click", closeDocEditor);

docEditorEl.addEventListener("submit", async event => {
    event.preventDefault();
    if (!docDraft || docBusy) return;
    const existing = Boolean(docDraft.file);

    let file;
    let url;
    let upload = null;
    if (existing) {
        file = docDraft.file;
        if (docDraft.url) url = docUrlEl.value.trim();
    } else if (docDraft.source === "upload") {
        upload = docUploadEl.files?.[0] || null;
        if (!upload) return feedback("Escolha um arquivo do computador.", true);
        if (upload.size > uploadMax()) {
            return feedback(`"${upload.name}" tem ${formatBytes(upload.size)}; por aqui vão até ${uploadMaxLabel()}.`, true);
        }
        file = upload.name;
    } else if (docDraft.source === "github") {
        file = docDraft.pick || docNameEl.value.trim();
        if (!file) return feedback("Escolha um arquivo da lista ou digite o nome.", true);
    } else {
        file = docExtNameEl.value.trim();
        url = docUrlEl.value.trim();
        if (!file) return feedback("Dê um nome ao documento.", true);
    }
    if (!existing && !upload && catalogState.docs.some(doc => doc.file === file)) {
        return feedback(`"${file}" já está na lista.`, true);
    }
    if (url !== undefined && !url) return feedback("Informe a URL do arquivo.", true);

    const doc = { file, category: docDraft.category, icon: docDraft.icon };
    if (url) doc.url = url;

    if (upload) {
        const replacing = catalogState.docs.some(d => d.file === file);
        if (replacing && !docEditorEl.dataset.confirmReplace) {
            docEditorEl.dataset.confirmReplace = "1";
            return feedback(`"${file}" já existe: clique em Salvar de novo para substituí-lo.`, true);
        }
        delete docEditorEl.dataset.confirmReplace;
        const content = await fileToBase64(upload);
        const ok = await catalogRequest("POST", { doc, content }, `"${file}" enviado.`);
        if (!ok) return;
        closeDocEditor();
        if (catalogState.uploads?.source === "github") {
            if (catalogState.fileAction === "replaced") {
                feedback(`"${file}" substituído no GitHub; a nova versão fica disponível em cerca de 20 s.`);
            } else {
                waitForPublish(file);
            }
        } else {
            feedback(`"${file}" salvo em repository/ — já aparece na página Repositório.`);
        }
        return;
    }

    const ok = await catalogRequest("PUT", { doc }, existing
        ? `"${file}" atualizado.`
        : `"${file}" adicionado — já aparece na página Repositório.`);
    if (ok) closeDocEditor();
});

function fileToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/* ---- Boot ---- */

tokenInputEl.focus();
