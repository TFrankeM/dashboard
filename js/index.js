// Cartão rotativo: estatistica real, mas atualizada manualmente
const stats = [
    { number: "1.216.457", label: "Notícias processadas no acervo" },
    { number: "1.957.973", label: "Análises geradas por I.A." },
    { number: "14.967",    label: "Fontes globais monitoradas" },
    { number: "61",        label: "Idiomas acompanhados" },
    { number: "18",        label: "Categorias temáticas cobertas" },
    { number: "504",       label: "Dias de cobertura contínua" }
];

// Países monitorados. Centróides aproximados + código ISO
// Brasil é HUB: imagem do Brasil no exterior
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

const HUB = "BRA";
const SOURCES = Object.keys(COUNTRIES).filter(c => c !== HUB);

const HEX_BASE   = "rgba(125,170,240,0.16)";
const HEX_ACTIVE = "rgba(96,165,250,0.82)";
const HEX_HUB    = "rgba(188,224,255,0.97)";


document.addEventListener('DOMContentLoaded', () => {

    // Cartao rotativo de dados
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
            startAutoplay();   // reinicia contagem de 10s após clique
        });
    }

    // Redireciona para Sala de Situação
    if (btnEnterDashboard) {
        btnEnterDashboard.addEventListener('click', () => {
            window.location.href = "dashboard.html";
        });
    }


    // GLOBO 3D
    const globeContainer = document.getElementById("globeViz");
    if (!globeContainer) return;

    let countryFeatures = [];

    // Contagem de linhas ativas por país (>0 => aceso)
    // Permite que vários arcos sobre o mesmo país não apaguem antes da hora
    const highlightCounts = new Map();

    // dataset do globe.gl marca alguns países como "-99" em ISO_A3. Código correto em ADM0_A3
    function isoOf(props) {
        const a = props.ISO_A3;
        return (a && a !== "-99") ? a : props.ADM0_A3;
    }

    function refreshPolygons() {
        world.hexPolygonColor(world.hexPolygonColor());
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
        .atmosphereColor("#3b82f6")
        .atmosphereAltitude(0.13)

        // Países como grade de pontos
        .hexPolygonsData([])
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.4)
        .hexPolygonUseDots(true)
        .hexPolygonAltitude(0.004)
        .hexPolygonColor(d => {
            const iso = isoOf(d.properties);
            if (iso === HUB) return HEX_HUB;            // Brasil sempre aceso
            if (highlightCounts.has(iso)) return HEX_ACTIVE;
            return HEX_BASE;
        })
        .hexPolygonsTransitionDuration(400)

        // Linhas de dados
        .arcColor("color")
        .arcStroke(0.3)
        .arcAltitudeAutoScale(0.4)
        .arcDashLength(0.5)
        .arcDashGap(2.5)
        .arcDashInitialGap(() => 1)
        .arcDashAnimateTime(d => d.flightTime)
        .arcsTransitionDuration(0)

        // Pulsos de radar nos pontos monitorados
        .ringColor(d => d.color)
        .ringMaxRadius(d => d.maxR)
        .ringPropagationSpeed(d => d.speed)
        .ringRepeatPeriod(d => d.period)
        .ringAltitude(0.006);

    // Esfera escura. Pontos flutuam sobre ela
    const globeMaterial = world.globeMaterial();
    globeMaterial.color.set("#060c1c");
    globeMaterial.transparent = true;
    globeMaterial.opacity = 0.95;
    globeMaterial.shininess = 0;
    globeMaterial.specular.set("#000000");

    world.width(globeContainer.clientWidth);
    world.height(globeContainer.clientHeight);

    // Pulso de radar: contínuo no Brasil, e na chegada nos outros paises
    let rings = [{
        lat: COUNTRIES[HUB].lat, lng: COUNTRIES[HUB].lng,
        maxR: 4, speed: 2.5, period: 2200,
        color: t => `rgba(188,224,255,${Math.sqrt(1 - t) * 0.4})`
    }];

    function pingRing(c) {
        const ring = {
            lat: c.lat, lng: c.lng, maxR: 3, speed: 3.2, period: 9e9,
            color: t => `rgba(96,165,250,${(1 - t) * 0.55})`
        };
        rings = [...rings, ring];
        world.ringsData(rings);
        setTimeout(() => { rings = rings.filter(r => r !== ring); world.ringsData(rings); }, 1300);
    }

    // Linhas de dados ligadas aos destaques e aos pulsos
    let arcsData = [];

    function spawnArc() {
        if (countryFeatures.length === 0) return;

        // 70% das linhas convergem para o Brasil; 30% ligam outros pares
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
            color: ["rgba(96,165,250,0)", "rgba(147,197,253,0.9)"],
            flightTime
        };

        arcsData = [...arcsData, arc];
        world.arcsData(arcsData);

        // linha saindo da origem -> acende a origem
        lightUp(srcIso);

        // chegada ao destino
        setTimeout(() => {
            lightDown(srcIso);                       // linha deixa origem
            if (dstIso !== HUB) lightUp(dstIso);     // linha entra destino
            pingRing(dst);                           // pulso de radar na chegada

            // remove o arco e apaga o destino
            setTimeout(() => {
                arcsData = arcsData.filter(a => a !== arc);
                world.arcsData(arcsData);
                if (dstIso !== HUB) {
                    setTimeout(() => lightDown(dstIso), 700);
                }
            }, 1500);
        }, flightTime);
    }

    fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
        .then(res => res.json())
        .then(countries => {
            countryFeatures = countries.features;
            world.hexPolygonsData(countryFeatures);
            world.ringsData(rings);

            spawnArc();
            setInterval(spawnArc, 1000);
        });

    // Câmera, rotação e interatividade
    world.pointOfView({ lat: 2, lng: -45, altitude: 1 }, 0);

    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.25;
    world.controls().enableZoom = true;
    world.controls().enableDamping = true;
    world.controls().dampingFactor = 0.05;

    // Inércia após arrastar mouse
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

