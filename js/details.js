import { DICTIONARY } from "./i18n.js";
import { fetchDetailsData, fetchRelationships } from "./api_adapter.js";

// Global state variables
let CURRENT_LANG = "pt-BR";
let choicesLanguage = null;
let currentLimit = 50;
let currentOffset = 0;

let currentSortColumn = "date";
let currentSortDirection = "asc";

let appState = {
    category: ["include_all"],
    startDate: "",
    endDate: "",
    evaluatorEntity: [],
    evaluatedEntity: []
};
let pendingState = JSON.parse(JSON.stringify(appState));

/*
CREATE INDEX idx_noticias_date ON noticias(date);
CREATE INDEX idx_noticias_grade ON noticias(grade);

CREATE INDEX idx_noticias_source ON noticias(source);
CREATE INDEX idx_noticias_category ON noticias(category);
CREATE INDEX idx_noticias_language ON noticias(language);

CREATE INDEX idx_noticias_evaluator ON noticias(evaluator_entity);
CREATE INDEX idx_noticias_evaluated ON noticias(evaluated_entity);

these the ordering doesn't work
CREATE INDEX idx_noticias_headline ON noticias(headline);
CREATE INDEX idx_noticias_summary ON noticias(summary);
*/

const COLUMNS = [
    { key: "date", labelKey: "col_date", type: "date", expandable: false, sortable: true},
    { key: "headline", labelKey: "col_headline", expandable: true, sortable: false },
    { key: "summary", labelKey: "col_summary", expandable: true, sortable: false },
    { key: "article_text", labelKey: "col_article_text", expandable: true , sortable: false },
    { key: "source", labelKey: "col_source", expandable: true , sortable: true },
    { key: "category", labelKey: "col_category", expandable: false, sortable: true },
    { key: "evaluator_entity", labelKey: "col_evaluator", expandable: false, sortable: true },
    { key: "evaluated_entity", labelKey: "col_evaluated", expandable: false, sortable: true },
    { key: "grade", labelKey: "col_grade", type: "number", expandable: false, sortable: true },
    { key: "analysis", labelKey: "col_analysis", expandable: true , sortable: false },
    { key: "url", labelKey: "col_link", type: "link", expandable: false, sortable: false },
];

let visibleColumns = {
    date: true, 
    language: false,
    category: true, 
    headline: true, 
    source: true, 
    summary: false, 
    article_text: false, 
    evaluator_entity: false,
    evaluated_entity: false,
    grade: true, 
    analysis: true, 
    url: true,
};

let RELATIONSHIPS = {};


// Data is stored in UTC; every user-facing datetime renders in Brasília time.
const DISPLAY_TZ = "America/Sao_Paulo";

function t(key) {
    return (DICTIONARY[CURRENT_LANG] && DICTIONARY[CURRENT_LANG][key]) || key;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// News URLs come from scraped external data; only http(s) links may become hrefs.
function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";
}

function tCategory(val) {
    return DICTIONARY[CURRENT_LANG].category_options?.[val] || val;
}

function tEntity(val) {
    return DICTIONARY[CURRENT_LANG].entity_options?.[val] || val;
}

const LANG_STORAGE_KEY = "iibex_lang";

function initLanguageSelector() {
    /* Initializes the language selector dropdown and sets up event listeners to handle language changes. */
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

        document.getElementById("language-select").addEventListener("change", (e) => {
            CURRENT_LANG = e.target.value;
            document.documentElement.lang = CURRENT_LANG;
            localStorage.setItem(LANG_STORAGE_KEY, CURRENT_LANG);

            // Locale-based date reformatting
            const rawDate = new URLSearchParams(window.location.search).get("date");
            if (rawDate) {
                const dateObj = new Date(rawDate);
                if (!isNaN(dateObj)) {
                    document.getElementById("date-span").textContent = dateObj.toLocaleDateString(CURRENT_LANG, { timeZone: "UTC" });
                }
            }
            
            updateFilterSummary(new URLSearchParams(window.location.search));
            translateUI();
            renderColumnSelector();
            
            const currentData = window.cachedData || [];
            if(currentData.length > 0) {
                renderTableHeaders();
                renderTableBody(currentData);
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
        }, 300);
    };

    wrapperElement.addEventListener("mouseenter", open);
    wrapperElement.addEventListener("mouseleave", close);
}

