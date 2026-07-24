/**
    Viewer layer
*/

let histogramInstance = null;
let gaugeInstance = null;
let volumeInstance = null;
let lineInstance = null;
let lineChartFixedIndex = null;

// X-axis tick labels for the evolution chart, recomputed whenever the visible
// range (zoom/pan) or the width changes: first + last visible dates, plus every
// day 1 and 15 in view. When zoomed below that granularity it falls back to
// evenly spaced dates and shows the time; day 1/15 markers never show the time.
let lineChartMeta = null;                       // { dates: number[] (ms), aggHours, locale }
let lineTickState = { key: "", map: new Map() };

const DAY_MS = 86400000;

// Data timestamps are UTC; labels and day-boundary math stay in UTC (Greenwich).
const utcDay = ms => Math.floor(ms / DAY_MS);

function fmtAxisLabel(ms, withHour, locale) {
    const opts = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" };
    if (withHour) { opts.hour = "2-digit"; opts.minute = "2-digit"; }
    return new Date(ms).toLocaleString(locale, opts);
}

// True when index i is the first bucket of a UTC day that lands on the 1st or 15th.
function isMonthMarker(dates, i) {
    const day = new Date(dates[i]).getUTCDate();
    if (day !== 1 && day !== 15) return false;
    if (i === 0) return true;
    return utcDay(dates[i]) !== utcDay(dates[i - 1]);
}

// Width budget per tick: dd/mm/yyyy labels (~58px) or dd/mm/yyyy hh:mm (~100px),
// plus breathing room so neighbours never touch.
function tickTarget(width, withHour) {
    return Math.max(2, Math.floor((width || 0) / (withHour ? 150 : 100)));
}

function markerTarget(width) {
    return Math.max(2, Math.floor((width || 0) / 100));
}

function computeLineTicks(scale) {
    const chart = scale.chart;
    const n = chart.data.labels.length;
    const map = new Map();
    const meta = lineChartMeta;
    if (!meta || !meta.dates.length || !n) return map;

    const dates = meta.dates;
    let lo = 0, hi = n - 1;
    if (isFinite(scale.min) && isFinite(scale.max)) {
        lo = Math.max(0, Math.ceil(scale.min));
        hi = Math.min(n - 1, Math.floor(scale.max));
    }
    if (hi < lo) hi = lo;

    const markers = [];
    for (let i = lo; i <= hi; i++) if (isMonthMarker(dates, i)) markers.push(i);

    let withHour = false;
    if (markers.length >= 2) {
        // Enough day 1/15 markers: label those, thinning to the width budget.
        const mTarget = markerTarget(chart.width || 0);
        let chosen = markers;
        if (markers.length > mTarget) {
            // Fixed stride keeps the day 1/15 alternation in phase, so thinning never
            // lands two adjacent markers side by side (which would overlap); e.g. a
            // stride of 2 keeps every 1st and drops every 15th.
            const stride = Math.ceil(markers.length / mTarget);
            chosen = [];
            for (let k = 0; k < markers.length; k += stride) chosen.push(markers[k]);
        }
        for (const i of chosen) map.set(i, fmtAxisLabel(dates[i], false, meta.locale));
    } else {
        // Zoomed in past the month markers: evenly spaced visible dates. Show the
        // time once ticks land less than a day apart (or aggregation is sub-hourly),
        // which also keeps the labels distinct.
        const span = dates[hi] - dates[lo];
        let count = Math.min(tickTarget(chart.width, false), hi - lo + 1);
        const step = count > 1 ? span / (count - 1) : span;
        withHour = step < DAY_MS || (meta.aggHours && meta.aggHours < 1);
        if (withHour) count = Math.min(tickTarget(chart.width, true), hi - lo + 1);
        if (count <= 1) {
            map.set(lo, fmtAxisLabel(dates[lo], withHour, meta.locale));
        } else {
            for (let k = 0; k < count; k++) {
                const i = lo + Math.round(k * (hi - lo) / (count - 1));
                map.set(i, fmtAxisLabel(dates[i], withHour, meta.locale));
            }
        }
    }
    // Always anchor the first and last visible dates.
    map.set(lo, fmtAxisLabel(dates[lo], withHour, meta.locale));
    map.set(hi, fmtAxisLabel(dates[hi], withHour, meta.locale));
    return map;
}

// Recompute only when the width or the visible range actually changed.
function ensureLineTicks(scale) {
    const chart = scale.chart;
    const key = `${chart.width}|${scale.min}|${scale.max}|${chart.data.labels.length}`;
    if (lineTickState.key === key) return;
    const map = computeLineTicks(scale);
    const keys = [...map.keys()].sort((a, b) => a - b);
    lineTickState = {
        key, map,
        lo: keys[0],
        hi: keys[keys.length - 1],
        second: keys[1],
        penult: keys[keys.length - 2],
    };
}

// Tick color comes from chartUI() so the fade matches the active theme.
// Rough label width in px for the tick font (~5.8px/char at 12px).
function estTickWidth(s) { return s ? s.length * 5.8 : 0; }

// The forced first/last anchors are raw edge dates; the second/penultimate ticks
// are the clean day 1/15 markers. When zoom pushes an anchor toward its marker
// neighbour, fade the anchor out (and drop it once the boxes would collide) so the
// marker takes its place instead of the two overlapping.
function lineTickColor(scale, v) {
    const st = lineTickState;
    let anchor, neighbor;
    if (v === st.lo && st.second !== undefined && st.second !== st.lo) {
        anchor = st.lo; neighbor = st.second;
    } else if (v === st.hi && st.penult !== undefined && st.penult !== st.hi) {
        anchor = st.hi; neighbor = st.penult;
    } else {
        return chartUI().tick;
    }
    const gap = Math.abs(scale.getPixelForValue(neighbor) - scale.getPixelForValue(anchor));
    // anchor is edge-aligned (occupies its full width inward); neighbour is centred.
    const clearance = gap - estTickWidth(st.map.get(anchor)) - estTickWidth(st.map.get(neighbor)) / 2;
    const alpha = Math.max(0, Math.min(1, clearance / 20));
    return `rgba(${chartUI().tickFadeRGB}, ${alpha})`;
}

