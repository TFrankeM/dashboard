import { fetchGradesHistogramData, fetchVolumeChartData, fetchGaugeData, fetchLineChartData, fetchRelationships, fetchDetailsData, fetchStats } from "./api_adapter.js";
import { drawGradesHistogramChart, drawVolumeChart, drawGaugeChart, drawLineChart, clearLineChartSelection, setChartsAnimation } from "./charts.js";
import { DICTIONARY } from "./i18n.js";

// Global state variables
let CURRENT_LANG = "pt-BR";

// Data is stored in UTC; every user-facing datetime renders in Brasília time.
const DISPLAY_TZ = "America/Sao_Paulo";

const POLL_INTERVAL_MS = 600000;      // dynamic-mode data refresh (10 min)
const LAST_UPDATE_TICK_MS = 60000;    // "last update" relative label refresh
const HOVER_CLOSE_DELAY_MS = 300;     // hover-opened panels linger before closing

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Whether the next chart draw should animate: true for fresh data (apply/load),
// false for cosmetic redraws (theme toggle, language switch).
let animateNextDraw = true;

// Rolls a numeric text from its previously shown value to `target`
// (easeOutQuart). The last target is kept in data-value so later applies
// transition old -> new instead of restarting at zero. Hidden tabs get the
// final value at once: rAF doesn't fire there and the roll would stall.
function animateCount(el, target, { duration = 1100, formatter, from } = {}) {
    if (!el) return;
    const fmt = formatter || (v => Math.round(v).toString());
    const prev = from !== undefined ? from : parseFloat(el.dataset.value);
    const startValue = isNaN(prev) ? 0 : prev;
    el.dataset.value = target;
    if (REDUCED_MOTION || document.hidden || startValue === target) {
        el.textContent = fmt(target);
        return;
    }
    el.textContent = fmt(target);   // final value as fallback if rendering stalls
    const start = performance.now();
    const step = now => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(startValue + (target - startValue) * eased);
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// Shared tooltip config, reused for static and dynamically-built info icons.
const INFO_TIPPY_OPTS = {
    placement: "auto-end",
    animation: "shift-away",
    theme: "dark",
    delay: [100, 100],
    arrow: false,
    arrowType: "round",
    size: "small",
    trigger: "mouseenter focus click",
    maxWidth: 250,
    interactive: true,
    allowHTML: true,
    appendTo: () => document.body,
};

const DEFAULT_CONFIG = {
    isDynamic: false,
    periodValue: "sem1_2025",
    customStartDate: "2025-01-01",
    customEndDate: "2025-06-30",
    evaluatorEntity: ["argentina"],
    evaluatedEntity: ["brasil"],
    category: ["include_all"],
    aggregation: 3
};
let appState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let pendingState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

let cachedApiData = {};

const PERIODS_CONFIG = {
    static: [
        { value: "set_dez_2024", start: "2024-09-01", end: "2024-12-31" },
        { value: "sem1_2025", start: "2025-01-01", end: "2025-06-30" },
        { value: "sem2_2025", start: "2025-07-01", end: "2025-12-31" },
        { value: "year_2025", start: "2025-01-01", end: "2025-12-31" },
        { value: "all_period", start: "2024-09-01", end: "2025-12-31" }
    ],
    dynamic: [
        { value: "last30d" },
        { value: "last120d" },
        { value: "last180d" },
        { value: "last365d" }
    ]
};

const CATEGORIESLIST = Object.keys(DICTIONARY["pt-BR"].category_options);

let RELATIONSHIPS = {};

// References for Choices instances
let choicesPeriod, choicesCategory, choicesEvaluatorEntity, choicesEvaluatedEntity, choicesLanguage;
let currentClickedDate = null;
let pollingInterval = null;
let lastDataDate = null;          // latest ingested data timestamp, for the "last update" footer
let lastUpdateInterval = null;    // keeps the "X min ago" label fresh while the page is open
// Remembers the period selection per mode so toggling static<->dynamic and back
// restores the previous choice (otherwise it falls to each mode's first default and
// the apply button never returns to idle after a round-trip).
let periodByMode = { static: null, dynamic: null };

function t(key) {
    return DICTIONARY[CURRENT_LANG][key] || key;
}
function tEntity(val) {
    return DICTIONARY[CURRENT_LANG].entity_options[val] || val;
}
function tPeriod(val) {
    return DICTIONARY[CURRENT_LANG].period_options[val] || val;
}
function tCategory(val) {
    return DICTIONARY[CURRENT_LANG].category_options[val] || val;
}
// Table 6 classification/meaning for a 1-7 grade, in the current language.
function tGradeScale(grade) {
    const g = Math.round(Number(grade));
    if (isNaN(g) || g < 1 || g > 7) return "";
    const scale = DICTIONARY[CURRENT_LANG].grade_scale || DICTIONARY["pt-BR"].grade_scale;
    return (scale && scale[g]) || "";
}
// "Nota N/7 — <classification>" in bold, followed by the (unbolded) meaning.
// Appended after an AI analysis. The classification is the text up to the first period.
function gradeScaleHTML(grade) {
    const desc = tGradeScale(grade);
    if (!desc) return "";
    const g = Math.round(Number(grade));
    const split = desc.indexOf(". ");
    const title = split === -1 ? desc.replace(/\.$/, "") : desc.slice(0, split);
    const meaning = split === -1 ? "" : desc.slice(split + 2);
    const head = `${t("newsstand_grade_label")} ${g}/7 — ${escapeHtml(title)}`;
    return `<p class="news-grade-scale"><strong>${head}.</strong>${meaning ? ` ${escapeHtml(meaning)}` : ""}</p>`;
}

function translateUI() {
    const texts = DICTIONARY[CURRENT_LANG];
    if (!texts) return;

    // ordinary texts
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (texts[key]) {
            el.textContent = texts[key];
        }
    });

    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const mobileFilterText = document.getElementById("mobile-filter-text");
    const filtersWrapper = document.getElementById("filters-wrapper");

    if (mobileFilterBtn && filtersWrapper && mobileFilterText) {
        const isOpen = filtersWrapper.classList.contains("open");
        mobileFilterText.textContent = isOpen ? t("btn_hide_filters") : t("btn_show_filters");
    }

    // imgs
    document.querySelectorAll("[data-i18n-img]").forEach(el => {
        const key = el.getAttribute("data-i18n-img");
        if (texts[key]) {
            el.src = texts[key];
        }
    });

    // title attributes (native tooltips, ex: link "voltar" na logo)
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        if (texts[key]) {
            el.setAttribute("title", texts[key]);
        }
    });

    // side-nav dot labels (CSS renders them via attr(data-label))
    document.querySelectorAll("[data-i18n-label]").forEach(el => {
        const key = el.getAttribute("data-i18n-label");
        if (texts[key]) {
            el.setAttribute("data-label", texts[key]);
            el.setAttribute("aria-label", texts[key]);
        }
    });

    // tooltips
    document.querySelectorAll("[data-i18n-tooltip]").forEach(el => {
        const key = el.getAttribute("data-i18n-tooltip");
        // The gauge tooltip depends on the applied mode, not just the language.
        const content = el.id === "gauge-info-icon" ? texts[gaugeTooltipKey()] : texts[key];
        if (el._tippy) {
            el._tippy.setContent(content);
        }
        el.setAttribute("data-tippy-content", content);
        // Screen readers get the tooltip text; keyboard users can focus the icon.
        el.setAttribute("aria-label", String(content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    });

    // filters
    [choicesEvaluatorEntity, choicesEvaluatedEntity, choicesCategory, choicesPeriod]
        .forEach(c => { if (c && c.relabel) c.relabel(); });
    updatePeriodDropdown(pendingState.isDynamic);

    const totalNewsEl = document.getElementById("total-news");
    if (totalNewsEl) {
        updateEvolutionHeader(parseInt(totalNewsEl.textContent.replace(/\D/g,'')) || 0);
    }

    // Re-render any open newspapers so their dynamic text follows the language
    if (currentClickedDate) ["pos", "neu", "neg"].forEach(b => renderSheet(b, false));

    // Keep the gauge "last update" footer in the current language
    renderLastUpdate();
}

async function fetchOptionsFromDB(targetType, filterValue) {
    return new Promise(resolve => {
        const allEvaluators = Object.keys(RELATIONSHIPS);
        const allEvaluated = [...new Set(Object.values(RELATIONSHIPS).flat())];

        let options = [];
        if (targetType === "evaluated") {
            const validSet = new Set();
            if (!filterValue || filterValue.length === 0) {
                allEvaluated.forEach(e => validSet.add(e));
            } else {
                filterValue.forEach(rev => {
                    if (RELATIONSHIPS[rev]) RELATIONSHIPS[rev].forEach(item => validSet.add(item));
                });
            }
            
            options = allEvaluated.map(opt => ({
                value: opt,
                label: tEntity(opt),
                disabled: !validSet.has(opt)
            }));
        } else if (targetType === "evaluator") {
            const validSet = new Set();
            if (!filterValue || filterValue.length === 0) {
                allEvaluators.forEach(e => validSet.add(e));
            } else {
                allEvaluators.forEach(rev => {
                    const targets = RELATIONSHIPS[rev];
                    if (filterValue.some(val => targets.includes(val))) {
                        validSet.add(rev);
                    }
                });
            }
            
            options = allEvaluators.map(opt => ({
                value: opt,
                label: tEntity(opt),
                disabled: !validSet.has(opt)
            }));
        }

        // Sort: valid first, then alphabetically
        options.sort((a, b) => {
            if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
            return a.label.localeCompare(b.label);
        });

        resolve(options);
    });
}

const LANG_STORAGE_KEY = "iibex_lang";
const THEME_STORAGE_KEY = "iibex_theme";

function updateThemeToggleAria() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const isDark = document.documentElement.dataset.theme === "dark";
    btn.setAttribute("aria-pressed", String(isDark));
    btn.setAttribute("aria-label", t(isDark ? "theme_to_light" : "theme_to_dark"));
}