/**
 * Helper to enable hover behavior on generic .dropdown elements
 * @param {HTMLElement} dropdownElement 
 */
function enableHoverToGenericDropdown(dropdownElement) {
    if (!dropdownElement || !window.matchMedia("(hover: hover)").matches) return;

    let timeout;
    const open = () => {
        clearTimeout(timeout);
        // Close other open dropdowns first to avoid overlaps
        document.querySelectorAll(".dropdown.is-open").forEach(d => {
            if (d !== dropdownElement) d.classList.remove("is-open");
        });
        dropdownElement.classList.add("is-open");
    };
    const close = () => {
        timeout = setTimeout(() => {
            dropdownElement.classList.remove("is-open");
        }, 300);
    };

    dropdownElement.addEventListener("mouseenter", open);
    dropdownElement.addEventListener("mouseleave", close);
}


function translateUI() {
    /* Translate all text elements with data-i18n attribute and also handles image 
    translations for elements with the data-i18n-img attribute. */
    const texts = DICTIONARY[CURRENT_LANG];
    if (!texts) return;

    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (texts[key]) {
            el.textContent = texts[key];
        }
    });

    document.querySelectorAll("[data-i18n-img]").forEach(el => {
        const key = el.getAttribute("data-i18n-img");
        if (texts[key]) {
            el.src = texts[key];
        }
    });

    document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        if (texts[key]) {
            el.setAttribute("title", texts[key]);
        }
    });

    const searchInputs = document.querySelectorAll(".dropdown-search");
    searchInputs.forEach(input => {
        input.placeholder = t("placeholder_search");
    });

    // Icon-only pagination buttons need accessible names.
    const prevBtn = document.getElementById("prev-page");
    if (prevBtn) prevBtn.setAttribute("aria-label", t("aria_prev_page"));
    const nextBtn = document.getElementById("next-page");
    if (nextBtn) nextBtn.setAttribute("aria-label", t("aria_next_page"));

    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const mobileFilterText = document.getElementById("mobile-filter-text");
    const filtersWrapper = document.getElementById("filters-wrapper");

    if (mobileFilterBtn && filtersWrapper && mobileFilterText) {
        const isOpen = filtersWrapper.classList.contains("open");
        mobileFilterText.textContent = isOpen ? t("btn_hide_filters") : t("btn_show_filters");
    }

    // Placeholder-only date inputs: keep placeholder and accessible name in sync
    // (flatpickr swaps in an altInput, which is the element users actually see).
    [["start-date", "placeholder_start_date"], ["end-date", "placeholder_end_date"]].forEach(([id, key]) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.placeholder = t(key);
        input.setAttribute("aria-label", t(key));
        if (input._flatpickr && input._flatpickr.altInput) {
            input._flatpickr.altInput.placeholder = t(key);
            input._flatpickr.altInput.setAttribute("aria-label", t(key));
        }
    });

    COLUMNS.forEach(col => {
        col.label = t(col.labelKey);
    });

    const theadRow = document.getElementById("table-header");
    if (theadRow && theadRow.innerHTML.trim() !== "") {
        renderTableHeaders();
    }
}


function checkApplyButtonState() {
    /* Checks if there are any changes in the filter inputs compared to the 
    current app state and enables/disables the Apply button accordingly. */
    const normalize = (s) => {
        const copy = JSON.parse(JSON.stringify(s));
        if(Array.isArray(copy.evaluatorEntity)) copy.evaluatorEntity.sort();
        if(Array.isArray(copy.evaluatedEntity)) copy.evaluatedEntity.sort();
        if(Array.isArray(copy.category)) copy.category.sort();
        return JSON.stringify(copy);
    };

    const isDifferent = normalize(appState) !== normalize(pendingState);
    const btnApply = document.getElementById("btn-apply");

    if (btnApply) {
        if (isDifferent) {
            btnApply.classList.remove("disabled");  /*removes the visual styling from CSS*/
            btnApply.removeAttribute("disabled");   /*tells the browser that the button is now active*/
        } else {
            btnApply.classList.add("disabled");
            btnApply.setAttribute("disabled", "true");
        }
    }
}


