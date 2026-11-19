import { stat } from "node:fs/promises";
import { authorized } from "./_lib/auth.js";
import { SEED_CATALOG, MAX_DOCS, normalizeDocInput } from "./_lib/repository.js";
import { getRepositoryStore, resolveCatalog } from "./_lib/repository-store.js";
import { head, del } from "@vercel/blob";
import {
    getFileStore, uploadCapabilities, isReleaseUrl, GITHUB_REPO, GITHUB_BRANCH, FOLDER,
    DIRECT_MAX_BYTES, MAX_UPLOAD_BYTES,
} from "./_lib/files-store.js";

// GET    /api/repository                      -> catalog (public)
// PUT    /api/repository { doc }              -> add a document, or update the
//                                                one with the same file name
// POST   /api/repository { doc, blobUrl }     -> move a file staged in Vercel
//                                                Blob (see api/upload.js) to
//                                                GitHub and catalog it
// POST   /api/repository { doc, content }     -> same, with the file base64
//                                                in the body (up to 3 MB)
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
        uploads: uploadCapabilities(fileStore),
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

// A staged upload must be one of ours: head() only answers for blobs in the
// store the token belongs to, and the host check keeps the fetch off any
// other origin.
async function stagedBlob(url) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com")) return null;
    try {
        return await head(url);
    } catch (error) {
        console.warn("staged blob lookup:", error.message);
        return null;
    }
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
                uploads: { enabled: false, source: "none", mode: "direct", maxBytes: 0, folderMaxBytes: 0 },
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
            const { blobUrl, content } = request.body ?? {};
            let written;
            if (typeof blobUrl === "string" && blobUrl) {
                const staged = await stagedBlob(blobUrl);
                if (!staged) return response.status(400).json({ error: "Arquivo enviado não encontrado no Blob." });
                if (staged.size > MAX_UPLOAD_BYTES) {
                    return response.status(413).json({ error: `Arquivo acima de ${Math.round(MAX_UPLOAD_BYTES / 1e9)} GB.` });
                }
                const res = await fetch(blobUrl);
                if (!res.ok || !res.body) throw new Error(`Blob download failed (${res.status})`);
                try {
                    written = await fileStore.write(doc.file, { stream: res.body, size: staged.size }, staged.contentType);
                } finally {
                    del(blobUrl).catch(error => console.warn("staging blob cleanup:", error));
                }
            } else {
                if (typeof content !== "string" || !content) {
                    return response.status(400).json({ error: "Conteúdo do arquivo ausente." });
                }
                const buffer = Buffer.from(content, "base64");
                if (!buffer.length) return response.status(400).json({ error: "Arquivo vazio." });
                const cap = process.env.VERCEL ? DIRECT_MAX_BYTES : MAX_UPLOAD_BYTES;
                if (buffer.length > cap) {
                    return response.status(413).json({ error: `Arquivo acima de ${Math.round(cap / 1e6)} MB para envio direto.` });
                }
                written = await fileStore.write(doc.file, { buffer });
            }
            doc.bytes = written.bytes;
            if (written.url) doc.url = written.url;
            upsert(docs, doc);
            await store.write(docs);
            return response.status(200).json({
                ...await state(store, fileStore),
                fileAction: written.replaced ? "replaced" : "created",
                destination: written.destination,
            });
        }

        // DELETE
        const { file, deleteFile } = request.body ?? {};
        if (typeof file !== "string") {
            return response.status(400).json({ error: "Expected { file: <name> }." });
        }
        const index = docs.findIndex(d => d.file === file);
        if (index < 0) return response.status(404).json({ error: `Documento "${file}" não encontrado.` });
        // Deletable: files in repository/ (no url) and our own release assets;
        // genuinely external links are only ever dropped from the list.
        let fileRemoved = false;
        const { url } = docs[index];
        if (deleteFile && (!url || isReleaseUrl(url))) {
            if (!fileStore.writable) {
                return response.status(503).json({ error: "Exclusão de arquivos desativada neste ambiente (sem GITHUB_TOKEN)." });
            }
            ({ removed: fileRemoved } = await fileStore.remove(file, url));
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