function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    updateThemeToggleAria();
    // Surface color transitions start only after the first paint.
    requestAnimationFrame(() => document.documentElement.classList.add("theme-anim"));
    btn.addEventListener("click", () => {
        const toDark = document.documentElement.dataset.theme !== "dark";
        if (toDark) document.documentElement.dataset.theme = "dark";
        else delete document.documentElement.dataset.theme;
        localStorage.setItem(THEME_STORAGE_KEY, toDark ? "dark" : "light");
        updateThemeToggleAria();
        redrawCharts();   // charts re-read chartUI() on draw
    });
}

function initLanguageSelector() {
    // Restore the language chosen on any page of the site.
    const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
    if (savedLang && DICTIONARY[savedLang]) {
        CURRENT_LANG = savedLang;
        document.documentElement.lang = savedLang;
    }

    if (typeof Choices !== "undefined") {
        choicesLanguage = new Choices("#language-select", {
            searchEnabled: false,
            itemSelectText: "",
            shouldSort: false,
            position: "bottom",
            choices: [
                { value: "pt-BR", label: "PT", selected: CURRENT_LANG === "pt-BR" },
                { value: "en-US", label: "EN", selected: CURRENT_LANG === "en-US" },
                { value: "es-ES", label: "ES", selected: CURRENT_LANG === "es-ES" }
            ]
        });

        const langWrapper = document.querySelector(".lang-dropdown-wrapper");
        if (langWrapper) {
            enableHoverToChoices(choicesLanguage, langWrapper);
        }

        const langSelect = document.getElementById("language-select");
        if (langSelect) {
            langSelect.addEventListener("change", (e) => {
                CURRENT_LANG = e.target.value;
                document.documentElement.lang = CURRENT_LANG;
                localStorage.setItem(LANG_STORAGE_KEY, CURRENT_LANG);

                const rawDate = new URLSearchParams(window.location.search).get("date");
                if (rawDate) {
                    const dateObj = new Date(rawDate);
                    if (!isNaN(dateObj)) {
                        const dateSpan = document.getElementById("date-span");
                        if (dateSpan) dateSpan.textContent = dateObj.toLocaleDateString(CURRENT_LANG, { timeZone: "UTC" });
                    }
                }
                
                translateUI();
                updateThemeToggleAria();
                redrawCharts();
                updateToggleVisual(pendingState.isDynamic);
            });
        }
    }
}

// Closed-field summaries depend on available width, so they must be re-fit when
// the field width or font size changes (viewport resize, compact bar, mobile
// filters opening). Each filter registers its own renderer here.
const summaryRefitters = [];
function refitFilterSummaries() {
    summaryRefitters.forEach(fn => fn());
}

// Searchable multi-select rendered as a checkbox list with a compact summary when
// closed. Used for every multi-value filter (categories, evaluators, evaluated) so
// they share one look. The hidden <select> stays the value source and fires "change"
// so the existing filter listeners and cross-filter constraints keep working.
// Exposes a Choices-compatible surface: getValue, setChoiceByValue, removeActiveItems,
// clearStore, setChoices, relabel.
function buildCheckboxFilter(selectEl, opts) {
    const translate = opts.translate;                 // value -> display label
    const single = !!opts.single;                     // single-select mode (period)
    const max = single ? 1 : (opts.max || Infinity);  // maximum number of selections
    const nameKey = opts.nameKey;                     // i18n key for the field name (closed-state label)
    const infoKey = opts.infoKey;                     // i18n key for the panel help tooltip
    const icon = opts.icon;                           // lucide icon name shown in the field
    const searchKey = opts.searchKey;                 // i18n key for the search placeholder
    const hoverCapable = window.matchMedia("(hover: hover)").matches;

    let options = (opts.values || []).map(o => ({ value: o.value, disabled: !!o.disabled }));
    const selected = new Set();
    let open = false;
    let order = [];                                   // display order, frozen while the panel is open
    let closeTimer;

    selectEl.style.display = "none";

    const root = document.createElement("div");
    root.className = "cbx-filter";
    root.innerHTML = `
        <button type="button" class="cbx-field" aria-haspopup="listbox" aria-expanded="false">
            ${icon ? `<i data-lucide="${icon}" class="cbx-icon"></i>` : ""}
            <span class="cbx-summary"><span class="cbx-summary-text"></span><span class="cbx-more" hidden></span></span>
            ${infoKey ? `<span class="info-icon" data-i18n-tooltip="${infoKey}">?</span>` : ""}
            <svg class="cbx-caret" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="cbx-panel" hidden>
            <input type="text" class="cbx-search"${single ? " hidden" : ""} />
            <div class="cbx-list" role="listbox" aria-multiselectable="${single ? "false" : "true"}"></div>
        </div>`;
    selectEl.after(root);
    // Drop the static placeholder shown before this field mounted.
    selectEl.parentElement?.querySelector(".cbx-skeleton")?.remove();

    const field = root.querySelector(".cbx-field");
    const summaryEl = root.querySelector(".cbx-summary");
    const summaryText = root.querySelector(".cbx-summary-text");
    const summaryMore = root.querySelector(".cbx-more");
    const panel = root.querySelector(".cbx-panel");
    const search = root.querySelector(".cbx-search");
    const listEl = root.querySelector(".cbx-list");

    // Reflect the current selection back onto the hidden <select> so it stays the value source.
    const syncSelect = () => {
        selectEl.innerHTML = options.map(o =>
            `<option value="${o.value}"${selected.has(o.value) ? " selected" : ""}></option>`).join("");
    };

    // The closed field shows the current selection (the field name lives in the
    // label above it). Names that don't fit collapse into a "+N" counter so the
    // field keeps its fixed size regardless of how many options are selected.
    const renderSummary = () => {
        if (nameKey) field.setAttribute("aria-label", t(nameKey));
        const names = Array.from(selected).map(translate);
        if (!names.length) {
            summaryText.textContent = "—";
            summaryMore.hidden = true;
            return;
        }
        // Try the longest prefix of full names first; each drop moves one more
        // name into the counter. A lone name that still overflows keeps its
        // CSS ellipsis. Selection is capped at 5, so the reflow cost is trivial.
        for (let shown = names.length; shown >= 1; shown--) {
            summaryText.textContent = names.slice(0, shown).join(", ");
            const hiddenCount = names.length - shown;
            summaryMore.hidden = hiddenCount === 0;
            summaryMore.textContent = `+${hiddenCount}`;
            if (summaryText.scrollWidth <= summaryText.clientWidth) return;
        }
    };
    summaryRefitters.push(renderSummary);

    // Order: selected first, then unselected, disabled last; alphabetical within each group.
    const computeOrder = () => {
        const rank = o => (o.disabled ? 2 : selected.has(o.value) ? 0 : 1);
        order = options.slice()
            .sort((a, b) => rank(a) - rank(b) || translate(a.value).localeCompare(translate(b.value)))
            .map(o => o.value);
    };

    const renderList = () => {
        const q = search.value.trim().toLowerCase();
        const byValue = Object.fromEntries(options.map(o => [o.value, o]));
        listEl.innerHTML = order
            .filter(v => byValue[v] && translate(v).toLowerCase().includes(q))
            .map(v => {
                const o = byValue[v];
                const cls = ["cbx-option"];
                if (selected.has(v)) cls.push("is-checked");
                if (o.disabled) cls.push("is-disabled");
                return `<div class="${cls.join(" ")}" role="option" aria-selected="${selected.has(v)}" data-value="${v}">
                    <input type="checkbox" tabindex="-1" ${selected.has(v) ? "checked" : ""} ${o.disabled ? "disabled" : ""}>
                    <span>${escapeHtml(translate(v))}</span>
                </div>`;
            }).join("");
    };

    // Flip one option, honouring the selection cap; the frozen order keeps it in place.
    const toggle = value => {
        const o = options.find(x => x.value === value);
        if (!o || o.disabled) return;
        if (single) {
            if (selected.has(value)) return;             // already the active choice
            selected.clear();
            selected.add(value);
        } else if (selected.has(value)) {
            selected.delete(value);
        } else if (selected.size < max) {
            selected.add(value);
        } else {
            return;
        }
        syncSelect();
        renderSummary();
        renderList();
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        if (single) closePanel();                        // single-select commits and closes
    };

    const openPanel = () => {
        if (open) return;
        open = true;
        computeOrder();                               // re-sort only on (re)open, never mid-selection
        panel.hidden = false;
        field.classList.add("is-open");
        field.setAttribute("aria-expanded", "true");
        search.value = "";
        renderList();
        search.focus();
    };
    const closePanel = () => {
        open = false;
        panel.hidden = true;
        field.classList.remove("is-open");
        field.setAttribute("aria-expanded", "false");
    };

    field.addEventListener("click", () => open ? closePanel() : openPanel());
    listEl.addEventListener("click", e => {
        const row = e.target.closest(".cbx-option");
        if (!row) return;
        // Keep the panel open on selection; re-rendering detaches the clicked node,
        // which would otherwise make the document handler treat this as a click-outside.
        e.stopPropagation();
        toggle(row.dataset.value);
    });
    search.addEventListener("input", renderList);
    root.addEventListener("keydown", e => {
        if (e.key === "Escape" && open) { closePanel(); field.focus(); }
    });
    document.addEventListener("click", e => { if (open && !root.contains(e.target)) closePanel(); });

    // Pointer devices open the panel on hover and close it shortly after the cursor leaves.
    if (hoverCapable) {
        root.addEventListener("mouseenter", () => { clearTimeout(closeTimer); openPanel(); });
        root.addEventListener("mouseleave", () => { closeTimer = setTimeout(closePanel, HOVER_CLOSE_DELAY_MS); });
    }

    syncSelect();
    renderSummary();

    // The component is built after the global lucide/tippy init, so render its icon
    // and wire the panel help tooltip here.
    if (typeof lucide !== "undefined") lucide.createIcons();
    const infoEl = root.querySelector(".info-icon");
    if (infoEl) {
        if (typeof tippy !== "undefined") tippy(infoEl, INFO_TIPPY_OPTS);
        // The help icon lives inside the field button; don't let clicking it toggle the panel.
        infoEl.addEventListener("click", e => e.stopPropagation());
    }

    return {
        getValue() { return Array.from(selected); },
        setChoiceByValue(v) {
            (Array.isArray(v) ? v : [v]).forEach(x => { if (options.some(o => o.value === x)) selected.add(x); });
            syncSelect(); renderSummary(); if (open) renderList();
        },
        removeActiveItems() { selected.clear(); syncSelect(); renderSummary(); if (open) renderList(); },
        clearStore() { options = []; },
        setChoices(list) {
            // Replace mode: the caller re-applies any still-valid selection afterwards.
            options = list.map(o => ({ value: o.value, disabled: !!o.disabled }));
            selected.clear();
            syncSelect(); renderSummary(); if (open) { computeOrder(); renderList(); }
        },
        relabel() { search.placeholder = t(searchKey); renderSummary(); if (open) { computeOrder(); renderList(); } },
    };
}