async function initializeFilters(urlParams) {
    /* Initializes the filter UI components (categories, evaluator, evaluated, date range) based 
    on the current URL parameters and sets up event listeners to handle user interactions. */
    
    // Fetch dynamic relationships from DB
    try {
        RELATIONSHIPS = await fetchRelationships();
    } catch (err) {
        console.error("Error fetching relationships:", err);
    }

    // Categories
    appState.category = urlParams.getAll("category").sort();
    if (appState.category.length === 0) appState.category = ["include_all"];
    
    appState.startDate = urlParams.get("startDate") || "";
    appState.endDate = urlParams.get("endDate") || "";
    appState.evaluatorEntity = urlParams.getAll("evaluatorEntity").sort();
    appState.evaluatedEntity = urlParams.getAll("evaluatedEntity").sort();
    
    pendingState = JSON.parse(JSON.stringify(appState));

    /* Categories */
    const catContent = document.getElementById("category-selector");
    if (catContent) {
        catContent.innerHTML = "";
        const allCategories = Object.keys(DICTIONARY[CURRENT_LANG].category_options || {});
        
        allCategories.forEach(cat => {
            const label = document.createElement("label");
            label.className = "col-option";
            
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = cat;
            checkbox.checked = pendingState.category.includes(cat);
            
            checkbox.addEventListener("change", (e) => {
                if (e.target.checked) {
                    if (!pendingState.category.includes(cat)) {
                        pendingState.category.push(cat);
                    }
                } else { /* unchecked */
                    pendingState.category = pendingState.category.filter(c => c !== cat);
                }
                enforceMultiSelectConstraints("category");
                checkApplyButtonState();
                renderCategorySummary();
            });
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(" " + tCategory(cat)));
            catContent.appendChild(label);
        });
    }

    setupEntityDropdown("evaluatorEntity");
    setupEntityDropdown("evaluatedEntity");
    renderCategorySummary();

    function setupEntityDropdown(type) {
        const containerId = type === "evaluatorEntity" ? "evaluator-selector" : "evaluated-selector";
        const container = document.getElementById(containerId);
        if (!container) return;

        // Inner structure: fixed search field and scrollable list
        const pText = t("placeholder_search");
        const fPlaceholder = (pText === "placeholder_search") ? "Procurar..." : pText;

        container.innerHTML = `
            <div class="dropdown-search-wrapper">
                <input type="text" class="dropdown-search" placeholder="${fPlaceholder}">
            </div>
            <div class="options-list"></div>
        `;

        const searchInput = container.querySelector(".dropdown-search");
        const optionsList = container.querySelector(".options-list");

        // Previne o encerramento do menu ao clicar no campo de pesquisa
        searchInput.addEventListener("click", e => e.stopPropagation());
        
        searchInput.addEventListener("input", () => {
            updateEntityOptions(type, searchInput.value, optionsList);
        });

        // Initial render
        updateEntityOptions(type, "", optionsList);
    }

    // Date range with flatpickr and apply button
    const localeMap = {
        "pt-BR": "pt",
        "es-ES": "es",
        "en-US": "en"
    };

    const dateConfig = {
        enableTime: true,
        dateFormat: "Y-m-d\\TH:i", // ISO format sent to the API
        altInput: true,
        altFormat: "d/m/Y H:i",    // How it appears to the user
        time_24hr: true,
        allowInput: true,          // Allow manual input
        locale: localeMap[CURRENT_LANG] || "pt",
        prevArrow: '<i data-lucide="chevron-left" class="icon-16"></i>',
        nextArrow: '<i data-lucide="chevron-right" class="icon-16"></i>',
        onReady: function() {
            if (window.lucide) {
                lucide.createIcons();
            }
        }
    };

    const startInput = document.getElementById("start-date");
    if (startInput) {
        const fpStart = flatpickr(startInput, {
            ...dateConfig,
            defaultDate: pendingState.startDate || null,
            onChange: function(selectedDates, dateStr) {
                pendingState.startDate = dateStr;
                checkApplyButtonState();
            }
        });

        if (window.matchMedia("(hover: hover)").matches) {
            let startTimeout;
            const openStart = () => { clearTimeout(startTimeout); fpStart.open(); };
            const closeStart = () => { startTimeout = setTimeout(() => fpStart.close(), 300); };
            
            startInput.parentElement.addEventListener("mouseenter", openStart);
            startInput.parentElement.addEventListener("mouseleave", closeStart);
            fpStart.calendarContainer.addEventListener("mouseenter", openStart);
            fpStart.calendarContainer.addEventListener("mouseleave", closeStart);
        }
    }

    const endInput = document.getElementById("end-date");
    if (endInput) {
        const fpEnd = flatpickr(endInput, {
            ...dateConfig,
            defaultDate: pendingState.endDate || null,
            onChange: function(selectedDates, dateStr) {
                pendingState.endDate = dateStr;
                checkApplyButtonState();
            }
        });
        if (window.matchMedia("(hover: hover)").matches) {
            let endTimeout;
            const openEnd = () => { clearTimeout(endTimeout); fpEnd.open(); };
            const closeEnd = () => { endTimeout = setTimeout(() => fpEnd.close(), 300); };

            endInput.parentElement.addEventListener("mouseenter", openEnd);
            endInput.parentElement.addEventListener("mouseleave", closeEnd);
            fpEnd.calendarContainer.addEventListener("mouseenter", openEnd);
            fpEnd.calendarContainer.addEventListener("mouseleave", closeEnd);
        }
    }

    const btnApply = document.getElementById("btn-apply");
    if (btnApply) {
        checkApplyButtonState(); // Initialize apply button as disabled

        btnApply.addEventListener("click", () => {
            if (btnApply.classList.contains("disabled")) return;
            
            appState = JSON.parse(JSON.stringify(pendingState));
            checkApplyButtonState(); // Disable apply button after applying changes

            const currentUrl = new URL(window.location);

            // Update URL parameters based on the current appState
            currentUrl.searchParams.delete("category");
            appState.category.forEach(c => currentUrl.searchParams.append("category", c));
            
            currentUrl.searchParams.delete("evaluatorEntity");
            appState.evaluatorEntity.forEach(e => currentUrl.searchParams.append("evaluatorEntity", e));
            
            // Standardize: if EUA is not selected, remove politicalAlignment
            if (!appState.evaluatorEntity.includes("eua")) {
                currentUrl.searchParams.delete("politicalAlignment");
            }

            currentUrl.searchParams.delete("evaluatedEntity");
            appState.evaluatedEntity.forEach(e => currentUrl.searchParams.append("evaluatedEntity", e));
            
            if (appState.startDate) {
                currentUrl.searchParams.set("startDate", appState.startDate);
            } else {
                currentUrl.searchParams.delete("startDate");
            }
            if (appState.endDate) {
                currentUrl.searchParams.set("endDate", appState.endDate);
            } else {
                currentUrl.searchParams.delete("endDate");
            }
            
            // Send new URL, restart pagination and fetch data
            window.history.replaceState({}, "", currentUrl.toString());
            currentOffset = 0;
            
            updateFilterSummary(currentUrl.searchParams);
            fetchData(currentUrl.searchParams);
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
                    const first = otherVal.length > 0 ? [otherVal[0]] : (k === "category" ? ["include_all"] : []);
                    pendingState[k] = first;
                }
            }
        });
        // Sync UI
        syncCheckboxesUI();
        updateAllEntityOptions();
    }
}

