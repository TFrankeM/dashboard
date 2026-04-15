import { fetchGradesHistogramData, fetchVolumeChartData, fetchGaugeData, fetchLineChartData } from "./api_adapter.js";
import { drawGradesHistogramChart, drawVolumeChart, drawGaugeChart, drawLineChart, clearLineChartSelection } from "./charts.js";
import { DICTIONARY } from "./i18n.js";

// Global state variables
let CURRENT_LANG = "pt-BR";

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

const CATEGORIESLIST = Object.keys(DICTIONARY["pt-BR"].category_options);

const RELATIONSHIPS = {
    // Evaluator: [Evaluated]
    "Argentina": ["Brasil"],
    "EUA": ["Presidente Trump"]
};

// References for Choices instances
let choicesPeriod, choicesCategory, choicesEvaluatorEntity, choicesEvaluatedEntity, choicesPolitical, choicesLanguage;
let currentClickedDate = null;
let pollingInterval = null;

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

    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const mobileFilterText = document.getElementById("mobile-filter-text");
    const filtersWrapper = document.getElementById("filters-wrapper");

    if (mobileFilterBtn && filtersWrapper && mobileFilterText) {
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

    const totalNewsEl = document.getElementById("total-news");
    if (totalNewsEl) {
        updateEvolutionHeader(parseInt(totalNewsEl.textContent.replace(/\D/g,'')) || 0);
    }
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

async function fetchOptionsFromDB(targetType, filterValue) {
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

        if (window.matchMedia("(hover: hover)").matches) {
            const langWrapper = document.querySelector(".lang-dropdown-wrapper");
            const choicesEl = choicesLanguage.containerOuter.element;
            if (langWrapper && choicesEl) {
                let langTimeout;
                const openLang = () => { 
                    clearTimeout(langTimeout); 
                    choicesLanguage.showDropdown(); 
                };
                const closeLang = () => { 
                    langTimeout = setTimeout(() => choicesLanguage.hideDropdown(), 300); 
                };

                langWrapper.addEventListener("mouseenter", openLang);
                langWrapper.addEventListener("mouseleave", closeLang);
            }
        }

        const langSelect = document.getElementById("language-select");
        if (langSelect) {
            langSelect.addEventListener("change", (e) => {
                CURRENT_LANG = e.target.value;
                
                const rawDate = new URLSearchParams(window.location.search).get("date");
                if (rawDate) {
                    const dateObj = new Date(rawDate);
                    if (!isNaN(dateObj)) {
                        const dateSpan = document.getElementById("date-span");
                        if (dateSpan) dateSpan.textContent = dateObj.toLocaleDateString(CURRENT_LANG, { timeZone: "UTC" });
                    }
                }
                
                translateUI();
                redrawCharts();
                updateToggleVisual(pendingState.isDynamic);
            });
        }
    }
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
        const evalEl = document.getElementById("evaluatorEntity");
        if (evalEl) {
            choicesEvaluatorEntity = new Choices(evalEl, multiOpts);
            const initialEvaluatorEntities = await fetchOptionsFromDB("evaluator", []); 
            choicesEvaluatorEntity.setChoices(initialEvaluatorEntities, "value", "label", true);
            choicesEvaluatorEntity.setChoiceByValue(appState.evaluatorEntity);
        }
        
        const polEl = document.getElementById("politicalAlignment");
        if (polEl) {
            choicesPolitical = new Choices(polEl, multiOpts);
            const polList = ["Democratas", "Republicanos", "Independentes"];
            choicesPolitical.setChoices(polList.map(p => ({ value: p, label: p, selected: p === "Independentes" })), "value", "label", true);
        }

        const evaluatedEl = document.getElementById("evaluatedEntity");
        if (evaluatedEl) {
            choicesEvaluatedEntity = new Choices(evaluatedEl, multiOpts);
            const initialEvaluated = await fetchOptionsFromDB("evaluated", appState.evaluatorEntity);
            choicesEvaluatedEntity.setChoices(initialEvaluated, "value", "label", true);
            choicesEvaluatedEntity.setChoiceByValue(appState.evaluatedEntity);
        }

        const periodEl = document.getElementById("period");
        if (periodEl) {
            choicesPeriod = new Choices(periodEl, singleOpts);
            updatePeriodDropdown(appState.isDynamic);
        }

        const aggregationInput = document.getElementById("aggregation");
        if (aggregationInput) {
            aggregationInput.value = appState.aggregation;
        }

        const catEl = document.getElementById("category");
        if (catEl) {
            choicesCategory = new Choices(catEl, multiOpts);
            choicesCategory.setChoices(CATEGORIESLIST.map(c => ({ value: c, label: c, selected: c === "Todas" })), "value", "label", true);
        }

        setupFilterListeners();
    }
    
    translateUI();
    updateToggleVisual(pendingState.isDynamic);
    checkEvaluatorContext(appState.evaluatorEntity);
    checkApplyButtonState();
    
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
            val = valueInstance.value;
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

    const evaluatorEntitySelect = document.getElementById("evaluatorEntity");
    if (evaluatorEntitySelect) {
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
    }

    const evaluatedEntitySelect = document.getElementById("evaluatedEntity");
    if (evaluatedEntitySelect) {
        evaluatedEntitySelect.addEventListener("change", async () => {
            onFilterChange("evaluatedEntity", choicesEvaluatedEntity, true);
        });
    }

    const periodSelect = document.getElementById("period");
    if (periodSelect) {
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
    }

    const categorySelect = document.getElementById("category");
    if (categorySelect) {
        categorySelect.addEventListener("change", () => onFilterChange('category', choicesCategory, true));
    }

    const politicalSelect = document.getElementById("politicalAlignment");
    if (politicalSelect) {
        politicalSelect.addEventListener("change", () => onFilterChange('politicalAlignment', choicesPolitical, true));
    }
    
    const aggregationInput = document.getElementById("aggregation");
    if (aggregationInput) {
        aggregationInput.addEventListener("input", () => {
            const val = parseFloat(aggregationInput.value);
            if (!isNaN(val) && val > 0) {
                onFilterChange('aggregation', aggregationInput, false);
            }
        });
    }

    const dynamicToggle = document.getElementById("dynamic-mode");
    if (dynamicToggle) {
        dynamicToggle.addEventListener("change", (e) => {
            pendingState.isDynamic = e.target.checked;
            updateToggleVisual(pendingState.isDynamic);
            updatePeriodDropdown(pendingState.isDynamic); 
            checkApplyButtonState();
        });
    }

    const btnApply = document.getElementById("btn-apply");
    if (btnApply) {
        btnApply.addEventListener("click", () => {
            if (!btnApply.classList.contains("disabled")) {
                applyFilters();
            }
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
                if (Array.isArray(otherVal) && otherVal.length > 1) {
                    const first = otherVal[0];
                    pendingState[k] = [first];
                    
                    if (k === "evaluatorEntity" && choicesEvaluatorEntity) { choicesEvaluatorEntity.removeActiveItems(); choicesEvaluatorEntity.setChoiceByValue(first); }
                    if (k === "evaluatedEntity" && choicesEvaluatedEntity) { choicesEvaluatedEntity.removeActiveItems(); choicesEvaluatedEntity.setChoiceByValue(first); }
                    if (k === "category" && choicesCategory) { choicesCategory.removeActiveItems(); choicesCategory.setChoiceByValue(first); }
                }
            }
        });
    }
}