async function initializeFilters() {
    // Fetch dynamic relationships from DB
    try {
        RELATIONSHIPS = await fetchRelationships();
    } catch (err) {
        console.error("Error fetching relationships:", err);
    }

    if (typeof Choices !== "undefined") {
        const evalEl = document.getElementById("evaluatorEntity");
        if (evalEl) {
            choicesEvaluatorEntity = buildCheckboxFilter(evalEl, {
                translate: tEntity, max: 5, searchKey: "placeholder_search",
                icon: "eye", nameKey: "label_evaluatorEntity"
            });
            const initialEvaluatorEntities = await fetchOptionsFromDB("evaluator", []);
            choicesEvaluatorEntity.setChoices(initialEvaluatorEntities);
            choicesEvaluatorEntity.setChoiceByValue(appState.evaluatorEntity);
        }

        const evaluatedEl = document.getElementById("evaluatedEntity");
        if (evaluatedEl) {
            choicesEvaluatedEntity = buildCheckboxFilter(evaluatedEl, {
                translate: tEntity, max: 5, searchKey: "placeholder_search",
                icon: "target", nameKey: "label_evaluatedEntity"
            });
            const initialEvaluated = await fetchOptionsFromDB("evaluated", appState.evaluatorEntity);
            choicesEvaluatedEntity.setChoices(initialEvaluated);
            choicesEvaluatedEntity.setChoiceByValue(appState.evaluatedEntity);
        }

        const periodEl = document.getElementById("period");
        if (periodEl) {
            choicesPeriod = buildCheckboxFilter(periodEl, {
                translate: tPeriod, single: true, searchKey: "placeholder_search",
                icon: "calendar-days", nameKey: "label_period"
            });
            updatePeriodDropdown(appState.isDynamic);
        }

        const aggregationInput = document.getElementById("aggregation");
        if (aggregationInput) {
            aggregationInput.value = appState.aggregation;
        }

        const catEl = document.getElementById("category");
        if (catEl) {
            choicesCategory = buildCheckboxFilter(catEl, {
                translate: tCategory, max: 5, searchKey: "category_search",
                values: CATEGORIESLIST.map(s => ({ value: s })),
                icon: "tags", nameKey: "label_category"
            });
            choicesCategory.setChoiceByValue(appState.category);
            choicesCategory.relabel();
        }

        setupFilterListeners();
    }

    translateUI();
    updateToggleVisual(pendingState.isDynamic);
    checkApplyButtonState();

    const langWrapper = document.querySelector(".lang-dropdown-wrapper");
    if (langWrapper && choicesLanguage) {
        langWrapper.addEventListener("click", (e) => {
            if (!e.target.closest(".choices")) {
                choicesLanguage.showDropdown();
            }
        });
    }
}

/**
 * Helper to enable hover behavior on Choices instances
 * @param {Choices} choicesInstance 
 * @param {HTMLElement} wrapperElement 
 */
function enableHoverToChoices(choicesInstance, wrapperElement) {
    if (!choicesInstance || !wrapperElement || !window.matchMedia("(hover: hover)").matches) return;

    let timeout;
    const open = () => {
        clearTimeout(timeout);
        choicesInstance.showDropdown();
    };
    const close = () => {
        timeout = setTimeout(() => {
            choicesInstance.hideDropdown();
        }, HOVER_CLOSE_DELAY_MS);
    };

    wrapperElement.addEventListener("mouseenter", open);
    wrapperElement.addEventListener("mouseleave", close);
}

function setupFilterListeners() {
    const onFilterChange = (key, valueInstance, isMulti = false) => {
        let val;
        if (valueInstance.getValue && typeof valueInstance.getValue === "function") {
            val = valueInstance.getValue(true);
        } else {
            val = valueInstance.value;
        }

        if (isMulti && !Array.isArray(val)) {
            val = [val];
        }

        pendingState[key] = val;
        
        if (isMulti) {
            enforceMultiSelectConstraints(key);
        }

        checkApplyButtonState();
    };

    const evaluatorEntitySelect = document.getElementById("evaluatorEntity");
    if (evaluatorEntitySelect) {
        evaluatorEntitySelect.addEventListener("change", async () => {
            onFilterChange("evaluatorEntity", choicesEvaluatorEntity, true);
            
            const newOptions = await fetchOptionsFromDB("evaluated", pendingState.evaluatorEntity);
            const currentSelected = choicesEvaluatedEntity.getValue(true);
            choicesEvaluatedEntity.clearStore();
            choicesEvaluatedEntity.setChoices(newOptions, "value", "label", true);
            const validSelection = (Array.isArray(currentSelected) ? currentSelected : [currentSelected]).filter(s => {
                const opt = newOptions.find(o => o.value === s);
                return opt && !opt.disabled;
            });
            if(validSelection.length > 0) {
                choicesEvaluatedEntity.setChoiceByValue(validSelection);
            }

            pendingState.evaluatedEntity = choicesEvaluatedEntity.getValue(true); 
        });
    }

    const evaluatedEntitySelect = document.getElementById("evaluatedEntity");
    if (evaluatedEntitySelect) {
        evaluatedEntitySelect.addEventListener("change", async () => {
            onFilterChange("evaluatedEntity", choicesEvaluatedEntity, true);
            
            const newOptions = await fetchOptionsFromDB("evaluator", pendingState.evaluatedEntity);
            const currentSelected = choicesEvaluatorEntity.getValue(true);
            choicesEvaluatorEntity.clearStore();
            choicesEvaluatorEntity.setChoices(newOptions, "value", "label", true);
            const validSelection = (Array.isArray(currentSelected) ? currentSelected : [currentSelected]).filter(s => {
                const opt = newOptions.find(o => o.value === s);
                return opt && !opt.disabled;
            });
            if(validSelection.length > 0) {
                choicesEvaluatorEntity.setChoiceByValue(validSelection);
            }

            pendingState.evaluatorEntity = choicesEvaluatorEntity.getValue(true);
        });
    }

    const periodSelect = document.getElementById("period");
    if (periodSelect) {
        periodSelect.addEventListener("change", () => {
            const val = periodSelect.value;
            pendingState.periodValue = val;
            
            if (!pendingState.isDynamic) {
                const config = PERIODS_CONFIG.static.find(p => p.value === val);
                if (config) { 
                    pendingState.customStartDate = config.start; 
                    pendingState.customEndDate = config.end; 
                }
            }
            checkApplyButtonState();
        });
    }

    const categorySelect = document.getElementById("category");
    if (categorySelect) {
        categorySelect.addEventListener("change", () => onFilterChange('category', choicesCategory, true));
    }

    const aggregationInput = document.getElementById("aggregation");
    if (aggregationInput) {
        const minAgg = parseFloat(aggregationInput.min) || 0.25;
        aggregationInput.addEventListener("input", () => {
            const val = parseFloat(aggregationInput.value);
            if (!isNaN(val) && val >= minAgg) {
                onFilterChange('aggregation', aggregationInput, false);
            }
        });
        // Snap invalid or below-minimum values back to the last accepted one on blur.
        aggregationInput.addEventListener("change", () => {
            const val = parseFloat(aggregationInput.value);
            if (isNaN(val) || val < minAgg) {
                aggregationInput.value = pendingState.aggregation;
            }
        });
    }

    const dynamicToggle = document.getElementById("dynamic-mode");
    if (dynamicToggle) {
        dynamicToggle.addEventListener("change", (e) => {
            // Stash the current period under the mode being left, then restore the
            // period previously used for the mode being entered, so a round-trip
            // toggle lands back on the same selection.
            periodByMode[pendingState.isDynamic ? "dynamic" : "static"] = {
                periodValue: pendingState.periodValue,
                customStartDate: pendingState.customStartDate,
                customEndDate: pendingState.customEndDate,
            };
            pendingState.isDynamic = e.target.checked;
            const mem = periodByMode[pendingState.isDynamic ? "dynamic" : "static"];
            if (mem) {
                pendingState.periodValue = mem.periodValue;
                pendingState.customStartDate = mem.customStartDate;
                pendingState.customEndDate = mem.customEndDate;
            }
            updateToggleVisual(pendingState.isDynamic);
            updatePeriodDropdown(pendingState.isDynamic);
            checkApplyButtonState();
        });
    }

    const btnApply = document.getElementById("btn-apply");
    if (btnApply) {
        btnApply.addEventListener("click", () => {
            if (!btnApply.classList.contains("disabled")) {
                applyFilters();
            }
        });
    }
}

