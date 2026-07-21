import { createHash, timingSafeEqual } from "node:crypto";

// Constant-time check of the Authorization: Bearer header against
// FLAGS_ADMIN_TOKEN. Shared by the flags and layouts admin APIs. Hashing both
// sides gives equal-length buffers, keeping the comparison constant-time
// regardless of what the client sent.
export function authorized(request) {
    const secret = process.env.FLAGS_ADMIN_TOKEN;
    if (!secret) return false;
    const header = request.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const a = createHash("sha256").update(token).digest();
    const b = createHash("sha256").update(secret).digest();
    return timingSafeEqual(a, b);
}