function syncCheckboxesUI() {
    // Update Category checkboxes
    const catContent = document.getElementById("category-selector");
    if (catContent) {
        const checkboxes = catContent.querySelectorAll("input[type='checkbox']");
        checkboxes.forEach(cb => {
            cb.checked = pendingState.category.includes(cb.value);
        });
        renderCategorySummary();
    }
}

function renderCategorySummary() {
    const summaryEl = document.getElementById("category-summary");
    if (!summaryEl) return;
    
    if (pendingState.category.includes("include_all") || pendingState.category.length === 0) {
        summaryEl.textContent = tCategory("include_all");
    } else if (pendingState.category.length === 1) {
        summaryEl.textContent = tCategory(pendingState.category[0]);
    } else {
        summaryEl.textContent = `${pendingState.category.length} ${t("category_selected_plural")}`;
    }
}


function updateAllEntityOptions() {
    /* Updates the options in both evaluator and evaluated entity dropdowns based on the 
    current search input and the defined relationships between entities. */
    const evaluatorContainer = document.getElementById("evaluator-selector");
    const evaluatedContainer = document.getElementById("evaluated-selector");

    if (evaluatorContainer) {
        const search = evaluatorContainer.querySelector(".dropdown-search").value;
        updateEntityOptions("evaluatorEntity", search, evaluatorContainer.querySelector(".options-list"));
    }
    if (evaluatedContainer) {
        const search = evaluatedContainer.querySelector(".dropdown-search").value;
        updateEntityOptions("evaluatedEntity", search, evaluatedContainer.querySelector(".options-list"));
    }
}


