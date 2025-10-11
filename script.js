document.addEventListener('DOMContentLoaded', function () {
    
    // --- CONFIGURAÇÃO E SELEÇÃO DE ELEMENTOS ---
    const CSV_URL = "https://raw.githubusercontent.com/TFrankeM/dashboard/main/data_no_analisys_two_fifths.csv";

    const lineChartCanvas = document.getElementById("lineChart");
    const barChartCanvas = document.getElementById("barChart");
    const currentDateEl = document.getElementById("currentDate");
    const currentTimeEl = document.getElementById("currentTime");
    const gaugeValueEl = document.getElementById("gaugeValue");
    const totalNoticiasEl = document.getElementById("total-noticias");
    const resetZoomBtn = document.getElementById("resetZoomBtn");
    const averageButtonsContainer = document.querySelector(".average-buttons");

    let lineChartInstance;
    let barChartInstance;
    let fullDataset = [];
    let currentAveragePeriod = "weekly";


    // --- RELÓGIO E DATA ---
    function updateClock() {
        const now = new Date();
        const dateOptions = { day: '2-digit', month: '2-digit', year: '2-digit' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        
        currentDateEl.textContent = now.toLocaleDateString('pt-BR', dateOptions);
        currentTimeEl.textContent = now.toLocaleTimeString('pt-BR', timeOptions);
    }
    setInterval(updateClock, 1000);
    updateClock();


    // --- AGREGAÇÃO DE DADOS ---
    // ================================================================
//      SUBSTITUA SUA FUNÇÃO aggregateData ANTIGA POR ESTA
// ================================================================

function aggregateData(data, period) {
    if (data.length === 0) return { labels: [], data: [] };

    // --- Funções Auxiliares para substituir o date-fns ---

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

    // --- Lógica de Agrupamento ---

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

        // Atualiza o medidor com a média do último período
        if (data.length > 0) {
            const lastValue = data[data.length - 1];
            gaugeValueEl.textContent = isNaN(lastValue) ? 'N/A' : lastValue.toFixed(0);
        }
    }

    // --- INICIA O DASHBOARD ---
    async function initializeDashboard() {
        totalNoticiasEl.textContent = "Carregando...";

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

    // Registra o plugin de zoom globalmente para o Chart.js
    Chart.register(ChartZoom);
    initializeDashboard();
});