// Admin panel for the module feature flags: lists every registered module and
// toggles it through PATCH /api/flags. The admin token lives only in memory —
// closing the tab forgets it.

const ENDPOINT = "/api/flags";

const listEl = document.getElementById("module-list");
const metaEl = document.getElementById("flags-meta");
const feedbackEl = document.getElementById("admin-feedback");
const tokenEl = document.getElementById("admin-token");

const SOURCE_LABELS = {
    "edge-config": "Edge Config (produção)",
    "dev-file": "arquivo local (desenvolvimento)",
    "defaults": "padrões do código (somente leitura)",
};

let state = null;
let busy = false;

function feedback(message, isError = false) {
    feedbackEl.textContent = message;
    feedbackEl.classList.toggle("is-error", isError);
    if (message) setTimeout(() => { feedbackEl.textContent = ""; }, 6000);
}

function render() {
    const { source, writable, modules, degraded } = state;
    metaEl.textContent = `Fonte das flags: ${SOURCE_LABELS[source] || source}` +
        (degraded ? " — indisponível, exibindo padrões" : "") +
        (writable ? "" : " — alterações desabilitadas");

    listEl.replaceChildren(...modules.map(mod => {
        const li = document.createElement("li");
        li.className = "module-item";

        const info = document.createElement("div");
        info.className = "module-info";
        const name = document.createElement("strong");
        name.textContent = mod.label;
        const status = document.createElement("span");
        status.className = `module-status is-${mod.status}`;
        status.textContent = mod.status === "production" ? "produção" : "em desenvolvimento";
        info.append(name, status);

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "module-toggle";
        toggle.setAttribute("role", "switch");
        toggle.setAttribute("aria-checked", String(mod.enabled));
        toggle.setAttribute("aria-label", `${mod.enabled ? "Desativar" : "Ativar"} ${mod.label}`);
        toggle.disabled = !writable || busy;
        toggle.addEventListener("click", () => setFlag(mod.id, !mod.enabled));

        li.append(info, toggle);
        return li;
    }));
}

async function refresh() {
    const res = await fetch(ENDPOINT, { cache: "no-store" });
    if (!res.ok) throw new Error(`GET ${ENDPOINT} → ${res.status}`);
    state = await res.json();
    render();
}

async function setFlag(id, enabled) {
    const token = tokenEl.value.trim();
    if (!token) {
        feedback("Informe o token de administração antes de alterar uma flag.", true);
        tokenEl.focus();
        return;
    }
    busy = true;
    render();
    try {
        const res = await fetch(ENDPOINT, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ id, enabled }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `PATCH → ${res.status}`);
        state = body;
        feedback(`"${state.modules.find(m => m.id === id)?.label}" ${enabled ? "ativado" : "desativado"}.`);
    } catch (error) {
        feedback(error.message, true);
    } finally {
        busy = false;
        render();
    }
}

refresh().catch(error => {
    metaEl.textContent = "Não foi possível carregar as flags.";
    feedback(error.message, true);
});