const COLORS = {
    bluePrimary: "#003A79",
    blueLight: "#008BC9",
};

function isDarkTheme() {
    return document.documentElement.dataset.theme === "dark";
}

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Entry animations run for fresh data only; theme/language redraws stay snappy.
let animationsEnabled = true;
export function setChartsAnimation(on) {
    animationsEnabled = on;
}

// Chart.js animation option: false when disabled, staggered per-bar when asked.
function chartAnimation(stagger) {
    if (!animationsEnabled || REDUCED_MOTION) return false;
    return stagger
        ? { delay: c => (c.type === "data" && c.mode === "default" ? c.dataIndex * 40 : 0) }
        : {};
}

// Theme-aware chart chrome. Charts are fully redrawn on theme toggle, so each
// draw call just reads the current values (celeste on dark per the FGV manual).
function chartUI() {
    return isDarkTheme() ? {
        tick: "#9FB3C8",
        tickFadeRGB: "159, 179, 200",
        axisBorder: "rgba(115, 191, 232, 0.25)",
        legend: "#B9C9D9",
        line: "#73BFE8",
        volumeFillTop: "rgba(115, 191, 232, 0.5)",
        volumeFillBottom: "rgba(115, 191, 232, 0.04)",
        surfaceBorder: "#102338",
        needle: "#E8F0F7",
        tooltip: {
            backgroundColor: "rgba(16, 35, 56, 0.97)",
            titleColor: "#E8F0F7",
            bodyColor: "#B9C9D9",
            borderColor: "rgba(115, 191, 232, 0.45)",
        },
    } : {
        tick: "#666",
        tickFadeRGB: "102, 102, 102",
        axisBorder: "rgba(0, 0, 0, 0.1)",
        legend: "#475569",
        line: COLORS.bluePrimary,
        volumeFillTop: "rgba(0, 58, 121, 0.7)",
        volumeFillBottom: "rgba(0, 58, 121, 0.1)",
        surfaceBorder: "#ffffff",
        needle: "#444",
        tooltip: {
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            titleColor: "#003A79",
            bodyColor: "#5C5B5F",
            borderColor: "#D7D9DD",
        },
    };
}

// Default text/axis colors for the charts created right after this call.
function applyChartDefaults() {
    if (typeof Chart === "undefined") return;
    const ui = chartUI();
    Chart.defaults.color = ui.tick;
    Chart.defaults.borderColor = ui.axisBorder;
}

// Diverging 1-7 grade scale (red pole / neutral mid / green pole), one tuning per
// theme. Steps validated for adjacent-pair CVD separation and surface contrast;
// identity is carried by the 1-7 axis position, color is reinforcement.
function gradeScale() {
    return isDarkTheme() ? {
        colors: ["#F4695B", "#C25A44", "#F2C795", "#7E8CA2", "#A9CF7C", "#3E9B58", "#35E68C"],
        hover:  ["#FF8578", "#D26D57", "#F7D6AE", "#93A0B4", "#BCDA93", "#4FAF6A", "#5BEBA1"],
    } : {
        colors: ["#8E1D14", "#C44B36", "#E2926A", "#8494A8", "#8CBD60", "#33923F", "#14602F"],
        hover:  ["#7A170F", "#B03D29", "#D97F53", "#75859A", "#7CAE50", "#2A8236", "#0F5228"],
    };
}

function compactNumber(n) {
    return new Intl.NumberFormat(document.documentElement.lang || "pt-BR",
        { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

// Direct value labels above each histogram bar (muted ink, never the bar color).
const barValueLabels = {
    id: "barValueLabels",
    afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        const { ctx } = chart;
        ctx.save();
        ctx.font = "700 11px 'Gotham', 'Arial', sans-serif";
        ctx.fillStyle = chartUI().tick;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        chart.data.datasets[0].data.forEach((v, i) => {
            const bar = meta.data[i];
            if (v == null || !bar) return;
            ctx.fillText(compactNumber(v), bar.x, bar.y - 4);
        });
        ctx.restore();
    },
};

const TOOLTIP_BASE = {
    borderWidth: 1,
    titleFont: { size: 13, weight: "bold", family: "'Gotham', 'Arial', sans-serif" },
    bodyFont: { size: 12, family: "'Gotham', 'Arial', sans-serif" },
    padding: 10,
    bodyPadding: 4,
    displayColors: true,
};

function tooltipTheme() {
    return { ...TOOLTIP_BASE, ...chartUI().tooltip };
}

// Global plugins
if (typeof Chart !== "undefined" && typeof ChartZoom !== "undefined") {
    Chart.register(ChartZoom);
}

const isSmallScreen = () => window.innerWidth <= 1024;

// Plugin to Gauge needle (Velocímetro)
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

        const arc = chart.getDatasetMeta(0).data[0];
        const cx = arc.x;
        const cy = arc.y;
        // Slim tapered needle reaching into the ring
        const length = arc.innerRadius + (arc.outerRadius - arc.innerRadius) * 0.55;

        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.beginPath();
        ctx.moveTo(-4, -2.5);
        ctx.lineTo(length, 0);
        ctx.lineTo(-4, 2.5);
        ctx.closePath();
        ctx.fillStyle = chartUI().needle;
        ctx.fill();
        ctx.rotate(-angle);
        ctx.translate(-cx, -cy);

        // hub: filled pin with a surface-colored core
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.beginPath();
        ctx.arc(cx, cy, 2.8, 0, 2 * Math.PI);
        ctx.fillStyle = chartUI().surfaceBorder;
        ctx.fill();
        ctx.restore();
    }
};