function updateEntityOptions(type, searchTerm, optionsList) {
    optionsList.innerHTML = "";

    const allEvaluators = Object.keys(RELATIONSHIPS);
    const allEvaluated = [...new Set(Object.values(RELATIONSHIPS).flat())];

    let allOptions = type === "evaluatorEntity" ? allEvaluators : allEvaluated;
    let selectedOptions = type === "evaluatorEntity" ? pendingState.evaluatorEntity : pendingState.evaluatedEntity;

    // Determine related options based on current selections in the opposite dropdown
    let validOptions;
    if (type === "evaluatorEntity") { // To select evaluator, we look at the currently selected evaluated entities
        const currentEvaluated = pendingState.evaluatedEntity;
        if (!currentEvaluated || currentEvaluated.length === 0) {
            validOptions = allOptions;
        } else {
            validOptions = allOptions.filter(evaluator => 
                RELATIONSHIPS[evaluator] && RELATIONSHIPS[evaluator]?.some(evaluated => currentEvaluated.includes(evaluated))
            );
        }
    } else {
        const currentEvaluators = pendingState.evaluatorEntity;
        if (!currentEvaluators || currentEvaluators.length === 0) {
            validOptions = allOptions;
        } else {
            let validSet = new Set();
            currentEvaluators.forEach(evaluator => {
                if (RELATIONSHIPS[evaluator]) {
                    RELATIONSHIPS[evaluator].forEach(evaluated => validSet.add(evaluated));
                }
            });
            validOptions = [...validSet];
        }
    }

    // Apply filter
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        allOptions = allOptions.filter(opt => tEntity(opt).toLowerCase().includes(term));
    }

    // Ordering: valid options first, then alphabetically; unavailable options at the end
    allOptions.sort((a, b) => {
        const aValid = validOptions.includes(a);
        const bValid = validOptions.includes(b);
        
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        
        return tEntity(a).localeCompare(tEntity(b));
    });

    // DOM elements
    allOptions.forEach(opt => {
        const isValid = validOptions.includes(opt);
        
        const label = document.createElement("label");
        label.className = `col-option ${isValid ? '' : "disabled-option"}`;
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = opt;
        checkbox.checked = selectedOptions.includes(opt);
        
        if (!isValid) {
            checkbox.disabled = true;
        }

        checkbox.addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedOptions.push(opt);
            } else {
                const idx = selectedOptions.indexOf(opt);
                if (idx > -1) selectedOptions.splice(idx, 1);
            }
            enforceMultiSelectConstraints(type);
            checkApplyButtonState();
            updateAllEntityOptions(); // Forces revaluation of restrictions in the opposite list
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(" " + tEntity(opt)));
        optionsList.appendChild(label);
    });
}

function renderLimitOptions() {
    /* Generates and manage limit dropdown options dynamically */
    const limitLabel = document.getElementById("limit-label");
    const limitSelector = document.getElementById("limit-selector");
    
    if (limitSelector && limitLabel) {
        limitSelector.innerHTML = '';
        limitLabel.textContent = currentLimit.toString();

        const limits = [50, 100, 500, 1000];
        limits.forEach(val => {
            const opt = document.createElement("div");
            opt.className = "col-option";
            if (currentLimit === val) {
                opt.classList.add("selected");
            }
            opt.setAttribute("data-val", val.toString());
            opt.textContent = val.toString();
            
            opt.addEventListener("click", () => {
                currentLimit = val;
                currentOffset = 0;
                renderLimitOptions(); // Update visual selection
                fetchData(new URLSearchParams(window.location.search));
                limitSelector.parentElement.classList.remove('is-open');
            });
            
            limitSelector.appendChild(opt);
        });
    }
}

function initPaginationSelectors() {
    /* Initializes the pagination controls, including the limit selector and page navigation buttons.
    It sets up event listeners to handle user interactions and updates the current limit and offset accordingly. */
    renderLimitOptions();

    // range selector
    document.getElementById("prev-page").addEventListener("click", () => {
        currentOffset = Math.max(0, currentOffset - currentLimit);
        fetchData(new URLSearchParams(window.location.search));
    });

    document.getElementById("next-page").addEventListener("click", () => {
        currentOffset += currentLimit;
        fetchData(new URLSearchParams(window.location.search));
    });
}


