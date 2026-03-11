const API_ENDPOINT = "/api/data";
import { DICTIONARY } from "./i18n.js";
import { fetchDetailsData } from "./api_adapter.js";

// Global state variables
let CURRENT_LANG = "pt-BR";
let choicesLanguage = null;
let currentLimit = 50;
let currentOffset = 0;
let choicesLimit = null;

const COLUMNS = [
    { key: "date", labelKey: "col_date", type: "date" },
    { key: "headline", labelKey: "col_headline", expandable: true },
    { key: "summary", labelKey: "col_summary", expandable: true },
    { key: "article_text", labelKey: "col_article_text", expandable: true },
    { key: "source", labelKey: "col_source" },
    { key: "category", labelKey: "col_category" },
    { key: "grade", labelKey: "col_grade", type: "number" },
    { key: "analysis", labelKey: "col_analysis", expandable: true },
    { key: "url", labelKey: "col_link", type: "link" },
];

let visibleColumns = {
    date: true, 
    language: false,
    category: true, 
    headline: true, 
    source: true, 
    summary: false, 
    article_text: false, 
    analysis: true, 
    grade: true, 
    url: true
};



function t(key) {
    return DICTIONARY[CURRENT_LANG][key] || key;
}

function translateEntity(key) {
    return DICTIONARY[CURRENT_LANG].entity_options?.[key] || key;
}

function initLanguageSelector() {
    /* Initializes the language selector dropdown and sets up event listeners to handle language changes. */
    if (typeof Choices !== "undefined") {
        choicesLanguage = new Choices("#language-select", {
            searchEnabled: false,
            itemSelectText: "",
            shouldSort: false,
            position: "bottom",
            choices: [
                { value: "pt-BR", label: "PT", selected: true },
                { value: "en-US", label: "EN" },
                { value: "es-ES", label: "ES" }
            ]
        });

        document.getElementById("language-select").addEventListener("change", (e) => {
            CURRENT_LANG = e.target.value;
            
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
            renderTableHeaders();
            
            const currentData = window.cachedData || [];
            if(currentData.length > 0) {
                renderTableBody(currentData);
            }
        });

        const langWrapper = document.querySelector(".lang-dropdown-wrapper");
        if (langWrapper) {
            langWrapper.addEventListener("click", (e) => {
                if (!e.target.closest(".choices")) {
                    choicesLanguage.showDropdown();
                }
            });
        }
    }
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

    COLUMNS.forEach(col => {
        col.label = t(col.labelKey);
    })
}


function initPaginationSelectors() {
    /* Initializes the pagination controls, including the limit selector and page navigation buttons.
    It sets up event listeners to handle user interactions and updates the current limit and offset accordingly. */
    if (typeof Choices !== "undefined") {
        choicesLimit = new Choices("#limit-select", {
            searchEnabled: false,
            itemSelectText: "",
            shouldSort: false,
            choices: [
                { value: "50", label: "50", selected: true },
                { value: "100", label: "100" },
                { value: "500", label: "500" },
                { value: "1000", label: "1000" }
            ]
        });

        document.getElementById("limit-select").addEventListener("change", (e) => {
            currentLimit = parseInt(e.target.value, 10);
            currentOffset = 0;
            // window.location.search := ?page=2&limit=50
            fetchData(new URLSearchParams(window.location.search));
        });
    }

    // range selector
    document.getElementById("prev-page").addEventListener("click", () => {
        currentOffset = Math.max(0, currentOffset - currentLimit);
        fetchData(new URLSearchParams(window.location.search));
    });

    document.getElementById("page-range-select").addEventListener("change", (e) => {
        currentOffset = parseInt(e.target.value, 10);
        fetchData(new URLSearchParams(window.location.search));
    });

    document.getElementById("next-page").addEventListener("click", () => {
        currentOffset += currentLimit;
        fetchData(new URLSearchParams(window.location.search));
    });
}


function updatePaginationUI(totalItems) {
    /* Updates the pagination controls based on the total number of items returned by the API and the current limit and offset. */
    const rangeSelect = document.getElementById("page-range-select");
    const totalCountElement = document.getElementById("total-news-count");

    rangeSelect.innerHTML = "";
    totalCountElement.textContent = totalItems.toLocaleString(CURRENT_LANG);

    const totalPages = Math.ceil(totalItems / currentLimit);

    if (totalPages === 0) {
        rangeSelect.appendChild(new Option("0 - 0", 0));
        rangeSelect.disabled = true;
        document.getElementById("prev-page").disabled = true;
        document.getElementById("next-page").disabled = true;
        return;
    }

    rangeSelect.disabled = false;
    for (let i = 0; i < totalPages; i++) {
        const startItem = (i * currentLimit) + 1;
        const endItem = Math.min((i + 1) * currentLimit, totalItems);
        const option = new Option(`${startItem} - ${endItem}`, i * currentLimit);
        if (currentOffset === i * currentLimit) {
            option.selected = true;
        }
        rangeSelect.appendChild(option);
    }

    document.getElementById("prev-page").disabled = currentOffset === 0;
    document.getElementById("next-page").disabled = (currentOffset + currentLimit) >= totalItems;
}