// Small 1-7 markers just outside the ring, in the muted tick ink.
const gaugeLabelsPlugin = {
    id: "gaugeLabels",
    afterDatasetDraw(chart) {
        const { ctx, data } = chart;
        ctx.save();

        ctx.font = "700 11px 'Gotham', 'Arial', sans-serif";
        ctx.fillStyle = chartUI().tick;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const outerRadius = chart.getDatasetMeta(0).data[0].outerRadius;
        const radius = outerRadius + 11;

        for (let i = 0; i < data.datasets[0].data.length; i++) {
            const meta = chart.getDatasetMeta(0).data[i];
            const angle = meta.startAngle + (meta.endAngle - meta.startAngle) / 2;
            const x = meta.x + Math.cos(angle) * radius;
            const y = meta.y + Math.sin(angle) * radius;
            ctx.fillText((i + 1).toString(), x, y);
        }

        ctx.restore();
    }
};

// Needle position currently shown, kept across chart rebuilds so each apply
// sweeps the needle from the old index to the new one.
let gaugeNeedleShown = null;
let gaugeNeedleAnim = null;

function animateNeedle(chart, from, to) {
    if (gaugeNeedleAnim) cancelAnimationFrame(gaugeNeedleAnim);
    const duration = 1100;
    const start = performance.now();
    const step = now => {
        if (chart !== gaugeInstance) return;   // chart was rebuilt meanwhile
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        const v = from + (to - from) * eased;
        chart.data.datasets[0].needleValue = v;
        gaugeNeedleShown = v;
        chart.draw();
        if (p < 1) gaugeNeedleAnim = requestAnimationFrame(step);
    };
    gaugeNeedleAnim = requestAnimationFrame(step);
}

export function drawGaugeChart(canvasElement, value, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }

    // value: number (1 to 7)
    // texts is expected to be: { segments: [] }
    // texts: { segments: [ "Extremely Negative", "Very Negative", "Slightly Negative", "Neutral", "Slightly Positive", "Positive", "Extremely Positive" ] }
    const ctx = canvasElement.getContext('2d');
    if (gaugeInstance) gaugeInstance.destroy();
    
    const gaugeSegmentDescriptions = texts.segments || [];
    const scale = gradeScale();

    // Sweep the needle from where it was to the new value (from the scale
    // start on the very first draw); jump straight there when animations are off.
    const animateSweep = animationsEnabled && !REDUCED_MOTION && !document.hidden;
    const needleStart = animateSweep ? (gaugeNeedleShown ?? 1) : value;

    gaugeInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: gaugeSegmentDescriptions,
            datasets: [{
                data: [0.5, 1, 1, 1, 1, 1, 0.5], // tamanho fatias
                needleValue: needleStart,
                backgroundColor: scale.colors,
                hoverBackgroundColor: scale.hover,
                borderWidth: 0,
                spacing: 3,
                borderRadius: 6,
                hoverOffset: 4
            }]
        },
        options: {
            rotation: -120,
            circumference: 240,
            cutout: "76%", // thin modern ring
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimation(false),
            layout: { padding: { top: 14, bottom: 12, left: 16, right: 16 } },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    ...tooltipTheme(),
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

    if (animateSweep && needleStart !== value) {
        animateNeedle(gaugeInstance, needleStart, value);
    } else {
        gaugeNeedleShown = value;
    }
}

// --- Thermometer (sketch) ---------------------------------------------------
// Prototype replacement for the gauge card; drawGaugeChart above stays intact.
// Pure-canvas render loop: the liquid fills from empty on first load, ripples
// while settling on a new value, and its color tracks the displayed grade.
let thermoInstance = null;   // { raf }
let thermoShownValue = null; // level currently on screen, survives redraws