function updatePaginationUI(totalItems) {
    /* Updates the pagination controls based on the total number of items returned by 
    the API and the current limit and offset. */
    const totalCountElement = document.getElementById("total-news-count");
    if (totalCountElement) {
        totalCountElement.textContent = totalItems.toLocaleString(CURRENT_LANG);
    }
    const totalPages = Math.ceil(totalItems / currentLimit);
    const rangeSelector = document.getElementById("page-range-selector");
    const rangeLabel = document.getElementById("page-range-label");

    if (rangeSelector && rangeLabel) {
        rangeSelector.innerHTML = "";

        if (totalPages === 0) {
            rangeLabel.textContent = "0 - 0";
            rangeSelector.disabled = true;
            document.getElementById("prev-page").disabled = true;
            document.getElementById("next-page").disabled = true;
            return;
        } else {
            let activeLabel = "";
            rangeSelector.disabled = false;

            for (let i = 0; i < totalPages; i++) {
                const startItem = (i * currentLimit) + 1;
                const endItem = Math.min((i + 1) * currentLimit, totalItems);
                const offsetValue = i * currentLimit;
                const labelText = `${startItem} - ${endItem}`;

                const opt = document.createElement("div");
                opt.className = "col-option";
                opt.textContent = labelText;
                
                if (currentOffset === offsetValue) {
                    opt.classList.add("selected");
                    activeLabel = labelText;
                } else {
                    opt.addEventListener("click", () => {
                        currentOffset = offsetValue;
                        fetchData(new URLSearchParams(window.location.search));
                        rangeSelector.parentElement.classList.remove("is-open");
                    });
                }
                
                rangeSelector.appendChild(opt);
            }

            rangeLabel.textContent = activeLabel;
            document.getElementById("prev-page").disabled = currentOffset === 0;
            document.getElementById("next-page").disabled = (currentOffset + currentLimit) >= totalItems;
        }
    }
}


function updateFilterSummary(urlParams) {
    const dateSpan = document.getElementById("date-span");

    const startDate = urlParams.get("startDate");
    const endDate = urlParams.get("endDate");


    let dateFormatted = "-";
    
    if (startDate && endDate) {
        // UTC timestamps rendered in Brasília time (DD/MM/YY hh:mm)
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        if (!isNaN(startDateObj) && !isNaN(endDateObj)) {
            const fmt = {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit', timeZone: DISPLAY_TZ
            };
            dateFormatted = `${startDateObj.toLocaleDateString(CURRENT_LANG, fmt)} - ${endDateObj.toLocaleDateString(CURRENT_LANG, fmt)}`;
        }
    }
    
    if (dateSpan) {
        dateSpan.textContent = dateFormatted;
    }

    /* Updates the filter summary text based on the current URL parameters */
    const filterSummary = document.getElementById("filter-summary");
    if (!filterSummary) return;

    const evaluatorEntities = urlParams.getAll("evaluatorEntity");
    const evaluatorEntitiesStr = evaluatorEntities.length > 0 ? evaluatorEntities.map(tEntity).join(", ") : t("not_specified");

    const evaluatedEntities = urlParams.getAll("evaluatedEntity");
    const evaluatedEntitiesStr = evaluatedEntities.length > 0 ? evaluatedEntities.map(tEntity).join(", ") : t("not_specified");
    
    filterSummary.textContent = `${t("evaluatorEntity")}: ${evaluatorEntitiesStr} | ${t("evaluatedEntity")}: ${evaluatedEntitiesStr}`;
}


function toggleLoadingState(isLoading) {
    /* Toggles the loading state of the UI by showing or hiding the loading spinner 
    and disabling/enabling interactive elements. */
    const elementsToFade = document.querySelectorAll(".table-container, .pagination-container, .controls, .details-subheader");

    if (!elementsToFade.length) return;

    if(isLoading) {
        elementsToFade.forEach(el => el.classList.add("loading-state"))

        const tableContainer = document.querySelector(".table-container");
        // Inject spinner if it doesn't exist
        if (tableContainer && !document.getElementById("table-spinner")) {
            const spinnerDiv = document.createElement("div");
            spinnerDiv.id = "table-spinner";
            spinnerDiv.className = "loading-spinner-container";
            spinnerDiv.innerHTML =  `
                                        <div class="css-spinner"></div>
                                        <span class="loading-text">${t("loading_data")}</span>
                                    `;
            tableContainer.appendChild(spinnerDiv);
        }
    } else {
        elementsToFade.forEach(el => el.classList.remove("loading-state"));
        const spinner = document.getElementById("table-spinner");
        if (spinner) spinner.remove();
    }
}