function enforceMultiSelectConstraints(changedKey) {
    const keys = ["evaluatorEntity", "evaluatedEntity", "category"];
    const changedVal = pendingState[changedKey];

    if (Array.isArray(changedVal) && changedVal.length > 1) {
        keys.forEach(k => {
            if (k !== changedKey) {
                const otherVal = pendingState[k];
                if (Array.isArray(otherVal) && (otherVal.length > 1 || otherVal.length === 0)) {
                    // Force to 1 selection if it had more, or keep empty/1
                    const first = otherVal.length > 0 ? [otherVal[0]] : [];
                    pendingState[k] = first;
                    
                    const instance = k === "evaluatorEntity" ? choicesEvaluatorEntity : (k === "evaluatedEntity" ? choicesEvaluatedEntity : choicesCategory);
                    if (instance) {
                        instance.removeActiveItems();
                        if (first.length > 0) instance.setChoiceByValue(first);
                    }
                }
            }
        });
    }
}

function checkApplyButtonState() {
    const normalize = (s) => {
        const copy = JSON.parse(JSON.stringify(s));
        if(Array.isArray(copy.evaluatorEntity)) copy.evaluatorEntity.sort();
        if(Array.isArray(copy.evaluatedEntity)) copy.evaluatedEntity.sort();
        if(Array.isArray(copy.category)) copy.category.sort();
        copy.aggregation = parseFloat(copy.aggregation);

        return JSON.stringify(copy);
    };

    const isDifferent = normalize(appState) !== normalize(pendingState);
    const btnApply = document.getElementById("btn-apply");

    if (btnApply) {
        btnApply.classList.toggle("disabled", !isDifferent);
        btnApply.disabled = !isDifferent;
    }
}