const THERMO_STOPS = [
    [1.0, [226, 56, 69]],    // deep red
    [2.6, [240, 129, 62]],   // orange
    [3.4, [246, 196, 120]],  // warm sand
    [3.8, [63, 160, 220]],   // FGV celeste (neutral band)
    [4.4, [63, 160, 220]],
    [5.4, [69, 196, 107]],   // green
    [7.0, [0, 184, 116]],    // emerald
];
function thermoRGB(v) {
    const x = Math.max(1, Math.min(7, v));
    for (let i = 0; i < THERMO_STOPS.length - 1; i++) {
        const [a, ca] = THERMO_STOPS[i];
        const [b, cb] = THERMO_STOPS[i + 1];
        if (x <= b) {
            const t = Math.max(0, (x - a) / (b - a));
            return ca.map((c, j) => Math.round(c + (cb[j] - c) * t));
        }
    }
    return THERMO_STOPS.at(-1)[1];
}
// shade < 1 darkens the same hue (used for the liquid depth gradient).
function thermoColor(v, alpha = 1, shade = 1) {
    const rgb = thermoRGB(v).map(c => Math.round(c * shade));
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function drawThermometerChart(canvasElement, value, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }
    if (gaugeInstance && gaugeInstance.canvas === canvasElement) {
        gaugeInstance.destroy();
        gaugeInstance = null;
    }
    if (thermoInstance) cancelAnimationFrame(thermoInstance.raf);
    thermoInstance = { raf: 0 };
    const instance = thermoInstance;

    const ctx = canvasElement.getContext("2d");
    const target = Math.max(1, Math.min(7, value));
    // Fill animation is suppressed on cosmetic redraws (theme/language switches),
    // but the idle waves keep rolling unless the user prefers reduced motion.
    const fillAnim = animationsEnabled && !REDUCED_MOTION && !document.hidden;
    const waves = !REDUCED_MOTION;
    // First load rises from empty (level 0); later applies start from the level on screen.
    const fromLevel = fillAnim ? (thermoShownValue ?? 0) : levelOf(target);
    const startTime = performance.now();
    const FILL_MS = 1600;

    function levelOf(v) { return (v - 1) / 6; }  // 0..1 along the tube

    function frame(now) {
        if (instance !== thermoInstance) return;

        const box = canvasElement.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const W = Math.max(120, box.width);
        const H = Math.max(140, box.height);
        if (canvasElement.width !== W * dpr || canvasElement.height !== H * dpr) {
            canvasElement.width = W * dpr;
            canvasElement.height = H * dpr;
            canvasElement.style.width = `${W}px`;
            canvasElement.style.height = `${H}px`;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const ui = chartUI();
        const dark = isDarkTheme();

        // Geometry: tube on the left third (the value overlays own the right side).
        const bulbR = Math.min(26, H * 0.10);
        const tubeW = bulbR * 1.05;
        const cx = Math.max(bulbR + 8, W * 0.26);
        const bulbCy = H - bulbR - 8;
        const tubeTop = 12;
        const w = tubeW / 2;

        // Concave fillets join the tube walls to the bulb: an outward-facing arc of
        // a larger circle, tangent to both the wall and the bulb (real glass shape).
        const f = w * 0.9;
        const dy = Math.sqrt((bulbR + f) ** 2 - (w + f) ** 2);
        const filletY = bulbCy - dy;             // fillet centers' height
        const aB = Math.atan2(dy, w + f);        // tangency angle on the bulb

        const tubeBottom = filletY;
        const yOf = level => tubeBottom - level * (tubeBottom - tubeTop - tubeW / 2);

        // Fill progress with easing; ripple strength decays as it settles.
        const p = fillAnim ? Math.min(1, (now - startTime) / FILL_MS) : 1;
        const eased = 1 - Math.pow(1 - p, 3);
        const level = fromLevel + (levelOf(target) - fromLevel) * eased;
        thermoShownValue = level;
        const shownValue = 1 + level * 6;
        const settle = fillAnim ? 1 - eased : 0;

        const liquid = thermoColor(target);
        const liquidDeep = thermoColor(target, 0.97, 0.72);

        // One continuous glass silhouette: left wall, top cap, right wall, right
        // fillet, bulb bottom, left fillet. No stroke ever crosses the bulb.
        const glass = new Path2D();
        glass.moveTo(cx - w, filletY);
        glass.lineTo(cx - w, tubeTop + w);
        glass.arc(cx, tubeTop + w, w, Math.PI, 0);
        glass.lineTo(cx + w, filletY);
        glass.arc(cx + w + f, filletY, f, Math.PI, Math.PI - aB, true);
        glass.arc(cx, bulbCy, bulbR, -aB, Math.PI + aB, false);
        glass.arc(cx - w - f, filletY, f, aB, 0, true);
        glass.closePath();

        // Track (empty glass)
        ctx.fillStyle = dark ? "rgba(115, 191, 232, 0.08)" : "rgba(0, 45, 77, 0.06)";
        ctx.fill(glass);

        // Liquid fills the bulb and rises up the tube, wavy surface on top
        ctx.save();
        ctx.clip(glass);
        const surfY = yOf(level);
        const t = now / 1000;
        const amp = waves ? (1.6 + settle * 5) : 0;
        ctx.beginPath();
        ctx.moveTo(cx - bulbR - 2, bulbCy + bulbR + 2);
        ctx.lineTo(cx - bulbR - 2, surfY);
        for (let x = -bulbR - 2; x <= bulbR + 2; x += 2) {
            const wave = Math.sin(x * 0.35 + t * 3.1) * amp + Math.sin(x * 0.18 - t * 2.2) * amp * 0.5;
            ctx.lineTo(cx + x, surfY + wave);
        }
        ctx.lineTo(cx + bulbR + 2, bulbCy + bulbR + 2);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, tubeTop, 0, bulbCy);
        grad.addColorStop(0, liquid);
        grad.addColorStop(1, liquidDeep);
        ctx.fillStyle = grad;
        ctx.fill();

        // Depth + glow inside the bulb reservoir
        ctx.shadowColor = thermoColor(target, dark ? 0.6 : 0.4);
        ctx.shadowBlur = 16;
        ctx.fillStyle = liquidDeep;
        ctx.beginPath();
        ctx.arc(cx, bulbCy, bulbR * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Bulb highlight
        ctx.beginPath();
        ctx.ellipse(cx - bulbR * 0.35, bulbCy - bulbR * 0.3, bulbR * 0.22, bulbR * 0.14, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.fill();

        // Glass border, drawn once over the whole silhouette
        ctx.strokeStyle = dark ? "rgba(185, 201, 217, 0.35)" : "rgba(0, 45, 77, 0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke(glass);

        // Reflection along the tube-bulb contact: highlight arcs on both fillets
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx + w + f, filletY, f + 1.5, Math.PI, Math.PI - aB, true);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - w - f, filletY, f + 1.5, aB, 0, true);
        ctx.stroke();

        // Soft shine along the left wall
        ctx.save();
        ctx.clip(glass);
        const shine = ctx.createLinearGradient(cx - w, 0, cx, 0);
        shine.addColorStop(0, "rgba(255, 255, 255, 0.28)");
        shine.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = shine;
        ctx.fillRect(cx - w, tubeTop, w, tubeBottom - tubeTop);
        ctx.restore();

        // Scale: ticks + numbers 1..7 on the right, current level emphasized
        ctx.font = "700 11px 'Gotham', 'Arial', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        for (let v = 1; v <= 7; v++) {
            const y = yOf(levelOf(v));
            const active = Math.round(shownValue) === v;
            ctx.strokeStyle = active ? thermoColor(target) : ui.axisBorder;
            ctx.lineWidth = active ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(cx + tubeW / 2 + 4, y);
            ctx.lineTo(cx + tubeW / 2 + (active ? 14 : 10), y);
            ctx.stroke();
            ctx.fillStyle = active ? thermoColor(target) : ui.tick;
            ctx.fillText(String(v), cx + tubeW / 2 + 18, y);
        }

        // Waves keep rolling while the tab is visible; a static frame is enough otherwise.
        if (waves) instance.raf = requestAnimationFrame(frame);
        else thermoShownValue = levelOf(target);
    }

    instance.raf = requestAnimationFrame(frame);
}

