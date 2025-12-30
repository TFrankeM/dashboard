const API_ENDPOINT = "/api/data";

const COLUMNS = [
    { key: "date", label: "Data", type: "date" },
    { key: "source", label: "Fonte" },
    { key: "grade", label: "Nota", type: "number" },
    { key: "category", label: "Categoria" },
    { key: "headline", label: "Manchete", expandable: true },
    { key: "analysis", label: "Análise", expandable: true },
    { key: "summary", label: "Resumo", expandable: true },
    { key: "article_text", label: "Texto Completo", expandable: true },
    { key: "url", label: "Link", type: "link" },
    { key: "language", label: "Idioma" }
];

let visibleColumns = {
    date: true, source: true, grade: true, category: true, 
    headline: true, analysis: true, summary: false, 
    article_text: false, url: true, language: false
};

document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const filterSummary = document.getElementById("filter-summary");
    const pageTitle = document.getElementById("page-title");
    
    const rawDate = urlParams.get("date");
    let dateFormatted = '-';
    
    if (rawDate) {
        const dateObj = new Date(rawDate);
        if (!isNaN(dateObj)) {
            dateFormatted = dateObj.toLocaleDateString("pt-BR", { timeZone: "UTC" });
        }
    }
    console.log("Raw date from URL:", rawDate);
    console.log("Data formatada:", dateFormatted);
    if (pageTitle && rawDate) {
        pageTitle.textContent = `Detalhamento das notícias que compõem a nota de ${dateFormatted}`;
    }
    
    const reviewer = urlParams.get("reviewer") || "Todos";
    const agg = urlParams.get("aggregation") || "Diária";
    filterSummary.textContent = `Avaliador: ${reviewer} | Agregação original: ${agg}`;

    renderColumnSelector();

    fetchData(urlParams);

    document.getElementById("refresh-btn").addEventListener("click", () => fetchData(urlParams));
    document.getElementById("limit-select").addEventListener("change", () => fetchData(urlParams));
});

function renderColumnSelector() {
    const container = document.getElementById("column-selector");
    container.innerHTML = '';
    
    COLUMNS.forEach(col => {
        const label = document.createElement("label");
        label.className = "col-option flex items-center gap-2 text-sm p-1 hover:bg-slate-50 rounded";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = visibleColumns[col.key];
        checkbox.addEventListener("change", (e) => {
            visibleColumns[col.key] = e.target.checked;
            renderTableHeaders();
            // Re-renderiza o corpo (usando cache se disponível)
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
    
    urlParams.set("widget", "details");
    urlParams.set("limit", document.getElementById("limit-select").value);
    
    const queryString = urlParams.toString().replace(/\+/g, "%20");

    try {
        const response = await fetch(`${API_ENDPOINT}?${queryString}`);
        if (!response.ok) throw new Error("Erro na API");
        
        const data = await response.json();
        window.cachedData = data;
        
        renderTableHeaders();
        renderTableBody(data);
        
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center text-red-500 p-4">Erro: ${error.message}</td></tr>`;
    }
}

function renderTableHeaders() {
    const theadRow = document.getElementById("table-header");
    theadRow.innerHTML = '';
    
    COLUMNS.forEach(col => {
        if (visibleColumns[col.key]) {
            const th = document.createElement("th");
            th.textContent = col.label;
            theadRow.appendChild(th);
        }
    });
}

function renderTableBody(data) {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%" class="text-center p-4">Nenhuma notícia encontrada para este filtro.</td></tr>';
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
                    td.title = "Clique para expandir";
                    td.onclick = function() { this.classList.toggle("expanded"); };
                } else if (col.type === "link") {
                    if (value) {
                        td.innerHTML = `<a href="${value}" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1">Link <i data-lucide="external-link" width="12"></i></a>`;
                    } else {
                        td.textContent = "-";
                    }
                } else if (col.type === "date") {
                    td.textContent = value ? new Date(value).toLocaleString("pt-BR") : "-";
                } else if (col.type === "number") {
                    td.textContent = value ? parseFloat(value).toFixed(2) : "-";
                    td.className = "font-mono font-bold";
                    if (value < 3.5) td.style.color = "#ef4444";
                    else if (value > 5.5) td.style.color = "#10b981";
                } else {
                    td.textContent = value || "-";
                }
                
                tr.appendChild(td);
            }
        });
        tbody.appendChild(tr);
    });
    
    if (typeof lucide !== "undefined") lucide.createIcons();
}

