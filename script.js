document.addEventListener('DOMContentLoaded', function () {
    
    // --- CONFIGURAÇÃO E SELEÇÃO DE ELEMENTOS ---
    const CSV_URL = "https://raw.githubusercontent.com/TFrankeM/dashboard/main/data_no_analisys_two_fifths.csv";

    const lineChartCanvas = document.getElementById("lineChart");
    const barChartCanvas = document.getElementById("barChart");
    const gaugeChartCanvas = document.getElementById("gaugeChart");
    const gaugeValueText = document.getElementById("gaugeValueText");
    const totalNoticiasEl = document.getElementById("total-noticias");
    const resetZoomBtn = document.getElementById("resetZoomBtn");
    const averageButtonsContainer = document.querySelector(".average-buttons");

    let lineChartInstance;
    let barChartInstance;
    let gaugeChartInstance;
    let fullDataset = [];
    let currentAveragePeriod = "weekly";

    Chart.register(ChartZoom); // Registro do plugin de zoom

    // desenhar o ponteiro do gauge
    const gaugeNeedle = {
        id: 'gaugeNeedle',
        afterDatasetDraw(chart, args, options) {
            const { ctx, data } = chart;
            ctx.save();

            const needleValue = data.datasets[0].needleValue;
            
            // arco começa em 150 graus e tem 240 graus de comprimento
            const startAngle = 150 * (Math.PI / 180);               // 150 graus em radianos
            const sweepAngle = 240 * (Math.PI / 180);               // 240 graus em radianos
            const valueFraction = (needleValue - 1) / (7 - 1);      // Percentual do valor na escala 1-7
            const angle = startAngle + (valueFraction * sweepAngle);

            const cx = chart.getDatasetMeta(0).data[0].x;
            const cy = chart.getDatasetMeta(0).data[0].y;
            
            // Desenha o ponteiro
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo((chart.chartArea.height / 2) + 10, 0); 
            ctx.lineTo(0, 5);
            ctx.fillStyle = '#444';
            ctx.fill();
            ctx.rotate(-angle);
            ctx.translate(-cx, -cy);

            // Desenha o pino central
            ctx.beginPath();
            ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
            ctx.fillStyle = '#444';
            ctx.fill();
            ctx.restore();
        }
    };

    function calculateLast30MinAverage(dataset) {
        if (dataset.length === 0) return 4;

        // Pega a data mais recente do dataset
        const lastDate = dataset[dataset.length - 1].date;
        const thirtyMinutesBeforeLast = new Date(lastDate.getTime() - (30 * 60 * 1000));

        // Filtra os dados que estão nos últimos 30 minutos do dataset
        const recentData = dataset.filter(row => row.date >= thirtyMinutesBeforeLast && row.date <= lastDate);

        if (recentData.length === 0) return 4;

        const sum = recentData.reduce((acc, row) => acc + row.grade, 0);
        return sum / recentData.length;
    }

    function renderGaugeChart(value) {
        gaugeValueText.textContent = value.toFixed(1);

        const ctx = gaugeChartCanvas.getContext('2d');
        if (gaugeChartInstance) gaugeChartInstance.destroy();
        
        const gaugeSegmentDescriptions = [
            'Extremamente Negativo (Nota: 1.0 - 1.5)',
            'Muito Negativo (Nota: 1.51 - 2.50)',
            'Pouco Negativo (Nota: 2.51 - 3.50)',
            'Neutro (Nota: 3.51 - 4.49)',
            'Pouco Positivo (Nota: 4.5 - 5.49)',
            'Muito Positivo (Nota: 5.5 - 6.49)',
            'Extremamente Positivo (Nota: 6.5 - 7.0)'
        ];

        gaugeChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: gaugeSegmentDescriptions,
                datasets: [{
                    data: [0.5, 1, 1, 1, 1, 1, 0.5],
                    needleValue: value, // Passa o valor para o plugin do ponteiro
                    backgroundColor: [
                        '#d7191c', // Vermelho forte
                        '#fdae61', // Laranja
                        '#ffffbf', // Amarelo
                        '#f0f0f0', // Cinza (Neutro)
                        '#abdda4', // Verde claro
                        '#2b83ba', // Azul
                        '#1a9641'  // Verde forte
                    ],
                    hoverBackgroundColor: [
                        '#b91619', 
                        '#e6984b', 
                        '#eaea9e', 
                        '#c7c7c7', 
                        '#93c98d', 
                        '#2570a1',
                        '#167d35'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                rotation: -120,
                circumference: 240,
                cutout: '65%',
                responsive: true,
                layout: { padding: { bottom: 15 } },
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            // Customiza o texto que aparece no tooltip
                            title: () => null,
                            label: function(context) {
                                return context.label;
                            }
                        }
                    }
                }
            },
            plugins: [gaugeNeedle] // Adiciona plugin
        });
    }

    // Função para atualizar o gauge periodicamente
    function updateGauge() {
        if (fullDataset.length > 0) {
            const avg = calculateLast30MinAverage(fullDataset);
            renderGaugeChart(avg);
        }
    }


    function aggregateData(data, period) {
        if (data.length === 0) return { labels: [], data: [] };

        // Adiciona um zero à esquerda para números menores que 10 (ex: 5 -> "05")
        const padZero = (num) => String(num).padStart(2, '0');

        // Calcula o número da semana (ISO 8601 standard)
        const getWeekNumber = (d) => {
            d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            return weekNo;
        };
        
        // Array para nomes de meses
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        const groups = {};

        data.forEach(row => {
            const date = row.date;
            let key;

            // Recriando as chaves de agrupamento com JavaScript puro
            if (period === 'monthly') {
                key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}`;
            } else if (period === 'weekly') {
                key = `${date.getFullYear()}-W${padZero(getWeekNumber(date))}`;
            } else if (period === 'daily') {
                key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
            } else if (period === 'hourly') {
                key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:00`;
            } else if (period === 'half_hourly') {
                const minutes = date.getMinutes() < 30 ? '00' : '30';
                key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${minutes}`;
            }

            if (key) {
                if (!groups[key]) {
                    groups[key] = { sum: 0, count: 0, date: date };
                }
                groups[key].sum += row.grade;
                groups[key].count++;
            }
        });

        const sortedKeys = Object.keys(groups).sort();
        
        // Recriando os labels para o gráfico
        const labels = sortedKeys.map(key => {
            const date = groups[key].date;
            const yearShort = String(date.getFullYear()).slice(-2);
            
            if (period === 'monthly') {
                return `${meses[date.getMonth()]}/${yearShort}`;
            }
            if (period === 'weekly') {
                return `Sem ${getWeekNumber(date)}, ${meses[date.getMonth()]}/${yearShort}`;
            }
            // Para os outros casos, um formato mais completo
            return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        });

        const aggregatedData = sortedKeys.map(key => groups[key].sum / groups[key].count);

        return { labels, data: aggregatedData };
    }


    // --- GRÁFICO DE BARRAS ---
    function renderBarChart(labels, data) {
        const ctx = barChartCanvas.getContext('2d');
        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Número de Notícias',
                    data: data,
                    backgroundColor: '#003a79',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { bottom: 15 } },
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: true } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }


    function processAndDisplayBarChartData(data) {
        const newsByYear = {};
        data.forEach(row => {
            if (row.date instanceof Date && !isNaN(row.date)) {
                const year = row.date.getFullYear();
                if (!newsByYear[year]) {
                    newsByYear[year] = 0;
                }
                newsByYear[year]++;
            }
        });

        const barLabels = Object.keys(newsByYear).sort();
        const barData = barLabels.map(year => newsByYear[year]);
        renderBarChart(barLabels, barData);

        const totalNoticias = barData.reduce((sum, value) => sum + value, 0);
        totalNoticiasEl.textContent = totalNoticias.toLocaleString('pt-BR');
    }


    // --- GRÁFICO DE LINHAS ---
    function renderLineChart(labels, data) {
        const ctx = lineChartCanvas.getContext('2d');
        if (lineChartInstance) lineChartInstance.destroy();
        lineChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Nota de Imagem (Grade)',
                    data: data,
                    borderColor: '#003a79',
                    backgroundColor: 'rgba(0, 58, 121, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { min: 1, max: 7, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { color: 'rgba(0,0,0,0.05)' } }
                },
                plugins: { 
                    legend: { display: false },
                    // PLUGIN DE ZOOM
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',                  // arrastar gráfico no eixo X
                        },
                        zoom: {
                            wheel: { enabled: true },   // Zoom com a roda do mouse
                            drag: { enabled: true },    // Ativa o "brush" para selecionar
                            mode: 'x',                  // Zoom apenas no eixo X
                        }
                    }
            }
            }
        });
    }


    // --- Atualiza gráfico de linha e medido Gauge ---
    function updateLineChart() {
        const { labels, data } = aggregateData(fullDataset, currentAveragePeriod);
        renderLineChart(labels, data);
    }

    // --- INICIA O DASHBOARD ---
    async function initializeDashboard() {
        totalNoticiasEl.textContent = "Carregando...";
        renderGaugeChart(0.0);

        // Papa Parse busca e processa o CSV
        Papa.parse(CSV_URL, {
            download: true,      // busca a URL remota
            header: true,        // Trata a primeira linha como cabeçalho
            dynamicTyping: true, // Tenta converter números e booleanos
            complete: function(results) {
                // Pré-processa os dados uma vez
                fullDataset = results.data.map(row => ({
                    ...row,
                    date: new Date(row.date),
                    grade: parseFloat(row.grade)
                })).filter(row => row.date instanceof Date && !isNaN(row.date) && !isNaN(row.grade)); // Filtra linhas inválidas

                fullDataset.sort((a, b) => a.date - b.date);

                processAndDisplayBarChartData(fullDataset);
                updateLineChart();
                updateGauge(); // Primeira atualização

                setInterval(updateGauge, 60*1000);
            },
            error: function(error) {
                console.error("Erro ao carregar ou processar o arquivo CSV:", error);
                totalNoticiasEl.textContent = "Erro ao carregar dados";
            }
        });
    }

    // --- Event Listeners para botões ---
    averageButtonsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('avg-btn')) {
            // Remove a classe 'active' de todos os botões
            averageButtonsContainer.querySelectorAll('.avg-btn').forEach(btn => btn.classList.remove('active'));
            // Adiciona 'active' ao botão clicado
            e.target.classList.add('active');
            
            // Atualiza o período e o gráfico
            currentAveragePeriod = e.target.dataset.period;
            updateLineChart();
        }
    });

    // Reseta ao estado original o gráfico de linhas
    resetZoomBtn.addEventListener('click', () => {
        // Reseta o zoom
        if (lineChartInstance) {
            lineChartInstance.resetZoom();
        }

        // reseta o período
        currentAveragePeriod = 'weekly';
        
        // Atualiza dos botões de período
        averageButtonsContainer.querySelectorAll('.avg-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        // 'active' para botão 'Semanal'
        const weeklyButton = averageButtonsContainer.querySelector('.avg-btn[data-period="weekly"]');
        if (weeklyButton) {
            weeklyButton.classList.add('active');
        }

        updateLineChart();
    });

    initializeDashboard();
});