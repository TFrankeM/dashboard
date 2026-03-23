import { fetchGradesHistogramData, fetchVolumeChartData, fetchGaugeData, fetchLineChartData } from "./api_adapter.js";
import { drawGradesHistogramChart, drawVolumeChart, drawGaugeChart, drawLineChart, resetLineChartZoom, clearLineChartSelection } from "./charts.js";
import { DICTIONARY } from "./i18n.js";

document.addEventListener("DOMContentLoaded", function () {
    
    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const mobileFilterText = document.getElementById("mobile-filter-text");
    const filtersWrapper = document.getElementById("filters-wrapper");

    let CURRENT_LANG = "pt-BR";
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
    function tPolitical(val) {
        return DICTIONARY[CURRENT_LANG].political_options[val] || val;
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

        if (mobileFilterBtn && filtersWrapper) {
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

        // tooltips
        document.querySelectorAll("[data-i18n-tooltip]").forEach(el => {
            const key = el.getAttribute("data-i18n-tooltip");
            if (el._tippy) {
                el._tippy.setContent(texts[key]);
            }
            el.setAttribute("data-tippy-content", texts[key]);
        });

        // filters
        updateChoicesLabels(choicesEvaluatorEntity, tEntity);
        updateChoicesLabels(choicesEvaluatedEntity, tEntity);
        updateChoicesLabels(choicesPolitical, tPolitical);
        updateChoicesLabels(choicesCategory, tCategory);
        updatePeriodDropdown(pendingState.isDynamic);

        updateEvolutionHeader(parseInt(totalNewsEl.textContent.replace(/\D/g,'')) || 0);
    }

    function updateChoicesLabels(choiceInstance, translatorFunc) {
        if (!choiceInstance) return;
        const currentChoices = choiceInstance._store.choices;
        const newChoices = currentChoices.map(item => ({
            value: item.value,
            label: translatorFunc(item.value),
            selected: item.selected,
            disabled: item.disabled
        }));
        choiceInstance.clearStore();
        choiceInstance.setChoices(newChoices, "value", "label", true);
    }


    //// UI Initialization ////
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    };
    if (typeof tippy !== "undefined") {
        tippy(".info-icon", {
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
        });
    }

    // filter toggle button for mobile
    if (mobileFilterBtn && filtersWrapper) {
        mobileFilterBtn.addEventListener("click", () => {
            const isOpen = filtersWrapper.classList.toggle("open");
            mobileFilterBtn.classList.toggle("expanded");
            
            const textKey = isOpen ? "btn_hide_filters" : "btn_show_filters";
            mobileFilterText.textContent = t(textKey);
            
            if (typeof lucide !== "undefined") lucide.createIcons();
        });
    }

    // Scroll: compact header; update side menu
    const filterSection = document.getElementById("filters-container");
    const navDots = document.querySelectorAll(".nav-dot");
    const sections = document.querySelectorAll("header, section, main");
    window.addEventListener("scroll", () => {
        const scrollY = window.scrollY;

        // compact filters
        if (filterSection) {
            if (scrollY > 200) {
                filterSection.classList.add("compact");
            } else if (scrollY < 50) {
                filterSection.classList.remove("compact");
            }
        }

        // update side menu
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

        // close popup and tooltips if scroll
        if (popup && !popup.classList.contains("hidden")) {
            popup.classList.add("hidden");
        };
        if (typeof tippy !== "undefined" && tippy.hideAll) {
            tippy.hideAll();
        };
        clearLineChartSelection();
    });


    //// Default config ////

    // SINGLE SOURCE OF TRUTH
    const DEFAULT_CONFIG = {
        isDynamic: false,
        period: "year_2025",
        customStartDate: "2025-01-01",
        customEndDate: "2025-06-30",
        evaluatorEntity: ["Argentina"],
        evaluatedEntity: ["Brasil"],
        category: ["Todas"],
        politicalAlignment: null,
        aggregation: 1
    };
    let appState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    let pendingState = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    let cachedApiData = {};
    
    // Static data for dropdowns
    const PERIODS_CONFIG = {
        static: [
            { value: "sem1_2025", start: "2025-01-01", end: "2025-06-30" },
            { value: "sem2_2025", start: "2025-07-01", end: "2025-12-31" },
            { value: "q1_2025", start: "2025-01-01", end: "2025-03-31" },
            { value: "q2_2025", start: "2025-04-01", end: "2025-06-30" },
            { value: "q3_2025", start: "2025-07-01", end: "2025-09-30" },
            { value: "q4_2025", start: "2025-10-01", end: "2025-12-31" },
            { value: "year_2025", start: "2025-01-01", end: "2025-12-31" },
            { value: "year_2026", start: "2026-01-01", end: "2026-12-31" },
            { value: "dec2025_jan2026", start: "2025-12-01", end: "2026-02-10" }

        ],
        dynamic: [
            { value: "Last30d" },
            { value: "Last120d" },
            { value: "Last180d" },
            { value: "Last365d" }
        ]
    };

    /* Get keys and transform into an array */
    const CATEGORIESLIST = Object.keys(DICTIONARY["pt-BR"].category_options); 

    const RELATIONSHIPS = {
        // Evaluator: [Evaluated]
        "Argentina": ["Brasil"],
        "EUA": ["Presidente Trump"]
    };
    
    // SELECTORS
    const evaluatorEntitySelect = document.getElementById("evaluatorEntity");
    const politicalSelect = document.getElementById("politicalAlignment");
    const politicalGroup = document.getElementById("political-filter-group");
    const evaluatedEntitySelect = document.getElementById("evaluatedEntity");
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
    const evolutionTitleEl = document.getElementById("evolution-title");
    const evolutionSubtitleEl = document.getElementById("evolution-subtitle");
    const popup = document.getElementById("chart-popup");


    // Referências para instâncias do Choices
    let choicesPeriod, choicesCategory, choicesEvaluatorEntity, choicesEvaluatedEntity, choicesPolitical, choicesLanguage;
    let currentClickedDate = null;
    let pollingInterval = null;

    async function fetchOptionsFromDB(targetType, filterValue) {
        /* */
        return new Promise(resolve => {
            setTimeout(() => {
                let options = [];
                if (targetType === "evaluated") {
                    if (!filterValue || filterValue.length === 0) {
                        options = [...new Set(Object.values(RELATIONSHIPS).flat())];
                    } else {
                        const allowed = new Set();
                        filterValue.forEach(rev => {
                            if (RELATIONSHIPS[rev]) RELATIONSHIPS[rev].forEach(item => allowed.add(item));
                        });
                        options = [...allowed];
                    }
                } else if (targetType === "evaluator") {
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
                
                resolve(options.map(label => ({ value: label, label: tEntity(label) })));
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
                choices: [
                    { value: "pt-BR", label: "PT", selected: true },
                    { value: "en-US", label: "EN" },
                    { value: "es-ES", label: "ES" }
                ]
            });

            // Evaluator (Multi)
            choicesEvaluatorEntity = new Choices("#evaluatorEntity", multiOpts);
            const initialEvaluatorEntities = await fetchOptionsFromDB("evaluator", []); 
            choicesEvaluatorEntity.setChoices(initialEvaluatorEntities, "value", "label", true);
            choicesEvaluatorEntity.setChoiceByValue(appState.evaluatorEntity);    // set initial value
            
            // Political (Multi)
            choicesPolitical = new Choices("#politicalAlignment", multiOpts);
            const polList = ["Democratas", "Republicanos", "Independentes"];
            choicesPolitical.setChoices(polList.map(p => ({ value: p, label: p, selected: p === "Independentes" })), "value", "label", true);

            // Evaluated (Multi)
            choicesEvaluatedEntity = new Choices("#evaluatedEntity", multiOpts);
            const initialEvaluated = await fetchOptionsFromDB("evaluated", appState.evaluatorEntity);
            choicesEvaluatedEntity.setChoices(initialEvaluated, "value", "label", true);
            choicesEvaluatedEntity.setChoiceByValue(appState.evaluatedEntity);

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
        updateToggleVisual(pendingState.isDynamic);
        checkEvaluatorContext(appState.evaluatorEntity);   // check for political alignement
        checkApplyButtonState();                           // Initialize apply button
        
        // Listeners for Language Buttons
        const langElement = document.getElementById("language-select");
        if (langElement) {
            langElement.addEventListener("change", async (e) => {
                CURRENT_LANG = e.target.value;
                translateUI();
                // instead of updateDashboard() that takes time, just refresh graphs
                redrawCharts();
                updateToggleVisual(pendingState.isDynamic);
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

        evaluatorEntitySelect.addEventListener("change", async () => {
            onFilterChange("evaluatorEntity", choicesEvaluatorEntity, true);
            checkEvaluatorContext(pendingState.evaluatorEntity);
            
            const newOptions = await fetchOptionsFromDB("evaluated", pendingState.evaluatorEntity);
            const currentSelected = choicesEvaluatedEntity.getValue(true);
            choicesEvaluatedEntity.clearStore();
            choicesEvaluatedEntity.setChoices(newOptions, "value", "label", true);
            const validSelection = currentSelected.filter(s => newOptions.find(o => o.value === s));
            if(validSelection.length > 0) {
                choicesEvaluatedEntity.setChoiceByValue(validSelection);
            }

            pendingState.evaluatedEntity = choicesEvaluatedEntity.getValue(true); 
        });

        evaluatedEntitySelect.addEventListener("change", async () => {
            onFilterChange("evaluatedEntity", choicesEvaluatedEntity, true);
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
        const keys = ["evaluatorEntity", "evaluatedEntity", "category"];
        const changedVal = pendingState[changedKey];

        if (Array.isArray(changedVal) && changedVal.length > 1) {
            keys.forEach(k => {
                if (k !== changedKey) {
                    const otherVal = pendingState[k];
                    if (Array.isArray(otherVal) && otherVal.length > 1) {
                        const first = otherVal[0];
                        pendingState[k] = [first];
                        
                        if (k === "evaluatorEntity") { choicesEvaluatorEntity.removeActiveItems(); choicesEvaluatorEntity.setChoiceByValue(first); }
                        if (k === "evaluatedEntity") { choicesEvaluatedEntity.removeActiveItems(); choicesEvaluatedEntity.setChoiceByValue(first); }
                        if (k === "category") { choicesCategory.removeActiveItems(); choicesCategory.setChoiceByValue(first); }
                    }
                }
            });
        }
    }

    function checkApplyButtonState() {
        /* 
            Compares appState and pendingState to determine if there are unsaved changes.
        */
        const normalize = (s) => {
            const copy = JSON.parse(JSON.stringify(s));
            if(Array.isArray(copy.evaluatorEntity)) copy.evaluatorEntity.sort();
            if(Array.isArray(copy.evaluatedEntity)) copy.evaluatedEntity.sort();
            if(Array.isArray(copy.category)) copy.category.sort();
            if(Array.isArray(copy.politicalAlignment)) copy.politicalAlignment.sort();
            copy.aggregation = parseFloat(copy.aggregation);

            return JSON.stringify(copy);
        };

        const isDifferent = normalize(appState) !== normalize(pendingState);

        if (isDifferent) {
            btnApply.classList.remove("disabled"); /* removes disabled class from css */
            btnApply.removeAttribute("disabled");  /* removes <button> from html*/
        } else {
            btnApply.classList.add("disabled");
            btnApply.setAttribute("disabled", "true");
        }
    }

    function applyFilters() {
        appState = JSON.parse(JSON.stringify(pendingState));
        checkApplyButtonState();
        updateDashboard();

        if (window.innerWidth < 1024 && filtersWrapper && filtersWrapper.classList.contains("open")) {
            filtersWrapper.classList.remove("open");
            mobileFilterBtn.classList.remove("expanded");
            mobileFilterText.textContent = t("btn_show_filters");
        }

        if (appState.isDynamic) {
            if (pollingInterval) clearInterval(pollingInterval);
            pollingInterval = setInterval(updateDashboard, 600000);
        } else {
            if (pollingInterval) clearInterval(pollingInterval);
        }
    }


    function updatePeriodDropdown(isDynamic) {
        if (!choicesPeriod) return;

        const rawOptions = isDynamic ? PERIODS_CONFIG.dynamic : PERIODS_CONFIG.static;
        const options = rawOptions.map(opt => ({
            ...opt,
            label: tPeriod(opt.value)
        }));

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
    function checkEvaluatorContext(evaluatorEntities) {
        const hasUS = Array.isArray(evaluatorEntities) ? evaluatorEntities.includes("EUA") : evaluatorEntities === "EUA";
        
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
        // apiData expected: [{ grade_bucket: 1, count: 10 }, { grade_bucket: 2, count: 5 }, ...]
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
        drawGradesHistogramChart(gradesChartCanvas, labels, values, texts);
    }
    
    function processAndUpdateVolumeChart(apiData) {
        if (!apiData || apiData.length === 0) {
            totalNewsEl.textContent = "0";
            drawVolumeChart(volumeChartCanvas, [t("no_data_found")], []);
            return 0;
        }

        const divisor = (appState.politicalAlignment && appState.politicalAlignment.length > 0) ? appState.politicalAlignment.length : 1;
        const labels = [];
        const values = [];
        let total = 0;

        const sortedData = apiData.sort((a, b) => new Date(a.time_period) - new Date(b.time_period));

        sortedData.forEach(row => {
            const date = new Date(row.time_period);
            let labelStr;
            labelStr = date.toLocaleDateString("pt-BR");
            labels.push(labelStr);

            let count = parseInt(row.news_count, 10);
            count = Math.round(count / divisor);

            values.push(count);
            total += count;
        });

        drawVolumeChart(volumeChartCanvas, labels, values, {
            labelNews: t("chart_label_news"),
            tooltipDay: t("chart_volume_tooltip_day"),
            suffixSingular: t("chart_volume_tooltip_unit_singular"),
            suffixPlural: t("chart_volume_tooltip_unit_plural")
        });
        
        const sufixo = total === 1 ? t("chart_volume_desc_singular") : t("chart_volume_desc_plural");
        totalNewsEl.classList.remove("skeleton");
        totalNewsEl.innerHTML = `<strong>${total.toLocaleString('pt-BR')}</strong> ${sufixo}`;
        return total;
    }

    // Data processing: JSON from JSON -> Chart.js format
    function processAndUpdateGaugeDisplay(value) {
        const finalValue = value !== undefined && value !== null ? parseFloat(value) : 4.00;
        gaugeValueText.textContent = finalValue.toFixed(2);

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

        drawGaugeChart(gaugeChartCanvas, finalValue, { segments });
    }

    //// POP-UP
    // Confirmation pop-up window for news roll down logic
    const confirmPopup = document.getElementById("chart-popup");
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

        // url for new handlePeriodChange
        const params = new URLSearchParams();
        params.append("startDate", currentClickedDate.startDate);
        params.append("endDate", currentClickedDate.endDate);
        params.append("aggregation", appState.aggregation);
        params.append("evaluatorEntity", appState.evaluatorEntity);
        params.append("evaluatedEntity", appState.evaluatedEntity);

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
        
        const revArr = Array.isArray(appState.evaluatorEntity) ? appState.evaluatorEntity : [appState.evaluatorEntity];
        const entArr = Array.isArray(appState.evaluatedEntity) ? appState.evaluatedEntity : [appState.evaluatedEntity];
        const revStr = revArr.map(r => tEntity(r)).join(", ");
        const entStr = entArr.map(e => tEntity(e)).join(", ");
        
        // title
        evolutionTitleEl.innerHTML = `${t("app_title")}<br><span style="font-size: 0.8em; font-weight: 500; opacity: 0.85;">${t("evo_title_prefix")}${revStr}${t("evo_title_separator")}${entStr}</span>`;
        
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
            dateStr = `${t("evo_date_connector_static")}${formatDate(appState.customStartDate)}${t("evo_date_connector_static_to")}${formatDate(appState.customEndDate)}`;
        }

        // subtitle
        const totalStr = totalNews ? totalNews.toLocaleString(CURRENT_LANG) : "0";
        evolutionSubtitleEl.classList.remove("skeleton");
        evolutionSubtitleEl.textContent = `${t("evo_subtitle_prefix")}${dateStr} | ${t("chart_line_tooltip_count")}: ${totalStr}`;
    }

    function processAndUpdateLineChart(apiData) {
        if (!apiData || apiData.length === 0) {
            drawLineChart(lineChartCanvas, [t("no_data_found")], [], null);
            return;
        }

        const allDates = new Set();  // all unique time_period, ISO date 
        const allSeries = new Set(); // category names

        apiData.forEach(row => {
            if (row.time_period) {
                allDates.add(row.time_period);
            }
            if (row.series_label) {
                allSeries.add(row.series_label);
            }
        });
        //console.log("All Dates:", allDates);
        //console.log("All Series:", allSeries);

        // default sort() treats items as strings; new Date creates timestamps
        // (a - b) if negative, 'a' comes first; if positive, 'b' comes first
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
    
        // Tooltip dates full format, with hours if aggregation < 24h
        const agg = parseFloat(appState.aggregation);
        const showHours = !isNaN(agg) && agg < 24;

        // X-Axis Labels: dd/mm, hh:mm if needed
        const axisLabels = sortedDates.map(dateStr => {
            const date = new Date(dateStr);
            if (!showHours) {
                return date.toLocaleDateString(CURRENT_LANG, { day: "2-digit", month: "2-digit" });
            }
            return date.toLocaleString(CURRENT_LANG, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        });
        
        const tooltipDates = sortedDates.map(dateStr => {
            const date = new Date(dateStr);
            const options = { day: "2-digit", month: "2-digit", year: "numeric" };
            if (showHours) {
                options.hour = "2-digit";
                options.minute = "2-digit";
            }
            return date.toLocaleString(CURRENT_LANG, options);
        });

        // Prepare datasets based on the series returned (categories or political alignments)
        const datasets = Array.from(allSeries).map(labelName => {
            const seriesRows = apiData.filter(row => row.series_label === labelName);
            // Fast access for date -> average grade
            
            // dataMap: time_period (ISO date) -> { grade: average_grade, count: news_count }
            // if the category has no news in a date, that date will be undefined
            const dataMap = new Map();

            seriesRows.forEach(row => {
                dataMap.set(row.time_period, {
                    grade: parseFloat(row.average_grade),
                    count: parseInt(row.news_count || 0, 10)
                });
            });

            // final structure: [{ x: dateStr, y: average_grade, count: news_count }, ...]
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
            if (translatedLabel === labelName) {
                translatedLabel = tPolitical(labelName);
            }
            return { label: translatedLabel, data: alignedData };
        });

        
        const handlePointClick = (index, event, popupCoords) => {
            // rawDateISO := e.g.: 2025-05-29T21:00:00.000Z
            const rawDateISO = sortedDates[index];
            // Keep clicked date for details navigation
            const startDateObj = new Date(rawDateISO);
            const aggHours = parseFloat(appState.aggregation) || 24;
            // endDateObj is startDate + aggregation hours (in milliseconds)
            const endDateObj = new Date(startDateObj.getTime() + (aggHours * 60 * 60 * 1000));
            
            currentClickedDate = { 
                startDate: startDateObj.toISOString(),
                endDate: endDateObj.toISOString(),
                aggregation: aggHours
            };

            // tooltipDates := Full date displayed in the tooltip | e.g.: 29/05/2025, 18:00
            if (tooltipDates && popupDateSpan) {
                popupDateSpan.textContent = tooltipDates[index];
            }
            
            const x = popupCoords ? popupCoords.x : event.native.clientX;
            confirmPopup.style.left = `${x}px`;
            confirmPopup.classList.remove("hidden");

            const popupHeight = confirmPopup.offsetHeight;
            const y = popupCoords ? popupCoords.y - popupHeight : event.native.clientY - popupHeight - 10;
            confirmPopup.style.top = `${y}px`;
        };

        //console.log("Axis Labels:", datasets);
        drawLineChart(lineChartCanvas, axisLabels, datasets, handlePointClick, {
            yAxisTitle: t("chart_line_y_axis_title"),
            tooltipGrade: t("chart_line_tooltip_avg"),
            tooltipNews: t("chart_line_tooltip_count"),
            originalDates: tooltipDates
        });
    }


    async function updateDashboard() {
        if (btnApply) {
            // Loading: disable button, show spinner
            btnApply.innerHTML = `
                <i data-lucide="loader-circle" class="icon-sm" style="animation: spin 1s linear infinite;"></i>
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
            evaluatorEntity: appState.evaluatorEntity, 
            evaluatedEntity: appState.evaluatedEntity, 
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
            // allSettled prevents one failure from breaking the entire dashboard

            const results = await Promise.allSettled([
                // Expected: [{ grade_bucket: number, count: number }]
                fetchGradesHistogramData(apiFilters),   // 0
                // Expected: [{ time_period: string (ISO date), news_count: number }]
                fetchVolumeChartData(apiFilters),       // 1
                // Expected: number (average grade) or null
                fetchGaugeData(apiFilters),             // 2
                // Expected: [{ time_period: string (ISO date), series_label: string, average_grade: number, news_count: number }]
                fetchLineChartData(apiFilters)          // 3
            ]);

            // Extract results or null if failed
            const [histogramData, volumeData, gaugeVal, lineData] = results.map(res => 
                res.status === "fulfilled" ? res.value : null
            );

            cachedApiData = { histogramData, volumeData, gaugeVal, lineData };

            if (histogramData) processAndUpdateHistogramChart(histogramData);
            const totalNewsCount = processAndUpdateVolumeChart(volumeData); // Handles null internally
            processAndUpdateGaugeDisplay(gaugeVal); // Handles null internally
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
            totalNewsEl.textContent = "Erro";
        } finally {
            if (btnApply) {
                btnApply.innerHTML = `
                <i data-lucide="check-circle" class="icon-sm"></i>
                <span data-i18n="btn_apply">${t("btn_apply")}</span>
                `;
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
                btnApply.disabled = true;
                btnApply.style.opacity = "0.8";
            }
        }
    }

    function redrawCharts() {
        if (!cachedApiData.histogramData) return;
        processAndUpdateHistogramChart(cachedApiData.histogramData);
        processAndUpdateVolumeChart(cachedApiData.volumeData);
        processAndUpdateGaugeDisplay(cachedApiData.gaugeVal);
        processAndUpdateLineChart(cachedApiData.lineData);
    }

    initializeFilters();
    setTimeout(updateDashboard, 100);
});