async function fetchData(urlParams) {
    /* Fetches data from the API based on the current URL parameters and updates the table with the results. */
    const tbody = document.getElementById("table-body");

    toggleLoadingState(true);

    const filters = {
        limit: currentLimit,
        offset: currentOffset,
        startDate: urlParams.get("startDate"),
        endDate: urlParams.get("endDate"),
        aggregation: urlParams.get("aggregation"),
        sort_by: currentSortColumn,
        sort_dir: currentSortDirection,
        evaluator: urlParams.getAll("evaluatorEntity"),
        evaluated: urlParams.getAll("evaluatedEntity"),
        category: urlParams.getAll("category"),
        politicalAlignment: urlParams.getAll("politicalAlignment"),
    };
    try {
        const responseData = await fetchDetailsData(filters);
        if (!responseData || typeof responseData.total_count === "undefined") {
            console.error("Invalid API response format:", responseData);
            return;
        }
        window.cachedData = responseData.data;
        updatePaginationUI(responseData.total_count);
        renderTableHeaders();
        renderTableBody(responseData.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        tbody.innerHTML = `<tr><td colspan="100%" class="error-message">${t("error_loading")}</td></tr>`;
    } finally {
        toggleLoadingState(false);
    }
}


document.addEventListener("DOMContentLoaded", async () => {
    initLanguageSelector();
    
    const urlParams = new URLSearchParams(window.location.search);
    
    // Initialize filters first so search inputs exist before translateUI
    await initializeFilters(urlParams);
    
    translateUI();
    initPaginationSelectors();

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    };

    updateFilterSummary(urlParams);
    renderColumnSelector();
    fetchData(urlParams);

    // Filter controls and mobile toggle
    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const filtersWrapper = document.getElementById("filters-wrapper");
    const mobileFilterText = document.getElementById("mobile-filter-text");

    if (mobileFilterBtn && filtersWrapper) {
        mobileFilterBtn.addEventListener("click", () => {
            const isOpen = filtersWrapper.classList.toggle("open");
            mobileFilterBtn.classList.toggle("expanded");
            
            if (mobileFilterText) {
                mobileFilterText.textContent = isOpen ? t("btn_hide_filters") : t("btn_show_filters");
            }
            if (typeof lucide !== "undefined") lucide.createIcons();
        });
    }

    const btnClose = document.getElementById("btn-close");
    if (btnClose) {
        btnClose.addEventListener("click", () => {
            window.close();
        });
    }

    // Apply hover to all generic dropdowns
    document.querySelectorAll(".dropdown").forEach(enableHoverToGenericDropdown);

    // Global click-dropdown handler
    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-outline");
        if (btn && btn.parentElement.classList.contains("dropdown")) {
            const dropdown = btn.parentElement;
            document.querySelectorAll(".dropdown.is-open").forEach(d => {
                if (d !== dropdown) d.classList.remove("is-open");
            });
            dropdown.classList.toggle("is-open");
        } else if (!e.target.closest(".dropdown-content")) {
            document.querySelectorAll(".dropdown.is-open").forEach(d => d.classList.remove("is-open"));
        }
    });

    const brandHeader = document.querySelector(".brand-header");
    const detailsSubheader = document.querySelector(".details-subheader");

    // Close buttons if scroll
    window.addEventListener("scroll", () => {
        const scrollY = window.scrollY;

        if (scrollY > 50) {
            if (brandHeader) brandHeader.classList.add("compact");
            if (detailsSubheader) detailsSubheader.classList.add("compact");
        } else {
            if (brandHeader) brandHeader.classList.remove("compact");
            if (detailsSubheader) detailsSubheader.classList.remove("compact");
        }

        document.querySelectorAll(".dropdown.is-open").forEach(d => {
            d.classList.remove("is-open");
        });
    }, { passive: true });
});


