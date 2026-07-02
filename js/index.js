import { DICTIONARY } from "./i18n.js";

// Active UI language (pt-BR is the default). Options live in the i18n dictionary.
let currentLang = "pt-BR";

const t = key => (DICTIONARY[currentLang] && DICTIONARY[currentLang][key]) || key;
const fmtNumber = n => Number(n).toLocaleString(currentLang);

// Average grade (1–7) → image-label key, matching the dashboard histogram buckets.
const GRADE_IMAGE_KEYS = {
    1: "image_extremely_negative",
    2: "image_very_negative",
    3: "image_slightly_negative",
    4: "image_neutral",
    5: "image_slightly_positive",
    6: "image_very_positive",
    7: "image_extremely_positive"
};
const gradeImageKey = grade =>
    GRADE_IMAGE_KEYS[Math.min(7, Math.max(1, Math.round(Number(grade))))];

// Localized language name from an ISO code (e.g. "es" → "Espanhol" / "Spanish").
const languageName = code => {
    const fallback = String(code).toUpperCase();
    try {
        const name = new Intl.DisplayNames([currentLang], { type: "language" }).of(String(code).toLowerCase());
        return name ? name.charAt(0).toUpperCase() + name.slice(1) : fallback;
    } catch {
        return fallback;
    }
};

// Rotating hero stats. Values are overwritten by /api/data?widget=stats when
// available; these act as a fallback. Labels are resolved per language at render.
let stats = [
    { value: 1216457, key: "stat_total_news" },
    { value: 1957973, key: "stat_total_analyses" },
    { value: 14967,   key: "stat_total_sources" },
    { value: 61,      key: "stat_total_languages" },
    { value: 18,      key: "stat_total_categories" },
    { value: 504,     key: "stat_coverage_days" }
];