// Reflect the applied filters in the URL so the current view is shareable and
// survives a refresh (replaceState: no history entry per apply).
function syncUrlWithState() {
    const p = new URLSearchParams();
    if (appState.isDynamic) p.set("mode", "dynamic");
    p.set("period", appState.periodValue);
    (appState.evaluatorEntity || []).forEach(v => p.append("evaluator", v));
    (appState.evaluatedEntity || []).forEach(v => p.append("evaluated", v));
    (appState.category || []).forEach(v => p.append("category", v));
    p.set("agg", appState.aggregation);
    history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

// Restore filters from a shared/refreshed URL before the widgets initialize.
function applyUrlState() {
    const p = new URLSearchParams(window.location.search);
    if (!p.has("period") && !p.has("evaluator") && !p.has("mode")) return;
    const st = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (p.get("mode") === "dynamic") st.isDynamic = true;
    const period = p.get("period");
    if (period) {
        const pool = st.isDynamic ? PERIODS_CONFIG.dynamic : PERIODS_CONFIG.static;
        const cfg = pool.find(x => x.value === period);
        if (cfg) {
            st.periodValue = period;
            if (!st.isDynamic) { st.customStartDate = cfg.start; st.customEndDate = cfg.end; }
        }
    }
    if (p.getAll("evaluator").length) st.evaluatorEntity = p.getAll("evaluator");
    if (p.getAll("evaluated").length) st.evaluatedEntity = p.getAll("evaluated");
    if (p.getAll("category").length) st.category = p.getAll("category");
    const agg = parseFloat(p.get("agg"));
    if (!isNaN(agg) && agg >= 0.25) st.aggregation = agg;
    appState = JSON.parse(JSON.stringify(st));
    pendingState = JSON.parse(JSON.stringify(st));
}

// Back to the default view: reset the pending selection, rebuild the entity
// options unconstrained and apply.
async function resetFilters() {
    pendingState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    periodByMode = { static: null, dynamic: null };

    if (choicesEvaluatorEntity) {
        const evaluatorOpts = await fetchOptionsFromDB("evaluator", []);
        choicesEvaluatorEntity.clearStore();
        choicesEvaluatorEntity.setChoices(evaluatorOpts);
        choicesEvaluatorEntity.setChoiceByValue(pendingState.evaluatorEntity);
    }
    if (choicesEvaluatedEntity) {
        const evaluatedOpts = await fetchOptionsFromDB("evaluated", pendingState.evaluatorEntity);
        choicesEvaluatedEntity.clearStore();
        choicesEvaluatedEntity.setChoices(evaluatedOpts);
        choicesEvaluatedEntity.setChoiceByValue(pendingState.evaluatedEntity);
    }
    if (choicesCategory) {
        choicesCategory.removeActiveItems();
        choicesCategory.setChoiceByValue(pendingState.category);
    }
    const aggregationInput = document.getElementById("aggregation");
    if (aggregationInput) aggregationInput.value = pendingState.aggregation;
    updateToggleVisual(pendingState.isDynamic);
    updatePeriodDropdown(pendingState.isDynamic);
    applyFilters();
}

// Pulsing LED next to the mode label while the APPLIED mode is dynamic (live data).
function updateModeLed() {
    const led = document.getElementById("mode-led");
    if (led) led.classList.toggle("on", !!appState.isDynamic);
}

function applyFilters() {
    appState = JSON.parse(JSON.stringify(pendingState));
    checkApplyButtonState();
    syncUrlWithState();
    updateModeLed();
    updateDashboard();

    const filtersWrapper = document.getElementById("filters-wrapper");
    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const mobileFilterText = document.getElementById("mobile-filter-text");

    if (window.innerWidth < 1024 && filtersWrapper && filtersWrapper.classList.contains("open")) {
        filtersWrapper.classList.remove("open");
        if (mobileFilterBtn) mobileFilterBtn.classList.remove("expanded");
        if (mobileFilterText) mobileFilterText.textContent = t("btn_show_filters");
    }

    if (appState.isDynamic) {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(updateDashboard, POLL_INTERVAL_MS);
    } else {
        if (pollingInterval) clearInterval(pollingInterval);
    }
}

function updatePeriodDropdown(isDynamic) {
    if (!choicesPeriod) return;

    const rawOptions = isDynamic ? PERIODS_CONFIG.dynamic : PERIODS_CONFIG.static;
    choicesPeriod.setChoices(rawOptions.map(o => ({ value: o.value })));

    const currentVal = pendingState.periodValue;
    const match = rawOptions.find(o => o.value === currentVal);
    if (match) {
        choicesPeriod.setChoiceByValue(currentVal);
    } else {
        const def = rawOptions[0];
        choicesPeriod.setChoiceByValue(def.value);
        pendingState.periodValue = def.value;
        if (!isDynamic) {
            pendingState.customStartDate = def.start;
            pendingState.customEndDate = def.end;
        }
    }
}

function updateToggleVisual(isDynamic) {
    const label = document.getElementById("mode-label");
    const texts = DICTIONARY[CURRENT_LANG];
    if (label) {
        label.textContent = isDynamic ? texts.mode_dynamic : texts.mode_static;
        label.style.color = isDynamic ? "#008BC9" : "white";
    }
    const dynamicToggle = document.getElementById("dynamic-mode");
    if (dynamicToggle) dynamicToggle.checked = isDynamic;

    updateGaugeTooltip();
}

// Mode-aware gauge tooltip: dynamic = avg of last 30 min, static = avg of selected period.
function gaugeTooltipKey() {
    const isDynamic = pendingState ? pendingState.isDynamic : appState.isDynamic;
    return isDynamic ? "tooltip_gauge_dynamic" : "tooltip_gauge_static";
}

function updateGaugeTooltip() {
    const el = document.getElementById("gauge-info-icon");
    if (!el) return;
    const content = t(gaugeTooltipKey());
    if (el._tippy) el._tippy.setContent(content);
    el.setAttribute("data-tippy-content", content);
}

// Builds the "Última atualização: há X min" description from the latest ingested data date.
function renderLastUpdate() {
    const el = document.getElementById("gauge-last-update");
    if (!el) return;
    if (!lastDataDate) { el.textContent = ""; return; }

    const diffMin = Math.max(0, Math.floor((Date.now() - lastDataDate.getTime()) / 60000));
    let rel;
    if (diffMin < 60) {
        rel = t("update_min_ago").replace("{n}", diffMin);
    } else if (diffMin < 1440) {
        rel = t("update_over_hour");
    } else {
        rel = t("update_over_day");
    }
    el.textContent = `${t("last_update")}${rel}`;
}

function processAndUpdateHistogramChart(apiData) {
    const fullBuckets = [1, 2, 3, 4, 5, 6, 7];
    const labels = fullBuckets.map(String);
    const dataMap = {};
    
    if (apiData) {
        apiData.forEach(row => {
            dataMap[parseInt(row.grade_bucket)] = parseInt(row.count);
        });
    }
    
    const values = fullBuckets.map(bucket => dataMap[bucket] || 0);

    const gradeDescriptions = {
        "1": t("image_extremely_negative"),
        "2": t("image_very_negative"),
        "3": t("image_slightly_negative"),
        "4": t("image_neutral"),
        "5": t("image_slightly_positive"),
        "6": t("image_very_positive"),
        "7": t("image_extremely_positive")
    };

    const texts = {
        tooltipTitle: t("chart_histogram_tooltip_grade"),
        tooltipUnitSingular: t("unit_singular"),
        tooltipUnitPlural: t("unit_plural"),
        gradeDescriptions: gradeDescriptions
    };
    const gradesChartCanvas = document.getElementById("gradesChart");
    if (gradesChartCanvas) {
        drawGradesHistogramChart(gradesChartCanvas, labels, values, texts);
    }
}

function processAndUpdateVolumeChart(apiData) {
    const volumeChartCanvas = document.getElementById("volumeChart");
    const totalNewsEl = document.getElementById("total-news");

    if (!apiData || apiData.length === 0) {
        if (totalNewsEl) totalNewsEl.textContent = "0";
        if (volumeChartCanvas) drawVolumeChart(volumeChartCanvas, [t("no_data_found")], []);
        return 0;
    }

    const labels = [];
    const rangeLabels = [];
    const values = [];
    let total = 0;

    const sortedData = apiData.sort((a, b) => new Date(a.time_period) - new Date(b.time_period));

    // Each point is a bucket of `aggregation` hours starting at time_period, but
    // the axis label only shows the day. The tooltip gets the full local range
    // (start – end) so the reader knows which slice of the day the point covers.
    const aggMs = (parseFloat(appState.aggregation) || 0) * 3600 * 1000;
    const rangeFmt = new Intl.DateTimeFormat(CURRENT_LANG, {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TZ
    });

    sortedData.forEach(row => {
        const date = new Date(row.time_period);
        labels.push(date.toLocaleDateString(CURRENT_LANG, { timeZone: DISPLAY_TZ }));

        const end = new Date(date.getTime() + aggMs);
        if (!aggMs) {
            rangeLabels.push(rangeFmt.format(date));
        } else if (typeof rangeFmt.formatRange === "function") {
            // formatRange collapses the shared parts ("01/03/2025, 09:00 – 12:00")
            // and repeats the date when the bucket crosses midnight.
            rangeLabels.push(rangeFmt.formatRange(date, end));
        } else {
            rangeLabels.push(`${rangeFmt.format(date)} – ${rangeFmt.format(end)}`);
        }

        let count = parseInt(row.news_count, 10);
        values.push(count);
        total += count;
    });

    if (volumeChartCanvas) {
        drawVolumeChart(volumeChartCanvas, labels, values, {
            labelNews: t("chart_label_news"),
            tooltipDay: t("chart_volume_tooltip_day"),
            tooltipRanges: rangeLabels,
            suffixSingular: t("chart_volume_tooltip_unit_singular"),
            suffixPlural: t("chart_volume_tooltip_unit_plural")
        });
    }
    
    const sufixo = total === 1 ? t("chart_volume_desc_singular") : t("chart_volume_desc_plural");
    if (totalNewsEl) {
        totalNewsEl.classList.remove("skeleton");
        // The <strong> is recreated on every render, so carry the previously
        // shown total over to keep the old -> new transition.
        const prevTotal = parseFloat(totalNewsEl.querySelector("strong")?.dataset.value);
        totalNewsEl.innerHTML = `<strong></strong> ${sufixo}`;
        const strongEl = totalNewsEl.querySelector("strong");
        if (animateNextDraw) {
            animateCount(strongEl, total, {
                from: isNaN(prevTotal) ? undefined : prevTotal,
                formatter: v => Math.round(v).toLocaleString(CURRENT_LANG)
            });
        } else {
            strongEl.dataset.value = total;
            strongEl.textContent = total.toLocaleString(CURRENT_LANG);
        }
    }
    return total;
}

function processAndUpdateGaugeDisplay(value) {
    const finalValue = value !== undefined && value !== null ? parseFloat(value) : 4.00;
    const gaugeValueText = document.getElementById("gaugeValueText");
    const gaugeDescription = document.getElementById("gaugeDescription");
    const gaugeChartCanvas = document.getElementById("gaugeChart");

    if (gaugeValueText) {
        if (animateNextDraw) {
            animateCount(gaugeValueText, finalValue, { formatter: v => v.toFixed(2) });
        } else {
            gaugeValueText.dataset.value = finalValue;
            gaugeValueText.textContent = finalValue.toFixed(2);
        }
    }

    let descText = t("no_data_found");
    let descColor = "#94a3b8";

    if (finalValue <= 1.50) { 
        descText = t("image_extremely_negative"); 
        descColor = "#b91c1c";
    } else if (finalValue <= 2.50) { 
        descText = t("image_very_negative"); 
        descColor = "#ef4444";
    } else if (finalValue <= 3.50) { 
        descText = t("image_slightly_negative"); 
        descColor = "#fdae61";
    } else if (finalValue <= 4.49) { 
        descText = t("image_neutral"); 
        descColor = "#64748b";
    } else if (finalValue <= 5.49) { 
        descText = t("image_slightly_positive"); 
        descColor = "#84cc16";
    } else if (finalValue <= 6.49) { 
        descText = t("image_very_positive"); 
        descColor = "#22c55e";
    } else { 
        descText = t("image_extremely_positive"); 
        descColor = "#15803d";
    }

    if (gaugeDescription) {
        gaugeDescription.textContent = descText;
        gaugeDescription.style.color = descColor;
    }

    const segments = [
        `${t("image_extremely_negative")} (1.0 - 1.5)`,
        `${t("image_very_negative")} (1.51 - 2.5)`,
        `${t("image_slightly_negative")} (2.51 - 3.5)`,
        `${t("image_neutral")} (3.51 - 4.49)`,
        `${t("image_slightly_positive")} (4.5 - 5.49)`,
        `${t("image_very_positive")} (5.5 - 6.49)`,
        `${t("image_extremely_positive")} (6.5 - 7.0)`
    ];

    if (gaugeChartCanvas) {
        drawGaugeChart(gaugeChartCanvas, finalValue, { segments });
    }
}

function updateEvolutionHeader(totalNews) {
    const evolutionTitleEl = document.getElementById("evolution-title");
    const evolutionSubtitleEl = document.getElementById("evolution-subtitle");

    if (!evolutionTitleEl || !evolutionSubtitleEl) return;
    
    const revArr = Array.isArray(appState.evaluatorEntity) ? appState.evaluatorEntity : [appState.evaluatorEntity];
    const entArr = Array.isArray(appState.evaluatedEntity) ? appState.evaluatedEntity : [appState.evaluatedEntity];
    const revStr = revArr.map(r => tEntity(r)).join(", ");
    const entStr = entArr.map(e => tEntity(e)).join(", ");
    
    evolutionTitleEl.textContent = t("chart_evolution_title");
    const evolutionEntitiesEl = document.getElementById("evolution-entities");
    if (evolutionEntitiesEl) {
        evolutionEntitiesEl.textContent = `${t("evo_title_prefix")}${revStr}${t("evo_title_separator")}${entStr}`;
    }
    
    let dateStr = "";
    if (appState.isDynamic) {
        dateStr = `nos ${PERIODS_CONFIG.dynamic.find(p => p.value === appState.periodValue)?.label?.replace("Ú", "ú") || appState.periodValue}`;
    } else {
        const formatDate = (isoDate) => {
            if (!isoDate) return "??";
            const parts = isoDate.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
        };
        dateStr = `${t("evo_date_connector_static")}${formatDate(appState.customStartDate)}${t("evo_date_connector_static_to")}${formatDate(appState.customEndDate)}`;
    }

    const totalStr = totalNews ? totalNews.toLocaleString(CURRENT_LANG) : "0";
    evolutionSubtitleEl.classList.remove("skeleton");
    evolutionSubtitleEl.textContent = `${t("evo_subtitle_prefix")}${dateStr} | ${t("chart_line_tooltip_count")}: ${totalStr}`;
}

function processAndUpdateLineChart(apiData) {
    const lineChartCanvas = document.getElementById("lineChart");
    if (!lineChartCanvas) return;

    if (!apiData || apiData.length === 0) {
        drawLineChart(lineChartCanvas, [t("no_data_found")], [], null);
        return;
    }

    const allDates = new Set();
    const allSeries = new Set();

    apiData.forEach(row => {
        if (row.time_period) {
            allDates.add(row.time_period);
        }
        if (row.series_label) {
            allSeries.add(row.series_label);
        }
    });

    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

    const agg = parseFloat(appState.aggregation);
    const showHours = !isNaN(agg) && agg < 24;

    // Category identity is the raw bucket date (unique); the x-axis tick engine in
    // charts.js decides what actually shows (day 1/15, first/last, zoom-aware time).
    const axisLabels = sortedDates;

    const tooltipDates = sortedDates.map(dateStr => {
        const date = new Date(dateStr);
        const options = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: DISPLAY_TZ };
        if (showHours) {
            options.hour = "2-digit";
            options.minute = "2-digit";
        }
        return date.toLocaleString(CURRENT_LANG, options);
    });

    const datasets = Array.from(allSeries).map(labelName => {
        const seriesRows = apiData.filter(row => row.series_label === labelName);
        const dataMap = new Map();

        seriesRows.forEach(row => {
            dataMap.set(row.time_period, {
                grade: parseFloat(row.average_grade),
                count: parseInt(row.news_count || 0, 10)
            });
        });

        const alignedData = sortedDates.map((date, i) => {
            const info = dataMap.get(date);
            if (!info) {
                return {
                    x: axisLabels[i],
                    y: null,
                    count: 0
                }
            }
            return {
                x: axisLabels[i],
                y: info.grade,
                count: info.count
            };
        });

        let translatedLabel = tEntity(labelName);
        if (translatedLabel === labelName) {
            translatedLabel = tCategory(labelName);
        }
        // key = stable slug for colour mapping; label = translated display text
        return { label: translatedLabel, key: labelName, data: alignedData };
    });

    const confirmPopup = document.getElementById("chart-popup");
    const popupDateSpan = document.getElementById("popup-date");

    // Load a point's news into the newsstand WITHOUT moving the viewport.
    const selectPoint = (index) => {
        const startDateObj = new Date(sortedDates[index]);
        const aggHours = parseFloat(appState.aggregation) || 24;
        currentClickedDate = {
            startDate: startDateObj.toISOString(),
            endDate: new Date(startDateObj.getTime() + aggHours * 3600 * 1000).toISOString(),
            aggregation: aggHours
        };
        updateNewsstand();
    };

    // User clicked a point: load it AND bring the news below the chart into view.
    const handlePointClick = (index) => {
        selectPoint(index);
        document.getElementById("newsstand")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    drawLineChart(lineChartCanvas, axisLabels, datasets, handlePointClick, {
        yAxisTitle: t("chart_line_y_axis_title"),
        tooltipGrade: t("chart_line_tooltip_avg"),
        tooltipNews: t("chart_line_tooltip_count"),
        originalDates: tooltipDates,
        axisDates: sortedDates.map(d => new Date(d).getTime()),
        aggHours: agg,
        locale: CURRENT_LANG
    });

    // Newsstand defaults to the first data point (no scroll); clicking a point changes it.
    if (sortedDates.length) selectPoint(0);
}

// News drawer: quick read of the clicked point.
const GRADE_COLORS = ["#b91c1c", "#ef4444", "#fdae61", "#cbd5e1", "#84cc16", "#22c55e", "#15803d"];

function gradeColor(g) {
    const i = Math.min(7, Math.max(1, Math.round(g))) - 1;
    return GRADE_COLORS[i] || "#cbd5e1";
}

function formatDrawerDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "";
    return d.toLocaleString(CURRENT_LANG, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TZ });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// News URLs come from scraped external data; only http(s) links may become hrefs
