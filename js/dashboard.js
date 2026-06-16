import { fetchGradesHistogramData, fetchVolumeChartData, fetchGaugeData, fetchLineChartData, fetchRelationships, fetchDetailsData } from "./api_adapter.js";
import { drawGradesHistogramChart, drawVolumeChart, drawGaugeChart, drawLineChart, clearLineChartSelection } from "./charts.js";
import { DICTIONARY } from "./i18n.js";

// Global state variables
let CURRENT_LANG = "pt-BR";

const DEFAULT_CONFIG = {
    isDynamic: false,
    period: "year_2025",
    customStartDate: "2025-01-01",
    customEndDate: "2025-06-30",
    evaluatorEntity: ["argentina"],
    evaluatedEntity: ["brasil"],
    category: ["include_all"],
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
        { value: "last30d" },
        { value: "last120d" },
        { value: "last180d" },
        { value: "last365d" }
    ]
};

const CATEGORIESLIST = Object.keys(DICTIONARY["pt-BR"].category_options);

let RELATIONSHIPS = {};

// References for Choices instances
let choicesPeriod, choicesCategory, choicesEvaluatorEntity, choicesEvaluatedEntity, choicesLanguage;
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

    // title attributes (native tooltips, ex: link "voltar" na logo)
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        if (texts[key]) {
            el.setAttribute("title", texts[key]);
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
        const allEvaluators = Object.keys(RELATIONSHIPS);
        const allEvaluated = [...new Set(Object.values(RELATIONSHIPS).flat())];

        let options = [];
        if (targetType === "evaluated") {
            const validSet = new Set();
            if (!filterValue || filterValue.length === 0) {
                allEvaluated.forEach(e => validSet.add(e));
            } else {
                filterValue.forEach(rev => {
                    if (RELATIONSHIPS[rev]) RELATIONSHIPS[rev].forEach(item => validSet.add(item));
                });
            }
            
            options = allEvaluated.map(opt => ({
                value: opt,
                label: tEntity(opt),
                disabled: !validSet.has(opt)
            }));
        } else if (targetType === "evaluator") {
            const validSet = new Set();
            if (!filterValue || filterValue.length === 0) {
                allEvaluators.forEach(e => validSet.add(e));
            } else {
                allEvaluators.forEach(rev => {
                    const targets = RELATIONSHIPS[rev];
                    if (filterValue.some(val => targets.includes(val))) {
                        validSet.add(rev);
                    }
                });
            }
            
            options = allEvaluators.map(opt => ({
                value: opt,
                label: tEntity(opt),
                disabled: !validSet.has(opt)
            }));
        }

        // Sort: valid first, then alphabetically
        options.sort((a, b) => {
            if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
            return a.label.localeCompare(b.label);
        });

        resolve(options);
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

        const langWrapper = document.querySelector(".lang-dropdown-wrapper");
        if (langWrapper) {
            enableHoverToChoices(choicesLanguage, langWrapper);
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
        searchPlaceholderValue: t("placeholder_search") || "Procurar...",
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

    // Fetch dynamic relationships from DB
    try {
        RELATIONSHIPS = await fetchRelationships();
    } catch (err) {
        console.error("Error fetching relationships:", err);
    }

    if (typeof Choices !== "undefined") {
        const evalEl = document.getElementById("evaluatorEntity");
        if (evalEl) {
            choicesEvaluatorEntity = new Choices(evalEl, multiOpts);
            const initialEvaluatorEntities = await fetchOptionsFromDB("evaluator", []); 
            choicesEvaluatorEntity.setChoices(initialEvaluatorEntities, "value", "label", true);
            choicesEvaluatorEntity.setChoiceByValue(appState.evaluatorEntity);
            enableHoverToChoices(choicesEvaluatorEntity, evalEl.closest(".filter-group"));
        }
        
        const evaluatedEl = document.getElementById("evaluatedEntity");
        if (evaluatedEl) {
            choicesEvaluatedEntity = new Choices(evaluatedEl, multiOpts);
            const initialEvaluated = await fetchOptionsFromDB("evaluated", appState.evaluatorEntity);
            choicesEvaluatedEntity.setChoices(initialEvaluated, "value", "label", true);
            choicesEvaluatedEntity.setChoiceByValue(appState.evaluatedEntity);
            enableHoverToChoices(choicesEvaluatedEntity, evaluatedEl.closest(".filter-group"));
        }

        const periodEl = document.getElementById("period");
        if (periodEl) {
            choicesPeriod = new Choices(periodEl, singleOpts);
            updatePeriodDropdown(appState.isDynamic);
            enableHoverToChoices(choicesPeriod, periodEl.closest(".filter-group"));
        }

        const aggregationInput = document.getElementById("aggregation");
        if (aggregationInput) {
            aggregationInput.value = appState.aggregation;
        }

        const catEl = document.getElementById("category");
        if (catEl) {
            choicesCategory = new Choices(catEl, multiOpts);
            choicesCategory.setChoices(CATEGORIESLIST.map(c => ({ value: c, label: c, selected: c === "include_all" })), "value", "label", true);
            enableHoverToChoices(choicesCategory, catEl.closest(".filter-group"));
        }

        setupFilterListeners();
    }
    
    translateUI();
    updateToggleVisual(pendingState.isDynamic);
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
            
            const newOptions = await fetchOptionsFromDB("evaluated", pendingState.evaluatorEntity);
            const currentSelected = choicesEvaluatedEntity.getValue(true);
            choicesEvaluatedEntity.clearStore();
            choicesEvaluatedEntity.setChoices(newOptions, "value", "label", true);
            const validSelection = (Array.isArray(currentSelected) ? currentSelected : [currentSelected]).filter(s => {
                const opt = newOptions.find(o => o.value === s);
                return opt && !opt.disabled;
            });
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
            
            const newOptions = await fetchOptionsFromDB("evaluator", pendingState.evaluatedEntity);
            const currentSelected = choicesEvaluatorEntity.getValue(true);
            choicesEvaluatorEntity.clearStore();
            choicesEvaluatorEntity.setChoices(newOptions, "value", "label", true);
            const validSelection = (Array.isArray(currentSelected) ? currentSelected : [currentSelected]).filter(s => {
                const opt = newOptions.find(o => o.value === s);
                return opt && !opt.disabled;
            });
            if(validSelection.length > 0) {
                choicesEvaluatorEntity.setChoiceByValue(validSelection);
            }

            pendingState.evaluatorEntity = choicesEvaluatorEntity.getValue(true);
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
                if (Array.isArray(otherVal) && (otherVal.length > 1 || otherVal.length === 0)) {
                    // Force to 1 selection if it had more, or keep empty/1
                    const first = otherVal.length > 0 ? [otherVal[0]] : [];
                    pendingState[k] = first;
                    
                    const instance = k === "evaluatorEntity" ? choicesEvaluatorEntity : (k === "evaluatedEntity" ? choicesEvaluatedEntity : choicesCategory);
                    if (instance) {
                        instance.removeActiveItems();
                        if (first.length > 0) instance.setChoiceByValue(first);
                    }
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
        return { label: translatedLabel, data: alignedData };
    });

    const confirmPopup = document.getElementById("chart-popup");
    const popupDateSpan = document.getElementById("popup-date");

    const handlePointClick = (index) => {
        const startDateObj = new Date(sortedDates[index]);
        const aggHours = parseFloat(appState.aggregation) || 24;
        currentClickedDate = {
            startDate: startDateObj.toISOString(),
            endDate: new Date(startDateObj.getTime() + aggHours * 3600 * 1000).toISOString(),
            aggregation: aggHours
        };
        openNewsDrawer(tooltipDates ? tooltipDates[index] : "");
    };

    drawLineChart(lineChartCanvas, axisLabels, datasets, handlePointClick, {
        yAxisTitle: t("chart_line_y_axis_title"),
        tooltipGrade: t("chart_line_tooltip_avg"),
        tooltipNews: t("chart_line_tooltip_count"),
        originalDates: tooltipDates
    });
}

