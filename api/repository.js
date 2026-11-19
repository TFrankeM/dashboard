import { stat } from "node:fs/promises";
import { authorized } from "./_lib/auth.js";
import { SEED_CATALOG, MAX_DOCS, normalizeDocInput } from "./_lib/repository.js";
import { getRepositoryStore, resolveCatalog } from "./_lib/repository-store.js";
import { getFileStore, GITHUB_REPO, GITHUB_BRANCH, FOLDER, MAX_UPLOAD_BYTES } from "./_lib/files-store.js";

// GET    /api/repository                      -> catalog (public)
// PUT    /api/repository { doc }              -> add a document, or update the
//                                                one with the same file name
// POST   /api/repository { doc, content }     -> upload the file (base64, up to
//                                                MAX_UPLOAD_BYTES) and catalog it
// DELETE /api/repository { file, deleteFile } -> remove a document; with
//                                                deleteFile, also delete the
//                                                file from repository/
// Write methods require Authorization: Bearer <FLAGS_ADMIN_TOKEN>. The
// catalog only describes the files; their bytes live in repository/
// (committed to GitHub, see files-store.js) or behind an external url.

// Hobby Edge Config stores cap at ~8KB total, shared with the flags and the
// layout library (4KB): refuse catalogs that could not fit.
const MAX_CATALOG_BYTES = 3072;

const FETCH_TIMEOUT_MS = 8000;

async function state(store, fileStore) {
    return {
        source: store.name,
        writable: store.writable,
        docs: await resolveCatalog(store),
        uploads: { enabled: fileStore.writable, source: fileStore.name, maxBytes: MAX_UPLOAD_BYTES },
    };
}

// Size of an external document: a HEAD on the url, following redirects. An
// HTML answer is a landing page, not the file, so its size is meaningless.
async function sizeFromUrl(url) {
    try {
        const res = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            // Without this, content-length may be the gzip size.
            headers: { "Accept-Encoding": "identity" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        if ((res.headers.get("content-type") || "").includes("text/html")) return null;
        const length = Number(res.headers.get("content-length"));
        return Number.isInteger(length) && length >= 0 ? length : null;
    } catch {
        return null;
    }
}

// Size of a file that lives in repository/: the deployed GitHub folder in
// production (public repo, no token needed), the folder on disk otherwise.
async function sizeFromFolder(file) {
    if (!process.env.VERCEL && !process.env.GITHUB_TOKEN) {
        try {
            return (await stat(new URL(`../${FOLDER}/${encodeURIComponent(file)}`, import.meta.url))).size;
        } catch {
            return null;
        }
    }
    try {
        const res = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/contents/${FOLDER}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
            {
                headers: { "Accept": "application/vnd.github+json", "User-Agent": "iipex-admin" },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            },
        );
        if (!res.ok) return null;
        const items = await res.json();
        const item = items.find(entry => entry.type === "file" && entry.name === file);
        return item ? item.size : null;
    } catch {
        return null;
    }
}

async function resolveBytes(doc) {
    if (doc.bytes !== null) return doc.bytes;
    return doc.url ? sizeFromUrl(doc.url) : sizeFromFolder(doc.file);
}

function upsert(docs, doc) {
    const index = docs.findIndex(d => d.file === doc.file);
    if (index >= 0) {
        docs[index] = doc;
        return { existed: true };
    }
    if (docs.length >= MAX_DOCS) {
        throw Object.assign(new Error(`O catálogo aceita no máximo ${MAX_DOCS} documentos.`), { status: 413 });
    }
    docs.push(doc);
    if (JSON.stringify(docs).length > MAX_CATALOG_BYTES) {
        throw Object.assign(new Error("Catálogo cheio; remova um documento antes."), { status: 413 });
    }
    return { existed: false };
}

export default async function handler(request, response) {
    // Catalog changes must show on the next page load: never cache.
    response.setHeader("Cache-Control", "no-store");
    const store = getRepositoryStore();
    const fileStore = getFileStore();

    if (request.method === "GET") {
        const auth = authorized(request);
        try {
            return response.status(200).json({ ...await state(store, fileStore), authorized: auth });
        } catch (error) {
            // A broken store must not take the page down: serve the seeds.
            console.error("repository read error:", error);
            return response.status(200).json({
                source: "defaults",
                writable: false,
                docs: SEED_CATALOG,
                uploads: { enabled: false, source: "none", maxBytes: MAX_UPLOAD_BYTES },
                degraded: true,
                authorized: auth,
            });
        }
    }

    if (!["PUT", "POST", "DELETE"].includes(request.method)) {
        response.setHeader("Allow", "GET, PUT, POST, DELETE");
        return response.status(405).json({ error: "Method not allowed." });
    }
    if (!authorized(request)) {
        return response.status(401).json({ error: "Invalid or missing admin token." });
    }
    if (!store.writable) {
        return response.status(503).json({ error: `Repository store "${store.name}" is read-only.` });
    }

    try {
        const docs = await resolveCatalog(store);

        if (request.method === "PUT") {
            const { doc, problem } = normalizeDocInput(request.body?.doc);
            if (problem) return response.status(400).json({ error: problem });
            // Editing keeps the known size when it cannot be refreshed.
            const prior = docs.find(d => d.file === doc.file);
            doc.bytes = (await resolveBytes(doc)) ?? prior?.bytes ?? null;
            upsert(docs, doc);
            await store.write(docs);
            return response.status(200).json(await state(store, fileStore));
        }

        if (request.method === "POST") {
            if (!fileStore.writable) {
                return response.status(503).json({ error: "Envio de arquivos desativado neste ambiente (sem GITHUB_TOKEN)." });
            }
            const { doc, problem } = normalizeDocInput({ ...request.body?.doc, url: undefined, bytes: undefined });
            if (problem) return response.status(400).json({ error: problem });
            const content = request.body?.content;
            if (typeof content !== "string" || !content) {
                return response.status(400).json({ error: "Conteúdo do arquivo ausente." });
            }
            const buffer = Buffer.from(content, "base64");
            if (!buffer.length) return response.status(400).json({ error: "Arquivo vazio." });
            if (buffer.length > MAX_UPLOAD_BYTES) {
                return response.status(413).json({ error: `Arquivo acima de ${Math.round(MAX_UPLOAD_BYTES / 1e6)} MB; use a interface do GitHub.` });
            }
            const { replaced } = await fileStore.write(doc.file, buffer);
            doc.bytes = buffer.length;
            upsert(docs, doc);
            await store.write(docs);
            return response.status(200).json({ ...await state(store, fileStore), fileAction: replaced ? "replaced" : "created" });
        }

        // DELETE
        const { file, deleteFile } = request.body ?? {};
        if (typeof file !== "string") {
            return response.status(400).json({ error: "Expected { file: <name> }." });
        }
        const index = docs.findIndex(d => d.file === file);
        if (index < 0) return response.status(404).json({ error: `Documento "${file}" não encontrado.` });
        let fileRemoved = false;
        if (deleteFile && !docs[index].url) {
            if (!fileStore.writable) {
                return response.status(503).json({ error: "Exclusão de arquivos desativada neste ambiente (sem GITHUB_TOKEN)." });
            }
            ({ removed: fileRemoved } = await fileStore.remove(file));
        }
        docs.splice(index, 1);
        await store.write(docs);
        return response.status(200).json({ ...await state(store, fileStore), fileRemoved });
    } catch (error) {
        if (error.status) return response.status(error.status).json({ error: error.message });
        console.error("repository write error:", error);
        return response.status(502).json({ error: error.message || "Failed to persist the catalog change." });
    }
}
