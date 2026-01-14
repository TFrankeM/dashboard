/**
    Viwer layer
*/

let gaugeInstance = null;
let volumeInstance = null;
let barInstance = null;
let lineInstance = null;

const COLORS = {
    bluePrimary: '#003A79',
    blueLight: '#008BC9'
};

// Global plugins
if (typeof Chart !== 'undefined' && typeof ChartZoom !== 'undefined') {
    Chart.register(ChartZoom);
}


// Plugin to draw the Gauge needle (Velocímetro)
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

export function drawGaugeChart(canvasElement, value) {
    const ctx = canvasElement.getContext('2d');
    if (gaugeInstance) gaugeInstance.destroy();
    
    const gaugeSegmentDescriptions = [
        "Imagem extremamente negativa (1.0 a 1.5)",
        "Imagem negativa (1.51 a 2.5)",
        "Imagem levemente negativa (2,51 a 3.5)",
        "Imagem neutra (3.51 a 4.49)",
        "Imagem levemente positiva (4.5 a 5.49)",
        "Imagem positiva (5.5 a 6.49)",
        "Imagem extremamente positiva (6.5 a 7.0)"
    ];

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
                    enabled: true,
                    bodyFont: { weight: "bold" },
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

export function drawVolumeChart(canvasElement, labels, data) {
    const ctx = canvasElement.getContext("2d");
    if (volumeInstance) volumeInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, canvasElement.height);
    gradient.addColorStop(0, "rgba(0, 58, 121, 0.7)");
    gradient.addColorStop(1, "rgba(0, 58, 121, 0.1)");

    volumeInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Notícias",
                data: data,
                borderColor: COLORS.bluePrimary,
                backgroundColor: gradient,
                borderWidth: 1.5,
                pointRadius: 0,
                hitRadius: 5,
                //pointHoverRadius: 4,
                pointBackgroundColor: COLORS.bluePrimary,
                fill: true,
                tension: 0.4
            }]
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
                padding: { left: -10 }
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
                    backgroundColor: "rgba(30, 41, 59, 0.9)",
                    titleFont: { size: 11 },
                    bodyFont: { weight: "bold", size: 12 },
                    cornerRadius: 6,
                    displayColors: false,
                    titleAlign: "left",
                    labelAlign: "left",
                    callbacks: { 
                        title: (ctx) => {
                            const label = Array.isArray(ctx) ? ctx[0].label : ctx.label;
                            return `Dia ${label}`;
                        },
                        label: (ctx) => {
                            const valor = ctx.raw;
                            const sufixo = valor !== 1 ? 'notícias analisadas' : 'notícia analisada';
                            return `${valor} ${sufixo}`;
                        }
                    } 
                }
            }
        }
    });
}

export function drawBarChart(canvasElement, labels, data) {
    const ctx = canvasElement.getContext("2d");
    if (barInstance) barInstance.destroy();

    barInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Quantidade de notícias",
                data: data,
                backgroundColor: "#003a79",
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // layout: { padding: {bottom: 5} },
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: true } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

export function drawLineChart(canvasElement, labels, datasets, onPointClicked) {
    //console.log("Desenhando gráfico de linhas com datasets:", datasets);
    const ctx = canvasElement.getContext("2d");
    if (lineInstance) lineInstance.destroy();
    
    const POLITICAL_COLORS = {
        'Democratas': '#2563eb',
        'Republicanos': '#dc2626',
        'Independentes': '#d97706'
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
                padding: { bottom: 30, left: 10, right: 30 } 
            },
            scales: {
                y: { 
                    min: 1, 
                    max: 7,
                    title: { display: true, text: "FGV IMíd.IA" }
                },
                x: { 
                    grid: { display: false } ,
                    ticks: {
                        maxRotation: 0,
                        includeBounds: true,
                        autoSkip: true,     // skip labels if it doesn't fit
                        //autoSkipPadding: 15,
                        maxTicksLimit: 10,   // max number of ticks to show
                    }
                }
            },
            onClick: (e) => {
                const points = lineInstance.getElementsAtEventForMode(e, "index", { intersect: false }, true);
                if (points.length && onPointClicked) {
                    const firstPoint = points[0];
                    const index = firstPoint.index;
                    const dateClicked = lineInstance.data.labels[index];
                    console.log("Ponto clicado:", dateClicked);
                    onPointClicked(dateClicked, index, e);
                }
            },
            plugins: { 
                legend: { display: true, position: "top", onClick: (e) => { e.stopPropagation(); } },
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

export function resetLineChartZoom() {
    if (lineInstance) lineInstance.resetZoom();
}