export function drawGradesHistogramChart(canvasElement, labels, data, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }

    // texts is expected to be: { labelFrequency: "", tooltipTitle: "", tooltipSuffix: "" }
    
    const ctx = canvasElement.getContext("2d");
    applyChartDefaults();

    const scale = gradeScale();
    const ui = chartUI();

    const config = {
        type: "bar",
        data: {
            labels: labels, // [1, 2, 3, 4, 5, 6, 7]
            datasets: [{
                label: texts.labelFrequency || "Frequência",
                data: data,
                backgroundColor: scale.colors,
                hoverBackgroundColor: scale.hover,
                borderRadius: 5,
                borderSkipped: "start", // rounded data-end, square baseline
                barPercentage: 0.72,
                maxBarThickness: 46
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimation(true),
            layout : {
                padding: { top: 20, bottom: 0, left: 0, right: 0 }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { display: true, color: ui.axisBorder, drawTicks: false },
                    border: { display: false },
                    ticks: {
                        maxTicksLimit: 4,
                        padding: 6,
                        font: { size: 11, family: "'Gotham', 'Arial', sans-serif" },
                        callback: v => compactNumber(v),
                    }
                },
                x: {
                    grid: { display: false },
                    border: { display: true, color: ui.axisBorder },
                    ticks: { font: { size: 12, weight: "700", family: "'Gotham', 'Arial', sans-serif" } }
                }
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    ...tooltipTheme(),
                    callbacks: {
                        // ctx := tooltip context
                        title: (ctx) => {
                            const grade = ctx[0].label;
                            const desc = texts.gradeDescriptions ? texts.gradeDescriptions[grade] : "";
                            const prefix = texts.tooltipTitle || "Nota";
                            return desc ? `${prefix} ${grade}: ${desc}` : `${prefix} ${grade}`; // ex: "Nota 5: Image slightly positive"
                        },
                        label: (ctx) => {
                            const count = ctx.raw;  // number of news
                            const unit = count === 1 ? (texts.tooltipUnitSingular || "notícia") : (texts.tooltipUnitPlural || "notícias");
                            return `${count} ${unit}`;
                        }
                    }
                }
            }
        },
        plugins: [barValueLabels]
    };

    // Updating in place lets Chart.js tween the bars from the old values to the
    // new ones; a rebuild would restart the entry animation from zero.
    if (histogramInstance && histogramInstance.canvas === canvasElement) {
        histogramInstance.data = config.data;
        histogramInstance.options = config.options;
        histogramInstance.update(animationsEnabled && !REDUCED_MOTION ? undefined : "none");
        return;
    }
    if (histogramInstance) histogramInstance.destroy();
    histogramInstance = new Chart(ctx, config);
}


export function drawVolumeChart(canvasElement, labels, data, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }
    
    const ctx = canvasElement.getContext("2d");

    const ui = chartUI();
    applyChartDefaults();
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasElement.height);
    gradient.addColorStop(0, ui.volumeFillTop);
    gradient.addColorStop(1, ui.volumeFillBottom);

    const config = {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                // Draw the blue line and the gradient background area clipped
                {
                    label: texts.labelNews || "Notícias",
                    data: data,
                    borderColor: ui.line,
                    backgroundColor: gradient,
                    borderWidth: 1,
                    pointRadius: 0,
                    hitRadius: 5,
                    pointHoverRadius: 0,
                    fill: true,
                    tension: 0.4,
                    clip: 0
                },
                // Invisible line with hoverable points unclipped
                {
                    label: texts.labelNews || "Notícias",
                    data: data,
                    borderColor: "transparent",
                    backgroundColor: "transparent",
                    borderWidth: 0,
                    pointRadius: 0,
                    hitRadius: 5,
                    pointHoverRadius: 3,
                    pointBackgroundColor: ui.line,
                    fill: false,
                    tension: 0.4,
                    clip: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimation(false),
            interaction: {
                mode: "index",
                intersect: false
            },
            layout : {
                padding: { top: 5, bottom: 0, left: -4, right: 5}
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
                    ...tooltipTheme(),
                    titleAlign: "left",
                    labelAlign: "left",
                    filter: (item) => item.datasetIndex === 0,
                    callbacks: {
                        title: (ctx) => {
                            const item = Array.isArray(ctx) ? ctx[0] : ctx;
                            // Full local time range of the aggregation bucket when
                            // available; the bare day label is the no-data fallback.
                            const range = texts.tooltipRanges && texts.tooltipRanges[item.dataIndex];
                            if (range) return range;
                            return `${texts.tooltipDay || "Dia"} ${item.label}`;
                        },
                        label: (ctx) => {
                            const valor = ctx.raw;
                            const sufixo = valor !== 1 ? (texts.suffixPlural || 'notícias analisadas') : (texts.suffixSingular || 'notícia analisada');
                            return `${valor} ${sufixo}`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: "x" },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        drag: { enabled: true },
                        mode: "x"
                    }
                }
            }
        }
    };

    // Update in place so the area morphs from the old series to the new one.
    if (volumeInstance && volumeInstance.canvas === canvasElement) {
        if (volumeInstance.isZoomedOrPanned && volumeInstance.isZoomedOrPanned()) {
            volumeInstance.resetZoom("none");
        }
        volumeInstance.data = config.data;
        volumeInstance.options = config.options;
        volumeInstance.update(animationsEnabled && !REDUCED_MOTION ? undefined : "none");
        return;
    }
    if (volumeInstance) volumeInstance.destroy();
    volumeInstance = new Chart(ctx, config);
}

