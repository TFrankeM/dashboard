/**
    Viwer layer
*/

let gaugeInstance = null;
let barInstance = null;
let lineInstance = null;

// plugins globais
if (typeof Chart !== 'undefined' && typeof ChartZoom !== 'undefined') {
    Chart.register(ChartZoom);
}


// Plugin para desenhar o ponteiro do Gauge (Velocímetro)
const gaugeNeedlePlugin = {
    id: "gaugeNeedle",
    afterDatasetDraw(chart, args, options) {
        const { ctx, data } = chart;
        ctx.save();
        const needleValue = data.datasets[0].needleValue;
        
        // arco de 150 a 390 graus
        const startAngle = 150 * (Math.PI / 180);
        const sweepAngle = 240 * (Math.PI / 180);
        
        // Limita o valor entre 1 e 7
        const safeValue = Math.max(1, Math.min(7, needleValue));
        const valueFraction = (safeValue - 1) / (7 - 1);
        const angle = startAngle + (valueFraction * sweepAngle);

        // Centro do gráfico
        const cx = chart.getDatasetMeta(0).data[0].x;
        const cy = chart.getDatasetMeta(0).data[0].y;
        
        // ponteiro
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -5); // largura base ponteiro
        ctx.lineTo((chart.chartArea.height / 2) + 10, 0);
        ctx.lineTo(0, 5);
        ctx.fillStyle = "#444";
        ctx.fill();
        ctx.rotate(-angle);
        ctx.translate(-cx, -cy);

        // pino central
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
        ctx.fillStyle = "#444";
        ctx.fill();
        ctx.restore();
    }
};


export function drawGaugeChart(canvasElement, value) {
    const ctx = canvasElement.getContext('2d');
    if (gaugeInstance) gaugeInstance.destroy();
    
    const gaugeSegmentDescriptions = [
        "Imagem extremamente negativa (1.0 a 1.5)",
        "Imagem muito negativa (1.51 a 2.5)",
        "Imagem levemente negativa (2,51 a 3.5)",
        "Imagem neutra (3.51 - 4.49)",
        "Imagem levemente positiva (4.5 - 5.49)",
        "Imagem positiva (5.5 a 6.49)",
        "Imagem extremamente positiva (6.5 a 7.0)"
    ];

    const backgroundColor = [
                        "#d7191c",
                        "#fdae61",
                        "#ffffbf",
                        "#f0f0f0",
                        "#abdda4",
                        "#2b83ba",
                        "#1a9641"
    ];

    const hoverBackgroundColor = [
                        "#b91619", 
                        "#e6984b", 
                        "#eaea9e", 
                        "#c7c7c7", 
                        "#93c98d", 
                        "#2570a1",
                        "#167d35"
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
            layout: { padding: { bottom: 10 } },
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
        plugins: [gaugeNeedlePlugin]
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
    const ctx = canvasElement.getContext("2d");
    if (lineInstance) lineInstance.destroy();
    
    const LINE_COLORS = [
        "#1e40af",
        "#dc2626",
        "#16a34a",
        "#d97706",
        "#9333ea",
        "#0891b2",
        "#db2777"
    ];

    const styledDatasets = datasets.map((dataObj, index) => ({
        label: dataObj.label,
        data: dataObj.data,
        borderColor: LINE_COLORS[index % LINE_COLORS.length],
        backgroundColor: LINE_COLORS[index % LINE_COLORS.length].replace("1)", "0.1)"),
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,    // aumenta o ponto ao passar o mouse
        tension: 0.3,           // suaviza linha
        fill: false,
        spanGaps: true
    }));

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
                padding: { bottom: 30, left: 10, right: 10 } 
            },
            scales: {
                y: { 
                    min: 1, 
                    max: 7,
                    title: { display: true, text: "FGV IIMEx" }
                },
                x: { 
                    grid: { display: false } 
                }
            },
            onClick: (e) => {
                const points = lineInstance.getElementsAtEventForMode(e, "nearest", { intersect: true }, true);
                if (points.length && onPointClicked) {
                    const firstPoint = points[0];
                    const index = firstPoint.index;
                    const dateClicked = lineInstance.data.labels[index];
                    console.log("Ponto clicado:", dateClicked);
                    onPointClicked(dateClicked, e);
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
