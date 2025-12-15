import { fetchLineChartData, fetchBarChartData, fetchGaugeData } from './api_adapter.js';
import { drawGaugeChart, drawBarChart, drawLineChart, resetLineChartZoom } from './charts.js';

document.addEventListener("DOMContentLoaded", function () {
    
    //// Inicialização de UI ////

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    // Scroll: compactar header; atualizar menu lateral
    const filterSection = document.getElementById("filters-container");
    const navDots = document.querySelectorAll(".nav-dot");
    const sections = document.querySelectorAll("header, section, main");

    window.addEventListener("scroll", () => {
        const scrollY = window.scrollY;

        // 1. Compactar Filtros
        if (filterSection) {
            if (scrollY > 150) {
                filterSection.classList.add("compact");
            } else if (scrollY < 50) {
                filterSection.classList.remove("compact");
            }
        }

        // Atualizar menu lateral
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (scrollY >= (sectionTop - 200)) {
                current = section.getAttribute("id");
            }
        });

        navDots.forEach(dot => {
            dot.classList.remove('active');
            if (dot.getAttribute('href').includes(current)) {
                dot.classList.add('active');
            }
        });
    });

    // Toggle
    const toggleBtn = document.getElementById("dynamic-mode");
    const labelTxt = document.getElementById("mode-label");

    if(toggleBtn && labelTxt) {
        toggleBtn.addEventListener("change", (e) => {
            if(e.target.checked) {
                labelTxt.textContent = "Modo dinâmico";
                labelTxt.style.color = "#73BFE8";
                labelTxt.style.fontWeight = "700";
                
                // tarefa da semana que vem - capricha, hein?

            } else {
                labelTxt.textContent = "Modo estático";
                labelTxt.style.color = "white";
                labelTxt.style.fontWeight = "500";

                // tarefa da semana que vem
            }
        });
    }

    //// Config padrão ////

    // SINGLE SOURCE OF TRUTH
    const DEFAULT_CONFIG = {
        period: "Last365d",
        reviewer: "Argentina",
        reviewedEntity: "Brasil",
        category: ["Todas"],
        aggregation: "weekly"
    };

    // Dados estáticos para os dropdowns
    const periodsList = [
        { label: "Todo o período", value: "All"},
        { label: "Últimas 24 horas", value: "Last24h"}, 
        { label: "Últimos 7 dias", value: "Last7d"}, 
        { label: "Últimos 30 dias", value: "Last30d"}, 
        { label: "Últimos 120 dias", value: "Last120d"}, 
        { label: "Últimos 180 dias", value: "Last180d"}, 
        { label: "Últimos 365 dias ", value: "Last365d"}
    ];
    
    const categoriesList = [
        "Artes, cultura, entretenimento e mídia", 
        "Ciência e tecnologia", 
        "Conflito, guerra e paz", 
        "Crime, lei e justiça", 
        "Desastres, acidentes e emergências", 
        "Economia, negócios e finanças", 
        "Educação", 
        "Esporte", 
        "Estilo de vida e lazer", 
        "Interesse humano", 
        "Meio ambiente", 
        "Meteorologia", 
        "Política", 
        "Religião e crenças", 
        "Saúde", 
        "Sociedade", 
        "Todas", 
        "Trabalho" 
    ];

    const reviewersList = [
        { label: "Argentina", value: "Argentina" }
    ];

    const reviewedEntityList = [
        { label: "Brasil", value: "Brasil" }
    ];

    // Currents filters applied
    let currentFilters = { ...DEFAULT_CONFIG };
    let currentAveragePeriod = DEFAULT_CONFIG.aggregation;

    // DOM SELECTORS
    const lineChartCanvas = document.getElementById("lineChart");
    const barChartCanvas = document.getElementById("barChart");
    const gaugeChartCanvas = document.getElementById("gaugeChart");
    
    const gaugeValueText = document.getElementById("gaugeValueText");
    const totalNoticiasEl = document.getElementById("total-noticias");
    
    const periodSelect = document.getElementById("period");
    const reviewerSelect = document.getElementById("reviewer");
    const reviewedEntitySelect = document.getElementById("reviewedEntity");
    const categorySelect = document.getElementById("category");
    
    const resetZoomBtn = document.getElementById("resetZoomBtn");
    const averageButtonsContainer = document.querySelector(".average-buttons");
    const titlereviewerEl = document.getElementById("title-reviewer");
    const titlereviewedEntityEl = document.getElementById("title-reviewedEntity");

    if (typeof tippy !== "undefined") {
        tippy(".info-icon", {
            placement: "top",
            animation: "shift-away",
            theme: "dark",
            delay: [100, 100],
            arrow: true,
            arrowType: "round",
            size: "small",
            trigger: "mouseenter focus click",
            maxWidth: 250,
            interactive: true
        });
    }

    // UI INITIALIZATION
    function initializeUI() {
        periodSelect.innerHTML = "";
        periodsList.forEach(p => periodSelect.add(new Option(p.label, p.value)));
        
        reviewerSelect.innerHTML = "";
        reviewersList.forEach(c => reviewerSelect.add(new Option(c.label, c.value)));

        reviewedEntitySelect.innerHTML = "";
        reviewedEntityList.forEach(c => reviewedEntitySelect.add(new Option(c.label, c.value)));

        categorySelect.innerHTML = "";
        categoriesList.forEach(c => categorySelect.add(new Option(c, c)));

        // Apply default values to period, reviewer, reviewed entity, categories
        periodSelect.value = currentFilters.period;
        reviewerSelect.value = currentFilters.reviewer;
        reviewedEntitySelect.value = currentFilters.reviewedEntity;
        
        if (typeof Choices !== "undefined") {
            const choices = new Choices("#category", {
                removeItemButton: true,
                searchEnabled: true,
                placeholderValue: "Selecione...",
                itemSelectText: "",
                shouldSort: true,
                editItems: true,
                maxItemCount: 5,
                maxItemText: "",
                // maxItemText: (maxItemCount) => {
                //     return `O máximo de ${maxItemCount} categorias selecionadas foi atingido.`;
                // }
            });
            choices.setChoiceByValue(currentFilters.category);

            // Adiciona listeners para controlar o colapso visual
            const categoryContainer = choices.containerOuter.element;
            
            // Estado inicial colapsado
            categoryContainer.classList.add("collapsed");

            // Expande ao abrir
            categoryContainer.addEventListener("showDropdown", () => {
                categoryContainer.classList.remove("collapsed");
            });

            // Colapsa ao fechar (perder foco)
            categoryContainer.addEventListener("hideDropdown", () => {
                categoryContainer.classList.add("collapsed");
            });
        }
    }


    // Data processing: JSON from JSON -> Chart.js format
    function updateGaugeDisplay(value) {
        const finalValue = value !== undefined && value !== null ? parseFloat(value) : 4;
        gaugeValueText.textContent = finalValue.toFixed(2);
        drawGaugeChart(gaugeChartCanvas, finalValue);
    }

    function processAndUpdateBarChart(apiData) {
        if (!apiData || apiData.length === 0) {
            totalNoticiasEl.textContent = "0";
            drawBarChart(barChartCanvas, ["Nenhum dado encontrado."], []);
            return;
        }

        const labels = [];
        const values = [];
        let total = 0;

        apiData.forEach(row => {
            const date = new Date(row.time_period);
            // Extrai apenas o ano para o label
            labels.push(date.getUTCFullYear());
            
            const count = parseInt(row.news_count, 10);
            values.push(count);
            total += count;
        });

        drawBarChart(barChartCanvas, labels, values);
        totalNoticiasEl.textContent = total.toLocaleString('pt-BR');
    }

    function processAndUpdateLineChart(apiData) {
        if (!apiData || apiData.length === 0) {
            drawLineChart(lineChartCanvas, ["Nenhum dado encontrado."], []);
            return;
        }

        const allDates = new Set();
        apiData.forEach(row => {
            if (row.time_period) {
                allDates.add(row.time_period);
            }
        });

        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

        // Prepare X-axis labels
        const labels = sortedDates.map(dateStr => {
            const date = new Date(dateStr);
            if (currentAveragePeriod === "hourly" || currentAveragePeriod === "minutely") {
                return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
            } else if (currentAveragePeriod === "monthly") {
                return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
            }
            return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
        });

        // Prepare datasets per selected category
        const datasets = currentFilters.category.map(catName => {
            // Backend returns "Todas" as category for all-inclusive
            const catRows = apiData.filter(row => row.category === catName);

            // Fast access for date -> value
            const dataMap = new Map();
            catRows.forEach(row => {
                dataMap.set(row.time_period, parseFloat(row.average_grade));
            });

            // Alinha com o Eixo X Mestre
            const alignedData = sortedDates.map(date => dataMap.get(date) || null);

            return {
                label: catName,
                data: alignedData
            };
        });

        drawLineChart(lineChartCanvas, labels, datasets);
    }


    async function updateDashboard() {
        // Combina filtros base com a agregação atual (estado do botão)
        const filters = { 
            ...currentFilters, 
            aggregation: currentAveragePeriod 
        };

        // Atualiza textos estáticos
        if (titlereviewerEl) titlereviewerEl.textContent = currentFilters.reviewer;
        if (titlereviewedEntityEl) titlereviewedEntityEl.textContent = currentFilters.reviewedEntity;

        // Feedback visual de carregamento
        totalNoticiasEl.textContent = "...";

        try {
            console.log("[Dashboard] Atualizando...");
            
            // Busca dados em paralelo para performance
            const [gaugeVal, barData, lineData] = await Promise.all([
                fetchGaugeData(filters),
                fetchBarChartData(filters),
                fetchLineChartData(filters)
            ]);

            // Atualiza a visualização
            updateGaugeDisplay(gaugeVal);
            processAndUpdateBarChart(barData);
            processAndUpdateLineChart(lineData);

        } catch (err) {
            console.error("Erro crítico no dashboard:", err);
            totalNoticiasEl.textContent = "Erro";
        }
    }


    // EVENT LISTENERS
    function handleFilterChange() {
        currentFilters.period = periodSelect.value;
        currentFilters.reviewer = reviewerSelect.value;
        currentFilters.reviewedEntity = reviewedEntitySelect.value;
        
        const selectedCategories = Array.from(categorySelect.selectedOptions).map(o => o.value);

        currentFilters.category = selectedCategories.length > 0 ? selectedCategories : ["Todas"];
        updateDashboard();
    }
    
    // Inputs listeners
    periodSelect.addEventListener("change", handleFilterChange);
    reviewerSelect.addEventListener("change", handleFilterChange);
    reviewedEntitySelect.addEventListener("change", handleFilterChange);
    categorySelect.addEventListener("change", handleFilterChange);

    // Aggregation Buttons (Day/Week/Month)
    averageButtonsContainer.addEventListener("click", (e) => {
        if (e.target.classList.contains("avg-btn")) {
            // Remove active class from all buttons
            document.querySelectorAll(".avg-btn").forEach(b => 
                b.classList.remove("active", "bg-white", "shadow-sm", "font-medium")
            );
            // Add to clicked button
            e.target.classList.add("active", "bg-white", "shadow-sm", "font-medium");
            
            currentAveragePeriod = e.target.dataset.period;
            updateDashboard();
        }
    });

    resetZoomBtn.addEventListener("click", () => {
        resetLineChartZoom();
        
        // Reset aggregation to default weekly
        currentAveragePeriod = DEFAULT_CONFIG.aggregation;
        
        // Reset buttons visual
        document.querySelectorAll(".avg-btn").forEach(b => b.classList.remove("active", "bg-white", "shadow-sm"));
        const defaultBtn = document.querySelector(`.avg-btn[data-period="${DEFAULT_CONFIG.aggregation}"]`);
        if(defaultBtn) defaultBtn.classList.add("active", "bg-white", "shadow-sm");
        
        updateDashboard();
    });

    initializeUI();
    updateDashboard();

});



