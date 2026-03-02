/**
    Viwer layer
*/

let histogramInstance = null;
let gaugeInstance = null;
let volumeInstance = null;
let lineInstance = null;
let lineChartFixedIndex = null;

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
                    // title: { display: true, text: "Nota FGV IMíd.IA" }
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

    const LINE_COLORS = [
        "#1e40af",
        "#dc2626",
        "#16a34a",
        "#d97706",
        "#9333ea",
        "#0891b2",
        "#db2777"
    ];

    const dataArray = Array.isArray(datasets) ? datasets : [datasets];

    const styledDatasets = dataArray.map((ds, index) => {
        let color = POLITICAL_COLORS[ds.label] || LINE_COLORS[index % LINE_COLORS.length]
        
        if (!POLITICAL_COLORS[ds.label] && dataArray.length > 1) {
            color = LINE_COLORS[index % LINE_COLORS.length];
        }

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
                    title: { display: true, text: texts.yAxisTitle || "FGV IMíd.IA" }
                },
                x: { 
                    grid: { display: false } ,
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: smallScreen ? 3 : 12,
                        align: "inner"
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
                        font: { size: smallScreen ? 10 : 12 },
                        boxWidth: smallScreen ? 10 : 40
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
    lineChartFixedIndex = null;
    if (lineInstance) lineInstance.update();
}

