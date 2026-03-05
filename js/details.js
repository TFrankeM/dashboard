const API_ENDPOINT = "/api/data";
import { DICTIONARY } from "./i18n.js";

let CURRENT_LANG = "pt-BR";
let choicesLanguage = null;

function t(key) {
    return DICTIONARY[CURRENT_LANG][key] || key;
}

const COLUMNS = [
    { key: "date", labelKey: "col_date", type: "date" },
    { key: "headline", labelKey: "col_headline", expandable: true },
    { key: "source", labelKey: "col_source" },
    { key: "category", labelKey: "col_category" },
    { key: "analysis", labelKey: "col_analysis", expandable: true },
    { key: "grade", labelKey: "col_grade", type: "number" },
    { key: "url", labelKey: "col_link", type: "link" },
];

let visibleColumns = {
    date: true, 
    headline: true, 
    source: true, 
    grade: true, 
    category: true, 
    analysis: true, 
    summary: false, 
    article_text: false, 
    url: true, 
    language: false
};

function initLanguageSelector() {
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
            
            // Recalcula formatação da data baseada no locale
            const rawDate = new URLSearchParams(window.location.search).get("date");
            if (rawDate) {
                const dateObj = new Date(rawDate);
                if (!isNaN(dateObj)) {
                    document.getElementById("date-span").textContent = dateObj.toLocaleDateString(CURRENT_LANG, { timeZone: "UTC" });
                }
            }
            
            // updateFilterSummary(new URLSearchParams(window.location.search));
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


document.addEventListener("DOMContentLoaded", () => {
    initLanguageSelector();
    translateUI();

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
    
    const reviewer = urlParams.get("reviewer") || "Não especificado";
    const reviwedEntity = urlParams.get("reviewedEntity") || "Não especificado";
    const agg = urlParams.get("aggregation") || "Diária";
    filterSummary.textContent = `Ente avaliador: ${reviewer} | Ente em avaliação: ${reviwedEntity}`;
    
    renderColumnSelector();

    fetchData(urlParams);

    document.getElementById("limit-select").addEventListener("change", () => fetchData(urlParams));
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

async function fetchData(urlParams) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '<tr><td colspan="100%" class="text-center p-4">Carregando...</td></tr>';
    
    urlParams.set('widget', 'details');
    urlParams.set('limit', document.getElementById('limit-select').value);
    
    const queryString = urlParams.toString().replace(/\+/g, '%20');

    try {
        const response = await fetch(`${API_ENDPOINT}?${queryString}`);
        if (!response.ok) throw new Error('Erro na API');
        
        const data = await response.json();
        window.cachedData = data;
        console.log("Query String:", queryString);
        console.log("Fetched Data:", data);
        renderTableHeaders();
        renderTableBody(data);
        
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center text-red-500 p-4">Erro: ${error.message}</td></tr>`;
    }
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
