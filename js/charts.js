/**
    Viwer layer
*/

let histogramInstance = null;
let gaugeInstance = null;
let volumeInstance = null;
let lineInstance = null;
let lineChartFixedIndex = null;

// Choose which x-axis tick indices to label: always the first and last, with a
// width-dependent number of evenly spaced ticks in between. Cached per chart width.
let lineTickCache = { w: -1, n: -1, set: null };
function lineTickIndices(chart, n) {
    const w = chart.width || 0;
    if (lineTickCache.w === w && lineTickCache.n === n) return lineTickCache.set;
    const target = w < 360 ? 3 : w < 560 ? 4 : w < 900 ? 6 : w < 1300 ? 9 : 12;
    const count = Math.min(target, n);
    const set = new Set();
    if (n > 0) {
        if (count <= 1) {
            set.add(0);
        } else {
            for (let i = 0; i < count; i++) set.add(Math.round(i * (n - 1) / (count - 1)));
        }
        set.add(0);
        set.add(n - 1);
    }
    lineTickCache = { w, n, set };
    return set;
}

const COLORS = {
    bluePrimary: "#003A79",
    blueLight: "#008BC9",
};

const TOOLTIP_THEME = {
    backgroundColor: "rgba(255, 255, 255, 0.95)", 
    titleColor: "#003A79",
    bodyColor: "#5C5B5F",
    borderColor: "#D7D9DD",
    borderWidth: 1,
    titleFont: { size: 13, weight: "bold", family: "'Gotham', 'Arial', sans-serif" },
    bodyFont: { size: 12, family: "'Gotham', 'Arial', sans-serif" },
    padding: 10,
    bodyPadding: 4,
    displayColors: true,
};

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
        ctx.fillStyle = "#444";
        ctx.fill();
        ctx.rotate(-angle);
        ctx.translate(-cx, -cy);

        // central pin
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
        ctx.fillStyle = "#444";
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
    
    gaugeInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: gaugeSegmentDescriptions,
            datasets: [{
                data: [0.5, 1, 1, 1, 1, 1, 0.5], // tamanho fatias
                needleValue: value,
                backgroundColor: backgroundColor,
                hoverBackgroundColor: hoverBackgroundColor,
                borderWidth: 2,
                borderColor: "#ffffff",
                hoverOffset: 4
            }]
        },
        options: {
            rotation: -120,
            circumference: 240,
            cutout: "65%", // arco
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 0, bottom: 10 } },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    ...TOOLTIP_THEME,
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
}

export function drawGradesHistogramChart(canvasElement, labels, data, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }

    // texts is expected to be: { labelFrequency: "", tooltipTitle: "", tooltipSuffix: "" }
    
    const ctx = canvasElement.getContext("2d");
    if (histogramInstance) histogramInstance.destroy();

    const sentimentColors = [
        "#b91c1c", // 1 Extremely negative
        "#ef4444", // 2 Very negative
        "#fdae61", // 3 Slightly negative
        "#94a3b8", // 4 Neutral
        "#84cc16", // 5 Slightly positive
        "#22c55e", // 6 Positive    
        "#15803d"  // 7 Extremely positive
    ];

    histogramInstance = new Chart(ctx, {
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
                    ...TOOLTIP_THEME,
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
    });
}


export function drawVolumeChart(canvasElement, labels, data, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }
    
    const ctx = canvasElement.getContext("2d");
    if (volumeInstance) volumeInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, canvasElement.height);
    gradient.addColorStop(0, "rgba(0, 58, 121, 0.7)");
    gradient.addColorStop(1, "rgba(0, 58, 121, 0.1)");

    volumeInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                // Draw the blue line and the gradient background area clipped
                {
                    label: texts.labelNews || "Notícias",
                    data: data,
                    borderColor: COLORS.bluePrimary,
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
                    pointBackgroundColor: COLORS.bluePrimary,
                    fill: false,
                    tension: 0.4,
                    clip: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { 
                mode: "index", 
                intersect: false
                // mode: "nearest",
                // intersect: false,
                // axis: "xy"
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
                    ...TOOLTIP_THEME,
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
    });
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

        // fixed vertical line (click)
        if (lineChartFixedIndex !== null) {
            drawLine(lineChartFixedIndex, "#88868B", 2, [10, 5]);
        }
        // "?" verifies if tooltip exists and has _active elements
        // mobile vertical line (hover)
        if (chart.tooltip?._active?.length) {
            const hoverIndex = chart.tooltip._active[0].index;
            if (hoverIndex !== lineChartFixedIndex) {
                drawLine(hoverIndex, "rgba(136, 134, 139, 0.5)", 1, [5, 5]);
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
    if (lineInstance) lineInstance.destroy();

    lineChartFixedIndex = null;
    
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

    const styledDatasets = dataArray.map((ds, index) => {
        // ds.key is the stable slug (category/entity); ds.label is translated.
        const color = CATEGORY_COLORS[ds.key]
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
    //console.log("Styled Datasets:", styledDatasets);
    //console.log("Labels:", labels);
    lineInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: styledDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
                        // Show first/last plus a width-based number of intermediate dates.
                        callback: function (value, index) {
                            const labels = this.chart.data.labels;
                            return lineTickIndices(this.chart, labels.length).has(index)
                                ? this.getLabelForValue(index)
                                : "";
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
                    console.log("rect.left", rect.left)
                    console.log("chartAreaTop", chartAreaTop)
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
                        color: "#475569",
                        font: { size: smallScreen ? 10 : 12, weight: "600" }
                    }
                },
                tooltip: {
                    backgroundColor: "rgba(255, 255, 255, 0.95)", 
                    titleColor: "#003A79",
                    bodyColor: "#5C5B5F",
                    borderColor: "#D7D9DD",
                    borderWidth: 1,
                    titleFont: { size: 13, weight: "bold" },
                    bodyFont: { size: 12 },
                    padding: 10,
                    bodySpacing: 4,
                    displayColors: true,
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
    });
}

export function resetLineChartZoom() {
    if (lineInstance) lineInstance.resetZoom();
}

export function clearLineChartSelection() {
    if (lineChartFixedIndex === null) return;   // nothing selected -> skip the redraw
    lineChartFixedIndex = null;
    if (lineInstance) lineInstance.update();
}

