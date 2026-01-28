import { fetchGradesHistogramData, fetchVolumeChartData, fetchGaugeData, fetchLineChartData } from "./api_adapter.js";
import { drawGradesHistogramChart, drawVolumeChart, drawGaugeChart, drawLineChart, resetLineChartZoom } from "./charts.js";
import { DICTIONARY } from "./i18n.js";

document.addEventListener("DOMContentLoaded", function () {
    
    let CURRENT_LANG = "pt-BR";
    function translateUI() {
        const texts = DICTIONARY[CURRENT_LANG];
        if (!texts) return; // language does not exist

        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.getAttribute("data-i18n");
            if (texts[key]) {
                el.textContent = texts[key];
            }
        });
    }


    //// UI Initialization ////
    
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
        customStartDate: "2025-01-01",
        customEndDate: "2025-06-30",
        reviewer: ["Argentina"],
        reviewedEntity: ["Brasil"],
        category: ["Todas"],
        politicalAlignment: null,
        aggregation: 1
    };

    let appState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    let pendingState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));


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

    const reviewersList = [ 
        { label: "Argentina", value: "Argentina" },
        { label: "Estados Unidos", value: "EUA" }
    ];

    const reviewedEntityList = [ 
        { label: "Brasil", value: "Brasil" },
        { label: "Presidente Trump", value: "Presidente Trump" }
    ];

    const RELATIONSHIPS = {
        "Argentina": ["Brasil"],
        "EUA": ["Presidente Trump"]
    };
    

    // SELECTORS
    const reviewerSelect = document.getElementById("reviewer");
    const politicalSelect = document.getElementById("politicalAlignment");
    const politicalGroup = document.getElementById("political-filter-group");
    const reviewedEntitySelect = document.getElementById("reviewedEntity");
    const periodSelect = document.getElementById("period");
    const aggregationInput = document.getElementById("aggregation");
    const categorySelect = document.getElementById("category");
    const dynamicToggle = document.getElementById("dynamic-mode");
    const toggleLabel = document.getElementById("mode-label");
    const btnApply = document.getElementById("btn-apply");
    // GRAPHS
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
    let choicesLanguage;
    let pollingInterval = null;

    async function fetchOptionsFromDB(targetType, filterValue) {
        return new Promise(resolve => {
            setTimeout(() => {
                let options = [];
                if (targetType === 'evaluated') {
                    if (!filterValue || filterValue.length === 0) {
                        options = [...new Set(Object.values(RELATIONSHIPS).flat())];
                    } else {
                        const allowed = new Set();
                        filterValue.forEach(rev => {
                            if (RELATIONSHIPS[rev]) RELATIONSHIPS[rev].forEach(item => allowed.add(item));
                        });
                        options = [...allowed];
                    }
                } else if (targetType === 'evaluator') {
                    if (!filterValue || filterValue.length === 0) {
                        options = Object.keys(RELATIONSHIPS);
                    } else {
                        const evaluators = [];
                        Object.keys(RELATIONSHIPS).forEach(rev => {
                            const targets = RELATIONSHIPS[rev];
                            if (filterValue.some(val => targets.includes(val))) {
                                evaluators.push(rev);
                            }
                        });
                        options = evaluators;
                    }
                }
                
                resolve(options.map(label => ({ value: label, label: label })));
            }, 50); 
        });
    }


    async function initializeFilters() {
        const multiOpts = {
            removeItemButton: true, 
            searchEnabled: true, 
            placeholderValue: "Selecione...", 
            itemSelectText: "", 
            shouldSort: true, 
            editItems: false, 
            maxItemCount: 5,
            maxItemText: "",
            position: "bottom"
        };
        const singleOpts = { 
            searchEnabled: false, 
            placeholderValue: "Selecione...", 
            itemSelectText: "", 
            shouldSort: false, 
            position: "bottom" 
        };

        if (typeof Choices !== "undefined") {
            // Language
            choicesLanguage = new Choices("#language-select", {
                searchEnabled: false,
                itemSelectText: "",
                shouldSort: false,
                position: "bottom",
                // Passamos as opções diretamente na inicialização para garantir que carreguem
                choices: [
                    { value: "pt-BR", label: "PT", selected: true },
                    { value: "en-US", label: "EN" },
                    { value: "es-ES", label: "ES" }
                ]
            });

            // Reviewer (Multi)
            choicesReviewer = new Choices("#reviewer", multiOpts);
            const initialReviewers = await fetchOptionsFromDB("evaluator", []); 
            choicesReviewer.setChoices(initialReviewers, "value", "label", true);
            choicesReviewer.setChoiceByValue(appState.reviewer);    // set initial value

            
            // Political (Multi)
            choicesPolitical = new Choices("#politicalAlignment", multiOpts);
            const polList = ["Democratas", "Republicanos", "Independentes"];
            choicesPolitical.setChoices(polList.map(p => ({ value: p, label: p, selected: p === "Independentes" })), "value", "label", true);

            // Reviewed (Multi)
            choicesReviewedEntity = new Choices("#reviewedEntity", multiOpts);
            const initialReviewed = await fetchOptionsFromDB("evaluated", appState.reviewer);
            choicesReviewedEntity.setChoices(initialReviewed, "value", "label", true);
            choicesReviewedEntity.setChoiceByValue(appState.reviewedEntity);

            // Period
            choicesPeriod = new Choices("#period", singleOpts);
            updatePeriodDropdown(appState.isDynamic);

            // Aggregation (Input)
            if (aggregationInput) {
                aggregationInput.value = appState.aggregation;
            }

            // Category (Multi)
            choicesCategory = new Choices("#category", multiOpts);
            choicesCategory.setChoices(CATEGORIESLIST.map(c => ({ value: c, label: c, selected: c === "Todas" })), "value", "label", true);

            setupFilterListeners();     // listeners for update pending filters state and UI
        }
        
        translateUI();
        updateToggleVisual(appState.isDynamic);
        checkEvaluatorContext(appState.reviewer);   // check for political alignement
        checkApplyButtonState();                    // Initialize apply button
        
        // Listeners for Language Buttons
        const langElement = document.getElementById("language-select");
        if (langElement) {
            langElement.addEventListener("change", (e) => {
                CURRENT_LANG = e.target.value;
                translateUI();
                updateToggleVisual(appState.isDynamic);
                updateEvolutionHeader(parseInt(totalNewsEl.textContent.replace(/\D/g,'')) || 0);
            });
        }

        // Dropdown if clicked in the wrapper
        const langWrapper = document.querySelector(".lang-dropdown-wrapper");
        if (langWrapper && choicesLanguage) {
            langWrapper.addEventListener("click", (e) => {
                if (!e.target.closest(".choices")) {
                    choicesLanguage.showDropdown();
                }
            });
        }
    }

    function setupFilterListeners() {
        const onFilterChange = (key, valueInstance, isMulti = false) => {
            let val;
            if (valueInstance.getValue && typeof valueInstance.getValue === "function") {
                val = valueInstance.getValue(true);
            } else {
                val = valueInstance.value; // HTML input
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

        reviewerSelect.addEventListener("change", async () => {
            onFilterChange('reviewer', choicesReviewer, true);
            checkEvaluatorContext(pendingState.reviewer);
            
            const newOptions = await fetchOptionsFromDB('evaluated', pendingState.reviewer);
            const currentSelected = choicesReviewedEntity.getValue(true);
            choicesReviewedEntity.clearStore();
            choicesReviewedEntity.setChoices(newOptions, 'value', 'label', true);
            const validSelection = currentSelected.filter(s => newOptions.find(o => o.value === s));
            if(validSelection.length > 0) {
                choicesReviewedEntity.setChoiceByValue(validSelection);
            }

            pendingState.reviewedEntity = choicesReviewedEntity.getValue(true); 
        });

        reviewedEntitySelect.addEventListener("change", async () => {
            onFilterChange('reviewedEntity', choicesReviewedEntity, true);
        });

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

        categorySelect.addEventListener("change", () => onFilterChange('category', choicesCategory, true));
        politicalSelect.addEventListener("change", () => onFilterChange('politicalAlignment', choicesPolitical, true));
        
        if (aggregationInput) {
            aggregationInput.addEventListener("input", () => {
                const val = parseFloat(aggregationInput.value);
                if (!isNaN(val) && val > 0) {
                    onFilterChange('aggregation', aggregationInput, false);
                }
            });
        }

        dynamicToggle.addEventListener("change", (e) => {
            pendingState.isDynamic = e.target.checked;
            updateToggleVisual(pendingState.isDynamic);
            updatePeriodDropdown(pendingState.isDynamic); 
            checkApplyButtonState();
        });

        btnApply.addEventListener("click", () => {
            if (!btnApply.classList.contains("disabled")) {
                applyFilters();
            }
        });
    }


    function enforceMultiSelectConstraints(changedKey) {
        const keys = ['reviewer', 'reviewedEntity', 'category'];
        const changedVal = pendingState[changedKey];

        if (Array.isArray(changedVal) && changedVal.length > 1) {
            keys.forEach(k => {
                if (k !== changedKey) {
                    const otherVal = pendingState[k];
                    if (Array.isArray(otherVal) && otherVal.length > 1) {
                        const first = otherVal[0];
                        pendingState[k] = [first];
                        
                        if (k === 'reviewer') { choicesReviewer.removeActiveItems(); choicesReviewer.setChoiceByValue(first); }
                        if (k === 'reviewedEntity') { choicesReviewedEntity.removeActiveItems(); choicesReviewedEntity.setChoiceByValue(first); }
                        if (k === 'category') { choicesCategory.removeActiveItems(); choicesCategory.setChoiceByValue(first); }
                    }
                }
            });
        }
    }

    function checkApplyButtonState() {
        const normalize = (s) => {
            const copy = JSON.parse(JSON.stringify(s));
            if(Array.isArray(copy.reviewer)) copy.reviewer.sort();
            if(Array.isArray(copy.reviewedEntity)) copy.reviewedEntity.sort();
            if(Array.isArray(copy.category)) copy.category.sort();
            if(Array.isArray(copy.politicalAlignment)) copy.politicalAlignment.sort();
            copy.aggregation = parseFloat(copy.aggregation);
            return JSON.stringify(copy);
        };

        const isDifferent = normalize(appState) !== normalize(pendingState);

        if (isDifferent) {
            btnApply.classList.remove("disabled");
            btnApply.removeAttribute("disabled");
        } else {
            btnApply.classList.add("disabled");
            btnApply.setAttribute("disabled", "true");
        }
    }

    function applyFilters() {
        appState = JSON.parse(JSON.stringify(pendingState));
        checkApplyButtonState();
        updateDashboard();

        if (appState.isDynamic) {
            if (pollingInterval) clearInterval(pollingInterval);
            pollingInterval = setInterval(updateDashboard, 600000);
        } else {
            if (pollingInterval) clearInterval(pollingInterval);
        }
    }


    function updatePeriodDropdown(isDynamic) {
        if (!choicesPeriod) return;

        const options = isDynamic ? PERIODS_CONFIG.dynamic : PERIODS_CONFIG.static;
        choicesPeriod.clearStore();
        choicesPeriod.setChoices(options, "value", "label", true);
        
        const currentVal = pendingState.periodValue;
        const exists = options.find(o => o.value === currentVal);
        if (exists) {
            choicesPeriod.setChoiceByValue(currentVal);
        } else {
            const def = options[0].value;
            choicesPeriod.setChoiceByValue(def);
            pendingState.periodValue = def;
            if (!isDynamic) {
                const config = options[0];
                pendingState.customStartDate = config.start;
                pendingState.customEndDate = config.end;
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
        if (gaugeFooter) gaugeFooter.style.display = isDynamic ? "flex" : "none";   // dynamic = flex (visible) | static = none (hidden)
        if (dynamicToggle) dynamicToggle.checked = isDynamic;
    }

    // Show/hide political alignemnt filter
    function checkEvaluatorContext(reviewers) {
        const hasUS = Array.isArray(reviewers) ? reviewers.includes("EUA") : reviewers === "EUA";
        
        if (hasUS) {
            politicalGroup.classList.remove("hidden");
                pendingState.politicalAlignment = ["Independentes"];

        } else {
            politicalGroup.classList.add("hidden");
            pendingState.politicalAlignment = null;
            
            if(choicesPolitical) {
                choicesPolitical.removeActiveItems();
                choicesPolitical.setChoiceByValue("Independentes");
                pendingState.politicalAlignment = null;
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

        const aggHours = parseFloat(appState.aggregation);

        sortedData.forEach(row => {
            const date = new Date(row.time_period);
            // show time if < 24h, else date only
            // let labelStr;
            // if (aggHours < 24) {
            //     labelStr = date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
            // } else {
            //     labelStr = date.toLocaleDateString('pt-BR');
            // }
            let labelStr;
            labelStr = date.toLocaleDateString("pt-BR");
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

        const aggHours = parseFloat(appState.aggregation);

        const formattedLabels = sortedDates.map(dateStr => {
            const date = new Date(dateStr);
            // if (aggHours < 24) {
            //     return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
            // } else {
            //     return date.toLocaleDateString('pt-BR');
            // }
            return date.toLocaleDateString("pt-BR");
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

            if (formattedDateStr && popupDateSpan) {
                popupDateSpan.textContent = formattedDateStr;
            }
            
            // Keep clicked date for details navigation
            currentClickedDate = { date: rawDateISO };

            const x = event.native.clientX;
            const y = event.native.clientY;
            
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

        totalNewsEl.textContent = "...";

        try {
            console.log("[Dashboard] Buscando dados...", apiFilters);
            const [histogramData, volumeData, gaugeVal, lineData] = await Promise.all([
                fetchGradesHistogramData(apiFilters),
                fetchVolumeChartData(apiFilters),
                fetchGaugeData(apiFilters),
                fetchLineChartData(apiFilters)
            ]);
            console.log("Dados do histograma", histogramData);
            console.log("Dados do volume", volumeData);
            console.log("Dados do gauge", gaugeVal);
            console.log("Dados do gráfico de linha", lineData);
            processAndUpdateHistogramChart(histogramData);
            const totalNewsCount = processAndUpdateVolumeChart(volumeData);
            processAndUpdateGaugeDisplay(gaugeVal); 
            updateEvolutionHeader(totalNewsCount);
            processAndUpdateLineChart(lineData);

        } catch (err) {
            console.error("Erro dashboard:", err);
            totalNewsEl.textContent = "Erro";
        }
    }


    initializeFilters();
    setTimeout(updateDashboard, 100);
});