function renderColumnSelector() {
    /* Renders the column selector UI based on the available columns and their visibility settings. */
    const container = document.getElementById("column-selector");
    if (!container) return;
    container.innerHTML = "";
    
    COLUMNS.forEach(col => {
        const label = document.createElement("label");
        label.className = "col-option";
        
        const checkbox = document.createElement("input");      // Checkbox for each column
        checkbox.type = "checkbox";
        checkbox.checked = visibleColumns[col.key];
        checkbox.addEventListener("change", (e) => {
            visibleColumns[col.key] = e.target.checked;
            renderTableHeaders();
            const currentData = window.cachedData || [];
            renderTableBody(currentData);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(col.label));
        container.appendChild(label);
    });
}


function handleSort(col) {
    /* Handles sorting when a column header is clicked
    3 steps cicle: Ascending -> Descending -> Return to Default (Date, Ascending) */
    if (!col.sortable) return;
    
    if (currentSortColumn === col.key) {
        if (currentSortDirection === "asc") {
            currentSortDirection = "desc";
        } else {
            currentSortColumn = "date";
            currentSortDirection = "asc";
        }
    } else {
        currentSortColumn = col.key;
        currentSortDirection = "asc";
    }
    
    currentOffset = 0;
    fetchData(new URLSearchParams(window.location.search));
}


function renderTableHeaders() {
    /* Renders the table headers based on the visible columns and their sorting state. 
    It adds click event listeners to sortable columns to handle sorting interactions. */
    const theadRow = document.getElementById("table-header");
    theadRow.innerHTML = "";
    
    COLUMNS.forEach(col => {
        if (visibleColumns[col.key]) {
            const th = document.createElement("th");
            if (col.sortable) {
                th.classList.add("sortable-header");
                th.style.cursor = "pointer";
                th.style.userSelect = "none";
                th.title = `Sort by ${col.label}`;

                let iconName = "chevrons-up-down";
                let iconClass = "th-icon-inactive"; 
                let iconOpacity = "0.6";

                if (currentSortColumn === col.key) {
                    iconName = currentSortDirection === "asc" ? "arrow-up-narrow-wide" : "arrow-down-wide-narrow";
                    iconClass = "th-icon-active"; 
                }

                th.innerHTML = `
                    <div class="th-inner">
                        <span>${col.label}</span>
                        <div class="th-icon-wrapper ${iconClass}">
                            <i data-lucide="${iconName}" class="icon-16"></i>
                        </div>
                    </div>
                `;
                th.addEventListener("click", () => handleSort(col));
            } else {
                // For columns that do not support sorting (e.g., full text blocks or URLs)
                th.innerHTML = `<span>${col.label}</span>`;
            }

            theadRow.appendChild(th);
        }
    });
    
    if (typeof lucide !== "undefined") {
        lucide.createIcons({ root: theadRow });
    }
}


function renderTableBody(data) {
    /* Renders the table body based on the provided data and the visible columns. */
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center p-4">${t("no_data_found")}</td></tr>`;
        return;
    }

    data.forEach(row => {
        const tr = document.createElement("tr");
        
        COLUMNS.forEach(col => {
            if (visibleColumns[col.key]) {
                const td = document.createElement("td");
                const value = row[col.key];

                if (col.expandable) {
                    td.className = "expandable";
                    td.textContent = value || "-";
                    td.title = t("click_to_expand");
                    td.onclick = function() { this.classList.toggle("expanded"); };
                } else if (col.type === "link") {
                    if (safeUrl(value)) {
                        td.innerHTML = `<a href="${escapeHtml(safeUrl(value))}" target="_blank" rel="noopener" class="table-link">${t("table_link_view")} <i data-lucide="external-link" class="icon-12"></i></a>`;
                    } else {
                        td.textContent = "-";
                    }
                } else if (col.type === "date") {
                    td.textContent = value ? new Date(value).toLocaleString(CURRENT_LANG, { timeZone: DISPLAY_TZ }) : "-";
                } else if (col.type === "number") {
                    td.textContent = value ? parseFloat(value).toFixed(2) : "-";
                    td.className = "font-mono font-bold";
                    if (value < 3.5) {
                        td.style.color = "#ef4444";
                    } else if (value > 5.5) {
                        td.style.color = "#10b981";
                    }
                } else {
                    if (col.key === "category" && value) {
                        td.textContent = tCategory(value) || "-";
                    } else if ((col.key === "evaluator_entity" || col.key === "evaluated_entity") && value) {
                        td.textContent = tEntity(value) || "-";
                    } else {
                        td.textContent = value || "-";
                    }
                }
                
                tr.appendChild(td);
            }
        });
        tbody.appendChild(tr);
    });
    
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}