// (encodeURI alone would let javascript: URLs through).
function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";
}

// Reuse the current filters to deep-link into the full details table
function detailsUrlParams() {
    const p = new URLSearchParams();
    p.append("startDate", currentClickedDate.startDate);
    p.append("endDate", currentClickedDate.endDate);
    p.append("aggregation", appState.aggregation);
    p.append("evaluatorEntity", appState.evaluatorEntity);
    p.append("evaluatedEntity", appState.evaluatedEntity);
    (appState.category || []).forEach(c => p.append("category", c));
    return p.toString();
}

function newsCardHTML(n) {
    const g = Number(n.grade);
    const gradeLabel = isNaN(g) ? "–" : (g % 1 === 0 ? g : g.toFixed(1));
    const analysis = n.analysis || "";
    const long = analysis.length > 180;
    const meta = [n.source, formatDrawerDate(n.date), n.category ? tCategory(n.category) : ""].filter(Boolean).map(escapeHtml).join(" · ");
    return `
        <article class="news-card">
            <div class="news-card-head">
                <span class="grade-chip" style="background:${gradeColor(g)}">${gradeLabel}</span>
                <div>
                    <h4 class="news-headline">${escapeHtml(n.headline || "—")}</h4>
                    <p class="news-meta">${meta}</p>
                </div>
            </div>
            ${analysis ? `<p class="news-analysis${long ? " clamp" : ""}">${escapeHtml(analysis)}</p>${gradeScaleHTML(n.grade)}` : ""}
            <div class="news-card-actions">
                ${long ? `<button type="button" class="read-more">${t("read_more")}</button>` : "<span></span>"}
                ${safeUrl(n.url) ? `<a class="news-original" href="${escapeHtml(safeUrl(n.url))}" target="_blank" rel="noopener">${t("read_original")} <i data-lucide="arrow-up-right"></i></a>` : ""}
            </div>
        </article>`;
}

