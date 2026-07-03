/**
    Viewer layer
*/

let histogramInstance = null;
let gaugeInstance = null;
let volumeInstance = null;
let lineInstance = null;
let lineChartFixedIndex = null;

// X-axis tick labels for the evolution chart, recomputed whenever the visible
// range (zoom/pan) or the width changes: first + last visible dates, plus every
// day 1 and 15 in view. When zoomed below that granularity it falls back to
// evenly spaced dates and shows the time; day 1/15 markers never show the time.
let lineChartMeta = null;                       // { dates: number[] (ms), aggHours, locale }
let lineTickState = { key: "", map: new Map() };

const DAY_MS = 86400000;

// Data timestamps are UTC; labels and day-boundary math use Brasília time
// (fixed UTC-3 — Brazil has no DST since 2019).
const BRT_OFFSET_MS = 3 * 3600 * 1000;
const brtDay = ms => Math.floor((ms - BRT_OFFSET_MS) / DAY_MS);

function fmtAxisLabel(ms, withHour, locale) {
    const opts = { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" };
    if (withHour) { opts.hour = "2-digit"; opts.minute = "2-digit"; }
    return new Date(ms).toLocaleString(locale, opts);
}

// True when index i is the first bucket of a Brasília day that lands on the 1st or 15th.
function isMonthMarker(dates, i) {
    const day = new Date(dates[i] - BRT_OFFSET_MS).getUTCDate();
    if (day !== 1 && day !== 15) return false;
    if (i === 0) return true;
    return brtDay(dates[i]) !== brtDay(dates[i - 1]);
}

function tickTarget(width) {
    return width < 360 ? 3 : width < 560 ? 4 : width < 900 ? 6 : width < 1300 ? 9 : 12;
}

// Day 1/15 markers are date-only (~35px each), so far more fit per row than the
// mixed date/hour ticks. Scale the budget to the width instead of capping at 12,
// so a wide chart can show every 1st and 15th of the period.
function markerTarget(width) {
    return Math.max(2, Math.floor((width || 0) / 55));
}

function computeLineTicks(scale) {
    const chart = scale.chart;
    const n = chart.data.labels.length;
    const map = new Map();
    const meta = lineChartMeta;
    if (!meta || !meta.dates.length || !n) return map;

    const dates = meta.dates;
    let lo = 0, hi = n - 1;
    if (isFinite(scale.min) && isFinite(scale.max)) {
        lo = Math.max(0, Math.ceil(scale.min));
        hi = Math.min(n - 1, Math.floor(scale.max));
    }
    if (hi < lo) hi = lo;

    const target = tickTarget(chart.width || 0);
    const markers = [];
    for (let i = lo; i <= hi; i++) if (isMonthMarker(dates, i)) markers.push(i);

    let withHour = false;
    if (markers.length >= 2) {
        // Enough day 1/15 markers: label those, thinning to the width budget.
        const mTarget = markerTarget(chart.width || 0);
        let chosen = markers;
        if (markers.length > mTarget) {
            // Fixed stride keeps the day 1/15 alternation in phase, so thinning never
            // lands two adjacent markers side by side (which would overlap); e.g. a
            // stride of 2 keeps every 1st and drops every 15th.
            const stride = Math.ceil(markers.length / mTarget);
            chosen = [];
            for (let k = 0; k < markers.length; k += stride) chosen.push(markers[k]);
        }
        for (const i of chosen) map.set(i, fmtAxisLabel(dates[i], false, meta.locale));
    } else {
        // Zoomed in past the month markers: evenly spaced visible dates. Show the
        // time once ticks land less than a day apart (or aggregation is sub-hourly),
        // which also keeps the labels distinct.
        const span = dates[hi] - dates[lo];
        const count = Math.min(target, hi - lo + 1);
        const step = count > 1 ? span / (count - 1) : span;
        withHour = step < DAY_MS || (meta.aggHours && meta.aggHours < 1);
        if (count <= 1) {
            map.set(lo, fmtAxisLabel(dates[lo], withHour, meta.locale));
        } else {
            for (let k = 0; k < count; k++) {
                const i = lo + Math.round(k * (hi - lo) / (count - 1));
                map.set(i, fmtAxisLabel(dates[i], withHour, meta.locale));
            }
        }
    }
    // Always anchor the first and last visible dates.
    map.set(lo, fmtAxisLabel(dates[lo], withHour, meta.locale));
    map.set(hi, fmtAxisLabel(dates[hi], withHour, meta.locale));
    return map;
}

// Recompute only when the width or the visible range actually changed.
function ensureLineTicks(scale) {
    const chart = scale.chart;
    const key = `${chart.width}|${scale.min}|${scale.max}|${chart.data.labels.length}`;
    if (lineTickState.key === key) return;
    const map = computeLineTicks(scale);
    const keys = [...map.keys()].sort((a, b) => a - b);
    lineTickState = {
        key, map,
        lo: keys[0],
        hi: keys[keys.length - 1],
        second: keys[1],
        penult: keys[keys.length - 2],
    };
}

// Tick color comes from chartUI() so the fade matches the active theme.
// Rough label width in px for the tick font (~5.8px/char at 12px).
function estTickWidth(s) { return s ? s.length * 5.8 : 0; }

// The forced first/last anchors are raw edge dates; the second/penultimate ticks
// are the clean day 1/15 markers. When zoom pushes an anchor toward its marker
// neighbour, fade the anchor out (and drop it once the boxes would collide) so the
// marker takes its place instead of the two overlapping.
function lineTickColor(scale, v) {
    const st = lineTickState;
    let anchor, neighbor;
    if (v === st.lo && st.second !== undefined && st.second !== st.lo) {
        anchor = st.lo; neighbor = st.second;
    } else if (v === st.hi && st.penult !== undefined && st.penult !== st.hi) {
        anchor = st.hi; neighbor = st.penult;
    } else {
        return chartUI().tick;
    }
    const gap = Math.abs(scale.getPixelForValue(neighbor) - scale.getPixelForValue(anchor));
    // anchor is edge-aligned (occupies its full width inward); neighbour is centred.
    const clearance = gap - estTickWidth(st.map.get(anchor)) - estTickWidth(st.map.get(neighbor)) / 2;
    const alpha = Math.max(0, Math.min(1, clearance / 20));
    return `rgba(${chartUI().tickFadeRGB}, ${alpha})`;
}

const COLORS = {
    bluePrimary: "#003A79",
    blueLight: "#008BC9",
};

function isDarkTheme() {
    return document.documentElement.dataset.theme === "dark";
}

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Entry animations run for fresh data only; theme/language redraws stay snappy.
let animationsEnabled = true;
export function setChartsAnimation(on) {
    animationsEnabled = on;
}

// Chart.js animation option: false when disabled, staggered per-bar when asked.
function chartAnimation(stagger) {
    if (!animationsEnabled || REDUCED_MOTION) return false;
    return stagger
        ? { delay: c => (c.type === "data" && c.mode === "default" ? c.dataIndex * 40 : 0) }
        : {};
}

// Theme-aware chart chrome. Charts are fully redrawn on theme toggle, so each
// draw call just reads the current values (celeste on dark per the FGV manual).
function chartUI() {
    return isDarkTheme() ? {
        tick: "#9FB3C8",
        tickFadeRGB: "159, 179, 200",
        axisBorder: "rgba(115, 191, 232, 0.25)",
        legend: "#B9C9D9",
        line: "#73BFE8",
        volumeFillTop: "rgba(115, 191, 232, 0.5)",
        volumeFillBottom: "rgba(115, 191, 232, 0.04)",
        surfaceBorder: "#102338",
        needle: "#E8F0F7",
        tooltip: {
            backgroundColor: "rgba(16, 35, 56, 0.97)",
            titleColor: "#E8F0F7",
            bodyColor: "#B9C9D9",
            borderColor: "rgba(115, 191, 232, 0.45)",
        },
    } : {
        tick: "#666",
        tickFadeRGB: "102, 102, 102",
        axisBorder: "rgba(0, 0, 0, 0.1)",
        legend: "#475569",
        line: COLORS.bluePrimary,
        volumeFillTop: "rgba(0, 58, 121, 0.7)",
        volumeFillBottom: "rgba(0, 58, 121, 0.1)",
        surfaceBorder: "#ffffff",
        needle: "#444",
        tooltip: {
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            titleColor: "#003A79",
            bodyColor: "#5C5B5F",
            borderColor: "#D7D9DD",
        },
    };
}

// Default text/axis colors for the charts created right after this call.
function applyChartDefaults() {
    if (typeof Chart === "undefined") return;
    const ui = chartUI();
    Chart.defaults.color = ui.tick;
    Chart.defaults.borderColor = ui.axisBorder;
}

const TOOLTIP_BASE = {
    borderWidth: 1,
    titleFont: { size: 13, weight: "bold", family: "'Gotham', 'Arial', sans-serif" },
    bodyFont: { size: 12, family: "'Gotham', 'Arial', sans-serif" },
    padding: 10,
    bodyPadding: 4,
    displayColors: true,
};

function tooltipTheme() {
    return { ...TOOLTIP_BASE, ...chartUI().tooltip };
}

// Global plugins
if (typeof Chart !== "undefined" && typeof ChartZoom !== "undefined") {
    Chart.register(ChartZoom);
}

const isSmallScreen = () => window.innerWidth <= 1024;

// Plugin to Gauge needle (Velocímetro)
const gaugeNeedlePlugin = {
    id: "gaugeNeedle",
    afterDatasetDraw(chart, args, options) {
        const { ctx, data } = chart;
        ctx.save();
        const needleValue = data.datasets[0].needleValue;
        
        // arc from 150 to 390 degrees
        const startAngle = 150 * (Math.PI / 180);
        const sweepAngle = 240 * (Math.PI / 180);
        
        // Limits the value between 1 and 7
        const safeValue = Math.max(1, Math.min(7, needleValue));
        const valueFraction = (safeValue - 1) / (7 - 1);
        const angle = startAngle + (valueFraction * sweepAngle);

        // Center of the chart
        const cx = chart.getDatasetMeta(0).data[0].x;
        const cy = chart.getDatasetMeta(0).data[0].y;
        
        // needle
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -5); // needle base width
        ctx.lineTo((chart.chartArea.height / 2) + 10, 0);
        ctx.lineTo(0, 5);
        ctx.fillStyle = chartUI().needle;
        ctx.fill();
        ctx.rotate(-angle);
        ctx.translate(-cx, -cy);

        // central pin
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
        ctx.fillStyle = chartUI().needle;
        ctx.fill();
        ctx.restore();
    }
};

