import { fetchLineChartData, fetchBarChartData, fetchGaugeData } from "./api_adapter.js";
import { drawGaugeChart, drawBarChart, drawLineChart, resetLineChartZoom } from "./charts.js";

document.addEventListener("DOMContentLoaded", function () {
    
    //// Inicialização de UI ////

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    };
    if (typeof tippy !== "undefined") {
        tippy(".info-icon", {
            placement: "top",
            animation: "shift-away",
            theme: "dark",
            delay: [100, 100],
            arrow: true,
            arrowType: "round",
            size: "small",
            trigger: "mouseenter focus click",
            maxWidth: 250,
            interactive: true,
            allowHTML: true,
        });
    }

    // Scroll: compact header; update side menu
    const filterSection = document.getElementById("filters-container");
    const navDots = document.querySelectorAll(".nav-dot");
    const sections = document.querySelectorAll("header, section, main");

    window.addEventListener("scroll", () => {
        const scrollY = window.scrollY;

        // Compact Filters
        if (filterSection) {
            if (scrollY > 200) {
                filterSection.classList.add("compact");
            } else if (scrollY < 50) {
                filterSection.classList.remove("compact");
            }
        }

        // Update side menu
        let current = "";
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (scrollY >= (sectionTop - 100)) {
                current = section.getAttribute("id");
            }
        });

        navDots.forEach(dot => {
            dot.classList.remove("active");
            if (dot.getAttribute("href").includes(current)) {
                dot.classList.add("active");
            }
        });
    });

    // Toggle
    const toggleBtn = document.getElementById("dynamic-mode");
    const labelTxt = document.getElementById("mode-label");

    function updateToggleVisual(isDynamic) {
        if (labelTxt) {
            if(isDynamic) {
                labelTxt.textContent = "Modo dinâmico: atualização em tempo real";
                labelTxt.style.color = "#008BC9";
                labelTxt.style.fontWeight = "700";
            } else {
                labelTxt.textContent = "Modo estático: 2025";
                labelTxt.style.color = "white";
                labelTxt.style.fontWeight = "700";
            }
        }
        if (toggleBtn) {
            toggleBtn.checked = isDynamic;
        }
    }

    if (toggleBtn) {
        /* Add listeners that calls update whenever the toggle is changed */
        toggleBtn.addEventListener("change", () => {
            const isDynamic = toggleBtn.checked;
            updateToggleVisual(isDynamic);
        });
    }

    //// Default config ////

    // SINGLE SOURCE OF TRUTH
    const DEFAULT_CONFIG = {
        isDynamic: false,
        period: "year_2025",
        reviewer: "Argentina",
        reviewedEntity: "Brasil",
        category: ["Todas"],
        aggregation: "daily"
    };

    // Static data for dropdowns
    const PERIODS_CONFIG = {
        static: [
            { label: "2025", value: "year_2025", start: "2025-01-01", end: "2025-12-31" },
            { label: "Semestre 1 de 2025", value: "sem1_2025", start: "2025-01-01", end: "2025-06-30" },
            { label: "Semestre 2 de 2025", value: "sem2_2025", start: "2025-07-01", end: "2025-12-31" },
            { label: "Trimestre 1 de 2025", value: "q1_2025", start: "2025-01-01", end: "2025-03-31" },
            { label: "Trimestre 2 de 2025", value: "q2_2025", start: "2025-04-01", end: "2025-06-30" },
            { label: "Trimestre 3 de 2025", value: "q3_2025", start: "2025-07-01", end: "2025-09-30" },
            { label: "Trimestre 4 de 2025", value: "q4_2025", start: "2025-10-01", end: "2025-12-31" }
        ],
        dynamic: [
            { label: "Últimos 7 dias", value: "Last7d" },
            { label: "Últimos 30 dias", value: "Last30d" },
            { label: "Últimos 120 dias", value: "Last120d" },
            { label: "Últimos 180 dias", value: "Last180d" },
            { label: "Últimos 365 dias", value: "Last365d" }
        ]
    };
    
    const categoriesList = [
        "Todas", 
        "Artes, cultura, entretenimento e mídia", 
        "Ciência e tecnologia", 
        "Conflito, guerra e paz", 
        "Crime, lei e justiça", 
        "Desastres, acidentes e emergências", 
        "Economia, negócios e finanças", 
        "Educação", 
        "Esporte", 
        "Estilo de vida e lazer", 
        "Interesse humano", 
        "Meio ambiente", 
        "Meteorologia", 
        "Política", 
        "Religião e crenças", 
        "Saúde", 
        "Sociedade", 
        "Trabalho" 
    ];

    const reviewersList = [
        { label: "Argentina", value: "Argentina" }
    ];

    const reviewedEntityList = [
        { label: "Brasil", value: "Brasil" }
    ];

    // Currents filters applied
    let appState = {
        isDynamic: DEFAULT_CONFIG.isDynamic,
        periodValue: DEFAULT_CONFIG.period,
        customStartDate: "2025-01-01",      // Default values for fallback
        customEndDate: "2025-12-31",
        reviewer: DEFAULT_CONFIG.reviewer,
        reviewedEntity: DEFAULT_CONFIG.reviewedEntity,
        category: DEFAULT_CONFIG.category,
        aggregation: DEFAULT_CONFIG.aggregation
    };

    // DOM SELECTORS
    const lineChartCanvas = document.getElementById("lineChart");
    const barChartCanvas = document.getElementById("barChart");
    const gaugeChartCanvas = document.getElementById("gaugeChart");
    const gaugeValueText = document.getElementById("gaugeValueText");
    const gaugeDescription = document.getElementById("gaugeDescription")
    const totalNoticiasEl = document.getElementById("total-noticias");
    
    const periodSelect = document.getElementById("period");
    const reviewerSelect = document.getElementById("reviewer");
    const reviewedEntitySelect = document.getElementById("reviewedEntity");
    const categorySelect = document.getElementById("category");
    const dynamicToggle = document.getElementById("dynamic-mode");

    const resetZoomBtn = document.getElementById("resetZoomBtn");
    // const averageButtonsContainer = document.querySelector(".average-buttons");
    const titleReviewerEl = document.getElementById("title-reviewer");
    const titleReviewedEntityEl = document.getElementById("title-reviewedEntity");

    // Referências para instâncias do Choices
    let choicesPeriod, choicesCategory, choicesReviewer, choicesReviewedEntity;
    let pollingInterval = null;

    // UI INITIALIZATION
    function initializeUI() {
        // config padrão para Choices com single select
        const singleOpts = {
            searchEnabled: false,
            itemSelectText: "",
            shouldSort: false,
            position: "bottom"
        };

        if (typeof Choices !== "undefined") {
            // Reviewer
            choicesReviewer = new Choices("#reviewer", singleOpts);
            choicesReviewer.setChoices(reviewersList.map(c => ({
                value: c.value, label: c.label, selected: c.value === appState.reviewer
            })), "value", "label", true);

            // Reviewed Entity
            choicesReviewedEntity = new Choices("#reviewedEntity", singleOpts);
            choicesReviewedEntity.setChoices(reviewedEntityList.map(c => ({
                value: c.value, label: c.label, selected: c.value === appState.reviewedEntity
            })), "value", "label", true);

            // Period
            choicesPeriod = new Choices("#period", singleOpts);
            // Initial options based on the mode configured in DEFAULT_CONFIG
            updatePeriodDropdown(appState.isDynamic);

            // Multi categories
            choicesCategory = new Choices("#category", {
                removeItemButton: true,
                searchEnabled: true,
                placeholderValue: "Selecione...",
                itemSelectText: "",
                shouldSort: true,
                editItems: true,
                maxItemCount: 5,
                maxItemText: "",
                position: "bottom"
                // maxItemText: (maxItemCount) => {
                //     return `O máximo de ${maxItemCount} categorias selecionadas foi atingido.`;
                // }
            });
            choicesCategory.setChoices(categoriesList.map(c => ({ 
                value: c, label: c, selected: c === "Todas" 
            })), "value", "label", true); /* Select todas by default; true := remove everything that exists */


            // Adiciona listeners para controlar o colapso visual
            const categoryContainer = choicesCategory.containerOuter.element;
            
            // Estado inicial colapsado
            categoryContainer.classList.add("collapsed");

            // Expande ao abrir
            categoryContainer.addEventListener("showDropdown", () => {
                categoryContainer.classList.remove("collapsed");
            });

            // Colapsa ao fechar
            categoryContainer.addEventListener("hideDropdown", () => {
                categoryContainer.classList.add("collapsed");
            });
        }
        updateToggleVisual(appState.isDynamic);
        
        // is dinamic? then, PULLING
        if (appState.isDynamic) {
            pollingInterval = setInterval(updateDashboard, 600000);
        }
    };

    function handlePeriodChange(value) {
        appState.periodValue = value;
        // If dynamic, no custom dates
        if (appState.isDynamic) {
            appState.customStartDate = null;
            appState.customEndDate = null;
        } 
        // If static, get the dates from config
        else {
            const config = PERIODS_CONFIG.static.find(p => p.value === value);
            if (config) {
                appState.customStartDate = config.start;
                appState.customEndDate = config.end;
            }
        }
    }

    function updatePeriodDropdown(isDynamic) {
        const options = isDynamic ? PERIODS_CONFIG.dynamic : PERIODS_CONFIG.static;
        choicesPeriod.clearChoices();
        choicesPeriod.setChoices(options, "value", "label", true);
        
        const defaultOption = options[0];
        
        // if initializing and have a compatible default value, use it
        // Otherwise, reset to the first in the list
        choicesPeriod.setChoiceByValue(defaultOption.value);
        handlePeriodChange(defaultOption.value);
    }

    // Data processing: JSON from JSON -> Chart.js format
    function updateGaugeDisplay(value) {
        const finalValue = value !== undefined && value !== null ? parseFloat(value) : 4.00;
        gaugeValueText.textContent = finalValue.toFixed(2);

        let descText = "Sem dados";
        let descColor = "#94a3b8";

        if (finalValue <= 1.50) { 
            descText = "Extremamente negativa"; 
            descColor = "#b91c1c";
        } else if (finalValue <= 2.50) { 
            descText = "Muito negativa"; 
            descColor = "#ef4444";
        } else if (finalValue <= 3.50) { 
            descText = "Levemente negativa"; 
            descColor = "#fdae61";
        } else if (finalValue <= 4.49) { 
            descText = "Neutra"; 
            descColor = "#64748b";
        } else if (finalValue <= 5.49) { 
            descText = "Levemente positiva"; 
            descColor = "#84cc16";
        } else if (finalValue <= 6.49) { 
            descText = "Muito positiva"; 
            descColor = "#22c55e";
        } else { 
            descText = "Extremamente positiva"; 
            descColor = "#15803d";
        }

        const gaugeDescriptionEl = document.getElementById("gaugeDescription");
        if (gaugeDescriptionEl) {
            gaugeDescriptionEl.textContent = descText;
            gaugeDescriptionEl.style.color = descColor;
        }

        drawGaugeChart(gaugeChartCanvas, finalValue);
    }

    function processAndUpdateBarChart(apiData) {
        if (!apiData || apiData.length === 0) {
            totalNoticiasEl.textContent = "0";
            drawBarChart(barChartCanvas, ["Nenhum dado encontrado."], []);
            return;
        }

        const labels = [];
        const values = [];
        let total = 0;

        apiData.forEach(row => {
            const date = new Date(row.time_period);
            // Extract the year for the label
            labels.push(date.getUTCFullYear("pt=BR"));
            
            const count = parseInt(row.news_count, 10);
            values.push(count);
            total += count;
        });

        drawBarChart(barChartCanvas, labels, values);
        totalNoticiasEl.textContent = total.toLocaleString('pt-BR');
    }


    //// POP-UP
    // Confirmation pop-up window for news roll down logic
    const confirmPopup = document.getElementById("chart-popup");
    let currentClickedDate = null;
    const datePopup = document.getElementById("popup-date")
    // Close popup when clicking outside line chart or popup
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#chart-popup")) {
            confirmPopup.classList.add("hidden");
        }
    });

    document.getElementById("popup-cancel").addEventListener("click", () => {
        confirmPopup.classList.add("hidden");
    });

    // when 'ver detalhes' is clicked, open details.html with filters applied
    document.getElementById("popup-confirm").addEventListener("click", () => {
        if (!currentClickedDate) {
            return;
        }

        // convert dd/mm/aaaa to mm/dd/aaaa for URL
        let dateISO = currentClickedDate.date;;
        if (dateISO && dateISO.includes("/")) {
            const parts = dateISO.split("/");
            if (parts.length === 3) {
                dateISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }

        // url for new handlePeriodChange
        const params = new URLSearchParams();
        params.append("date", dateISO);
        params.append("aggregation", appState.aggregation);
        params.append("reviewer", appState.reviewer);
        params.append("reviewedEntity", appState.reviewedEntity);

        if(appState.category) {
            appState.category.forEach(c => params.append("category", c));
        }

        window.open(`details.html?${params.toString()}`, "_blank");
        confirmPopup.classList.add("hidden");
    });


    const handlePointClick = (dateStr, event) => {
        if (dateStr) {
            datePopup.textContent = dateStr;
        };

        currentClickedDate = { date: dateStr};

        const x = event.native.clientX;
        const y = event.native.clientY;
        confirmPopup.style.left = `${x}px`;
        confirmPopup.style.top = `${y-90}px`;

        confirmPopup.classList.remove("hidden");
    };


    function processAndUpdateLineChart(apiData) {
        if (!apiData || apiData.length === 0) {
            drawLineChart(lineChartCanvas, ["Nenhum dado encontrado."], [], null);
            return;
        }

        const allDates = new Set();
        apiData.forEach(row => {
            if (row.time_period) {
                allDates.add(row.time_period);
            }
        });

        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

        const formattedLabels = sortedDates.map(dateStr => {
            const date = new Date(dateStr);
            
            // dd/mm/aaaa
            return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        });

        // Prepare datasets per selected category
        const datasets = appState.category.map(catName => {
            // Backend returns "Todas" as category for all-inclusive
            const catRows = apiData.filter(row => row.category === catName);

            // Fast access for date -> average grade
            const dataMap = new Map();
            catRows.forEach(row => {
                dataMap.set(row.time_period, parseFloat(row.average_grade));
            });

            // Align average grades with
            const alignedData = sortedDates.map(date => dataMap.get(date) || null);

            return {
                label: catName,
                data: alignedData
            };
        });

        drawLineChart(lineChartCanvas, formattedLabels, datasets, handlePointClick);
    }


    async function updateDashboard() {
        const apiFilters = {
            reviewer: appState.reviewer,
            reviewedEntity: appState.reviewedEntity,
            category: appState.category,
            aggregation: appState.aggregation
        };

        if (appState.isDynamic) {
            apiFilters.period = appState.periodValue;
        } else {
            apiFilters.startDate = appState.customStartDate;
            apiFilters.endDate = appState.customEndDate;
        }

        if (titleReviewerEl) {
            titleReviewerEl.textContent = appState.reviewer;
        }
        if (titleReviewedEntityEl) {
            titleReviewedEntityEl.textContent = appState.reviewedEntity;
        }
        totalNoticiasEl.textContent = "...";

        try {
            console.log("[Dashboard] Buscando dados...", apiFilters);
            const [gaugeVal, barData, lineData] = await Promise.all([
                fetchGaugeData(apiFilters),
                fetchBarChartData(apiFilters),
                fetchLineChartData(apiFilters)
            ]);

            updateGaugeDisplay(gaugeVal);
            processAndUpdateBarChart(barData);
            processAndUpdateLineChart(lineData);
        } catch (err) {
            console.error("Erro dashboard:", err);
            totalNoticiasEl.textContent = "Erro";
        }
    }
    

    if (dynamicToggle) {
        dynamicToggle.addEventListener("change", (e) => {
            appState.isDynamic = e.target.checked;
            updateToggleVisual(appState.isDynamic);
            updatePeriodDropdown(appState.isDynamic);
            
            if (appState.isDynamic) {
                pollingInterval = setInterval(updateDashboard, 600000); // 10  min
            } else {
                if (pollingInterval) clearInterval(pollingInterval);
            }
        });
    }
    
    // Choices listeners
    if (periodSelect) {
        periodSelect.addEventListener("change", (e) => { handlePeriodChange(e.target.value); 
        updateDashboard(); 
        });
    };
    if (reviewerSelect) reviewerSelect.addEventListener("change", (e) => { 
        appState.reviewer = e.target.value; 
        updateDashboard(); 
    });
    
    if (reviewedEntitySelect) reviewedEntitySelect.addEventListener("change", (e) => { 
        appState.reviewedEntity = e.target.value; 
        updateDashboard(); 
    });

    if (categorySelect) categorySelect.addEventListener("change", () => {
        const selected = Array.from(categorySelect.selectedOptions).map(o => o.value);
        appState.category = selected.length > 0 ? selected : ["Todas"];
        updateDashboard();
    });

    resetZoomBtn.addEventListener("click", () => {
        resetLineChartZoom();
        
        // Reset aggregation to default weekly
        appState.aggregation = DEFAULT_CONFIG.aggregation;
        
        // Reset buttons visual
        document.querySelectorAll(".avg-btn").forEach(b => b.classList.remove("active", "bg-white", "shadow-sm"));
        const defaultBtn = document.querySelector(`.avg-btn[data-period="${DEFAULT_CONFIG.aggregation}"]`);
        if(defaultBtn) defaultBtn.classList.add("active", "bg-white", "shadow-sm");
        
        updateDashboard();
    });

    initializeUI();
    setTimeout(updateDashboard, 100);
});


