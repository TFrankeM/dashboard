import { access, unlink, writeFile } from "node:fs/promises";

// Where the bytes of repository/ documents are written from the admin panel:
//   - GitHub (production): the Contents API commits straight to the branch
//     the site deploys from, so a write is live after the next deploy
//     (~20 s). Needs GITHUB_TOKEN, a fine-grained token limited to this
//     repository with "Contents: read and write".
//   - Local folder (development, no GITHUB_TOKEN, not on Vercel): writes
//     into repository/ on disk, so the whole flow runs offline.
//   - Read-only: deployed without GITHUB_TOKEN; uploads are disabled.
// A store exposes { name, writable, write(file, buffer) -> { replaced },
// remove(file) -> { removed } }. File names are validated upstream (plain
// names, no path separators).

export const GITHUB_REPO = process.env.GITHUB_REPO || "TFrankeM/dashboard";
export const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
export const FOLDER = "repository";

// Vercel functions take request bodies up to 4.5 MB; the file travels as
// base64 inside JSON (+33%), so 3 MB of raw file is the safe ceiling.
export const MAX_UPLOAD_BYTES = 3 * 1000 * 1000;

const GITHUB_API = "https://api.github.com";
const COMMITTER = { name: "IIPEx Admin", email: "noreply@iipex.com.br" };

function githubHeaders() {
    return {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "iipex-admin",
    };
}

async function githubError(res, what) {
    const detail = await res.text().catch(() => "");
    return new Error(`GitHub ${what} failed (${res.status}): ${detail.slice(0, 200)}`);
}

// The blob sha is required to update or delete a file. The folder listing
// carries every entry's sha regardless of size (a single-file GET refuses
// files over 1 MB).
async function githubFileSha(file) {
    const res = await fetch(
        `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${FOLDER}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
        { headers: githubHeaders() },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw await githubError(res, "listing");
    const items = await res.json();
    return items.find(item => item.type === "file" && item.name === file)?.sha ?? null;
}

const githubStore = {
    name: "github",
    writable: Boolean(process.env.GITHUB_TOKEN),

    async write(file, buffer) {
        const sha = await githubFileSha(file);
        const res = await fetch(
            `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${FOLDER}/${encodeURIComponent(file)}`,
            {
                method: "PUT",
                headers: githubHeaders(),
                body: JSON.stringify({
                    message: `Repositório: ${sha ? "atualiza" : "adiciona"} ${file} (via admin)`,
                    content: buffer.toString("base64"),
                    branch: GITHUB_BRANCH,
                    committer: COMMITTER,
                    author: COMMITTER,
                    ...(sha ? { sha } : {}),
                }),
            },
        );
        if (!res.ok) throw await githubError(res, "write");
        return { replaced: Boolean(sha) };
    },

    async remove(file) {
        const sha = await githubFileSha(file);
        if (!sha) return { removed: false };
        const res = await fetch(
            `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${FOLDER}/${encodeURIComponent(file)}`,
            {
                method: "DELETE",
                headers: githubHeaders(),
                body: JSON.stringify({
                    message: `Repositório: remove ${file} (via admin)`,
                    sha,
                    branch: GITHUB_BRANCH,
                    committer: COMMITTER,
                    author: COMMITTER,
                }),
            },
        );
        if (!res.ok) throw await githubError(res, "delete");
        return { removed: true };
    },
};

const localPath = file => new URL(`../../${FOLDER}/${encodeURIComponent(file)}`, import.meta.url);

const localFolderStore = {
    name: "local-folder",
    writable: true,

    async write(file, buffer) {
        let replaced = true;
        try { await access(localPath(file)); } catch { replaced = false; }
        await writeFile(localPath(file), buffer);
        return { replaced };
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