async function loadDrawerNews(sort) {
    const body = document.getElementById("drawer-body");
    const meta = document.getElementById("drawer-meta");
    if (!body || !currentClickedDate) return;
    body.innerHTML = `<p class="drawer-state">${t("loading_data")}</p>`;

    const [field, dir] = (sort || "grade-desc").split("-");
    let res;
    try {
        res = await fetchDetailsData({
            evaluator: appState.evaluatorEntity,
            evaluated: appState.evaluatedEntity,
            category: appState.category,
            startDate: currentClickedDate.startDate,
            endDate: currentClickedDate.endDate,
            sort_by: field === "date" ? "date" : "grade",
            sort_dir: (dir || "desc").toUpperCase(),
            limit: 50,
            offset: 0
        });
    } catch (err) {
        console.error("Error loading drawer news:", err);
        body.innerHTML = `<p class="drawer-state">${t("drawer_error")}</p>`;
        return;
    }

    const list = (res && res.data) || [];
    const total = (res && res.total_count) || list.length;
    if (meta) meta.textContent = `${total > list.length ? `${list.length}/${total}` : total} ${t("drawer_count_label")}`;

    body.innerHTML = list.length ? list.map(newsCardHTML).join("") : `<p class="drawer-state">${t("drawer_empty")}</p>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function openNewsDrawer(dateLabel) {
    const drawer = document.getElementById("news-drawer");
    if (!drawer || !currentClickedDate) return;
    document.getElementById("drawer-date").textContent = dateLabel || formatDrawerDate(currentClickedDate.startDate);
    drawer.classList.remove("hidden");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
    const sort = document.getElementById("drawer-sort");
    loadDrawerNews(sort ? sort.value : "grade-desc");
}

function closeNewsDrawer() {
    const drawer = document.getElementById("news-drawer");
    if (!drawer) return;
    drawer.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
}

// Newsstand: 3-column newspaper view of the clicked point's news.
const newsstand = { neg: [], neu: [], pos: [] };
const newsstandIdx = { neg: 0, neu: 0, pos: 0 };
let newsstandSortDesc = true;

const bucketOf = grade => { const g = Math.round(Number(grade)); return g <= 3 ? "neg" : g === 4 ? "neu" : "pos"; };

// "News published between X and Y, evaluated by A about B" for the newsstand card.
function newsstandDescription() {
    if (!currentClickedDate) return "";
    const rev = Array.isArray(appState.evaluatorEntity) ? appState.evaluatorEntity : [appState.evaluatorEntity];
    const ent = Array.isArray(appState.evaluatedEntity) ? appState.evaluatedEntity : [appState.evaluatedEntity];
    return t("newsstand_desc")
        .replace("{start}", formatDrawerDate(currentClickedDate.startDate))
        .replace("{end}", formatDrawerDate(currentClickedDate.endDate))
        .replace("{evaluator}", rev.map(r => tEntity(r)).join(", "))
        .replace("{evaluated}", ent.map(e => tEntity(e)).join(", "));
}

async function updateNewsstand() {
    const dateEl = document.getElementById("newsstand-date");
    if (!currentClickedDate || !dateEl) return;
    dateEl.textContent = newsstandDescription();
    // Reveal the stand on first selection and drop the "click a point" hint
    document.getElementById("newsstand-hint")?.setAttribute("hidden", "");
    document.getElementById("newsstand-grid")?.removeAttribute("hidden");
    document.getElementById("newsstand-foot")?.removeAttribute("hidden");
    ["pos", "neu", "neg"].forEach(b => {
        const w = document.getElementById(`sheet-${b}`);
        if (w) w.innerHTML = `<p class="news-sheet-state">${t("loading_data")}</p>`;
    });
    let res;
    try {
        res = await fetchDetailsData({
            evaluator: appState.evaluatorEntity, evaluated: appState.evaluatedEntity,
            category: appState.category,
            startDate: currentClickedDate.startDate, endDate: currentClickedDate.endDate,
            limit: 150, offset: 0
        });
    } catch (err) {
        console.error("Error loading newsstand news:", err);
        ["pos", "neu", "neg"].forEach(b => {
            const w = document.getElementById(`sheet-${b}`);
            if (w) w.innerHTML = `<p class="news-sheet-state">${t("drawer_error")}</p>`;
        });
        return;
    }
    const list = (res && res.data) || [];
    newsstand.neg = list.filter(n => bucketOf(n.grade) === "neg");
    newsstand.neu = list.filter(n => bucketOf(n.grade) === "neu");
    newsstand.pos = list.filter(n => bucketOf(n.grade) === "pos");
    sortNewsstand();
    ["pos", "neu", "neg"].forEach(b => { newsstandIdx[b] = 0; renderSheet(b, false); });
}

function sortNewsstand() {
    const dir = newsstandSortDesc ? -1 : 1;
    ["pos", "neu", "neg"].forEach(b => newsstand[b].sort((a, c) => dir * (new Date(a.date) - new Date(c.date))));
}

// dir: +1 = turning to the next sheet, -1 = back to the previous, 0 = no animation
function renderSheet(bucket, animate = true, dir = 0) {
    const wrap = document.getElementById(`sheet-${bucket}`);
    if (!wrap) return;
    const postit = document.getElementById(`postit-${bucket}`);
    const list = newsstand[bucket];
    if (!list.length) {
        wrap.innerHTML = `<p class="news-sheet-state">${t("newsstand_empty")}</p>`;
        if (postit) postit.innerHTML = "";
        return;
    }
    const n = list[newsstandIdx[bucket]];
    const face = bucket === "neg" ? "frown" : bucket === "pos" ? "smile" : "meh";   // sad / indifferent / happy
    // Stacked meta: date (prominent) then category, one per line. The grade now
    // lives in the AI post-it (see gradeScaleHTML).
    const dateStr = escapeHtml(formatDrawerDate(n.date) || "");
    const catStr = escapeHtml(n.category ? tCategory(n.category) : "");
    const body = n.article_text || n.summary || "";   // the actual news text (not the AI justification)
    // Page indicator lives inside the paper: current sheet number + total in the pile
    const pageInfo = `${t("newsstand_page")} ${newsstandIdx[bucket] + 1}/${list.length} · ${list.length} ${t("newsstand_news_plural")}`;
    const single = list.length < 2 ? "disabled" : "";   // no page-turn when there is one sheet
    const sheetHtml = `
        <article class="news-sheet">
            <button type="button" class="news-turn prev" data-nav="prev" aria-label="${t("newsstand_prev")}" ${single}></button>
            <button type="button" class="news-turn next" data-nav="next" aria-label="${t("newsstand_next")}" ${single}></button>
            <div class="news-sheet-top">
                <span class="news-sheet-face bucket-${bucket}"><i data-lucide="${face}"></i></span>
                <div class="news-sheet-mast">
                    <div class="news-sheet-source">${escapeHtml(n.source || "—")}</div>
                    <p class="news-sheet-date">${dateStr}</p>
                    ${catStr ? `<p class="news-sheet-cat">${catStr}</p>` : ""}
                </div>
            </div>
            <h4 class="news-sheet-headline">${escapeHtml(n.headline || "—")}</h4>
            ${n.summary ? `<p class="news-sheet-subtitle">${escapeHtml(n.summary)}</p>` : ""}
            ${body ? `<p class="news-sheet-body">${escapeHtml(body)}</p>` : ""}
            <div class="news-sheet-foot">
                <span class="news-sheet-pageno">${pageInfo}</span>
                ${safeUrl(n.url) ? `<a class="news-sheet-detail" href="${escapeHtml(safeUrl(n.url))}" target="_blank" rel="noopener">${t("newsstand_detail")} ↗</a>` : ""}
            </div>
        </article>`;
    const postitHtml = n.analysis
        ? `<div class="news-postit-title">${t("postit_title")}</div><p class="news-postit-body">${escapeHtml(n.analysis)}</p>${gradeScaleHTML(n.grade)}`
        : "";
    const paint = () => {
        wrap.dataset.dir = dir > 0 ? "next" : dir < 0 ? "prev" : "";
        wrap.innerHTML = sheetHtml;
        if (postit) {
            postit.classList.remove("postit-peel");
            postit.innerHTML = postitHtml;
            if (animate && postitHtml) {
                postit.classList.remove("postit-paste");
                void postit.offsetWidth;             // restart the paste-in animation
                postit.classList.add("postit-paste");
            }
        }
        if (typeof lucide !== "undefined") lucide.createIcons();
    };
    const old = animate ? wrap.querySelector(".news-sheet") : null;
    if (old) {
        old.classList.add(dir < 0 ? "tear-prev" : "tear-next");   // peel the current sheet away
        if (postit) postit.classList.add("postit-peel");
        setTimeout(paint, 200);
    } else {
        paint();
    }
}

function stepSheet(bucket, delta) {
    const list = newsstand[bucket];
    if (list.length < 2) return;
    newsstandIdx[bucket] = (newsstandIdx[bucket] + delta + list.length) % list.length;
    renderSheet(bucket, true, delta);
}

function initNewsstand() {
    const grid = document.getElementById("newsstand-grid");
    if (grid) grid.addEventListener("click", (e) => {
        const col = e.target.closest(".newsstand-col");
        if (!col) return;
        const nav = e.target.closest("[data-nav]");
        if (nav) stepSheet(col.dataset.bucket, nav.dataset.nav === "prev" ? -1 : 1);
    });
    // Single, centred "open in table" action for the whole section
    const tableBtn = document.getElementById("newsstand-table-btn");
    if (tableBtn) tableBtn.addEventListener("click", () => {
        if (currentClickedDate) window.open(`details.html?${detailsUrlParams()}`, "_blank");
    });
    const sortBtn = document.getElementById("newsstand-sort");
    if (sortBtn) sortBtn.addEventListener("click", () => {
        newsstandSortDesc = !newsstandSortDesc;
        const span = sortBtn.querySelector("span");
        if (span) span.textContent = newsstandSortDesc ? t("newsstand_sort_recent") : t("newsstand_sort_old");
        sortNewsstand();
        ["pos", "neu", "neg"].forEach(b => { newsstandIdx[b] = 0; renderSheet(b, false); });
    });
}

// Drag the left edge to resize the panel; cards reflow to the new width
function initDrawerResize() {
    const handle = document.querySelector(".drawer-resize");
    const panel = document.querySelector(".drawer-panel");
    if (!handle || !panel) return;
    const MIN = 320;
    let dragging = false;

    handle.addEventListener("pointerdown", (e) => {
        dragging = true;
        handle.setPointerCapture(e.pointerId);
        document.body.classList.add("drawer-resizing");
        e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const max = Math.min(window.innerWidth * 0.92, 900);
        panel.style.width = `${Math.min(max, Math.max(MIN, window.innerWidth - e.clientX))}px`;
    });
    const stop = (e) => {
        if (!dragging) return;
        dragging = false;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        document.body.classList.remove("drawer-resizing");
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
}

// Monotonic id so a slow response from an older apply never overwrites a newer one.
let dashboardRequestId = 0;

async function updateDashboard() {
    const requestId = ++dashboardRequestId;
    animateNextDraw = true;   // fresh data: charts and counters animate in
    setChartsAnimation(true);
    const btnApply = document.getElementById("btn-apply");
    if (btnApply) {
        btnApply.innerHTML = `
            <span class="css-spinner css-spinner--inline"></span>
            <span data-i18n="btn_apply">${t("btn_apply")}</span>
        `;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
        btnApply.disabled = true;
        btnApply.style.opacity = "0.8";
        btnApply.style.cursor = "wait";
    }

    const apiFilters = {
        evaluator: appState.evaluatorEntity, 
        evaluated: appState.evaluatedEntity, 
        category: appState.category,
        aggregation: appState.aggregation
    };
    
    if (appState.isDynamic) {
        apiFilters.period = appState.periodValue; 
        apiFilters.startDate = null; 
        apiFilters.endDate = null;
    } else {
        apiFilters.startDate = appState.customStartDate; 
        apiFilters.endDate = appState.customEndDate; 
        apiFilters.period = null;
    }

    try {
        const results = await Promise.allSettled([
            fetchGradesHistogramData(apiFilters),   
            fetchVolumeChartData(apiFilters),       
            fetchGaugeData(apiFilters),             
            fetchLineChartData(apiFilters)          
        ]);

        if (requestId !== dashboardRequestId) return;   // a newer apply superseded this one

        const [histogramData, volumeData, gaugeVal, lineData] = results.map(res =>
            res.status === "fulfilled" ? res.value : null
        );

        cachedApiData = { histogramData, volumeData, gaugeVal, lineData };

        if (histogramData) processAndUpdateHistogramChart(histogramData);
        const totalNewsCount = processAndUpdateVolumeChart(volumeData);
        processAndUpdateGaugeDisplay(gaugeVal);
        updateEvolutionHeader(totalNewsCount);
        
        try {
            if (lineData) {
                processAndUpdateLineChart(lineData);
            } else if (results[3].status === "rejected") {
                console.error("Line chart error:", results[3].reason);
            }
        } catch (e) {
            console.error("Error updating line chart:", e);
        }
    } catch (err) {
        console.error("Erro dashboard:", err);
        const totalNewsEl = document.getElementById("total-news");
        if (totalNewsEl) totalNewsEl.textContent = "Erro";
    } finally {
        // Only the latest request may restore the button (an in-flight newer one owns it).
        if (btnApply && requestId === dashboardRequestId) {
            const restoreButton = () => {
                btnApply.classList.remove("success");
                btnApply.innerHTML = `
                <i data-lucide="check-circle" class="icon-sm"></i>
                <span data-i18n="btn_apply">${t("btn_apply")}</span>
                `;
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
                // Clear the loading overrides and let pending-vs-applied state drive the look:
                // the active (light blue) style only shows while a filter change is pending.
                btnApply.style.opacity = "";
                btnApply.style.cursor = "";
                checkApplyButtonState();
            };
            if (REDUCED_MOTION) {
                restoreButton();
            } else {
                // Brief green check confirming the data landed, then back to normal.
                btnApply.classList.add("success");
                btnApply.style.opacity = "";
                btnApply.style.cursor = "";
                btnApply.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
                <span>${t("btn_apply")}</span>
                `;
                setTimeout(restoreButton, 900);
            }
        }
    }
}

