import { fetchGradesHistogramData, fetchVolumeChartData, fetchGaugeData, fetchLineChartData } from "./api_adapter.js";
import { drawGradesHistogramChart, drawVolumeChart, drawGaugeChart, drawLineChart, resetLineChartZoom } from "./charts.js";

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

    //// Default config ////

    // SINGLE SOURCE OF TRUTH
    const DEFAULT_CONFIG = {
        isDynamic: false,
        period: "year_2025",
        reviewer: "Argentina",
        reviewedEntity: "Brasil",
        category: ["Todas"],
        politicalAlignment: ["Independentes"],
        aggregation: "hourly"
    };

    // Static data for dropdowns
    const PERIODS_CONFIG = {
        static: [
            { label: "2025 semestre 1 de 2", value: "sem1_2025", start: "2025-01-01", end: "2025-06-30" },
            { label: "2025 semestre 2 de 2", value: "sem2_2025", start: "2025-07-01", end: "2025-12-31" },
            { label: "2025 trimestre 1 de 4", value: "q1_2025", start: "2025-01-01", end: "2025-03-31" },
            { label: "2025 trimestre 2 de 4", value: "q2_2025", start: "2025-04-01", end: "2025-06-30" },
            { label: "2025 trimestre 3 de 4", value: "q3_2025", start: "2025-07-01", end: "2025-09-30" },
            { label: "2025 trimestre 4 de 4", value: "q4_2025", start: "2025-10-01", end: "2025-12-31" },
            { label: "2025", value: "year_2025", start: "2025-01-01", end: "2025-12-31" },
            { label: "2026", value: "year_2026", start: "2026-01-01", end: "2026-12-31" },
            { label: "Dez de 2025 a Fev de 2026", value: "dec2025_jan2026", start: "2025-12-01", end: "2026-02-10" }

        ],
        dynamic: [
            { label: "Últimos 30 dias", value: "Last30d" },
            { label: "Últimos 120 dias", value: "Last120d" },
            { label: "Últimos 180 dias", value: "Last180d" },
            { label: "Últimos 365 dias", value: "Last365d" }
        ]
    };
    
    const CATEGORIESLIST = [
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

    const AGGREGATIONLIST = [
        { label: "1 minuto", value: "minutely" },
        { label: "30 minutos", value: "half_hourly" },
        { label: "1 hora", value: "hourly" },
        { label: "6 horas", value: "six_hourly" },
        { label: "24 horas", value: "daily" },
    ];

    const reviewersList = [ 
        { label: "Argentina", value: "Argentina" },
        { label: "Estados Unidos", value: "EUA" }
    ];

    const reviewedEntityList = [ 
        { label: "Brasil", value: "Brasil" },
        { label: "Presidente Trump", value: "Presidente Trump" }
    ];

    const politicalList = [
        "Democratas", "Republicanos", "Independentes"
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
        politicalAlignment: DEFAULT_CONFIG.politicalAlignment,
        aggregation: DEFAULT_CONFIG.aggregation
    };

    // DOM SELECTORS
    const periodSelect = document.getElementById("period");
    const reviewerSelect = document.getElementById("reviewer");
    const reviewedEntitySelect = document.getElementById("reviewedEntity");
    const categorySelect = document.getElementById("category");
    const politicalSelect = document.getElementById("politicalAlignment");
    const politicalGroup = document.getElementById("political-filter-group");
    const dynamicToggle = document.getElementById("dynamic-mode");
    const toggleLabel = document.getElementById("mode-label");

    const gradesChartCanvas = document.getElementById("gradesChart");

    const volumeChartCanvas = document.getElementById("volumeChart");
    const totalNewsEl = document.getElementById("total-news");

    const gaugeChartCanvas = document.getElementById("gaugeChart");
    const gaugeValueText = document.getElementById("gaugeValueText");
    const gaugeDescription = document.getElementById("gaugeDescription")
    const gaugeFooter = document.querySelector(".gauge-footer");
    
    const lineChartCanvas = document.getElementById("lineChart");
    const resetZoomBtn = document.getElementById("resetZoomBtn");
    // const averageButtonsContainer = document.querySelector(".average-buttons");
    const evolutionTitleEl = document.getElementById("evolution-title");
    const evolutionSubtitleEl = document.getElementById("evolution-subtitle");


    // Referências para instâncias do Choices
    let choicesPeriod, choicesCategory, choicesReviewer, choicesReviewedEntity, choicesPolitical;
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
            });
            choicesCategory.setChoices(CATEGORIESLIST.map(c => ({ 
                value: c, label: c, selected: c === "Todas" 
            })), "value", "label", true); /* Select todas by default; true := remove everything that exists */

            choicesPolitical = new Choices("#politicalAlignment", {
                removeItemButton: true, 
                searchEnabled: false, 
                placeholderValue: "Selecione...",
                itemSelectText: "", 
                position: "bottom", 
                maxItemCount: 3,
                maxItemText: ""
            });
            choicesPolitical.setChoices(politicalList.map(p => ({ 
                value: p, label: p, selected: p === "Independentes" 
            })), "value", "label", true);


            const setupCollapse = (choiceInstance) => {
                const container = choiceInstance.containerOuter.element;
                container.classList.add("collapsed");
                container.addEventListener("showDropdown", () => container.classList.remove("collapsed"));
                container.addEventListener("hideDropdown", () => container.classList.add("collapsed"));
            };
            setupCollapse(choicesCategory);
            setupCollapse(choicesPolitical);
        }
        updateToggleVisual(appState.isDynamic);
        checkEvaluatorContext(appState.reviewer);

        // is dinamic? then, PULLING
        if (appState.isDynamic) {
            pollingInterval = setInterval(updateDashboard, 600000);
        }
    };

    function updatePeriodDropdown(isDynamic) {
        if (!choicesPeriod) return;
        
        const options = isDynamic ? PERIODS_CONFIG.dynamic : PERIODS_CONFIG.static;
        choicesPeriod.clearStore(); // Clear all options
        choicesPeriod.setChoices(options, "value", "label", true);
        
        // Set first option as default selected
        const defaultOption = options[0];
        choicesPeriod.setChoiceByValue(defaultOption.value);
        handlePeriodChange(defaultOption.value);
    }

    function updateToggleVisual(isDynamic) {
        if (toggleLabel) {
            if(isDynamic) {
                toggleLabel.textContent = "Modo dinâmico: atualização em tempo real";
                toggleLabel.style.color = "#008BC9";
                toggleLabel.style.fontWeight = "700";
            } else {
                toggleLabel.textContent = "Modo estático: 2025";
                toggleLabel.style.color = "white";
                toggleLabel.style.fontWeight = "700";
            }
        }

        // Visibility of gauge footer
        if (gaugeFooter) {
            // dynamic = flex (visible) | static = none (hidden)
            gaugeFooter.style.display = isDynamic ? "flex" : "none";
        }

        if (dynamicToggle) {
            dynamicToggle.checked = isDynamic;
            //dynamicToggle.disabled = true;
        }
    }

    // Show/hide political alignemnt filter
    function checkEvaluatorContext(reviewer) {
        if (!politicalGroup) return;
        if (reviewer === "EUA") {
            politicalGroup.classList.remove("hidden");
        } else {
            politicalGroup.classList.add("hidden");
            // Reset to "Independentes" when hidden
            if (choicesPolitical) {
                choicesPolitical.setChoiceByValue("Independentes");
                appState.politicalAlignment = null;
            }
        }
    }

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

    function processAndUpdateHistogramChart(apiData) {
        // apiData expected: [{ bucket: 1, count: 10 }, { bucket: 2, count: 5 }, ...]
        const fullBuckets = [1, 2, 3, 4, 5, 6, 7];
        const labels = fullBuckets.map(String);
        const dataMap = {};
        
        if (apiData) {
            apiData.forEach(row => {
                dataMap[parseInt(row.grade_bucket)] = parseInt(row.count);
            });
        }
        
        const values = fullBuckets.map(bucket => dataMap[bucket] || 0);
        drawGradesHistogramChart(gradesChartCanvas, labels, values);
    }
    
    function processAndUpdateVolumeChart(apiData) {
        if (!apiData || apiData.length === 0) {
            totalNewsEl.textContent = "0";
            drawVolumeChart(volumeChartCanvas, ["Nenhum dado"], []);
            return 0;
        }

        const divisor = (appState.politicalAlignment && appState.politicalAlignment.length > 0) ? appState.politicalAlignment.length : 1;
        const labels = [];
        const values = [];
        let total = 0;

        const sortedData = apiData.sort((a, b) => new Date(a.time_period) - new Date(b.time_period));

        sortedData.forEach(row => {
            const date = new Date(row.time_period);
            
            let labelStr = "";
            if (['hourly', 'half_hourly', 'minutely'].includes(appState.aggregation)) {
                labelStr = date.toLocaleString('pt-BR', { 
                    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' 
                });
            } else {
                labelStr = date.toLocaleDateString('pt-BR', { 
                    day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' 
                });
            }
            labels.push(labelStr);
            
            let count = parseInt(row.news_count, 10);
            count = Math.round(count / divisor);
            
            values.push(count);
            total += count;
        });

        drawVolumeChart(volumeChartCanvas, labels, values);
        const sufixo = total === 1 ? "notícia analisada no período" : "notícias analisadas no período";
        totalNewsEl.innerHTML = `<strong>${total.toLocaleString('pt-BR')}</strong> ${sufixo}`;
        return total;
    }

    // Data processing: JSON from JSON -> Chart.js format
    function processAndUpdateGaugeDisplay(value) {
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

        if (gaugeDescription) {
            gaugeDescription.textContent = descText;
            gaugeDescription.style.color = descColor;
        }

        drawGaugeChart(gaugeChartCanvas, finalValue);
    }

    //// POP-UP
    // Confirmation pop-up window for news roll down logic
    const confirmPopup = document.getElementById("chart-popup");
    let currentClickedDate = null;
    const popupDateSpan = document.getElementById("popup-date")
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

        let dateISO = currentClickedDate.date;;
        // url for new handlePeriodChange
        const params = new URLSearchParams();
        params.append("date", dateISO);
        params.append("aggregation", appState.aggregation);
        params.append("reviewer", appState.reviewer);
        params.append("reviewedEntity", appState.reviewedEntity);

        if (appState.category) {
            appState.category.forEach(c => params.append("category", c));
        }
        if (appState.politicalAlignment) {
            appState.politicalAlignment.forEach(p => params.append("politicalAlignment", p));
        }

        window.open(`details.html?${params.toString()}`, "_blank");
        confirmPopup.classList.add("hidden");
    });


    function updateEvolutionHeader(totalNews) {
        if (!evolutionTitleEl || !evolutionSubtitleEl) return;
        
        //title
        evolutionTitleEl.innerHTML = `Indicador de Imagem na Mídia por IA (FGV IMíd.IA)<br><span style="font-size: 0.8em; font-weight: 500; opacity: 0.85;">Ente avaliador: ${appState.reviewer} | Ente em avaliação: ${appState.reviewedEntity}</span>`;

        let dateStr = "";
        if (appState.isDynamic) {
            dateStr = `nos ${PERIODS_CONFIG.dynamic.find(p => p.value === appState.periodValue)?.label?.replace("Ú", "ú") || appState.periodValue}`;
        } else {
            const formatDate = (isoDate) => {
                if (!isoDate) return "??";
                const d = new Date(isoDate);
                const parts = isoDate.split('-');
                return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`; // dd/mm/aa
            };
            dateStr = `de ${formatDate(appState.customStartDate)} a ${formatDate(appState.customEndDate)}`;
        }

        //subtitle
        const totalStr = totalNews ? totalNews.toLocaleString('pt-BR') : "0";
        evolutionSubtitleEl.textContent = `Evolução do Indicador de Imagem no Exterior ${dateStr} | ${totalStr} notícias analisadas no período`;
    }

    function processAndUpdateLineChart(apiData) {
        if (!apiData || apiData.length === 0) {
            drawLineChart(lineChartCanvas, ["Nenhum dado encontrado."], [], null);
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

        const formattedLabels = sortedDates.map(dateStr => {
            const date = new Date(dateStr);
            
            // Se for horária (hourly) ou menor, mostra a hora
            if (appState.aggregation === 'hourly' || appState.aggregation === 'half_hourly') {
                return date.toLocaleString('pt-BR', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    timeZone: 'UTC' 
                });
            }
            
            // Padrão Diário/Mensal
            return date.toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit', 
                year: '2-digit', 
                timeZone: 'UTC' 
            });
        });

        // Prepare datasets based on the series returned (categories or political alignments)
        const datasets = Array.from(allSeries).map(labelName => {
            const seriesRows = apiData.filter(row => row.series_label === labelName);
            // Fast access for date -> average grade
            const dataMap = new Map();

            seriesRows.forEach(row => {
                dataMap.set(row.time_period, parseFloat(row.average_grade));
            });

            // Align average grades with
            const alignedData = sortedDates.map(date => dataMap.get(date) || null);
            return {
                label: labelName,
                data: alignedData
            };
        });

        
        const handlePointClick = (formattedDateStr, index, event) => {
            const rawDateISO = sortedDates[index];
            console.log("Data clicada (ISO):", rawDateISO);
            // Atualiza visual do popup
            if (formattedDateStr && popupDateSpan) {
                popupDateSpan.textContent = formattedDateStr;
            }
            
            // Guarda dado bruto para a navegação
            currentClickedDate = { date: rawDateISO };

            const x = event.native.clientX;
            const y = event.native.clientY;
            
            // Posiciona e mostra
            confirmPopup.style.left = `${x}px`;
            confirmPopup.style.top = `${y - 90}px`;
            confirmPopup.classList.remove("hidden");
        };

        drawLineChart(lineChartCanvas, formattedLabels, datasets, handlePointClick);
    }

    async function updateDashboard() {
        const apiFilters = {
            reviewer: appState.reviewer,
            reviewedEntity: appState.reviewedEntity,
            category: appState.category,
            politicalAlignment: appState.politicalAlignment,
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
            console.log("[Dashboard] Buscando dados...", apiFilters);
            const [gradesData, gaugeVal, volumeData, lineData] = await Promise.all([
                fetchGradesHistogramData(apiFilters),
                fetchGaugeData(apiFilters),
                fetchVolumeChartData(apiFilters),
                fetchLineChartData(apiFilters)
            ]);

            processAndUpdateHistogramChart(gradesData);
            processAndUpdateGaugeDisplay(gaugeVal); 
            const totalNewsCount = processAndUpdateVolumeChart(volumeData);
            processAndUpdateLineChart(lineData);
            updateEvolutionHeader(totalNewsCount);
        } catch (err) {
            console.error("Erro dashboard:", err);
            totalNewsEl.textContent = "Erro";
        }
    }
    
    // LISTENERS 

    // Dynamic toggle listener
    if (dynamicToggle) {
        dynamicToggle.addEventListener("change", (e) => {
            appState.isDynamic = e.target.checked;
            updateToggleVisual(appState.isDynamic);
            updatePeriodDropdown(appState.isDynamic);
            updateDashboard();

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

    // Political alignment
    if (politicalSelect) {
        politicalSelect.addEventListener("change", () => {
            const selectedPol = Array.from(politicalSelect.selectedOptions).map(o => o.value);
            
            const currentCategories = choicesCategory ? choicesCategory.getValue(true) : [];
            const catsArr = Array.isArray(currentCategories) ? currentCategories : [currentCategories];

            // if more than 1 political alignment selected AND more than 1 category selected
            if (selectedPol.length > 1 && catsArr.length > 1) {
                if (choicesCategory) {
                    // Remove multiple selections and revert to default
                    choicesCategory.removeActiveItems(); 
                    choicesCategory.setChoiceByValue("Todas"); 
                }
                appState.category = ["Todas"];
            } 
            
            appState.politicalAlignment = selectedPol.length > 0 ? selectedPol : ["Independentes"];
            updateDashboard();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener("change", () => {
            const selectedCat = Array.from(categorySelect.selectedOptions).map(o => o.value);
            
            const currentPol = choicesPolitical ? choicesPolitical.getValue(true) : [];
            const polArr = Array.isArray(currentPol) ? currentPol : [currentPol];

            // If selecting more than 1 category AND more than 1 political alignment
            if (selectedCat.length > 1 && polArr.length > 1) {
                // Check if the political filter is active (visible)
                if (choicesPolitical && !politicalGroup.classList.contains("hidden")) {
                    // Remove multiple political alignment selections and revert to default
                    choicesPolitical.removeActiveItems();
                    choicesPolitical.setChoiceByValue("Independentes");
                    appState.politicalAlignment = ["Independentes"];
                }
            }

            appState.category = selectedCat.length > 0 ? selectedCat : ["Todas"];
            updateDashboard();
        });
    }
    
    if (reviewedEntitySelect) reviewedEntitySelect.addEventListener("change", (e) => { 
        appState.reviewedEntity = e.target.value; 
        updateDashboard(); 
    });

    if (reviewerSelect) {
        reviewerSelect.addEventListener("change", (e) => { 
            appState.reviewer = e.target.value; 
            
            checkEvaluatorContext(appState.reviewer);
            
            if (choicesPolitical) {
                choicesPolitical.removeActiveItems();
                choicesPolitical.setChoiceByValue("Independentes");
                appState.politicalAlignment = ["Independentes"];
            }
            if (choicesCategory) {
                choicesCategory.removeActiveItems(); 
                choicesCategory.setChoiceByValue("Todas"); 
                appState.category = ["Todas"];
            }
            
            updateDashboard(); 
        });
    }

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



