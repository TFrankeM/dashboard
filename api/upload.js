import { handleUpload } from "@vercel/blob/client";
import { authorized } from "./_lib/auth.js";
import { STAGING_PREFIX, MAX_UPLOAD_BYTES } from "./_lib/files-store.js";

// POST /api/upload — token endpoint for direct browser → Vercel Blob uploads
// (the @vercel/blob client calls it before uploading). No completion
// callback is used: the blob is only a staging copy, and the admin itself
// then calls POST /api/repository { doc, blobUrl }, which moves the bytes to
// GitHub and deletes the blob. Staged blobs expire on their own after a day
// in case that second step never happens.

export default async function handler(request, response) {
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return response.status(405).json({ error: "Method not allowed." });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return response.status(503).json({ error: "Envio direto desativado (sem BLOB_READ_WRITE_TOKEN)." });
    }
    const body = request.body ?? {};
    if (!authorized(request)) {
        return response.status(401).json({ error: "Invalid or missing admin token." });
    }

    try {
        const result = await handleUpload({
            request,
            body,
            onBeforeGenerateToken: async (pathname) => {
                if (!pathname.startsWith(`${STAGING_PREFIX}/`)) {
                    throw new Error("Caminho de envio inválido.");
                }
                return {
                    maximumSizeInBytes: MAX_UPLOAD_BYTES,
                    addRandomSuffix: true,
                    ttlDays: 1,
                };
            },
        });
        return response.status(200).json(result);
    } catch (error) {
        console.error("upload token error:", error);
        return response.status(400).json({ error: error.message || "Falha ao autorizar o envio." });
    }
}
