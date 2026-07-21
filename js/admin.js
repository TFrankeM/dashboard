// Admin panel: gallery + drag-and-drop editor for the page layouts
// (/api/layouts). Nothing renders before the admin token is validated against
// the server; the token lives in memory only — closing the tab forgets it.

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
const editorGridEl = document.getElementById("editor-grid");

const SOURCE_LABELS = {
    "edge-config": "Edge Config (produção)",
    "dev-file": "arquivo local (desenvolvimento)",
    "defaults": "padrões do código (somente leitura)",
};

const MODULE_LABELS = {
    "grades-histogram": "Distribuição de notas",
    "news-volume": "Quantidade de notícias",
    "gauge-thermometer": "Indicador (termômetro)",
    "gauge-speedometer": "Indicador (acelerador)",
    "evolution": "Evolução temporal",
    "newsstand": "Notícias do ponto",
    "blank": "Caixa em branco",
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

MODULE_GLYPHS["blank"] = `<svg viewBox="0 0 64 32" aria-hidden="true">
    <rect x="2" y="2" width="60" height="28" rx="4" fill="none" stroke="currentColor"
          stroke-width="1.4" stroke-dasharray="5 4" opacity="0.55"/>
</svg>`;

function moduleGlyph(id) {
    const glyph = document.createElement("span");
    glyph.className = "module-glyph";
    glyph.innerHTML = MODULE_GLYPHS[id] || "";
    return glyph;
}

const SIZES = ["1x1", "2x1", "3x1"];
const BUILTIN_ORDER = ["padrao", "compacto"];

let token = null;
let layoutState = null;
let busy = false;
let draft = null;
let feedbackTimer = null;

function moduleLabel(id) {
    return MODULE_LABELS[id] || id;
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
    const { source, writable, degraded } = layoutState;
    metaEl.textContent = `Fonte: ${SOURCE_LABELS[source] || source}` +
        (degraded ? " — indisponível" : "") +
        (writable ? "" : " — somente leitura");
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

function layoutThumb(cards) {
    const thumb = document.createElement("div");
    thumb.className = "layout-thumb";
    // Every layout starts with the mandatory filter bar.
    const filters = document.createElement("span");
    filters.className = "thumb-filters size-3x1";
    filters.title = "Barra de filtros (fixa)";
    filters.innerHTML = FILTERS_STRIP_SVG;
    thumb.append(filters);
    for (const card of cards) {
        const cell = document.createElement("span");
        cell.className = `size-${card.size}`;
        if (card.id === "blank") {
            cell.classList.add("is-blank");
            thumb.append(cell);
            continue;
        }
        const label = document.createElement("span");
        label.className = "thumb-label";
        label.textContent = moduleLabel(card.id).replace("Indicador ", "");
        cell.append(moduleGlyph(card.id), label);
        thumb.append(cell);
    }
    return thumb;
}

function galleryCard(slug, layout, { active, writable }) {
    // With nothing active the page renders exactly the "padrao" layout.
    const isLive = active === slug || (active === null && slug === "padrao");

    const card = document.createElement("article");
    card.className = "layout-card" + (isLive ? " is-live" : "");

    const head = document.createElement("div");
    head.className = "layout-card-head";
    const name = document.createElement("h3");
    name.textContent = layout.label || slug;
    head.append(name);
    if (isLive) {
        const live = document.createElement("span");
        live.className = "layout-badge is-live";
        live.textContent = "no ar";
        head.append(live);
    }
    if (layout.builtin) {
        const builtin = document.createElement("span");
        builtin.className = "layout-badge";
        builtin.textContent = "embutido";
        head.append(builtin);
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
    if (!layout.builtin) {
        actions.append(plainButton("Editar", () => openEditor({ slug, label: layout.label, cards: layout.cards })));
    }
    actions.append(plainButton("Duplicar", () => openEditor({ cards: layout.cards })));
    if (!isLive && writable) {
        actions.append(armedButton("Ativar", "Confirmar? Muda o site no ar", () => setActiveLayout(slug), "btn-primary"));
    }
    if (!layout.builtin && writable && !isLive) {
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

    // Order: live layout first, then the builtins, then customs by creation
    // order (the library object keeps insertion order; editing an existing
    // slug does not move it, only brand-new layouts append at the end).
    const liveSlug = layouts[active] ? active : "padrao";
    const order = [liveSlug];
    for (const slug of BUILTIN_ORDER) {
        if (slug !== liveSlug && layouts[slug]) order.push(slug);
    }
    for (const slug of Object.keys(layouts)) {
        if (slug !== liveSlug && !BUILTIN_ORDER.includes(slug)) order.push(slug);
    }
    const entries = order.map(slug => [slug, layouts[slug]]);
    galleryEl.replaceChildren(add, ...entries.map(([slug, layout]) =>
        galleryCard(slug, layout, { active, writable })));
}

/* ---- Layout editor (drag-and-drop + click fallbacks) ---- */

function slugify(label) {
    return label.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "").slice(0, 32) || null;
}

function openEditor({ slug = null, label = "", cards = [] } = {}) {
    draft = { fixedSlug: slug, cards: cards.map(c => ({ id: c.id, size: c.size })) };
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

function addToDraft(id) {
    draft.cards.push({ id, size: "1x1" });
    renderEditor();
}

function moveInDraft(from, to) {
    const [card] = draft.cards.splice(from, 1);
    draft.cards.splice(to, 0, card);
    renderEditor();
}

function handleEditorDrop(data, targetIndex) {
    if (data.startsWith("add:")) {
        addToDraft(data.slice(4));
    } else if (data.startsWith("move:")) {
        const from = Number(data.slice(5));
        if (!Number.isInteger(from) || from === targetIndex) return;
        moveInDraft(from, from < targetIndex ? targetIndex - 1 : targetIndex);
    }
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
    const available = Object.keys(MODULE_LABELS)
        .filter(id => id === "blank" || !used.has(id))
        .filter(id => !query || normalizeSearch(moduleLabel(id)).includes(query));
    editorTrayEl.classList.toggle("is-filtered-empty", available.length === 0);
    editorTrayEl.replaceChildren(...available.map(id => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = moduleLabel(id);
        li.append(moduleGlyph(id), label);
        li.draggable = true;
        li.title = "Clique ou arraste para a página";
        li.addEventListener("click", () => addToDraft(id));
        li.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", `add:${id}`));
        return li;
    }));

    editorGridEl.replaceChildren(...draft.cards.map((card, index) => {
        const li = document.createElement("li");
        li.className = `size-${card.size}` + (card.id === "blank" ? " is-blank" : "");
        li.draggable = true;

        const label = document.createElement("span");
        label.className = "editor-card-label";
        label.textContent = moduleLabel(card.id);

        const size = document.createElement("button");
        size.type = "button";
        size.className = "editor-size";
        size.textContent = card.size.replace("x1", "x");
        size.title = "Alternar largura (terços da página)";
        size.addEventListener("click", () => {
            card.size = SIZES[(SIZES.indexOf(card.size) + 1) % SIZES.length];
            renderEditor();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "editor-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remover ${moduleLabel(card.id)}`);
        remove.addEventListener("click", () => {
            draft.cards.splice(index, 1);
            renderEditor();
        });

        li.append(moduleGlyph(card.id), label, size, remove);
        li.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", `move:${index}`));
        li.addEventListener("dragover", e => e.preventDefault());
        li.addEventListener("drop", e => {
            e.preventDefault();
            e.stopPropagation();
            handleEditorDrop(e.dataTransfer.getData("text/plain"), index);
        });
        return li;
    }));
}

editorGridEl.addEventListener("dragover", e => e.preventDefault());
editorGridEl.addEventListener("drop", e => {
    e.preventDefault();
    if (draft) handleEditorDrop(e.dataTransfer.getData("text/plain"), draft.cards.length);
});
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
    const ok = await layoutRequest("PUT", { slug, label, cards: draft.cards }, `Layout "${label}" salvo.`);
    if (ok) closeEditor();
});

/* ---- Boot ---- */

tokenInputEl.focus();
