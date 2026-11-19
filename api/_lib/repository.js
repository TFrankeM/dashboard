// Repository catalog contract: the documents listed on repository.html.
// Each entry is { file, category, icon, bytes, url? }: "file" is the display
// name and the key (unique); "url" is only set for documents hosted outside
// repository/ (Zenodo, GitHub Releases...). Without it the download points at
// repository/<file>, which is whatever is committed in that folder. "bytes"
// is resolved by the API (upload size, GitHub listing or a HEAD on the url)
// and is null when it could not be determined.

export const CATEGORIES = ["data", "benchmarks", "scripts", "prompts", "docs"];

// Lucide icon names the admin picker offers (and the API accepts).
export const ICONS = [
    "database", "table", "file-spreadsheet", "file-text", "file-json", "file-archive",
    "bar-chart-3", "pie-chart", "line-chart", "code", "terminal", "braces",
    "list-checks", "message-square-text", "book-open", "file-check", "quote",
    "shield", "scroll-text", "globe", "link", "image", "package", "notebook-pen",
];

export const MAX_FILE_CHARS = 120;
export const MAX_URL_CHARS = 400;
export const MAX_DOCS = 60;

// The catalog as shipped in the code: used until the store is written once.
export const SEED_CATALOG = [
    { file: "dados_noticias_2025.csv", category: "data", icon: "database", bytes: 84427491 },
    { file: "dados_dicionario.csv", category: "data", icon: "table", bytes: 4325 },
    { file: "dados_LEIA-ME.txt", category: "data", icon: "file-text", bytes: 974 },
    { file: "resultados_esperados_categorias_2025.csv", category: "benchmarks", icon: "bar-chart-3", bytes: 918 },
    { file: "resultados_esperados_concentracao_veiculos.csv", category: "benchmarks", icon: "pie-chart", bytes: 208 },
    { file: "codigo_p2_classificacao_tematica.py", category: "scripts", icon: "code", bytes: 5195 },
    { file: "codigo_p3_analise_sentimento.py", category: "scripts", icon: "code", bytes: 11292 },
    { file: "codigo_prompts_iipex.py", category: "scripts", icon: "code", bytes: 8667 },
    { file: "prompts_requirements.txt", category: "scripts", icon: "list-checks", bytes: 455 },
    { file: "prompts_P2_prompt_classificacao_tematica.txt", category: "prompts", icon: "message-square-text", bytes: 620 },
    { file: "prompts_P3_prompt_analise_sentimento.txt", category: "prompts", icon: "message-square-text", bytes: 3093 },
    { file: "prompts_README.md.txt", category: "prompts", icon: "book-open", bytes: 3524 },
    { file: "Guia_de_Replicacao_IIPEx.docx", category: "docs", icon: "file-check", bytes: 38063 },
    { file: "CITATION.cff", category: "docs", icon: "quote", bytes: 1306 },
    { file: "LICENSE", category: "docs", icon: "shield", bytes: 2022 },
];

// A file name must be a plain name (no path separators, no leading dot).
const FILE_RE = /^[^/\\\s][^/\\]*$/;

// Returns a problem string, or null when the document is acceptable. Also
// trims and coerces the fields in place on the returned normalized copy.
export function normalizeDocInput(input) {
    const doc = input ?? {};
    const file = typeof doc.file === "string" ? doc.file.trim() : "";
    if (!file || file.length > MAX_FILE_CHARS || !FILE_RE.test(file) || file.startsWith(".")) {
        return { problem: "Nome de arquivo inválido." };
    }
    if (!CATEGORIES.includes(doc.category)) {
        return { problem: "Categoria desconhecida." };
    }
    if (!ICONS.includes(doc.icon)) {
        return { problem: "Ícone desconhecido." };
    }
    // Optional: the API fills it in when absent.
    let bytes = null;
    if (doc.bytes !== undefined && doc.bytes !== null && doc.bytes !== "") {
        bytes = Number(doc.bytes);
        if (!Number.isInteger(bytes) || bytes < 0) {
            return { problem: "Tamanho em bytes inválido." };
        }
    }
    const out = { file, category: doc.category, icon: doc.icon, bytes };
    if (doc.url !== undefined && doc.url !== null && doc.url !== "") {
        const url = String(doc.url).trim();
        let parsed;
        try { parsed = new URL(url); } catch { parsed = null; }
        if (!parsed || !["http:", "https:"].includes(parsed.protocol) || url.length > MAX_URL_CHARS) {
            return { problem: "URL externa inválida (use http:// ou https://)." };
        }
        out.url = url;
    }
    return { doc: out };
}