const gaugeLabelsPlugin = {
    id: "gaugeLabels",
    afterDatasetDraw(chart) {
        const { ctx, data } = chart;
        ctx.save();

        ctx.font = "bold 30px sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const innerRadius = chart.getDatasetMeta(0).data[0].innerRadius;
        const outerRadius = chart.getDatasetMeta(0).data[0].outerRadius;
        const radius = (innerRadius + outerRadius) / 2; // half of the way between the center and the edge

        for (let i = 0; i < data.datasets[0].data.length; i++) {
            const meta = chart.getDatasetMeta(0).data[i];
            
            // average angle of the current slice
            const startAngle = meta.startAngle;
            const endAngle = meta.endAngle;
            const angle = startAngle + (endAngle - startAngle) / 2;

            // Calculate the X Y position of the center of the slice
            const x = meta.x + Math.cos(angle) * radius;
            const y = meta.y + Math.sin(angle) * radius;

            // section number (from 1 to 7)
            const labelText = (i + 1).toString(); 

            ctx.fillText(labelText, x, y);
        }

        ctx.restore();
    }
};

// Needle position currently shown, kept across chart rebuilds so each apply
// sweeps the needle from the old index to the new one.
let gaugeNeedleShown = null;
let gaugeNeedleAnim = null;

function animateNeedle(chart, from, to) {
    if (gaugeNeedleAnim) cancelAnimationFrame(gaugeNeedleAnim);
    const duration = 1100;
    const start = performance.now();
    const step = now => {
        if (chart !== gaugeInstance) return;   // chart was rebuilt meanwhile
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        const v = from + (to - from) * eased;
        chart.data.datasets[0].needleValue = v;
        gaugeNeedleShown = v;
        chart.draw();
        if (p < 1) gaugeNeedleAnim = requestAnimationFrame(step);
    };
    gaugeNeedleAnim = requestAnimationFrame(step);
}