const verticalLinePlugin = {
    id: "verticalLine",
    // myPlugin.afterDraw(actual version of the graph)
    afterDraw: (chart) => {
        const ctx = chart.ctx;
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;

        const drawLine = (index, color, width, dash) => {
            const visibleMetas = chart.getSortedVisibleDatasetMetas();
            let x = null;
            // meta 
            for (const meta of visibleMetas) {
                const el = meta.data[index];
                if (el && !el.skip) {
                    x = el.x;
                    break;
                }
            }
            if (x === null) x = chart.scales.x.getPixelForValue(index);
            if (x === undefined || x === null) return;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);
            ctx.lineWidth = width;
            ctx.strokeStyle = color;
            ctx.setLineDash(dash);
            ctx.stroke();
            ctx.restore();
        };

        const crossFixed = isDarkTheme() ? "rgba(115, 191, 232, 0.8)" : "#88868B";
        const crossHover = isDarkTheme() ? "rgba(115, 191, 232, 0.4)" : "rgba(136, 134, 139, 0.5)";

        // fixed vertical line (click)
        if (lineChartFixedIndex !== null) {
            drawLine(lineChartFixedIndex, crossFixed, 2, [10, 5]);
        }
        // hover: crosshair plus a glowing dot on each active point
        if (chart.tooltip?._active?.length) {
            const hoverIndex = chart.tooltip._active[0].index;
            if (hoverIndex !== lineChartFixedIndex) {
                drawLine(hoverIndex, crossHover, 1, [5, 5]);
            }
            for (const active of chart.tooltip._active) {
                const el = active.element;
                if (!el || el.skip) continue;
                const dsColor = chart.data.datasets[active.datasetIndex]?.borderColor;
                const color = typeof dsColor === "string" ? dsColor : "#73BFE8";
                ctx.save();
                ctx.beginPath();
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                ctx.fillStyle = color;
                ctx.arc(el.x, el.y, 3.5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
            }
        }
    }
};


const POLITICAL_COLORS = {
    "Democratas": "#2563eb",
    "Republicanos": "#dc2626",
    "Independentes": "#d97706"
};

// Fixed colour per category (keyed by the stable slug, not the translated
// label or array position). This way a series keeps its colour when other
// categories are added/removed, so comparisons stay readable across changes.
const CATEGORY_COLORS = {
    include_all:                        "#003A79",
    politica:                           "#1f77b4",
    economia_negocios_financas:         "#2ca02c",
    conflito_guerra_paz:                "#d62728",
    saude:                              "#e7298a",
    educacao:                           "#17becf",
    ciencia_tecnologia:                 "#9467bd",
    esporte:                            "#bcbd22",
    crime_lei_justica:                  "#8c564b",
    meio_ambiente:                      "#31a354",
    desastres_acidentes_emergencias:    "#ff7f0e",
    interesse_humano:                   "#ffbb78",
    sociedade:                          "#756bb1",
    trabalho:                           "#00a0b0",
    meteorologia:                       "#7fc7ff",
    religiao_crencas:                   "#bd9e39",
    estilo_vida_lazer:                  "#fb9a99",
    artes_cultura_entretenimento_midia: "#c71585",
    nao_informado:                      "#7f7f7f"
};

// Fallback palette for non-category series (entities, mixed triples, anything
// without a fixed colour). Picked by a hash of the series key so it is stable.
const FALLBACK_COLORS = [
    "#1e40af", "#16a34a", "#9333ea", "#0891b2", "#db2777", "#d97706", "#dc2626"
];
const stableColor = key => {
    let h = 0;
    const s = String(key || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
};

// Blend a #rrggbb colour toward white: the fixed palette was picked for light
// backgrounds and reads too dark on the navy theme.
function lightenHex(hex, k) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    const c = i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + 255 * k)
        .toString(16).padStart(2, "0");
    return `#${c(1)}${c(3)}${c(5)}`;
}

// Dark-theme layer palette, by chip position: five clearly distinct hues
// (sky, green, amber, coral, lilac — the approved demo palette). The
// category-keyed palette drowns on navy: too many near-blues.
const DARK_SLOT_COLORS = ["#73BFE8", "#00E1AC", "#F5B041", "#F87171", "#C4A3F9"];

// Colour of a line series, shared with the layer chips in the filter bar so a
// chip and its line always match. In dark mode, a layer slot (chip position)
// picks from the distinct palette; without one, the light palette lightened.
export function seriesColor(key, label, slot) {
    if (isDarkTheme() && Number.isInteger(slot)) {
        return DARK_SLOT_COLORS[slot % DARK_SLOT_COLORS.length];
    }
    const base = (key === "include_all" ? chartUI().line : null)
        || CATEGORY_COLORS[key]
        || POLITICAL_COLORS[label]
        || stableColor(key || label);
    return isDarkTheme() ? lightenHex(base, 0.28) : base;
}

// Dims every line but one (hover on a chip/legend); null falls back to the
// PINNED key (chip label click), and to no highlight when nothing is pinned.
let linePinnedKey = null;

export function setLinePinnedKey(key) {
    linePinnedKey = key;
    setLineSeriesHighlight(null);
}

export function setLineSeriesHighlight(key) {
    if (!lineInstance) return;
    const target = key ?? linePinnedKey;
    lineInstance.data.datasets.forEach((ds, i) => {
        const base = seriesColor(ds.colorKey || ds.key, ds.label, ds.colorSlot ?? i);
        const dimmed = target !== null && ds.key !== target;
        ds.borderColor = dimmed ? base + "33" : base;
        ds.borderWidth = target !== null && ds.key === target ? 3
            : ds.principal && target === null ? 2.5 : 1.25;
    });
    lineInstance.update("none");
}

