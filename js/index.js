/*
    Landing page "Dado Concreto" — globo 3D + cartão de estatísticas.
    Todos os números abaixo são REAIS, extraídos do banco Neon (jun/2026).
    Eles são preenchidos manualmente aqui; não se atualizam sozinhos quando
    o banco muda (atualização futura, quando os dados forem renovados).
*/

// ----------------------------------------------------------------------------
// 1. ESTATÍSTICAS REAIS (cartão rotativo)
// ----------------------------------------------------------------------------
const stats = [
    { number: "1.216.457", label: "Notícias processadas no acervo" },
    { number: "1.957.973", label: "Análises geradas por I.A." },
    { number: "14.967",    label: "Fontes globais monitoradas" },
    { number: "61",        label: "Idiomas acompanhados" },
    { number: "18",        label: "Categorias temáticas cobertas" },
    { number: "504",       label: "Dias de cobertura contínua" }
];

// ----------------------------------------------------------------------------
// 2. PAÍSES MONITORADOS (centróides aproximados + código ISO de 3 letras)
//    O Brasil é o HUB: o sujeito do indicador (imagem do Brasil no exterior).
//    As "linhas" partem das fontes pelo mundo e convergem para o Brasil.
// ----------------------------------------------------------------------------
const COUNTRIES = {
    BRA: { lat: -10.0, lng: -53.0,  name: "Brasil" },
    ARG: { lat: -38.4, lng: -63.6,  name: "Argentina" },
    USA: { lat:  39.8, lng: -98.6,  name: "EUA" },
    MEX: { lat:  23.6, lng: -102.5, name: "México" },
    GBR: { lat:  54.0, lng:  -2.0,  name: "Reino Unido" },
    DEU: { lat:  51.2, lng:  10.4,  name: "Alemanha" },
    FRA: { lat:  46.6, lng:   2.2,  name: "França" },
    ESP: { lat:  40.5, lng:  -3.7,  name: "Espanha" },
    PRT: { lat:  39.4, lng:  -8.2,  name: "Portugal" },
    ITA: { lat:  41.9, lng:  12.6,  name: "Itália" },
    CHN: { lat:  35.9, lng: 104.2,  name: "China" },
    IND: { lat:  22.6, lng:  79.0,  name: "Índia" },
    JPN: { lat:  36.2, lng: 138.3,  name: "Japão" },
    ZAF: { lat: -30.6, lng:  22.9,  name: "África do Sul" },
    RUS: { lat:  61.5, lng:  90.0,  name: "Rússia" },
    CAN: { lat:  56.1, lng: -106.3, name: "Canadá" },
    AUS: { lat: -25.3, lng: 133.8,  name: "Austrália" }
};

const HUB = "BRA";  // o ente avaliado: o Brasil
const SOURCES = Object.keys(COUNTRIES).filter(c => c !== HUB);

const colorBaseCountry      = "#0f172a";  // país em repouso
const colorActiveCountry    = "#fbbf24";  // país aceso (linha presente)
const colorHubCountry       = "#10b981";  // Brasil (sempre aceso)


