import { access, stat, unlink, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";

// Where the bytes of repository documents live, and how the admin panel
// writes them.
//
//   - GitHub (production, GITHUB_TOKEN set): small files are committed into
//     repository/ through the Contents API (live after the next deploy,
//     ~20 s); files above FOLDER_MAX_BYTES become assets of one GitHub
//     Release (public download link, no git history bloat, up to 2 GB).
//   - Local folder (development, no GITHUB_TOKEN, not on Vercel): everything
//     is written into repository/ on disk, so the flow runs offline.
//   - Read-only: deployed without GITHUB_TOKEN; uploads are disabled.
//
// How the bytes reach the function:
//   - "blob" mode (BLOB_READ_WRITE_TOKEN set): the browser uploads straight to
//     Vercel Blob (any size), then hands the blob url to the API, which
//     streams it to GitHub and deletes the staging blob.
//   - "direct" mode: the file travels base64-encoded in the request body,
//     which Vercel caps at 4.5 MB (3 MB of file); no cap on the dev server.
//
// A store exposes { name, writable, write(file, source) -> { url, bytes,
// replaced, destination }, remove(file, url) -> { removed } }. "source" is
// { buffer } or { stream, size }. File names are validated upstream.

export const GITHUB_REPO = process.env.GITHUB_REPO || "TFrankeM/dashboard";
export const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
export const FOLDER = "repository";
export const RELEASE_TAG = process.env.GITHUB_RELEASE_TAG || "repositorio-arquivos";
export const STAGING_PREFIX = "staging";

// Above this a file goes to the Release instead of the git folder (the
// GitHub web UI stops at 25 MB too, so the two routes agree).
export const FOLDER_MAX_BYTES = 25 * 1000 * 1000;
// GitHub's limit per release asset.
export const MAX_UPLOAD_BYTES = 2 * 1000 * 1000 * 1000;
// Vercel functions take request bodies up to 4.5 MB; base64 adds a third.
export const DIRECT_MAX_BYTES = 3 * 1000 * 1000;
// Up to this size a release upload is buffered in memory; beyond, streamed.
const BUFFER_MAX_BYTES = 256 * 1000 * 1000;

const GITHUB_API = "https://api.github.com";
const COMMITTER = { name: "IIPEx Admin", email: "noreply@iipex.com.br" };

export const RELEASE_DOWNLOAD_PREFIX = `https://github.com/${GITHUB_REPO}/releases/download/`;

export function isReleaseUrl(url) {
    return typeof url === "string" && url.startsWith(RELEASE_DOWNLOAD_PREFIX);
}

function githubHeaders(extra = {}) {
    return {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "iipex-admin",
        ...extra,
    };
}

async function githubError(res, what) {
    const detail = await res.text().catch(() => "");
    return new Error(`GitHub ${what} failed (${res.status}): ${detail.slice(0, 200)}`);
}

async function githubJson(path, init = {}, what = "request") {
    const res = await fetch(`${GITHUB_API}${path}`, {
        ...init,
        headers: githubHeaders({ ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) }),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw await githubError(res, what);
    return res.status === 204 ? {} : res.json();
}

async function sourceBuffer(source) {
    if (source.buffer) return source.buffer;
    const chunks = [];
    for await (const chunk of source.stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

/* ---- GitHub: repository/ folder (Contents API) ---- */

// The blob sha is required to update or delete a file. The folder listing
// carries every entry's sha regardless of size (a single-file GET refuses
// files over 1 MB).
async function folderFileSha(file) {
    const items = await githubJson(
        `/repos/${GITHUB_REPO}/contents/${FOLDER}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {}, "listing");
    return items?.find(item => item.type === "file" && item.name === file)?.sha ?? null;
}

async function folderWrite(file, buffer) {
    const sha = await folderFileSha(file);
    await githubJson(`/repos/${GITHUB_REPO}/contents/${FOLDER}/${encodeURIComponent(file)}`, {
        method: "PUT",
        body: JSON.stringify({
            message: `Repositório: ${sha ? "atualiza" : "adiciona"} ${file} (via admin)`,
            content: buffer.toString("base64"),
            branch: GITHUB_BRANCH,
            committer: COMMITTER,
            author: COMMITTER,
            ...(sha ? { sha } : {}),
        }),
    }, "write");
    return { url: null, bytes: buffer.length, replaced: Boolean(sha), destination: "folder" };
}

async function folderRemove(file) {
    const sha = await folderFileSha(file);
    if (!sha) return { removed: false };
    await githubJson(`/repos/${GITHUB_REPO}/contents/${FOLDER}/${encodeURIComponent(file)}`, {
        method: "DELETE",
        body: JSON.stringify({
            message: `Repositório: remove ${file} (via admin)`,
            sha,
            branch: GITHUB_BRANCH,
            committer: COMMITTER,
            author: COMMITTER,
        }),
    }, "delete");
    return { removed: true };
}

/* ---- GitHub: one Release holding the large files ---- */

async function ensureRelease() {
    const existing = await githubJson(`/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(RELEASE_TAG)}`, {}, "release lookup");
    if (existing) return existing;
    return githubJson(`/repos/${GITHUB_REPO}/releases`, {
        method: "POST",
        body: JSON.stringify({
            tag_name: RELEASE_TAG,
            target_commitish: GITHUB_BRANCH,
            name: "Arquivos do repositório IIPEx",
            body: "Arquivos grandes do repositório de replicação, publicados pela área de administração do site. "
                + "A lista completa está em https://iipex.com.br/repository.html.",
            draft: false,
            prerelease: false,
        }),
    }, "release create");
}

async function deleteAsset(asset) {
    await githubJson(`/repos/${GITHUB_REPO}/releases/assets/${asset.id}`, { method: "DELETE" }, "asset delete");
}

async function releaseWrite(file, source, contentType) {
    const release = await ensureRelease();
    const previous = release.assets?.find(asset => asset.name === file);
    if (previous) await deleteAsset(previous);   // GitHub refuses duplicate names

    const size = source.buffer ? source.buffer.length : source.size;
    const uploadUrl = release.upload_url.replace(/\{.*\}$/, "");
    const body = source.buffer ?? (size <= BUFFER_MAX_BYTES ? await sourceBuffer(source) : source.stream);
    const res = await fetch(`${uploadUrl}?name=${encodeURIComponent(file)}`, {
        method: "POST",
        headers: githubHeaders({
            "Content-Type": contentType || "application/octet-stream",
            "Content-Length": String(size),
        }),
        body,
        ...(Buffer.isBuffer(body) ? {} : { duplex: "half" }),
    });
    if (!res.ok) throw await githubError(res, "asset upload");
    const asset = await res.json();
    return { url: asset.browser_download_url, bytes: asset.size, replaced: Boolean(previous), destination: "release" };
}

async function releaseRemove(url) {
    const release = await githubJson(`/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(RELEASE_TAG)}`, {}, "release lookup");
    const asset = release?.assets?.find(entry => entry.browser_download_url === url);
    if (!asset) return { removed: false };
    await deleteAsset(asset);
    return { removed: true };
}

const githubStore = {
    name: "github",
    writable: Boolean(process.env.GITHUB_TOKEN),

    async write(file, source, contentType) {
        const size = source.buffer ? source.buffer.length : source.size;
        if (size <= FOLDER_MAX_BYTES) return folderWrite(file, await sourceBuffer(source));
        return releaseWrite(file, source, contentType);
    },

    remove(file, url) {
        return isReleaseUrl(url) ? releaseRemove(url) : folderRemove(file);
    },
};

/* ---- Local folder (development) ---- */

const localPath = file => new URL(`../../${FOLDER}/${encodeURIComponent(file)}`, import.meta.url);

const localFolderStore = {
    name: "local-folder",
    writable: true,

    async write(file, source) {
        let replaced = true;
        try { await access(localPath(file)); } catch { replaced = false; }
        if (source.buffer) await writeFile(localPath(file), source.buffer);
        else await writeFile(localPath(file), Readable.fromWeb(source.stream));
        const { size } = await stat(localPath(file));
        return { url: null, bytes: size, replaced, destination: "folder" };
    },

    async remove(file) {
        try {
            await unlink(localPath(file));
            return { removed: true };
        } catch (err) {
            if (err.code === "ENOENT") return { removed: false };
            throw err;
        }
    },
};

const readOnlyError = () => { throw new Error("File store not configured (missing GITHUB_TOKEN)"); };

const readOnlyStore = {
    name: "none",
    writable: false,
    write: readOnlyError,
    remove: readOnlyError,
};

export function getFileStore() {
    if (process.env.GITHUB_TOKEN) return githubStore;
    if (!process.env.VERCEL) return localFolderStore;
    return readOnlyStore;
}

// What the admin panel needs to know to pick an upload path.
export function uploadCapabilities(store) {
    const blob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    const onVercel = Boolean(process.env.VERCEL);
    return {
        enabled: store.writable,
        source: store.name,
        mode: blob ? "blob" : "direct",
        maxBytes: blob || !onVercel ? MAX_UPLOAD_BYTES : DIRECT_MAX_BYTES,
        folderMaxBytes: FOLDER_MAX_BYTES,
    };
}