// Moves the principal (★) mark to another series without redrawing data:
// thicker line + starred legend label.
export function setLinePrincipal(key) {
    if (!lineInstance) return;
    lineInstance.data.datasets.forEach(ds => {
        ds.principal = ds.key === key;
        ds.borderWidth = ds.principal ? 3 : 2;
    });
    lineInstance.update("none");
}

const escapeTooltipHtml = s => String(s).replace(/[&<>"']/g,
    m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

// Rich HTML tooltip in the demo's style — date header, one row per series
// with its colour dot, label on the left and the value right-aligned (bold
// grade, muted news count). The canvas tooltip cannot mix alignments/fonts.
function lineExternalTooltip(context, texts) {
    const { chart, tooltip } = context;
    const parent = chart.canvas.parentNode;
    let el = parent.querySelector(".line-tooltip");
    if (!el) {
        el = document.createElement("div");
        el.className = "line-tooltip";
        parent.appendChild(el);
    }
    if (tooltip.opacity === 0) {
        el.classList.remove("show");
        return;
    }

    const locale = texts.locale || "pt-BR";
    const title = (tooltip.title && tooltip.title[0]) || "";
    const rows = (tooltip.dataPoints || []).map(dp => {
        const ds = dp.dataset;
        const raw = dp.raw || {};
        const dot = seriesColor(ds.colorKey || ds.key, ds.label, ds.colorSlot);
        let value;
        if (raw.y == null) {
            value = `<span class="lt-off">—</span>`;
        } else {
            const grade = Number(raw.y).toLocaleString(locale, {
                minimumFractionDigits: 2, maximumFractionDigits: 2,
            });
            const count = Number(raw.count || 0);
            const unit = count === 1
                ? (texts.newsUnitSingular || "notícia")
                : (texts.newsUnitPlural || "notícias");
            value = `<span class="lt-grade">${grade}</span>` +
                `<span class="lt-cnt"> · ${count.toLocaleString(locale)} ${unit}</span>`;
        }
        const star = ds.principal ? ` <span class="lt-star">★</span>` : "";
        return `<div class="lt-row"><span class="lt-dot" style="background:${dot}"></span>` +
            `<span class="lt-label">${escapeTooltipHtml(ds.label || "")}${star}</span>` +
            `<span class="lt-val">${value}</span></div>`;
    }).join("");
    el.innerHTML = `<div class="lt-date">${escapeTooltipHtml(title)}</div>${rows}`;
    el.classList.add("show");

    // Beside the caret, flipped and clamped so it never leaves the card.
    const tw = el.offsetWidth, th = el.offsetHeight;
    let left = tooltip.caretX + 14;
    if (left + tw > parent.clientWidth - 6) left = tooltip.caretX - tw - 14;
    const top = Math.min(Math.max(6, tooltip.caretY - th / 2), parent.clientHeight - th - 6);
    el.style.left = `${Math.max(6, left)}px`;
    el.style.top = `${top}px`;
}

export function drawLineChart(canvasElement, labels, datasets, onPointClicked, texts = {}) {
    if (canvasElement.parentElement) {
        canvasElement.parentElement.classList.remove("skeleton");
    }

    // datasets: array of { label: string, data: [{ x: dateStr, y: grade, count: number }, ...] }
    // texts: { yAxisTitle: "", tooltipGrade: "", tooltipNews: "", originalDates: [] }
    const ctx = canvasElement.getContext("2d");

    lineChartFixedIndex = null;

    // Feed the tick engine the raw bucket timestamps so it can label day 1/15,
    // recompute on zoom/pan, and decide when to show the time.
    lineChartMeta = {
        dates: Array.isArray(texts.axisDates) ? texts.axisDates : [],
        aggHours: texts.aggHours,
        locale: texts.locale || "pt-BR"
    };
    lineTickState = { key: "", map: new Map() };
    
    const smallScreen = isSmallScreen();

    const dataArray = Array.isArray(datasets) ? datasets : [datasets];

    const ui = chartUI();
    applyChartDefaults();

    const styledDatasets = dataArray.map((ds, index) => {
        // ds.key is the stable identity; ds.colorKey overrides the colour for
        // merged groups (they keep their drop-target's colour); ds.label is
        // translated; ds.principal marks the ★ layer feeding the widgets.
        const color = seriesColor(ds.colorKey || ds.key, ds.label, ds.colorSlot ?? index);

        return {
            label: ds.label,
            key: ds.key,
            colorKey: ds.colorKey,
            colorSlot: ds.colorSlot ?? index,
            principal: !!ds.principal,
            data: ds.data,
            borderColor: color,
            backgroundColor: color.replace("1)", "0.1)"),
            borderWidth: ds.principal && dataArray.length > 1 ? 3 : 2,
            pointRadius: 0,
            pointHoverRadius: 3,    // aumenta o ponto ao passar o mouse
            tension: 0.3,           // suaviza linha
            fill: false,
            spanGaps: true,
            clip: 5
        };
    });
    // Single-series view gets a soft gradient under the line; with multiple
    // series the fills would stack and hurt readability.
    if (styledDatasets.length === 1) {
        const grad = ctx.createLinearGradient(0, 0, 0, canvasElement.height || 400);
        grad.addColorStop(0, isDarkTheme() ? "rgba(115, 191, 232, 0.22)" : "rgba(0, 58, 121, 0.12)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        styledDatasets[0].fill = true;
        styledDatasets[0].backgroundColor = grad;
    }

    const config = {
        type: "line",
        data: {
            labels: labels,
            datasets: styledDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: chartAnimation(false),
            interaction: {
                mode: "index",
                intersect: false,
            },
            layout: {
                padding: smallScreen ? { top: 15, bottom: 15, left: 5, right: 5 } : { top: 15, bottom: 15, left: 10, right: 10 }
            },
            scales: {
                y: { 
                    min: 1, 
                    max: 7,
                    title: { display: true, text: texts.yAxisTitle || "FGV IIBEx" }
                },
                x: {
                    grid: { display: false } ,
                    ticks: {
                        maxRotation: 0,
                        autoSkip: false,
                        align: "inner",
                        // Labels come from the zoom-aware tick engine (day 1/15 + first/last).
                        // `value` is the data index; when zoomed it differs from the
                        // tick's position in the visible array, so key the map by it.
                        callback: function (value) {
                            ensureLineTicks(this);
                            return lineTickState.map.get(value) || "";
                        },
                        // Fade the first/last anchors out as they crowd their marker neighbour.
                        color: function (ctx) {
                            const scale = ctx.scale || (ctx.chart && ctx.chart.scales && ctx.chart.scales.x);
                            if (!scale || !ctx.tick) return chartUI().tick;
                            ensureLineTicks(scale);
                            return lineTickColor(scale, ctx.tick.value);
                        }
                    }
                }
            },
            onClick: (e) => {
                const points = lineInstance.getElementsAtEventForMode(e, "index", { intersect: false }, true);
                if (points.length && onPointClicked) {
                    lineChartFixedIndex = points[0].index;
                    lineInstance.update();

                    const firstPoint = points[0];
                    const index = firstPoint.index;

                    // Which LINE was clicked (nearest dataset): the newsstand
                    // loads that layer's news, not the global selection's.
                    const nearest = lineInstance.getElementsAtEventForMode(e, "nearest", { intersect: false }, true)[0];
                    const datasetKey = nearest
                        ? lineInstance.data.datasets[nearest.datasetIndex]?.key
                        : null;

                    // dimensions and position of the canvas on the user's screen
                    const rect = lineInstance.canvas.getBoundingClientRect();
                    // X position of the vertical line clicked day
                    const pointX = lineInstance.scales.x.getPixelForValue(index);
                    // Y position of the upper limit of the drawable area
                    const chartAreaTop = lineInstance.chartArea.top;
                    const popupCoords = {
                        x: rect.left + pointX,
                        y: rect.top + chartAreaTop
                    };

                    onPointClicked(index, e, popupCoords, datasetKey);
                }
            },
            plugins: {
                legend: {
                    // A lone default series ("Todas") explains nothing — hide it.
                    display: !(dataArray.length === 1 && dataArray[0].key === "include_all"),
                    position: "top",
                    onClick: (e) => { e.stopPropagation(); },
                    // Hovering a legend entry spotlights its line, same gesture
                    // as hovering the layer chip in the filter bar.
                    onHover: (e, item, legend) => {
                        const ds = legend.chart.data.datasets[item.datasetIndex];
                        if (ds) setLineSeriesHighlight(ds.key);
                    },
                    onLeave: () => setLineSeriesHighlight(null),
                    labels: {
                        usePointStyle: true,
                        pointStyle: "rectRounded",   // filled, rounded colour chip
                        boxWidth: smallScreen ? 13 : 15,
                        boxHeight: smallScreen ? 13 : 15,
                        padding: smallScreen ? 10 : 16,
                        color: ui.legend,
                        font: { size: smallScreen ? 10 : 12, weight: "600" },
                        // The single-series area fill is a gradient; chips use the line color.
                        generateLabels: (chart) => {
                            const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                            items.forEach(item => {
                                const ds = chart.data.datasets[item.datasetIndex];
                                if (ds && typeof ds.borderColor === "string") item.fillStyle = ds.borderColor;
                                // ★ marks the principal layer (feeds the widgets).
                                if (ds && ds.principal && chart.data.datasets.length > 1) {
                                    item.text = `★ ${item.text}`;
                                }
                            });
                            return items;
                        }
                    }
                },
                tooltip: {
                    // Rendered as HTML (see lineExternalTooltip): the demo's
                    // layout with mixed alignment and typography.
                    enabled: false,
                    external: (context) => lineExternalTooltip(context, texts),
                    callbacks: {
                        title: (tooltipItems) => {
                            const index = tooltipItems[0].dataIndex;
                            return texts.originalDates ? texts.originalDates[index] : tooltipItems[0].label;
                        },
                    }
                },
                zoom: { 
                    pan: { enabled: true, mode: "x" }, 
                    zoom: { 
                        wheel: { enabled: true }, 
                        drag: { enabled: false }, 
                        mode: "x" 
                    } 
                },
                verticalLine: true
            }
        },
        plugins: [verticalLinePlugin]
    };

    // Update in place so the line morphs from the old series to the new one
    // (a stale zoom window is cleared first — the new data has its own range).
    if (lineInstance && lineInstance.canvas === canvasElement) {
        if (lineInstance.isZoomedOrPanned && lineInstance.isZoomedOrPanned()) {
            lineInstance.resetZoom("none");
        }
        lineInstance.data.labels = labels;
        lineInstance.data.datasets = styledDatasets;
        lineInstance.options = config.options;
        lineInstance.update(animationsEnabled && !REDUCED_MOTION ? undefined : "none");
        if (linePinnedKey) setLineSeriesHighlight(null);   // re-assert the pin
        return;
    }
    if (lineInstance) lineInstance.destroy();
    lineInstance = new Chart(ctx, config);
    if (linePinnedKey) setLineSeriesHighlight(null);
}

export function resetLineChartZoom() {
    if (lineInstance) lineInstance.resetZoom();
}

export function clearLineChartSelection() {
    if (lineChartFixedIndex === null) return;   // nothing selected -> skip the redraw
    lineChartFixedIndex = null;
    if (lineInstance) lineInstance.update();
}