// Monitored countries: approximate centroids + ISO code. Brazil is the hub
// (the subject whose image abroad is tracked).
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

    // Rotating data card
    const SLIDE_MS = 10000;
    let currentIndex = 0;
    let slideTimer = null;
    let lastStats = null;   // latest /api/data payload, kept for re-render on language change

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
        if (numEl) numEl.innerText = fmtNumber(stats[i].value);
        if (lblEl) lblEl.innerText = t(stats[i].key);
        if (idxEl) idxEl.innerText = pad2(i + 1);
    }

    function renderMiniCards(s) {
        const grade = document.getElementById('stat-grade');
        const gradeSub = document.getElementById('stat-grade-sub');
        if (grade && s.avg_grade_brasil != null) {
            grade.innerHTML = `${s.avg_grade_brasil} <span class="mini-unit">/ 7</span>`;
            // Sub label follows the grade so it stays correct as the data shifts.
            if (gradeSub) gradeSub.textContent = t(gradeImageKey(s.avg_grade_brasil));
        }

        const lang = document.getElementById('stat-lang');
        const langSub = document.getElementById('stat-lang-sub');
        if (lang && s.top_language) {
            lang.innerHTML = `${String(s.top_language).toUpperCase()} <span class="mini-unit">${Math.round(s.top_language_pct)}%</span>`;
            // Resolve the full language name from the code, per current language.
            if (langSub) langSub.textContent = languageName(s.top_language);
        }

        const dateEl = document.getElementById('stat-date');
        if (dateEl && s.last_date) {
            const d = new Date(s.last_date);
            const mon = d.toLocaleString(currentLang, { month: 'short', timeZone: 'UTC' }).replace('.', '');
            dateEl.innerHTML = `${pad2(d.getUTCDate())} <span class="mini-unit">${mon} ${String(d.getUTCFullYear()).slice(2)}</span>`;
        }
    }

    function restartTimeline() {
        if (!timelineFill) return;
        timelineFill.style.transition = 'none';
        timelineFill.style.width = '0%';
        void timelineFill.offsetWidth;                       // force reflow
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
            startAutoplay();   // restart the 10s countdown after a click
        });
    }

    // Fill the cards from site_stats (computed at ingestion, not per visitor).
    // The hardcoded values act as a fallback if the endpoint is unavailable.
    fetch("/api/data?widget=stats")
        .then(r => r.ok ? r.json() : null)
        .then(s => {
            if (!s || s.total_news == null) return;
            lastStats = s;

            const values = {
                stat_total_news: s.total_news,
                stat_total_analyses: s.total_analyses,
                stat_total_sources: s.total_sources,
                stat_total_languages: s.total_languages,
                stat_total_categories: s.total_categories,
                stat_coverage_days: s.coverage_days
            };
            stats.forEach(item => { if (values[item.key] != null) item.value = values[item.key]; });

            if (totalEl) totalEl.innerText = pad2(stats.length);
            renderStat(currentIndex % stats.length);
            renderMiniCards(s);
        })
        .catch(err => console.warn("Stats fetch failed; keeping fallback values:", err));

    // Navigate to the dashboard
    if (btnEnterDashboard) {
        btnEnterDashboard.addEventListener("click", () => {
            window.location.href = "dashboard.html";
        });
    }


    // Language switch: re-translate the overlay and re-render locale-aware
    // values, with a brief fade on the translated regions during the swap.
    const uiOverlay = document.getElementById('ui-overlay');
    const langSwitch = document.getElementById('lang-switch');

    function translatePage() {
        const dict = DICTIONARY[currentLang];
        if (!dict) return;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) el.textContent = dict[key];
        });
        document.documentElement.lang = currentLang;
        renderStat(currentIndex % stats.length);
        if (lastStats) renderMiniCards(lastStats);
    }

    if (langSwitch) {
        langSwitch.addEventListener('click', e => {
            const btn = e.target.closest('.lang-opt');
            if (!btn) return;
            const lang = btn.dataset.lang;
            if (lang === currentLang || !DICTIONARY[lang]) return;

            currentLang = lang;
            langSwitch.querySelectorAll('.lang-opt')
                .forEach(b => b.classList.toggle('is-active', b === btn));

            if (uiOverlay) {
                uiOverlay.classList.add('lang-switching');     // fade out
                setTimeout(() => {
                    translatePage();                           // swap while hidden
                    uiOverlay.classList.remove('lang-switching'); // fade back in
                }, 200);
            } else {
                translatePage();
            }
        });
    }


    // 3D globe
    const globeContainer = document.getElementById("globeViz");
    if (!globeContainer) return;

    let countryFeatures = [];

    // Active-arc count per country (>0 = lit). Lets overlapping arcs on the same
    // country keep it lit until the last one leaves.
    const highlightCounts = new Map();

    // Some countries carry ISO_A3 "-99" in this dataset; fall back to ADM0_A3.
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

        // Countries rendered as a dot grid
        .hexPolygonsData([])
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.4)
        .hexPolygonUseDots(true)
        .hexPolygonAltitude(0.004)
        .hexPolygonColor(d => {
            const iso = isoOf(d.properties);
            if (iso === HUB) return HEX_HUB;            // Brazil is always lit
            if (highlightCounts.has(iso)) return HEX_ACTIVE;
            return HEX_BASE;
        })
        .hexPolygonsTransitionDuration(400)

        // Data arcs
        .arcColor("color")
        .arcStroke(0.3)
        .arcAltitudeAutoScale(0.4)
        .arcDashLength(0.5)
        .arcDashGap(2.5)
        .arcDashInitialGap(() => 1)
        .arcDashAnimateTime(d => d.flightTime)
        .arcsTransitionDuration(0)

        // Radar pulses on monitored points
        .ringColor(d => d.color)
        .ringMaxRadius(d => d.maxR)
        .ringPropagationSpeed(d => d.speed)
        .ringRepeatPeriod(d => d.period)
        .ringAltitude(0.006);

    // Dark sphere; the dots float above it.
    const globeMaterial = world.globeMaterial();
    globeMaterial.color.set("#060c1c");
    globeMaterial.transparent = true;
    globeMaterial.opacity = 0.95;
    globeMaterial.shininess = 0;
    globeMaterial.specular.set("#000000");

    world.width(globeContainer.clientWidth);
    world.height(globeContainer.clientHeight);

    // Radar rings: continuous on Brazil, plus one on each arc arrival.
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

    let arcsData = [];

    function spawnArc() {
        if (countryFeatures.length === 0) return;

        // 70% of arcs converge on Brazil; 30% link other pairs.
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

        lightUp(srcIso);   // arc leaves origin -> light it up

        setTimeout(() => {
            lightDown(srcIso);                       // arc has left the origin
            if (dstIso !== HUB) lightUp(dstIso);     // arc reaches destination
            pingRing(dst);                           // radar pulse on arrival

            // remove the arc and unlight the destination
            setTimeout(() => {
                arcsData = arcsData.filter(a => a !== arc);
                world.arcsData(arcsData);
                if (dstIso !== HUB) {
                    setTimeout(() => lightDown(dstIso), 700);
                }
            }, 1500);
        }, flightTime);
    }

    let arcInterval = null;
    fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
        .then(res => res.json())
        .then(countries => {
            countryFeatures = countries.features;
            world.hexPolygonsData(countryFeatures);
            world.ringsData(rings);

            spawnArc();
            arcInterval = setInterval(spawnArc, 1000);
        })
        .catch(err => console.warn("Globe country data failed to load; skipping arcs:", err));
    window.addEventListener("pagehide", () => { if (arcInterval) clearInterval(arcInterval); });

    // Camera, rotation and interaction. Pull the camera back on small screens so
    // the globe renders smaller and doesn't overwhelm the phone layout.
    const povAltitude = () => (window.innerWidth <= 768 ? 2.4 : 1);
    world.pointOfView({ lat: 2, lng: -45, altitude: povAltitude() }, 0);

    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.25;
    world.controls().enableZoom = false;
    world.controls().enableDamping = true;
    world.controls().dampingFactor = 0.05;

    // Preserve the drag direction as rotation inertia after the user lets go.
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

    // Prevent the rotation "catch-up" when the tab returns from the background.
    // rAF is frozen while hidden, so the controls' delta time accumulates and the
    // first visible frame would apply it all at once. Pause auto-rotate while
    // hidden and skip that stale frame before resuming, so the spin stays smooth.
    document.addEventListener('visibilitychange', () => {
        const controls = world.controls();
        if (document.hidden) {
            controls.autoRotate = false;
        } else {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                controls.autoRotate = true;
            }));
        }
    });

    // Keep the globe sized to its container and re-fit the camera per breakpoint
    window.addEventListener('resize', () => {
        world.width(globeContainer.clientWidth);
        world.height(globeContainer.clientHeight);
        world.pointOfView({ altitude: povAltitude() }, 400);
    });
});