function updateFilterSummary(urlParams) {
    /* Updates the filter summary text based on the current URL parameters */
    const filterSummary = document.getElementById("filter-summary");
    if (!filterSummary) return;

    const reviewers = urlParams.getAll("reviewer");
    const reviewersStr = reviewers.length > 0 ? reviewers.map(translateEntity).join(", ") : t("not_specified");

    const reviewedEntities = urlParams.getAll("reviewedEntity");
    const reviewedEntitiesStr = reviewedEntities.length > 0 ? reviewedEntities.map(translateEntity).join(", ") : t("not_specified");
    
    filterSummary.textContent = `${t("reviewer")}: ${reviewersStr} | ${t("reviewedEntity")}: ${reviewedEntitiesStr}`;
}


async function fetchData(urlParams) {
    /* Fetches data from the API based on the current URL parameters and updates the table with the results. */
    const tbody = document.getElementById("table-body");

    const filters = {
        limit: currentLimit,
        offset: currentOffset,
        date: urlParams.get("date"),
        aggregation: urlParams.get("aggregation"),

        reviewer: urlParams.getAll("reviewer"),
        reviewedEntity: urlParams.getAll("reviewedEntity"),
        category: urlParams.getAll("category"),
        politicalAlignment: urlParams.getAll("politicalAlignment"),
    };

    try {
        const { total_count, data } = await fetchDetailsData(filters);
        if (!{ total_count, data } || typeof total_count === "undefined") {
            console.error("Invalid API response format:", { total_count, data });
            return;
        }
        window.cachedData = data;
        updatePaginationUI(total_count);
        renderTableHeaders();
        renderTableBody(data);
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}


document.addEventListener("DOMContentLoaded", () => {
    initLanguageSelector();
    translateUI();
    initPaginationSelectors();

    const urlParams = new URLSearchParams(window.location.search);
    const filterSummary = document.getElementById("filter-summary");
    const dateSpan = document.getElementById("date-span");

    const rawDate = urlParams.get("date");
    let dateFormatted = "-";
    
    if (rawDate) {
        // If it's UTC string, convert to local string (DD/MM/YY)
        const dateObj = new Date(rawDate);
        if (!isNaN(dateObj)) {
            dateFormatted = dateObj.toLocaleDateString("pt-BR", { timeZone: "UTC" });
        }
    }
    console.log("Formatted Date:", dateFormatted);
    if (dateSpan && rawDate) {
        dateSpan.textContent = dateFormatted;
    }
    
    // const reviewer = urlParams.get("reviewer") || t("not_specified");
    // const reviewedEntity = urlParams.get("reviewedEntity") || t("not_specified");
    // const agg = urlParams.get("aggregation") || "Diária";
    // filterSummary.textContent = `${t("reviewer")}: ${reviewer} | ${t("reviewedEntity")}: ${reviewedEntity}`;
    
    updateFilterSummary(urlParams);
    renderColumnSelector();
    fetchData(urlParams);
});


function renderColumnSelector() {
    const container = document.getElementById("column-selector");
    container.innerHTML = '';
    
    COLUMNS.forEach(col => {
        const label = document.createElement('label');
        label.className = 'col-option flex items-center gap-2 text-sm p-1 hover:bg-slate-50 rounded';
        
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


function renderTableHeaders() {
    const theadRow = document.getElementById('table-header');
    theadRow.innerHTML = '';
    
    COLUMNS.forEach(col => {
        if (visibleColumns[col.key]) {
            const th = document.createElement('th');
            th.textContent = col.label;
            theadRow.appendChild(th);
        }
    });
}


function renderTableBody(data) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%" class="text-center p-4">Nenhuma notícia encontrada para este filtro.</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        
        COLUMNS.forEach(col => {
            if (visibleColumns[col.key]) {
                const td = document.createElement('td');
                const value = row[col.key];

                if (col.expandable) {
                    td.className = 'expandable';
                    td.textContent = value || '-';
                    td.title = "Clique para expandir";
                    td.onclick = function() { this.classList.toggle('expanded'); };
                } else if (col.type === 'link') {
                    if (value) {
                        td.innerHTML = `<a href="${value}" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1">Link <i data-lucide="external-link" width="12"></i></a>`;
                    } else {
                        td.textContent = '-';
                    }
                } else if (col.type === 'date') {
                    td.textContent = value ? new Date(value).toLocaleString('pt-BR') : '-';
                } else if (col.type === 'number') {
                    td.textContent = value ? parseFloat(value).toFixed(2) : '-';
                    td.className = 'font-mono font-bold';
                    if (value < 3.5) td.style.color = '#ef4444';
                    else if (value > 5.5) td.style.color = '#10b981';
                } else {
                    td.textContent = value || '-';
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
