document.addEventListener('DOMContentLoaded', function () {
    
    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    // --- CONFIGURAÇÃO ---
    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    const CSV_URL = "https://raw.githubusercontent.com/TFrankeM/dashboard/main/data_no_analisys_two_fifths.csv";

    const periods = [
        { label: "Todo o período", value: "All"},
        { label: "Últimas 24 horas", value: "Last24h"}, 
        { label: "Últimos 7 dias", value: "Last7d"}, 
        { label: "Últimos 30 dias", value: "Last30d"}, 
        { label: "Últimos 120 dias", value: "Last120d"}, 
        { label: "Últimos 180 dias", value: "Last180d"}, 
        { label: "Últimos 365 dias ", value: "Last365d"}
    ];
    
    const categories = [ "Todas", "Ambiente", "Artes, cultura, entretenimento e mídia", 
                         "Ciência e tecnologia", "Conflito, guerra e paz", "Crime, lei e justiça", 
                         "Desastres, acidentes e emergências", "Economia, negócios e finanças", "Educação", 
                         "Esporte", "Estilo de vida e lazer", "Interesse humano", "Meteorologia", "Política", 
                         "Religião e crenças", "Saúde", "Sociedade", "Trabalho" ];
    
    // Filters initial state
    let currentFilters = {
        period: "Last365d",
        evaluator: "Argentina",
        evaluated: "Brasil",
        category: ["Todas"]
    };

    // Selection DOM elements
    const lineChartCanvas = document.getElementById("lineChart");
    const barChartCanvas = document.getElementById("barChart");
    const gaugeChartCanvas = document.getElementById("gaugeChart");
    const gaugeValueText = document.getElementById("gaugeValueText");
    const totalNoticiasEl = document.getElementById("total-noticias");
    const resetZoomBtn = document.getElementById("resetZoomBtn");
    const averageButtonsContainer = document.querySelector(".average-buttons");

    // Selection filters
    const periodSelect = document.getElementById("period");
    const evaluatorSelect = document.getElementById("evaluator");
    const evaluatedSelect = document.getElementById("evaluated");
    const categorySelect = document.getElementById("category");

    const titleEvaluatorEl = document.getElementById("title-evaluator");
    const titleEvaluatedEl = document.getElementById("title-evaluated");

    let lineChartInstance;
    let barChartInstance;
    let gaugeChartInstance;
    let fullDataset = [];
    let currentAveragePeriod = "weekly";

    Chart.register(ChartZoom); // Plugin of the zoom

    // --> Gauge Pointer
    const gaugeNeedle = {
        id: "gaugeNeedle",
        afterDatasetDraw(chart, args, options) {
            const { ctx, data } = chart;
            ctx.save();

            const needleValue = data.datasets[0].needleValue;
            
            // arco começa em 150 graus e tem 240 graus de comprimento (graus -> radianos)
            const startAngle = 150 * (Math.PI / 180);
            const sweepAngle = 240 * (Math.PI / 180);
            const valueFraction = (needleValue - 1) / (7 - 1);      // Percentual do valor na escala 1-7
            const angle = startAngle + (valueFraction * sweepAngle);

            const cx = chart.getDatasetMeta(0).data[0].x;
            const cy = chart.getDatasetMeta(0).data[0].y;
            
            // Ponteiro
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo((chart.chartArea.height / 2) + 10, 0); 
            ctx.lineTo(0, 5);
            ctx.fillStyle = "#444";
            ctx.fill();
            ctx.rotate(-angle);
            ctx.translate(-cx, -cy);

            // Pino central
            ctx.beginPath();
            ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
            ctx.fillStyle = "#444";
            ctx.fill();
            ctx.restore();
        }
    };


    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    // --- Filtering ---
    //////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Filling <select> menus
    function populateFilters() {
        periodSelect.innerHTML = "";
        periods.forEach(p => {
            const option = document.createElement("option");
            option.value = p.value;
            option.textContent = p.label;
            periodSelect.appendChild(option);
        });
        
        categorySelect.innerHTML = "";
        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });

        // Set all fixed values ​​for evaluators and evaluated
        evaluatorSelect.innerHTML = "<option value='Argentina'>Argentina</option>";
        evaluatedSelect.innerHTML = "<option value='Brasil'>Brasil</option>";

        // Define the initial values of the filters
        periodSelect.value = currentFilters.period;
        evaluatorSelect.value = currentFilters.evaluator;
        evaluatedSelect.value = currentFilters.evaluated;
        currentFilters.category.forEach(cat => {
            const option = categorySelect.querySelector(`option[value="${cat}"]`);
            if (option) option.selected = true;
        });

        // Initialize dropdown box with existing categories
        const categoryChoices = new Choices("#category", {
            removeItemButton: true,
            searchEnabled: true,
            searchPlaceholderValue: "Pesquisar categoria",
            placeholder: true,
            itemSelectText: "",
            shouldSort: false,
        });

        // Collapse when the dropdown closes
        const categoryContainer = document.querySelector(".choices[data-type='select-multiple']");

        categoryContainer.classList.add("collapsed"); // initial state

        categoryContainer.addEventListener("hideDropdown", () => {
            categoryContainer.classList.add("collapsed");
        });

        categoryContainer.addEventListener("showDropdown", () => {
            categoryContainer.classList.remove("collapsed");
        });
    }

    // Apply filters to the entire dataset
    function applyFilters(data, filters) {
        let filteredData = [...data];

        // Period filter
        if (filters.period && filters.period !== "All") {
            const now = new Date();
            let startDate;
            if (filters.period === "Last24h") startDate = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000))
            else if (filters.period === 'Last7d') startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            else if (filters.period === 'Last30d') startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            else if (filters.period === 'Last120d') startDate = new Date(now.getTime() - (120 * 24 * 60 * 60 * 1000));
            else if (filters.period === 'Last180d') startDate = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
            else if (filters.period === 'Last365d') startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
            
            if (startDate) {
                filteredData = filteredData.filter(row => row.date >= startDate);
            }
        }

        // Category Filter
        if (filters.category && !filters.category.includes("Todas")) {
            filteredData = filteredData.filter(row => filters.category.includes(row.category));
        }

        // Reviewer Filter (geography)
        if (filters.evaluator && filters.evaluator !== 'Todos (nd)') {
            filteredData = filteredData.filter(row => row.geography === filters.evaluator);
        }
        
        // Reviewed Filter (evaluated_entity)
        if (filters.evaluated) {
            filteredData = filteredData.filter(row => row.evaluated_entity === filters.evaluated);
        }

        return filteredData;
    }

    function aggregateData(filteredData, period, selectedCategories) {
        if (!filteredData || filteredData.length === 0) {
            return { labels: [], datasets: [] };
        }

        // e.g.: 5 -> "05"
        const padZero = (num) => String(num).padStart(2, "0");

        // ISO 8601 week number (the standard)
        const getWeekNumber = (d) => {
            d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            return weekNo;
        };
        
        // Array para nomes de meses
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const groups = {};  // ex: { '2025-W41': { 'Esporte': {sum, count}, 'Política': {sum, count} } }

        // Aggregate data by chosen period
        filteredData.forEach((row) => {
            const date = new Date (row.date);
            let key;
            
            switch (period) {
                case "monthly":
                    key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}`;
                    break;
                case "weekly":
                    key = `${date.getFullYear()}-W${padZero(getWeekNumber(date))}`;
                    break;
                case "daily":
                    key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
                    break;
                case "hourly":
                    key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:00`;
                case "half_hourly":
                    const minutes = date.getMinutes() < 30 ? "00" : "30";
                    key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${minutes}`;
                    break;
                default:
                    key = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
            }

            if (!groups[key]) {
                groups[key] = { date, _allGrades: [] };
            }
            
            const cat = row.category;
            if (!groups[key][cat]) {
                groups[key][cat] = { sum: 0, count: 0 };
            }
            groups[key][cat].sum += row.grade;
            groups[key][cat].count++;

            // Track for “Todas”
            groups[key]._allGrades.push(row.grade);
        });

        const sortedKeys = Object.keys(groups).sort();
        
        // Build chart labels
        const labels = sortedKeys.map((key) => {
            const date = groups[key].date;
            const yearShort = String(date.getFullYear()).slice(-2);
            
            if (period === 'monthly') {
                return `${meses[date.getMonth()]}/${yearShort}`;
            }
            if (period === 'weekly') {
                return `Sem ${getWeekNumber(date)}, ${meses[date.getMonth()]}/${yearShort}`;
            }
            return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: period.includes("hour") ? "short" : undefined });
        });

        // Build datasets only for selected categories
        const datasets = {};
        const useAverage = selectedCategories.includes("Todas");

        selectedCategories.forEach((cat) => {
            if (cat === "Todas") return; // handle after

            datasets[cat] = sortedKeys.map((key) => {
                const g = groups[key][cat];
                return g ? g.sum / g.count : null;
            });
        });

        // Handle “Todas” as average across all categories for each key
        if (useAverage) {
            const allAvg = sortedKeys.map((key) => {
                const vals = groups[key]._allGrades.filter(v => typeof v === "number" && !isNaN(v));
                return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            });
            datasets["Todas"] = allAvg;
        }

        return { labels, datasets };
    }


    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    // --- GAUGE ---
    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    function calculateLast30MinAverage(dataset) {
        // Data mais recente do dataset
        if (dataset.length === 0) return 4;
        const lastDate = dataset[dataset.length - 1]?.date;
        if(!lastDate) return 4;

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

    function updateGauge(data) {
        const avg = calculateLast30MinAverage(data);
        renderGaugeChart(avg);
    }


    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    // --- GRÁFICO DE BARRAS ---
    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    function renderBarChart(labels, data) {
        const ctx = barChartCanvas.getContext('2d');
        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(ctx, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Número de Notícias",
                    data: data,
                    backgroundColor: "#003a79",
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

    function updateBarChart(data) {
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


    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    // --- GRÁFICO DE LINHAS ---
    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    function renderLineChart(labels, datasets) {
        const ctx = lineChartCanvas.getContext('2d');
        if (lineChartInstance) lineChartInstance.destroy();
        const colorPalette = ['#003a79', 
                              '#d7191c', 
                              '#fdae61', 
                              '#2b83ba', 
                              '#abdda4', 
                              '#000000'];

        // Create datasets for charts
        const chartDatasets = Object.keys(datasets).map((categoryName, index) => ({
            label: categoryName,
            data: datasets[categoryName],
            borderColor: colorPalette[index % colorPalette.length],             // Pega uma cor da paleta
            backgroundColor: colorPalette[index % colorPalette.length] + '1A',  // Cor com transparência
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.1,
            fill: false,
            spanGaps: true,
        }));

        lineChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { min: 1, max: 7, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { color: 'rgba(0,0,0,0.05)' } }
                },
                plugins: { 
                    legend: { display: true },
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

    function updateLineChart(filteredData) {
        console.log("Before filtering: ", filteredData);
        const { labels, datasets } = aggregateData(filteredData, currentAveragePeriod, currentFilters.category);
        renderLineChart(labels, datasets);
        console.log("After filtered: ", datasets);
    }
    

    //////////////////////////////////////////////////////////////////////////////////////////////////////////
    // --- INICIA O DASHBOARD ---
    //////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Update all dashboard components
    function updateDashboard() {
        if (fullDataset.length === 0) return;
        const filteredData = applyFilters(fullDataset, currentFilters);

        titleEvaluatorEl.textContent = currentFilters.evaluator;
        titleEvaluatedEl.textContent = currentFilters.evaluated;
    
        updateLineChart(filteredData);
        updateBarChart(filteredData);
        updateGauge(filteredData);
    }

    function handleFilterChange() {
        currentFilters.period = periodSelect.value;
        currentFilters.evaluator = evaluatorSelect.value;
        currentFilters.evaluated = evaluatedSelect.value;

        const selectedCategories = Array.from(categorySelect.selectedOptions).map(option => option.value);

        // Limita a seleção a 5 categorias
        if (selectedCategories.length > 5) {
            alert("Você pode selecionar no máximo 5 categorias.");
            // Reverte para a seleção anterior
            Array.from(categorySelect.options).forEach(option => {
                option.selected = currentFilters.category.includes(option.value);
            });
            return;
        }

        currentFilters.category = selectedCategories.length > 0 ? selectedCategories : ["Todas"];
        
        updateDashboard();
    }
    
    async function initializeDashboard() {
        totalNoticiasEl.textContent = "Carregando...";
        populateFilters();
        renderGaugeChart(4);

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
                updateDashboard();
            },
            error: function(error) {
                console.error("Erro ao carregar ou processar o arquivo CSV:", error);
                totalNoticiasEl.textContent = "Erro ao carregar dados";
            }
        });
    }

    periodSelect.addEventListener('change', handleFilterChange);
    evaluatorSelect.addEventListener('change', handleFilterChange);
    evaluatedSelect.addEventListener('change', handleFilterChange);
    categorySelect.addEventListener('change', handleFilterChange);

    averageButtonsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('avg-btn')) {
            averageButtonsContainer.querySelectorAll('.avg-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentAveragePeriod = e.target.dataset.period;
            updateDashboard(); // Atualiza o dashboard quando a média muda
        }
    });

    resetZoomBtn.addEventListener('click', () => {
        if (lineChartInstance) {
            lineChartInstance.resetZoom();  // Reset zoom
        }
        currentAveragePeriod = 'weekly';    // Deactivate all buttons
        averageButtonsContainer.querySelectorAll('.avg-btn').forEach(btn => {
            btn.classList.remove('active')
        });
        const weeklyButton = averageButtonsContainer.querySelector('.avg-btn[data-period="weekly"]');
        if (weeklyButton) {                 // Activate just weekly button
            weeklyButton.classList.add('active');
        }
        updateDashboard();
    });
    
    initializeDashboard();
});

