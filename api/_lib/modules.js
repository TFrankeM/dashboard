// Single source of truth for the feature-flagged dashboard modules.
// Each id matches a data-module attribute in dashboard.html; the flag store
// (Edge Config in production) only holds overrides, so a module missing from
// the store falls back to defaultEnabled.
//
// To add a new module: register it here with defaultEnabled: false and
// status: "development", tag its card with data-module="<id>" in the HTML,
// and promote it later through the admin panel (/admin.html).

export const MODULES = [
    { id: "grades-histogram", label: "Distribuição de notas", status: "production", defaultEnabled: true },
    { id: "news-volume", label: "Quantidade de notícias", status: "production", defaultEnabled: true },
    { id: "gauge-thermometer", label: "Indicador atual (termômetro)", status: "production", defaultEnabled: true },
    { id: "gauge-speedometer", label: "Indicador atual (acelerador)", status: "retired", defaultEnabled: false },
    { id: "evolution", label: "Evolução temporal", status: "production", defaultEnabled: true },
    { id: "newsstand", label: "Notícias do ponto", status: "production", defaultEnabled: true },
];

export const MODULE_IDS = new Set(MODULES.map(m => m.id));

// Edge Config item keys allow [A-Za-z0-9_-]; keep a stable, prefixed mapping
// so unrelated items can live in the same store.
export function flagKey(id) {
    return `module_${id.replaceAll("-", "_")}`;
}
