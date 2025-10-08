document.addEventListener('DOMContentLoaded', function () {
    // --- 1. SELEÇÃO DOS ELEMENTOS DO DOM ---
    const fileInput = document.getElementById('fileInput');
    const uploadButton = document.getElementById('uploadButton');
    const lineChartCanvas = document.getElementById('lineChart');
    const barChartCanvas = document.getElementById('barChart');
    const currentDateEl = document.getElementById('currentDate');
    const currentTimeEl = document.getElementById('currentTime');
    const gaugeValueEl = document.getElementById('gaugeValue');
    const totalNoticiasEl = document.getElementById('total-noticias');

    let lineChartInstance;
    let barChartInstance;

    // --- 2. FUNÇÕES DO RELÓGIO E DATA ---
    function updateClock() {
        const now = new Date();
        const dateOptions = { day: '2-digit', month: '2-digit', year: '2-digit' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        
        currentDateEl.textContent = now.toLocaleDateString('pt-BR', dateOptions);
        currentTimeEl.textContent = now.toLocaleTimeString('pt-BR', timeOptions);
    }
    setInterval(updateClock, 1000);
    updateClock();

    // --- 3. FUNÇÕES PARA RENDERIZAR GRÁFICOS ---
    function renderLineChart(labels, data) {
        const ctx = lineChartCanvas.getContext('2d');
        if (lineChartInstance) {
            lineChartInstance.destroy();
        }
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
                plugins: { legend: { display: false } }
            }
        });
    }

    function renderBarChart(labels, data) {
        const ctx = barChartCanvas.getContext('2d');
        if (barChartInstance) {
            barChartInstance.destroy();
        }
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
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- 4. LÓGICA DE UPLOAD E PROCESSAMENTO DO EXCEL ---
    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });

            processAndDisplayData(jsonData);
        };
        reader.readAsArrayBuffer(file);
    });

    function processAndDisplayData(data) {
        // --- Processamento para o Gráfico de Linha ---
        const lineLabels = [];
        const lineData = [];
        // Ordena os dados pela data para garantir que a linha seja desenhada corretamente
        data.sort((a, b) => new Date(a.data) - new Date(b.data));

        data.forEach(row => {
            if (row.data && row.grade) {
                const date = new Date(row.data);
                lineLabels.push(date.toLocaleDateString('pt-BR'));
                lineData.push(parseFloat(row.grade));
            }
        });
        renderLineChart(lineLabels, lineData);
        // Atualiza o medidor com o último valor
        if (lineData.length > 0) {
            gaugeValueEl.textContent = lineData[lineData.length - 1].toFixed(0);
        }

        // --- Processamento para o Gráfico de Barras (Agregado por Ano) ---
        const newsByYear = {};
        data.forEach(row => {
            if (row.data) {
                const year = new Date(row.data).getFullYear();
                if (!newsByYear[year]) {
                    newsByYear[year] = 0;
                }
                newsByYear[year]++;
            }
        });

        const barLabels = Object.keys(newsByYear).sort();
        const barData = barLabels.map(year => newsByYear[year]);
        renderBarChart(barLabels, barData);
        
        // Atualiza o total de notícias
        const totalNoticias = barData.reduce((sum, value) => sum + value, 0);
        totalNoticiasEl.textContent = totalNoticias.toLocaleString('pt-BR');
    }

    // --- 5. ESTADO INICIAL DOS GRÁFICOS ---
    function initializeDashboard() {
        // Renderiza o gráfico de linha vazio
        renderLineChart([], []);
        
        // Renderiza o gráfico de barras com os dados da imagem
        const initialBarLabels = ['2020', '2021', '2022', '2023', '2024', '2025*'];
        const initialBarData = [626622, 788379, 766021, 469261, 529401, 449298];
        renderBarChart(initialBarLabels, initialBarData);
    }

    initializeDashboard();
});