export function drawGaugeChart(canvasElement, value, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }

    // value: number (1 to 7)
    // texts is expected to be: { segments: [] }
    // texts: { segments: [ "Extremely Negative", "Very Negative", "Slightly Negative", "Neutral", "Slightly Positive", "Positive", "Extremely Positive" ] }
    const ctx = canvasElement.getContext('2d');
    if (gaugeInstance) gaugeInstance.destroy();
    
    const gaugeSegmentDescriptions = texts.segments || [];

    const backgroundColor = [
        "#b91c1c", "#ef4444", /*"#f97316",*/ "#fdae61", "#cbd5e1", "#84cc16", "#22c55e", "#15803d"  
    ];

    const hoverBackgroundColor = [
        "#991b1b", "#dc2626", /*"#ea580c",*/ "#e6984b", "#94a3b8", "#65a30d", "#16a34a", "#14532d"
    ];
    
    // Sweep the needle from where it was to the new value (from the scale
    // start on the very first draw); jump straight there when animations are off.
    const animateSweep = animationsEnabled && !REDUCED_MOTION && !document.hidden;
    const needleStart = animateSweep ? (gaugeNeedleShown ?? 1) : value;

    gaugeInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: gaugeSegmentDescriptions,
            datasets: [{
                data: [0.5, 1, 1, 1, 1, 1, 0.5], // tamanho fatias
                needleValue: needleStart,
                backgroundColor: backgroundColor,
                hoverBackgroundColor: hoverBackgroundColor,
                borderWidth: 2,
                borderColor: chartUI().surfaceBorder,
                hoverOffset: 4
            }]
        },
        options: {
            rotation: -120,
            circumference: 240,
            cutout: "65%", // arco
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimation(false),
            layout: { padding: { top: 0, bottom: 10 } },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    ...tooltipTheme(),
                    callbacks: {
                        title: () => null,
                        label: function(context) { 
                            return context.label; 
                        }
                    }
                }
            }
        },
        plugins: [gaugeNeedlePlugin, gaugeLabelsPlugin]
    });

    if (animateSweep && needleStart !== value) {
        animateNeedle(gaugeInstance, needleStart, value);
    } else {
        gaugeNeedleShown = value;
    }
}