function redrawCharts() {
    if (!cachedApiData.histogramData) return;
    animateNextDraw = false;   // cosmetic redraw (theme/language): no entry animation
    setChartsAnimation(false);
    processAndUpdateHistogramChart(cachedApiData.histogramData);
    processAndUpdateVolumeChart(cachedApiData.volumeData);
    processAndUpdateGaugeDisplay(cachedApiData.gaugeVal);
    processAndUpdateLineChart(cachedApiData.lineData);
}

document.addEventListener("DOMContentLoaded", function () {
    applyUrlState();
    initLanguageSelector();
    initThemeToggle();
    updateModeLed();

    // Cards cascade in on first load.
    if (!REDUCED_MOTION) {
        document.querySelectorAll(".card").forEach((card, i) => {
            card.style.setProperty("--enter-delay", `${i * 70}ms`);
            card.classList.add("card-enter");
            card.addEventListener("animationend", () => card.classList.remove("card-enter"), { once: true });
        });
    }

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
    if (typeof tippy !== "undefined") {
        tippy(".info-icon", INFO_TIPPY_OPTS);
    }

    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const mobileFilterText = document.getElementById("mobile-filter-text");
    const filtersWrapper = document.getElementById("filters-wrapper");

    if (mobileFilterBtn && filtersWrapper) {
        mobileFilterBtn.addEventListener("click", () => {
            const isOpen = filtersWrapper.classList.toggle("open");
            mobileFilterBtn.classList.toggle("expanded");

            const textKey = isOpen ? "btn_hide_filters" : "btn_show_filters";
            if (mobileFilterText) mobileFilterText.textContent = t(textKey);

            if (typeof lucide !== "undefined") lucide.createIcons();
            // The fields were display:none while collapsed, so their summaries
            // were fitted against a zero width; redo it now that they can measure.
            if (isOpen) refitFilterSummaries();
        });
    }

    const clearFiltersBtn = document.getElementById("btn-clear-filters");
    if (clearFiltersBtn) clearFiltersBtn.addEventListener("click", resetFilters);

    // The mode toggle sits in the filter row on wide screens; on phones it moves
    // back to the header band so it stays visible while the row is collapsed
    // behind "Show filters". Listeners/tooltips survive the reparenting.
    const modeCell = document.getElementById("mode-cell");
    const toggleHome = document.querySelector(".filters-header");
    const toggleContainer = document.querySelector(".toggle-container");
    const modeMq = window.matchMedia("(max-width: 768px)");
    const placeModeToggle = () => {
        if (!modeCell || !toggleHome || !toggleContainer) return;
        const target = modeMq.matches ? toggleHome : modeCell;
        if (toggleContainer.parentElement !== target) {
            target.appendChild(toggleContainer);
            refitFilterSummaries();   // the move changes the fields' widths
        }
    };
    placeModeToggle();
    modeMq.addEventListener("change", placeModeToggle);

    // Summary fitting depends on field width: refit after viewport resizes settle.
    let summaryRefitTimer;
    window.addEventListener("resize", () => {
        clearTimeout(summaryRefitTimer);
        summaryRefitTimer = setTimeout(refitFilterSummaries, 120);
    });

    const filterSection = document.getElementById("filters-container");
    const brandHeader = document.querySelector(".brand-header");
    const navDots = document.querySelectorAll(".nav-dot");
    // Scroll-spy only over sections a dot points to; other ids (e.g. the
    // filter bar) would otherwise match no dot and clear the active state.
    const dotTargets = new Set([...navDots].map(dot => dot.getAttribute("href").slice(1)));
    const sections = [...document.querySelectorAll("header, section, main")].filter(s => dotTargets.has(s.id));
    const confirmPopup = document.getElementById("chart-popup");

    // Compact-header thresholds. The gap between them is hysteresis: shrinking the
    // header reflows content and nudges scrollY, which with a single threshold would
    // re-cross it and oscillate ("pulsing"). COMPACT_ON also sits past the header
    // height so it collapses off-screen, never leaving a blank strip above the filters.
    const COMPACT_ON = 110;
    const COMPACT_OFF = 40;
    let scrollTicking = false;

    const onScrollFrame = () => {
        scrollTicking = false;
        const scrollY = window.scrollY;

        const isCompact = brandHeader && brandHeader.classList.contains("compact");
        if (!isCompact && scrollY > COMPACT_ON) {
            if (filterSection) filterSection.classList.add("compact");
            if (brandHeader) brandHeader.classList.add("compact");
            refitFilterSummaries();   // compact mode shrinks the summary font
        } else if (isCompact && scrollY < COMPACT_OFF) {
            if (filterSection) filterSection.classList.remove("compact");
            if (brandHeader) brandHeader.classList.remove("compact");
            refitFilterSummaries();
        }

        let current = "";
        sections.forEach(section => {
            if (scrollY >= (section.offsetTop - 100)) current = section.getAttribute("id");
        });
        navDots.forEach(dot => {
            dot.classList.toggle("active", dot.getAttribute("href").includes(current));
        });

        if (confirmPopup && !confirmPopup.classList.contains("hidden")) {
            confirmPopup.classList.add("hidden");
        }
        if (typeof tippy !== "undefined" && tippy.hideAll) tippy.hideAll();
        clearLineChartSelection();   // cheap no-op when nothing is selected
    };

    // Coalesce scroll events to one update per frame.
    window.addEventListener("scroll", () => {
        if (!scrollTicking) {
            scrollTicking = true;
            requestAnimationFrame(onScrollFrame);
        }
    }, { passive: true });

    document.addEventListener("click", (e) => {
        if (confirmPopup && !e.target.closest("#chart-popup")) {
            confirmPopup.classList.add("hidden");
        }
    });

    initNewsstand();

    const newsDrawer = document.getElementById("news-drawer");
    if (newsDrawer) {
        initDrawerResize();
        newsDrawer.querySelectorAll("[data-drawer-close]").forEach(el => el.addEventListener("click", closeNewsDrawer));

        const drawerSort = document.getElementById("drawer-sort");
        if (drawerSort) drawerSort.addEventListener("change", () => loadDrawerNews(drawerSort.value));

        const openFull = document.getElementById("drawer-open-full");
        if (openFull) openFull.addEventListener("click", () => {
            if (currentClickedDate) window.open(`details.html?${detailsUrlParams()}`, "_blank");
        });

        // Toggle the "read more" clamp on each card
        document.getElementById("drawer-body").addEventListener("click", (e) => {
            const btn = e.target.closest(".read-more");
            if (!btn) return;
            const clamped = btn.closest(".news-card").querySelector(".news-analysis").classList.toggle("clamp");
            btn.textContent = clamped ? t("read_more") : t("read_less");
        });

        document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNewsDrawer(); });
    }

    initializeFilters();
    setTimeout(updateDashboard, 100);

    // Gauge "last update" footer: read the latest ingested data date, then keep the
    // relative label fresh (the value only changes by the minute, so a 60s tick is plenty).
    updateGaugeTooltip();
    loadLastUpdate();
    if (lastUpdateInterval) clearInterval(lastUpdateInterval);
    lastUpdateInterval = setInterval(renderLastUpdate, LAST_UPDATE_TICK_MS);
});

async function loadLastUpdate() {
    try {
        const stats = await fetchStats();
        // computed_at = when the pipeline last refreshed the data (true "last upload",
        // with minute precision). Fall back to last_date (date-only) if it's absent.
        const raw = stats && (stats.computed_at || stats.last_date);
        if (raw) {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) lastDataDate = d;
        }
    } catch (e) {
        console.error("Error loading last-update stats:", e);
    }
    renderLastUpdate();
}