document.addEventListener('DOMContentLoaded', () => {

    // ------------------------------------------------------------------------
    // CARTÃO ROTATIVO DE DADOS — avança por clique OU a cada 10s,
    // com uma "linha do tempo" que mostra o tempo passando.
    // ------------------------------------------------------------------------
    const SLIDE_MS = 10000;
    let currentIndex = 0;
    let slideTimer = null;

    const dataCard      = document.getElementById('dataCard');
    const contentEl     = document.getElementById('dataContent');
    const numEl         = document.getElementById('dataNumber');
    const lblEl         = document.getElementById('dataLabel');
    const idxEl         = document.getElementById('slideIndex');
    const totalEl       = document.getElementById('slideTotal');
    const timelineFill  = document.getElementById('timelineFill');
    const btnEnterDashboard = document.getElementById('btn-enter-dashboard');

    const pad2 = n => String(n).padStart(2, '0');

    function renderStat(i) {
        if (numEl) numEl.innerText = stats[i].number;
        if (lblEl) lblEl.innerText = stats[i].label;
        if (idxEl) idxEl.innerText = pad2(i + 1);
    }

    function restartTimeline() {
        if (!timelineFill) return;
        timelineFill.style.transition = 'none';
        timelineFill.style.width = '0%';
        void timelineFill.offsetWidth;                       // força reflow
        timelineFill.style.transition = `width ${SLIDE_MS}ms linear`;
        timelineFill.style.width = '100%';
    }

    function showStat(i) {
        if (contentEl) {
            contentEl.classList.remove('fade-enter-active');
            contentEl.classList.add('fade-enter');
            setTimeout(() => {
                renderStat(i);
                contentEl.classList.remove('fade-enter');
                contentEl.classList.add('fade-enter-active');
            }, 300);
        } else {
            renderStat(i);
        }
        restartTimeline();
    }

    function nextStat() {
        currentIndex = (currentIndex + 1) % stats.length;
        showStat(currentIndex);
    }

    function startAutoplay() {
        clearInterval(slideTimer);
        slideTimer = setInterval(nextStat, SLIDE_MS);
    }

    if (dataCard) {
        if (totalEl) totalEl.innerText = pad2(stats.length);
        renderStat(0);
        restartTimeline();
        startAutoplay();

        dataCard.addEventListener('click', () => {
            nextStat();
            startAutoplay();   // reinicia a contagem de 10s após o clique
        });
    }

    // Redireciona para a Sala de Situação (painel de gráficos)
    if (btnEnterDashboard) {
        btnEnterDashboard.addEventListener('click', () => {
            window.location.href = "dashboard.html";
        });
    }


    // ------------------------------------------------------------------------
    // GLOBO 3D
    // ------------------------------------------------------------------------
    const globeContainer = document.getElementById("globeViz");
    if (!globeContainer) return;

    let countryFeatures = [];

    // Contagem de "linhas" ativas por país (>0 => aceso). Permite que vários
    // arcos sobre o mesmo país não apaguem antes da hora.
    const highlightCounts = new Map();

    // Código ISO confiável: o dataset do globe.gl marca alguns países como
    // "-99" em ISO_A3; nesse caso caímos para ADM0_A3.
    function isoOf(props) {
        const a = props.ISO_A3;
        return (a && a !== "-99") ? a : props.ADM0_A3;
    }

    function refreshPolygons() {
        // Reaplica o accessor de cor para forçar a re-renderização.
        world.polygonCapColor(world.polygonCapColor());
    }

    function lightUp(iso) {
        highlightCounts.set(iso, (highlightCounts.get(iso) || 0) + 1);
        refreshPolygons();
    }

    function lightDown(iso) {
        const next = (highlightCounts.get(iso) || 0) - 1;
        if (next <= 0) highlightCounts.delete(iso);
        else highlightCounts.set(iso, next);
        refreshPolygons();
    }

    const world = Globe()(globeContainer)
        .backgroundColor("rgba(0,0,0,0)")
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor("#1e40af")
        .atmosphereAltitude(0.25)

        // continentes
        .polygonCapColor(d => {
            const iso = isoOf(d.properties);
            if (iso === HUB) return colorHubCountry;            // Brasil sempre aceso
            if (highlightCounts.has(iso)) return colorActiveCountry;
            return colorBaseCountry;
        })
        .polygonsTransitionDuration(700)
        .polygonSideColor(() => "rgba(15, 23, 42, 0.7)")
        .polygonStrokeColor(() => "#1e3a8a")

        // arcos (as "linhas" de dados)
        .arcColor("color")
        .arcStroke(0.6)
        .arcAltitudeAutoScale(0.45)
        .arcDashLength(0.4)
        .arcDashGap(4)
        .arcDashInitialGap(() => 1)
        .arcDashAnimateTime(d => d.flightTime)
        .arcsTransitionDuration(0);

    // oceano
    const oceanMaterial = world.globeMaterial();
    oceanMaterial.color.set("#0f172a");
    oceanMaterial.transparent = true;
    oceanMaterial.opacity = 0.05;
    oceanMaterial.shininess = 0;
    oceanMaterial.specular.set("#000000");

    world.width(globeContainer.clientWidth);
    world.height(globeContainer.clientHeight);

    // ------------------------------------------------------------------------
    // EMISSÃO DE ARCOS conectada aos destaques de país
    //   - ao surgir, a ORIGEM acende (a linha está saindo dela);
    //   - ao chegar (após flightTime), a origem APAGA e o DESTINO acende;
    //   - pouco depois o arco é removido e o destino apaga.
    //   O Brasil (HUB) permanece sempre aceso, como sujeito do indicador.
    // ------------------------------------------------------------------------
    let arcsData = [];

    function spawnArc() {
        if (countryFeatures.length === 0) return;

        // 70% das linhas convergem para o Brasil; 30% ligam outros pares.
        const toHub = Math.random() < 0.7;
        const srcIso = SOURCES[Math.floor(Math.random() * SOURCES.length)];
        let dstIso = HUB;
        if (!toHub) {
            do {
                dstIso = SOURCES[Math.floor(Math.random() * SOURCES.length)];
            } while (dstIso === srcIso);
        }

        const src = COUNTRIES[srcIso];
        const dst = COUNTRIES[dstIso];
        const flightTime = 2600 + Math.random() * 2200;

        const arc = {
            startLat: src.lat, startLng: src.lng,
            endLat: dst.lat,   endLng: dst.lng,
            color: ["#fbbf24", dstIso === HUB ? "#34d399" : "#60a5fa"],
            flightTime
        };

        arcsData = [...arcsData, arc];
        world.arcsData(arcsData);

        // a linha está saindo da origem -> acende a origem
        lightUp(srcIso);

        // chegada ao destino
        setTimeout(() => {
            lightDown(srcIso);                       // a linha deixou a origem
            if (dstIso !== HUB) lightUp(dstIso);     // a linha entrou no destino

            // remove o arco e apaga o destino depois de um breve brilho
            setTimeout(() => {
                arcsData = arcsData.filter(a => a !== arc);
                world.arcsData(arcsData);
                if (dstIso !== HUB) {
                    setTimeout(() => lightDown(dstIso), 700);
                }
            }, 1500);
        }, flightTime);
    }

    // GeoJSON dos países
    fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
        .then(res => res.json())
        .then(countries => {
            countryFeatures = countries.features;
            world.polygonsData(countryFeatures);

            // dispara as linhas só depois de termos os polígonos para acender
            spawnArc();
            setInterval(spawnArc, 850);
        });

    // ------------------------------------------------------------------------
    // CÂMARA, ROTAÇÃO E INTERATIVIDADE
    // ------------------------------------------------------------------------
    world.pointOfView({ lat: 2, lng: -45, altitude: 2.4 }, 0);

    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.25;
    world.controls().enableZoom = true;
    world.controls().enableDamping = true;
    world.controls().dampingFactor = 0.05;

    // Inércia: mantém o sentido da rotação após o arrasto do rato
    let lastAzimuthalAngle = 0;

    world.controls().addEventListener('start', () => {
        lastAzimuthalAngle = world.controls().getAzimuthalAngle();
    });

    world.controls().addEventListener('end', () => {
        const currentAzimuthalAngle = world.controls().getAzimuthalAngle();
        const diff = currentAzimuthalAngle - lastAzimuthalAngle;
        const currentSpeed = Math.abs(world.controls().autoRotateSpeed);

        if (diff > 0) {
            world.controls().autoRotateSpeed = -currentSpeed;
        } else if (diff < 0) {
            world.controls().autoRotateSpeed = currentSpeed;
        }
    });

    // Responsividade
    window.addEventListener('resize', () => {
        world.width(globeContainer.clientWidth);
        world.height(globeContainer.clientHeight);
    });
});