export function drawGradesHistogramChart(canvasElement, labels, data, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }

    // texts is expected to be: { labelFrequency: "", tooltipTitle: "", tooltipSuffix: "" }
    
    const ctx = canvasElement.getContext("2d");
    applyChartDefaults();

    const sentimentColors = [
        "#b91c1c", // 1 Extremely negative
        "#ef4444", // 2 Very negative
        "#fdae61", // 3 Slightly negative
        "#94a3b8", // 4 Neutral
        "#84cc16", // 5 Slightly positive
        "#22c55e", // 6 Positive
        "#15803d"  // 7 Extremely positive
    ];

    const config = {
        type: "bar",
        data: {
            labels: labels, // [1, 2, 3, 4, 5, 6, 7]
            datasets: [{
                label: texts.labelFrequency || "Frequência",
                data: data,
                backgroundColor: sentimentColors,
                borderRadius: 4,
                barPercentage: 0.8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimation(true),
            layout : {
                padding: { top: 5, bottom: 0, left: 0, right: 0 }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { display: false },
                    border: { display: true }
                },
                x: { 
                    grid: { display: false },
                    border: { display: true },
                }
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    ...tooltipTheme(),
                    callbacks: {
                        // ctx := tooltip context
                        title: (ctx) => {
                            const grade = ctx[0].label;
                            const desc = texts.gradeDescriptions ? texts.gradeDescriptions[grade] : "";
                            const prefix = texts.tooltipTitle || "Nota";
                            return desc ? `${prefix} ${grade}: ${desc}` : `${prefix} ${grade}`; // ex: "Nota 5: Image slightly positive"
                        },
                        label: (ctx) => {
                            const count = ctx.raw;  // number of news
                            const unit = count === 1 ? (texts.tooltipUnitSingular || "notícia") : (texts.tooltipUnitPlural || "notícias");
                            return `${count} ${unit}`;
                        }
                    }
                }
            }
        }
    };

    // Updating in place lets Chart.js tween the bars from the old values to the
    // new ones; a rebuild would restart the entry animation from zero.
    if (histogramInstance && histogramInstance.canvas === canvasElement) {
        histogramInstance.data = config.data;
        histogramInstance.options = config.options;
        histogramInstance.update(animationsEnabled && !REDUCED_MOTION ? undefined : "none");
        return;
    }
    if (histogramInstance) histogramInstance.destroy();
    histogramInstance = new Chart(ctx, config);
}


