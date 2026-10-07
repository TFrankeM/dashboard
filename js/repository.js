import { DICTIONARY } from "./i18n.js";

// Global State
let CURRENT_LANG = "pt-BR";
let ACTIVE_CATEGORY = "all";
let SEARCH_QUERY = "";
let choicesLanguage = null;

const LANG_STORAGE_KEY = "iipex_lang";
const THEME_STORAGE_KEY = "iipex_theme";

// Files catalog
const REPO_FILES = [
    {
        filename: "dados_noticias_2025.csv",
        category: "data",
        size: "84.4 MB",
        icon: "database",
        titleKey: "repo_file_dados_noticias_title",
        descKey: "repo_file_dados_noticias_desc",
        url: "repository/dados_noticias_2025.csv"
    },
    {
        filename: "dados_dicionario.csv",
        category: "data",
        size: "4.3 KB",
        icon: "table",
        titleKey: "repo_file_dados_dicionario_title",
        descKey: "repo_file_dados_dicionario_desc",
        url: "repository/dados_dicionario.csv"
    },
    {
        filename: "dados_LEIA-ME.txt",
        category: "data",
        size: "974 B",
        icon: "file-text",
        titleKey: "repo_file_dados_leiame_title",
        descKey: "repo_file_dados_leiame_desc",
        url: "repository/dados_LEIA-ME.txt"
    },
    {
        filename: "resultados_esperados_categorias_2025.csv",
        category: "benchmarks",
        size: "918 B",
        icon: "bar-chart-3",
        titleKey: "repo_file_res_categorias_title",
        descKey: "repo_file_res_categorias_desc",
        url: "repository/resultados_esperados_categorias_2025.csv"
    },
    {
        filename: "resultados_esperados_concentracao_veiculos.csv",
        category: "benchmarks",
        size: "208 B",
        icon: "pie-chart",
        titleKey: "repo_file_res_veiculos_title",
        descKey: "repo_file_res_veiculos_desc",
        url: "repository/resultados_esperados_concentracao_veiculos.csv"
    },
    {
        filename: "codigo_p2_classificacao_tematica.py",
        category: "scripts",
        size: "5.1 KB",
        icon: "code",
        titleKey: "repo_file_cod_p2_title",
        descKey: "repo_file_cod_p2_desc",
        url: "repository/codigo_p2_classificacao_tematica.py"
    },
    {
        filename: "codigo_p3_analise_sentimento.py",
        category: "scripts",
        size: "12.0 KB",
        icon: "code",
        titleKey: "repo_file_cod_p3_title",
        descKey: "repo_file_cod_p3_desc",
        url: "repository/codigo_p3_analise_sentimento.py"
    },
    {
        filename: "codigo_prompts_iipex.py",
        category: "scripts",
        size: "8.5 KB",
        icon: "code",
        titleKey: "repo_file_cod_prompts_title",
        descKey: "repo_file_cod_prompts_desc",
        url: "repository/codigo_prompts_iipex.py"
    },
    {
        filename: "prompts_requirements.txt",
        category: "scripts",
        size: "455 B",
        icon: "list-checks",
        titleKey: "repo_file_requirements_title",
        descKey: "repo_file_requirements_desc",
        url: "repository/prompts_requirements.txt"
    },
    {
        filename: "prompts_P2_prompt_classificacao_tematica.txt",
        category: "prompts",
        size: "620 B",
        icon: "message-square-text",
        titleKey: "repo_file_prompt_p2_title",
        descKey: "repo_file_prompt_p2_desc",
        url: "repository/prompts_P2_prompt_classificacao_tematica.txt"
    },
    {
        filename: "prompts_P3_prompt_analise_sentimento.txt",
        category: "prompts",
        size: "3.1 KB",
        icon: "message-square-text",
        titleKey: "repo_file_prompt_p3_title",
        descKey: "repo_file_prompt_p3_desc",
        url: "repository/prompts_P3_prompt_analise_sentimento.txt"
    },
    {
        filename: "prompts_README.md.txt",
        category: "prompts",
        size: "3.5 KB",
        icon: "book-open",
        titleKey: "repo_file_prompt_readme_title",
        descKey: "repo_file_prompt_readme_desc",
        url: "repository/prompts_README.md.txt"
    },
    {
        filename: "Guia_de_Replicacao_IIPEx.docx",
        category: "docs",
        size: "38.0 KB",
        icon: "file-check",
        titleKey: "repo_file_guia_title",
        descKey: "repo_file_guia_desc",
        url: "repository/Guia_de_Replicacao_IIPEx.docx"
    },
    {
        filename: "CITATION.cff",
        category: "docs",
        size: "1.3 KB",
        icon: "quote",
        titleKey: "repo_file_citation_title",
        descKey: "repo_file_citation_desc",
        url: "repository/CITATION.cff"
    },
    {
        filename: "LICENSE",
        category: "docs",
        size: "2.0 KB",
        icon: "shield",
        titleKey: "repo_file_license_title",
        descKey: "repo_file_license_desc",
        url: "repository/LICENSE"
    }
];

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
        if (langWrapper && window.matchMedia("(hover: hover)").matches) {
            let timeout;
            langWrapper.addEventListener("mouseenter", () => {
                clearTimeout(timeout);
                choicesLanguage.showDropdown();
            });
            langWrapper.addEventListener("mouseleave", () => {
                timeout = setTimeout(() => choicesLanguage.hideDropdown(), 300);
            });
        }

        document.getElementById("language-select").addEventListener("change", (e) => {
            CURRENT_LANG = e.target.value;
            document.documentElement.lang = CURRENT_LANG;
            localStorage.setItem(LANG_STORAGE_KEY, CURRENT_LANG);
            translateUI();
            renderFileList();
        });
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
        const title = (t(file.titleKey) || "").toLowerCase();
        const desc = (t(file.descKey) || "").toLowerCase();
        return fname.includes(q) || title.includes(q) || desc.includes(q);
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="repo-empty-state">
                <i data-lucide="search-x" style="width: 36px; height: 36px; margin: 0 auto 12px auto; display: block; opacity: 0.5;"></i>
                <p>${escapeHtml(t("no_data_found") || "Nenhum arquivo encontrado")}</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    container.innerHTML = filtered.map(file => {
        const categoryLabel = t(CATEGORY_NAMES[file.category]) || file.category;
        const fileTitle = t(file.titleKey) || file.filename;
        const fileDesc = t(file.descKey) || "";
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
                            <span class="file-size-badge">${escapeHtml(file.size)}</span>
                        </div>
                        <h3 class="file-title">${escapeHtml(fileTitle)}</h3>
                        <p class="file-desc">${escapeHtml(fileDesc)}</p>
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
    renderFileList();

    if (window.lucide) {
        lucide.createIcons();
    }
});