function checkApplyButtonState() {
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
    const btnApply = document.getElementById("btn-apply");

    if (btnApply) {
        if (isDifferent) {
            btnApply.classList.remove("disabled");
            btnApply.removeAttribute("disabled");
        } else {
            btnApply.classList.add("disabled");
            btnApply.setAttribute("disabled", "true");
        }
    }
}

function applyFilters() {
    appState = JSON.parse(JSON.stringify(pendingState));
    checkApplyButtonState();
    updateDashboard();

    const filtersWrapper = document.getElementById("filters-wrapper");
    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const mobileFilterText = document.getElementById("mobile-filter-text");

    if (window.innerWidth < 1024 && filtersWrapper && filtersWrapper.classList.contains("open")) {
        filtersWrapper.classList.remove("open");
        if (mobileFilterBtn) mobileFilterBtn.classList.remove("expanded");
        if (mobileFilterText) mobileFilterText.textContent = t("btn_show_filters");
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
    const gaugeFooter = document.querySelector(".gauge-footer");
    if (gaugeFooter) gaugeFooter.style.display = isDynamic ? "flex" : "none";
    const dynamicToggle = document.getElementById("dynamic-mode");
    if (dynamicToggle) dynamicToggle.checked = isDynamic;
}

function checkEvaluatorContext(evaluatorEntities) {
    const hasUS = Array.isArray(evaluatorEntities) ? evaluatorEntities.includes("EUA") : evaluatorEntities === "EUA";
    const politicalGroup = document.getElementById("political-filter-group");
    
    if (hasUS) {
        if (politicalGroup) politicalGroup.classList.remove("hidden");
        pendingState.politicalAlignment = ["Independentes"];
    } else {
        if (politicalGroup) politicalGroup.classList.add("hidden");
        pendingState.politicalAlignment = null;
        
        if(choicesPolitical) {
            choicesPolitical.removeActiveItems();
            choicesPolitical.setChoiceByValue("Independentes");
            pendingState.politicalAlignment = null;
        }
    }
}

function processAndUpdateHistogramChart(apiData) {
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
    const gradesChartCanvas = document.getElementById("gradesChart");
    if (gradesChartCanvas) {
        drawGradesHistogramChart(gradesChartCanvas, labels, values, texts);
    }
}

function processAndUpdateVolumeChart(apiData) {
    const volumeChartCanvas = document.getElementById("volumeChart");
    const totalNewsEl = document.getElementById("total-news");

    if (!apiData || apiData.length === 0) {
        if (totalNewsEl) totalNewsEl.textContent = "0";
        if (volumeChartCanvas) drawVolumeChart(volumeChartCanvas, [t("no_data_found")], []);
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

    if (volumeChartCanvas) {
        drawVolumeChart(volumeChartCanvas, labels, values, {
            labelNews: t("chart_label_news"),
            tooltipDay: t("chart_volume_tooltip_day"),
            suffixSingular: t("chart_volume_tooltip_unit_singular"),
            suffixPlural: t("chart_volume_tooltip_unit_plural")
        });
    }
    
    const sufixo = total === 1 ? t("chart_volume_desc_singular") : t("chart_volume_desc_plural");
    if (totalNewsEl) {
        totalNewsEl.classList.remove("skeleton");
        totalNewsEl.innerHTML = `<strong>${total.toLocaleString('pt-BR')}</strong> ${sufixo}`;
    }
    return total;
}

function processAndUpdateGaugeDisplay(value) {
    const finalValue = value !== undefined && value !== null ? parseFloat(value) : 4.00;
    const gaugeValueText = document.getElementById("gaugeValueText");
    const gaugeDescription = document.getElementById("gaugeDescription");
    const gaugeChartCanvas = document.getElementById("gaugeChart");

    if (gaugeValueText) gaugeValueText.textContent = finalValue.toFixed(2);

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

    if (gaugeChartCanvas) {
        drawGaugeChart(gaugeChartCanvas, finalValue, { segments });
    }
}

function updateEvolutionHeader(totalNews) {
    const evolutionTitleEl = document.getElementById("evolution-title");
    const evolutionSubtitleEl = document.getElementById("evolution-subtitle");

    if (!evolutionTitleEl || !evolutionSubtitleEl) return;
    
    const revArr = Array.isArray(appState.evaluatorEntity) ? appState.evaluatorEntity : [appState.evaluatorEntity];
    const entArr = Array.isArray(appState.evaluatedEntity) ? appState.evaluatedEntity : [appState.evaluatedEntity];
    const revStr = revArr.map(r => tEntity(r)).join(", ");
    const entStr = entArr.map(e => tEntity(e)).join(", ");
    
    evolutionTitleEl.innerHTML = `${t("app_title")}<br><span style="font-size: 0.8em; font-weight: 500; opacity: 0.85;">${t("evo_title_prefix")}${revStr}${t("evo_title_separator")}${entStr}</span>`;
    
    let dateStr = "";
    if (appState.isDynamic) {
        dateStr = `nos ${PERIODS_CONFIG.dynamic.find(p => p.value === appState.periodValue)?.label?.replace("Ú", "ú") || appState.periodValue}`;
    } else {
        const formatDate = (isoDate) => {
            if (!isoDate) return "??";
            const d = new Date(isoDate);
            const parts = isoDate.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
        };
        dateStr = `${t("evo_date_connector_static")}${formatDate(appState.customStartDate)}${t("evo_date_connector_static_to")}${formatDate(appState.customEndDate)}`;
    }

    const totalStr = totalNews ? totalNews.toLocaleString(CURRENT_LANG) : "0";
    evolutionSubtitleEl.classList.remove("skeleton");
    evolutionSubtitleEl.textContent = `${t("evo_subtitle_prefix")}${dateStr} | ${t("chart_line_tooltip_count")}: ${totalStr}`;
}

function processAndUpdateLineChart(apiData) {
    const lineChartCanvas = document.getElementById("lineChart");
    if (!lineChartCanvas) return;

    if (!apiData || apiData.length === 0) {
        drawLineChart(lineChartCanvas, [t("no_data_found")], [], null);
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

    const agg = parseFloat(appState.aggregation);
    const showHours = !isNaN(agg) && agg < 24;

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

    const datasets = Array.from(allSeries).map(labelName => {
        const seriesRows = apiData.filter(row => row.series_label === labelName);
        const dataMap = new Map();

        seriesRows.forEach(row => {
            dataMap.set(row.time_period, {
                grade: parseFloat(row.average_grade),
                count: parseInt(row.news_count || 0, 10)
            });
        });

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

    const confirmPopup = document.getElementById("chart-popup");
    const popupDateSpan = document.getElementById("popup-date");

    const handlePointClick = (index, event, popupCoords) => {
        const rawDateISO = sortedDates[index];
        const startDateObj = new Date(rawDateISO);
        const aggHours = parseFloat(appState.aggregation) || 24;
        const endDateObj = new Date(startDateObj.getTime() + (aggHours * 60 * 60 * 1000));
        
        currentClickedDate = { 
            startDate: startDateObj.toISOString(),
            endDate: endDateObj.toISOString(),
            aggregation: aggHours
        };

        if (tooltipDates && popupDateSpan) {
            popupDateSpan.textContent = tooltipDates[index];
        }
        
        if (confirmPopup) {
            const x = popupCoords ? popupCoords.x : event.native.clientX;
            confirmPopup.style.left = `${x}px`;
            confirmPopup.classList.remove("hidden");

            const popupHeight = confirmPopup.offsetHeight;
            const y = popupCoords ? popupCoords.y - popupHeight : event.native.clientY - popupHeight - 10;
            confirmPopup.style.top = `${y}px`;
        }
    };

    drawLineChart(lineChartCanvas, axisLabels, datasets, handlePointClick, {
        yAxisTitle: t("chart_line_y_axis_title"),
        tooltipGrade: t("chart_line_tooltip_avg"),
        tooltipNews: t("chart_line_tooltip_count"),
        originalDates: tooltipDates
    });
}

async function updateDashboard() {
    const btnApply = document.getElementById("btn-apply");
    if (btnApply) {
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
        const results = await Promise.allSettled([
            fetchGradesHistogramData(apiFilters),   
            fetchVolumeChartData(apiFilters),       
            fetchGaugeData(apiFilters),             
            fetchLineChartData(apiFilters)          
        ]);

        const [histogramData, volumeData, gaugeVal, lineData] = results.map(res => 
            res.status === "fulfilled" ? res.value : null
        );

        cachedApiData = { histogramData, volumeData, gaugeVal, lineData };

        if (histogramData) processAndUpdateHistogramChart(histogramData);
        const totalNewsCount = processAndUpdateVolumeChart(volumeData);
        processAndUpdateGaugeDisplay(gaugeVal);
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
        const totalNewsEl = document.getElementById("total-news");
        if (totalNewsEl) totalNewsEl.textContent = "Erro";
    } finally {
        if (btnApply) {
            btnApply.innerHTML = `
            <i data-lucide="check-circle" class="icon-sm"></i>
            <span data-i18n="btn_apply">${t("btn_apply")}</span>
            `;
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
            btnApply.disabled = false;
            btnApply.style.opacity = "1";
            btnApply.style.cursor = "pointer";
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

document.addEventListener("DOMContentLoaded", function () {
    initLanguageSelector();

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
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

    const mobileFilterBtn = document.getElementById("mobile-filter-toggle");
    const mobileFilterText = document.getElementById("mobile-filter-text");
    const filtersWrapper = document.getElementById("filters-wrapper");

    if (mobileFilterBtn && filtersWrapper) {
        mobileFilterBtn.addEventListener("click", () => {
            const isOpen = filtersWrapper.classList.toggle("open");
            mobileFilterBtn.classList.toggle("expanded");
            
            const textKey = isOpen ? "btn_hide_filters" : "btn_show_filters";
            if (mobileFilterText) mobileFilterText.textContent = t(textKey);
            
            if (typeof lucide !== "undefined") lucide.createIcons();
        });
    }

    const filterSection = document.getElementById("filters-container");
    const navDots = document.querySelectorAll(".nav-dot");
    const sections = document.querySelectorAll("header, section, main");
    const confirmPopup = document.getElementById("chart-popup");

    window.addEventListener("scroll", () => {
        const scrollY = window.scrollY;

        if (filterSection) {
            if (scrollY > 200) {
                filterSection.classList.add("compact");
            } else if (scrollY < 50) {
                filterSection.classList.remove("compact");
            }
        }

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

        if (confirmPopup && !confirmPopup.classList.contains("hidden")) {
            confirmPopup.classList.add("hidden");
        }
        if (typeof tippy !== "undefined" && tippy.hideAll) {
            tippy.hideAll();
        }
        clearLineChartSelection();
    });

    document.addEventListener("click", (e) => {
        if (confirmPopup && !e.target.closest("#chart-popup")) {
            confirmPopup.classList.add("hidden");
        }
    });

    const popupCancel = document.getElementById("popup-cancel");
    if (popupCancel) {
        popupCancel.addEventListener("click", () => {
            if (confirmPopup) confirmPopup.classList.add("hidden");
        });
    }

    const popupConfirm = document.getElementById("popup-confirm");
    if (popupConfirm) {
        popupConfirm.addEventListener("click", () => {
            if (!currentClickedDate) {
                return;
            }

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
            if (confirmPopup) confirmPopup.classList.add("hidden");
        });
    }

    initializeFilters();
    setTimeout(updateDashboard, 100);
});