export function drawVolumeChart(canvasElement, labels, data, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }
    
    const ctx = canvasElement.getContext("2d");

    const ui = chartUI();
    applyChartDefaults();
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasElement.height);
    gradient.addColorStop(0, ui.volumeFillTop);
    gradient.addColorStop(1, ui.volumeFillBottom);

    const config = {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                // Draw the blue line and the gradient background area clipped
                {
                    label: texts.labelNews || "Notícias",
                    data: data,
                    borderColor: ui.line,
                    backgroundColor: gradient,
                    borderWidth: 1,
                    pointRadius: 0,
                    hitRadius: 5,
                    pointHoverRadius: 0,
                    fill: true,
                    tension: 0.4,
                    clip: 0
                },
                // Invisible line with hoverable points unclipped
                {
                    label: texts.labelNews || "Notícias",
                    data: data,
                    borderColor: "transparent",
                    backgroundColor: "transparent",
                    borderWidth: 0,
                    pointRadius: 0,
                    hitRadius: 5,
                    pointHoverRadius: 3,
                    pointBackgroundColor: ui.line,
                    fill: false,
                    tension: 0.4,
                    clip: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimation(false),
            interaction: {
                mode: "index",
                intersect: false
            },
            layout : {
                padding: { top: 5, bottom: 0, left: -4, right: 5}
            },
            scales: {
                y: { 
                    beginAtZero: true,  
                    grid: {display: false},
                    border: { display: true },
                    ticks: { display: false }
                },
                x: { 
                    grid: { display: false },
                    border: { display: true },
                    ticks: { 
                        callback: function (value, index, values) {
                            if (index === 0 || index === values.length - 1) {
                            return this.getLabelForValue(value);
                            }
                            return "";
                        },
                        autoSkip: false,
                        maxRotation: 0,
                        align: "inner"
                    }
                }
            },
            plugins: { 
                legend: { display: false }, 
                tooltip: { 
                    ...tooltipTheme(),
                    titleAlign: "left",
                    labelAlign: "left",
                    filter: (item) => item.datasetIndex === 0,
                    callbacks: { 
                        title: (ctx) => {
                            const label = Array.isArray(ctx) ? ctx[0].label : ctx.label;
                            return `${texts.tooltipDay || "Dia"} ${label}`;
                        },
                        label: (ctx) => {
                            const valor = ctx.raw;
                            const sufixo = valor !== 1 ? (texts.suffixPlural || 'notícias analisadas') : (texts.suffixSingular || 'notícia analisada');
                            return `${valor} ${sufixo}`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: "x" },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        drag: { enabled: true },
                        mode: "x"
                    }
                }
            }
        }
    };

    // Update in place so the area morphs from the old series to the new one.
    if (volumeInstance && volumeInstance.canvas === canvasElement) {
        if (volumeInstance.isZoomedOrPanned && volumeInstance.isZoomedOrPanned()) {
            volumeInstance.resetZoom("none");
        }
        volumeInstance.data = config.data;
        volumeInstance.options = config.options;
        volumeInstance.update(animationsEnabled && !REDUCED_MOTION ? undefined : "none");
        return;
    }
    if (volumeInstance) volumeInstance.destroy();
    volumeInstance = new Chart(ctx, config);
}