// ===== News drawer: quick read of the clicked point =====
const GRADE_COLORS = ["#b91c1c", "#ef4444", "#fdae61", "#cbd5e1", "#84cc16", "#22c55e", "#15803d"];

function gradeColor(g) {
    const i = Math.min(7, Math.max(1, Math.round(g))) - 1;
    return GRADE_COLORS[i] || "#cbd5e1";
}

function formatDrawerDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "";
    return d.toLocaleString(CURRENT_LANG, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// Reuse the current filters to deep-link into the full details table
function detailsUrlParams() {
    const p = new URLSearchParams();
    p.append("startDate", currentClickedDate.startDate);
    p.append("endDate", currentClickedDate.endDate);
    p.append("aggregation", appState.aggregation);
    p.append("evaluatorEntity", appState.evaluatorEntity);
    p.append("evaluatedEntity", appState.evaluatedEntity);
    (appState.category || []).forEach(c => p.append("category", c));
    return p.toString();
}

function newsCardHTML(n) {
    const g = Number(n.grade);
    const gradeLabel = isNaN(g) ? "–" : (g % 1 === 0 ? g : g.toFixed(1));
    const analysis = n.analysis || "";
    const long = analysis.length > 180;
    const meta = [n.source, formatDrawerDate(n.date), n.category].filter(Boolean).map(escapeHtml).join(" · ");
    return `
        <article class="news-card">
            <div class="news-card-head">
                <span class="grade-chip" style="background:${gradeColor(g)}">${gradeLabel}</span>
                <div>
                    <h4 class="news-headline">${escapeHtml(n.headline || "—")}</h4>
                    <p class="news-meta">${meta}</p>
                </div>
            </div>
            ${analysis ? `<p class="news-analysis${long ? " clamp" : ""}">${escapeHtml(analysis)}</p>` : ""}
            <div class="news-card-actions">
                ${long ? `<button type="button" class="read-more">${t("read_more")}</button>` : "<span></span>"}
                ${n.url ? `<a class="news-original" href="${encodeURI(n.url)}" target="_blank" rel="noopener">${t("read_original")} <i data-lucide="arrow-up-right"></i></a>` : ""}
            </div>
        </article>`;
}

async function loadDrawerNews(sort) {
    const body = document.getElementById("drawer-body");
    const meta = document.getElementById("drawer-meta");
    if (!body || !currentClickedDate) return;
    body.innerHTML = `<p class="drawer-state">${t("loading_data")}</p>`;

    const [field, dir] = (sort || "grade-desc").split("-");
    const res = await fetchDetailsData({
        evaluator: appState.evaluatorEntity,
        evaluated: appState.evaluatedEntity,
        category: appState.category,
        startDate: currentClickedDate.startDate,
        endDate: currentClickedDate.endDate,
        sort_by: field === "date" ? "date" : "grade",
        sort_dir: (dir || "desc").toUpperCase(),
        limit: 50,
        offset: 0
    });

    const list = (res && res.data) || [];
    const total = (res && res.total_count) || list.length;
    if (meta) meta.textContent = `${total > list.length ? `${list.length}/${total}` : total} ${t("drawer_count_label")}`;

    body.innerHTML = list.length ? list.map(newsCardHTML).join("") : `<p class="drawer-state">${t("drawer_empty")}</p>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function openNewsDrawer(dateLabel) {
    const drawer = document.getElementById("news-drawer");
    if (!drawer || !currentClickedDate) return;
    document.getElementById("drawer-date").textContent = dateLabel || formatDrawerDate(currentClickedDate.startDate);
    drawer.classList.remove("hidden");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
    const sort = document.getElementById("drawer-sort");
    loadDrawerNews(sort ? sort.value : "grade-desc");
}

function closeNewsDrawer() {
    const drawer = document.getElementById("news-drawer");
    if (!drawer) return;
    drawer.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
}

// Drag the left edge to resize the panel; cards reflow to the new width
function initDrawerResize() {
    const handle = document.querySelector(".drawer-resize");
    const panel = document.querySelector(".drawer-panel");
    if (!handle || !panel) return;
    const MIN = 320;
    let dragging = false;

    handle.addEventListener("pointerdown", (e) => {
        dragging = true;
        handle.setPointerCapture(e.pointerId);
        document.body.classList.add("drawer-resizing");
        e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const max = Math.min(window.innerWidth * 0.92, 900);
        panel.style.width = `${Math.min(max, Math.max(MIN, window.innerWidth - e.clientX))}px`;
    });
    const stop = (e) => {
        if (!dragging) return;
        dragging = false;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        document.body.classList.remove("drawer-resizing");
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
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
        evaluator: appState.evaluatorEntity, 
        evaluated: appState.evaluatedEntity, 
        category: appState.category,
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
    const brandHeader = document.querySelector(".brand-header");
    const navDots = document.querySelectorAll(".nav-dot");
    const sections = document.querySelectorAll("header, section, main");
    const confirmPopup = document.getElementById("chart-popup");

    window.addEventListener("scroll", () => {
        const scrollY = window.scrollY;

        if (scrollY > 50) {
            if (filterSection) filterSection.classList.add("compact");
            if (brandHeader) brandHeader.classList.add("compact");
        } else {
            if (filterSection) filterSection.classList.remove("compact");
            if (brandHeader) brandHeader.classList.remove("compact");
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

    const newsDrawer = document.getElementById("news-drawer");
    if (newsDrawer) {
        initDrawerResize();
        newsDrawer.querySelectorAll("[data-drawer-close]").forEach(el => el.addEventListener("click", closeNewsDrawer));

        const drawerSort = document.getElementById("drawer-sort");
        if (drawerSort) drawerSort.addEventListener("change", () => loadDrawerNews(drawerSort.value));

        const openFull = document.getElementById("drawer-open-full");
        if (openFull) openFull.addEventListener("click", () => {
            if (currentClickedDate) window.open(`details.html?${detailsUrlParams()}`, "_blank");
        });

        // Toggle the "read more" clamp on each card
        document.getElementById("drawer-body").addEventListener("click", (e) => {
            const btn = e.target.closest(".read-more");
            if (!btn) return;
            const clamped = btn.closest(".news-card").querySelector(".news-analysis").classList.toggle("clamp");
            btn.textContent = clamped ? t("read_more") : t("read_less");
        });

        document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNewsDrawer(); });
    }

    initializeFilters();
    setTimeout(updateDashboard, 100);
});
