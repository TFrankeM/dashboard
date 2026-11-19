import { DICTIONARY } from "./i18n.js";

// Global State
let CURRENT_LANG = "pt-BR";
let ACTIVE_CATEGORY = "all";
let SEARCH_QUERY = "";
let choicesLanguage = null;

const LANG_STORAGE_KEY = "iipex_lang";
const THEME_STORAGE_KEY = "iipex_theme";

// Files catalog: served by /api/repository (edited in admin.html). Each
// entry is { filename, category, size, icon, url }; "size" is preformatted.
let REPO_FILES = [];
let CATALOG_ERROR = false;

const CATALOG_ENDPOINT = "/api/repository";

// Decimal units (1 MB = 1,000,000 B), one decimal above bytes.
function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1000) return `${n} B`;
    if (n < 1e6) return `${(n / 1e3).toFixed(1)} KB`;
    if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
    return `${(n / 1e9).toFixed(1)} GB`;
}

async function loadCatalog() {
    try {
        const res = await fetch(CATALOG_ENDPOINT, { cache: "no-store" });
        if (!res.ok) throw new Error(`GET ${CATALOG_ENDPOINT} → ${res.status}`);
        const payload = await res.json();
        REPO_FILES = (payload.docs || []).map(doc => ({
            filename: doc.file,
            category: doc.category,
            size: doc.bytes === null || doc.bytes === undefined ? "" : formatBytes(doc.bytes),
            icon: doc.icon,
            url: doc.url || `repository/${encodeURIComponent(doc.file)}`,
        }));
        CATALOG_ERROR = false;
    } catch (error) {
        console.error("repository catalog:", error);
        REPO_FILES = [];
        CATALOG_ERROR = true;
    }
    renderTabCounts();
    renderFileList();
}

function renderTabCounts() {
    document.querySelectorAll(".repo-tab").forEach(tab => {
        const category = tab.getAttribute("data-category") || "all";
        const count = category === "all"
            ? REPO_FILES.length
            : REPO_FILES.filter(file => file.category === category).length;
        const badge = tab.querySelector(".repo-tab-count");
        if (badge) badge.textContent = String(count);
    });
}

const CATEGORY_NAMES = {
    data: "repo_tab_data",
    benchmarks: "repo_tab_benchmarks",
    scripts: "repo_tab_scripts",
    prompts: "repo_tab_prompts",
    docs: "repo_tab_docs"
};

function t(key) {
    return (DICTIONARY[CURRENT_LANG] && DICTIONARY[CURRENT_LANG][key]) || key;
}

function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[m]));
}

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
    requestAnimationFrame(() => document.documentElement.classList.add("theme-anim"));
    btn.addEventListener("click", () => {
        const toDark = document.documentElement.dataset.theme !== "dark";
        if (toDark) document.documentElement.dataset.theme = "dark";
        else delete document.documentElement.dataset.theme;
        localStorage.setItem(THEME_STORAGE_KEY, toDark ? "dark" : "light");
        updateThemeToggleAria();
    });
}

function translateUI() {
    const texts = DICTIONARY[CURRENT_LANG];
    if (!texts) return;

    // Document title
    if (texts.repo_page_title) {
        document.title = texts.repo_page_title;
    }

    // Text elements
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (texts[key]) {
            el.textContent = texts[key];
        }
    });

    // Image src elements (e.g. logos)
    document.querySelectorAll("[data-i18n-img]").forEach(el => {
        const key = el.getAttribute("data-i18n-img");
        if (texts[key]) {
            el.src = texts[key];
        }
    });

    // Tooltip/title attributes
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        if (texts[key]) {
            el.setAttribute("title", texts[key]);
        }
    });

    // Placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (texts[key]) {
            el.setAttribute("placeholder", texts[key]);
        }
    });

    updateThemeToggleAria();
}

const HOVER_CLOSE_DELAY_MS = 150;

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

function initLanguageSelector() {
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
                translateUI();
                renderFileList();
            });
        }
    }
}

function renderFileList() {
    const container = document.getElementById("repo-file-list");
    if (!container) return;

    const filtered = REPO_FILES.filter(file => {
        const matchesCategory = ACTIVE_CATEGORY === "all" || file.category === ACTIVE_CATEGORY;
        if (!matchesCategory) return false;

        if (!SEARCH_QUERY) return true;
        const q = SEARCH_QUERY.toLowerCase();
        const fname = file.filename.toLowerCase();
        return fname.includes(q);
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="repo-empty-state">
                <i data-lucide="search-x" style="width: 36px; height: 36px; margin: 0 auto 12px auto; display: block; opacity: 0.5;"></i>
                <p>${escapeHtml(CATALOG_ERROR ? (t("repo_catalog_error") || "Catálogo indisponível") : (t("no_data_found") || "Nenhum arquivo encontrado"))}</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    container.innerHTML = filtered.map(file => {
        const categoryLabel = t(CATEGORY_NAMES[file.category]) || file.category;
        const downloadBtnText = t("repo_btn_download") || "Baixar";

        return `
            <div class="repo-file-card cat-${escapeHtml(file.category)}">
                <div class="file-card-left">
                    <div class="file-icon-box">
                        <i data-lucide="${escapeHtml(file.icon)}"></i>
                    </div>
                    <div class="file-meta-content">
                        <div class="file-header-row">
                            <span class="file-name-code">${escapeHtml(file.filename)}</span>
                            <span class="file-category-badge">${escapeHtml(categoryLabel)}</span>
                            ${file.size ? `<span class="file-size-badge">${escapeHtml(file.size)}</span>` : ""}
                        </div>
                    </div>
                </div>
                <div class="file-card-right">
                    <a href="${escapeHtml(file.url)}" download class="btn-download-file">
                        <i data-lucide="download" style="width: 16px; height: 16px;"></i>
                        <span>${escapeHtml(downloadBtnText)}</span>
                    </a>
                </div>
            </div>
        `;
    }).join("");

    if (window.lucide) {
        lucide.createIcons();
    }
}

function initTabs() {
    const tabs = document.querySelectorAll(".repo-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            ACTIVE_CATEGORY = tab.getAttribute("data-category") || "all";
            renderFileList();
        });
    });
}

function initSearch() {
    const searchInput = document.getElementById("repo-search");
    if (!searchInput) return;

    searchInput.addEventListener("input", (e) => {
        SEARCH_QUERY = e.target.value.trim();
        renderFileList();
    });
}

// Initialization on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    initLanguageSelector();
    initTabs();
    initSearch();
    translateUI();
    loadCatalog();

    if (window.lucide) {
        lucide.createIcons();
    }
});