const verticalLinePlugin = {
    id: "verticalLine",
    // myPlugin.afterDraw(actual version of the graph)
    afterDraw: (chart) => {
        const ctx = chart.ctx;
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;

        const drawLine = (index, color, width, dash) => {
            const visibleMetas = chart.getSortedVisibleDatasetMetas();
            let x = null;
            // meta 
            for (const meta of visibleMetas) {
                const el = meta.data[index];
                if (el && !el.skip) {
                    x = el.x;
                    break;
                }
            }
            if (x === null) x = chart.scales.x.getPixelForValue(index);
            if (x === undefined || x === null) return;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = width;
            ctx.strokeStyle = color;
            ctx.setLineDash(dash);
            ctx.stroke();
            ctx.restore();
        };

        const crossFixed = isDarkTheme() ? "rgba(115, 191, 232, 0.8)" : "#88868B";
        const crossHover = isDarkTheme() ? "rgba(115, 191, 232, 0.4)" : "rgba(136, 134, 139, 0.5)";

        // fixed vertical line (click)
        if (lineChartFixedIndex !== null) {
            drawLine(lineChartFixedIndex, crossFixed, 2, [10, 5]);
        }
        // hover: crosshair plus a glowing dot on each active point
        if (chart.tooltip?._active?.length) {
            const hoverIndex = chart.tooltip._active[0].index;
            if (hoverIndex !== lineChartFixedIndex) {
                drawLine(hoverIndex, crossHover, 1, [5, 5]);
            }
            for (const active of chart.tooltip._active) {
                const el = active.element;
                if (!el || el.skip) continue;
                const dsColor = chart.data.datasets[active.datasetIndex]?.borderColor;
                const color = typeof dsColor === "string" ? dsColor : "#73BFE8";
                ctx.save();
                ctx.beginPath();
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                ctx.fillStyle = color;
                ctx.arc(el.x, el.y, 3.5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
            }
        }
    }
};


export function drawLineChart(canvasElement, labels, datasets, onPointClicked, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }

    // datasets: array of { label: string, data: [{ x: dateStr, y: grade, count: number }, ...] }
    // texts: { yAxisTitle: "", tooltipGrade: "", tooltipNews: "", originalDates: [] }
    const ctx = canvasElement.getContext("2d");

    lineChartFixedIndex = null;

    // Feed the tick engine the raw bucket timestamps so it can label day 1/15,
    // recompute on zoom/pan, and decide when to show the time.
    lineChartMeta = {
        dates: Array.isArray(texts.axisDates) ? texts.axisDates : [],
        aggHours: texts.aggHours,
        locale: texts.locale || "pt-BR"
    };
    lineTickState = { key: "", map: new Map() };
    
    const smallScreen = isSmallScreen();

    const POLITICAL_COLORS = {
        "Democratas": "#2563eb",
        "Republicanos": "#dc2626",
        "Independentes": "#d97706"
        };

    // Fixed colour per category (keyed by the stable slug, not the translated
    // label or array position). This way a series keeps its colour when other
    // categories are added/removed, so comparisons stay readable across changes.
    const CATEGORY_COLORS = {
        include_all:                        "#003A79",
        politica:                           "#1f77b4",
        economia_negocios_financas:         "#2ca02c",
        conflito_guerra_paz:                "#d62728",
        saude:                              "#e7298a",
        educacao:                           "#17becf",
        ciencia_tecnologia:                 "#9467bd",
        esporte:                            "#bcbd22",
        crime_lei_justica:                  "#8c564b",
        meio_ambiente:                      "#31a354",
        desastres_acidentes_emergencias:    "#ff7f0e",
        interesse_humano:                   "#ffbb78",
        sociedade:                          "#756bb1",
        trabalho:                           "#00a0b0",
        meteorologia:                       "#7fc7ff",
        religiao_crencas:                   "#bd9e39",
        estilo_vida_lazer:                  "#fb9a99",
        artes_cultura_entretenimento_midia: "#c71585",
        nao_informado:                      "#7f7f7f"
    };

    // Fallback palette for non-category series (entities, alignments without a
    // fixed colour). Picked by a hash of the series key so it is also stable.
    const FALLBACK_COLORS = [
        "#1e40af", "#16a34a", "#9333ea", "#0891b2", "#db2777", "#d97706", "#dc2626"
    ];
    const stableColor = key => {
        let h = 0;
        const s = String(key || "");
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
    };

    const dataArray = Array.isArray(datasets) ? datasets : [datasets];

    const ui = chartUI();
    applyChartDefaults();

    const styledDatasets = dataArray.map((ds, index) => {
        // ds.key is the stable slug (category/entity); ds.label is translated.
        // The all-in-one series uses the theme line color (dark blue is unreadable on navy).
        const color = (ds.key === "include_all" ? ui.line : null)
            || CATEGORY_COLORS[ds.key]
            || POLITICAL_COLORS[ds.label]
            || stableColor(ds.key || ds.label);

        return {
            label: ds.label,
            data: ds.data,
            borderColor: color,
            backgroundColor: color.replace("1)", "0.1)"), 
            borderWidth: 1,
            pointRadius: 0,
            pointHoverRadius: 3,    // aumenta o ponto ao passar o mouse
            tension: 0.3,           // suaviza linha
            fill: false,
            spanGaps: true,
            clip: 5
        };
    });
    // Single-series view gets a soft gradient under the line; with multiple
    // series the fills would stack and hurt readability.
    if (styledDatasets.length === 1) {
        const grad = ctx.createLinearGradient(0, 0, 0, canvasElement.height || 400);
        grad.addColorStop(0, isDarkTheme() ? "rgba(115, 191, 232, 0.22)" : "rgba(0, 58, 121, 0.12)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        styledDatasets[0].fill = true;
        styledDatasets[0].backgroundColor = grad;
    }

    const config = {
        type: "line",
        data: {
            labels: labels,
            datasets: styledDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimation(false),
            interaction: {
                mode: "index",
                intersect: false,
            },
            layout: {
                padding: smallScreen ? { top: 15, bottom: 15, left: 5, right: 5 } : { top: 15, bottom: 15, left: 10, right: 10 }
            },
            scales: {
                y: { 
                    min: 1, 
                    max: 7,
                    title: { display: true, text: texts.yAxisTitle || "FGV IIBEx" }
                },
                x: {
                    grid: { display: false } ,
                    ticks: {
                        maxRotation: 0,
                        autoSkip: false,
                        align: "inner",
                        // Labels come from the zoom-aware tick engine (day 1/15 + first/last).
                        // `value` is the data index; when zoomed it differs from the
                        // tick's position in the visible array, so key the map by it.
                        callback: function (value) {
                            ensureLineTicks(this);
                            return lineTickState.map.get(value) || "";
                        },
                        // Fade the first/last anchors out as they crowd their marker neighbour.
                        color: function (ctx) {
                            const scale = ctx.scale || (ctx.chart && ctx.chart.scales && ctx.chart.scales.x);
                            if (!scale || !ctx.tick) return chartUI().tick;
                            ensureLineTicks(scale);
                            return lineTickColor(scale, ctx.tick.value);
                        }
                    }
                }
            },
            onClick: (e) => {
                const points = lineInstance.getElementsAtEventForMode(e, "index", { intersect: false }, true);
                if (points.length && onPointClicked) {
                    lineChartFixedIndex = points[0].index;
                    lineInstance.update();

                    const firstPoint = points[0];
                    const index = firstPoint.index;

                    // dimensions and position of the canvas on the user's screen
                    const rect = lineInstance.canvas.getBoundingClientRect();
                    // X position of the vertical line clicked day
                    const pointX = lineInstance.scales.x.getPixelForValue(index);
                    // Y position of the upper limit of the drawable area
                    const chartAreaTop = lineInstance.chartArea.top;
                    const popupCoords = {
                        x: rect.left + pointX,
                        y: rect.top + chartAreaTop
                    };

                    onPointClicked(index, e, popupCoords);
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    onClick: (e) => { e.stopPropagation(); },
                    labels: {
                        usePointStyle: true,
                        pointStyle: "rectRounded",   // filled, rounded colour chip
                        boxWidth: smallScreen ? 13 : 15,
                        boxHeight: smallScreen ? 13 : 15,
                        padding: smallScreen ? 10 : 16,
                        color: ui.legend,
                        font: { size: smallScreen ? 10 : 12, weight: "600" },
                        // The single-series area fill is a gradient; chips use the line color.
                        generateLabels: (chart) => {
                            const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                            items.forEach(item => {
                                const ds = chart.data.datasets[item.datasetIndex];
                                if (ds && typeof ds.borderColor === "string") item.fillStyle = ds.borderColor;
                            });
                            return items;
                        }
                    }
                },
                tooltip: {
                    ...tooltipTheme(),
                    titleFont: { size: 13, weight: "bold" },
                    bodyFont: { size: 12 },
                    bodySpacing: 4,
                    callbacks: {
                        title: (tooltipItems) => {
                            const index = tooltipItems[0].dataIndex;
                            return texts.originalDates ? texts.originalDates[index] : tooltipItems[0].label;
                        },
                        label: (context) => {
                            // context.raw := { x: date, y: grade, count: number }
                            const row = context.raw;
                            const grade = row && row.y != null ? row.y.toFixed(2) : "N/A";
                            const count = row && row.count != null ? row.count : "N/A";
                            const label = context.dataset.label || "";
                            return [
                                label,
                                `${texts.tooltipGrade || "Nota média"}: ${grade}`,
                                `${texts.tooltipNews || "Qtd. notícias"}: ${count}`
                            ];
                        }
                    }
                },
                zoom: { 
                    pan: { enabled: true, mode: "x" }, 
                    zoom: { 
                        wheel: { enabled: true }, 
                        drag: { enabled: false }, 
                        mode: "x" 
                    } 
                },
                verticalLine: true
            }
        },
        plugins: [verticalLinePlugin]
    };

    // Update in place so the line morphs from the old series to the new one
    // (a stale zoom window is cleared first — the new data has its own range).
    if (lineInstance && lineInstance.canvas === canvasElement) {
        if (lineInstance.isZoomedOrPanned && lineInstance.isZoomedOrPanned()) {
            lineInstance.resetZoom("none");
        }
        lineInstance.data.labels = labels;
        lineInstance.data.datasets = styledDatasets;
        lineInstance.options = config.options;
        lineInstance.update(animationsEnabled && !REDUCED_MOTION ? undefined : "none");
        return;
    }
    if (lineInstance) lineInstance.destroy();
    lineInstance = new Chart(ctx, config);
}

export function resetLineChartZoom() {
    if (lineInstance) lineInstance.resetZoom();
}

export function clearLineChartSelection() {
    if (lineChartFixedIndex === null) return;   // nothing selected -> skip the redraw
    lineChartFixedIndex = null;
    if (lineInstance) lineInstance.update();
}

