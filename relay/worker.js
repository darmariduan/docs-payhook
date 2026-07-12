/**
 * PayHook Sandbox Relay — Cloudflare Worker
 * ------------------------------------------------------------
 * Forwards a test webhook from the docs simulator to a
 * developer-supplied URL. Needed because PayHook has no server
 * and browsers block cross-origin POSTs (CORS).
 *
 * Deploy (free):
 *   1. Install Wrangler:  npm i -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy            (uses wrangler.toml)
 *   4. Copy the *.workers.dev URL into window.PAYHOOK_RELAY_URL
 *      in index.html
 *
 * Request  (POST, JSON):
 *   { "url": "...", "headers": { ... }, "body": { ... }, "raw_body": "..." }
 * Response (JSON):
 *   { "ok": bool, "status": int, "body": "string", "error": "string" }
 *
 * Security:
 *   - Only http/https, only POST target.
 *   - Blocks localhost / private / link-local / reserved IPs (SSRF).
 *   - 10s timeout, response body capped at 8 KB.
 *   - Optional ALLOWED_ORIGINS allowlist via env var.
 * ------------------------------------------------------------
 */

const TIMEOUT_MS = 10000;
const MAX_BODY = 8 * 1024;

// Hostnames / IP patterns that must never be reachable (SSRF guard).
const BLOCKED_HOSTS = new Set([
    "localhost",
    "0.0.0.0",
    "metadata.google.internal",
]);

function isPrivateHost(hostname) {
    const h = hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(h)) return true;
    if (h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;

    // IPv6 loopback / link-local / unique-local
    if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;

    // IPv4 literal checks
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
        if (a === 10) return true;                         // 10.0.0.0/8
        if (a === 127) return true;                        // loopback
        if (a === 169 && b === 254) return true;           // link-local / cloud metadata
        if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
        if (a === 192 && b === 168) return true;           // 192.168.0.0/16
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
        if (a === 0) return true;
    }
    return false;
}

function corsHeaders(origin, allowed) {
    const allowOrigin = allowed.length === 0 || allowed.includes(origin) ? (origin || "*") : allowed[0];
    return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    };
}

function isAllowedOrigin(origin, allowed) {
    if (allowed.length === 0) return true;
    if (!origin) return false;
    return allowed.includes(String(origin).toLowerCase());
}

function json(data, status, cors) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: Object.assign({ "Content-Type": "application/json" }, cors),
    });
}

function parseCsv(value) {
    return String(value || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

export default {
    async fetch(request, env) {
        const allowed = parseCsv(env && env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS : "");
        const allowedTargets = parseCsv(env && env.ALLOWED_TARGET_HOSTS ? env.ALLOWED_TARGET_HOSTS : "");
        const origin = (request.headers.get("Origin") || "").toLowerCase();
        const cors = corsHeaders(origin, allowed);

        if (!isAllowedOrigin(origin, allowed)) {
            return json({ ok: false, error: "Origin is not allowed" }, 403, cors);
        }

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: cors });
        }
        if (request.method !== "POST") {
            return json({ ok: false, error: "Method not allowed" }, 405, cors);
        }

        let input;
        try {
            input = await request.json();
        } catch (e) {
            return json({ ok: false, error: "Invalid JSON request" }, 400, cors);
        }

        const target = String(input.url || "").trim();
        if (!target) return json({ ok: false, error: "Missing target url" }, 400, cors);

        let parsed;
        try {
            parsed = new URL(target);
        } catch (e) {
            return json({ ok: false, error: "Invalid target url" }, 400, cors);
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return json({ ok: false, error: "Only http/https targets allowed" }, 400, cors);
        }
        if (isPrivateHost(parsed.hostname)) {
            return json({ ok: false, error: "Target host is not allowed (private/loopback)" }, 400, cors);
        }
        if (allowedTargets.length > 0 && !allowedTargets.includes(parsed.hostname.toLowerCase())) {
            return json({ ok: false, error: "Target host is not in allowlist" }, 400, cors);
        }

        // Sanitize forwarded headers.
        const outHeaders = { "Content-Type": "application/json", "Accept": "application/json" };
        if (input.headers && typeof input.headers === "object") {
            for (const k of Object.keys(input.headers)) {
                const key = k.toLowerCase();
                if (["host", "content-length", "connection", "cookie"].includes(key)) continue;
                outHeaders[k] = String(input.headers[k]);
            }
        }

        const bodyStr = typeof input.raw_body === "string"
            ? input.raw_body
            : JSON.stringify(input.body != null ? input.body : {});
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const res = await fetch(parsed.toString(), {
                method: "POST",
                headers: outHeaders,
                body: bodyStr,
                redirect: "manual",
                signal: controller.signal,
            });
            clearTimeout(timer);

            const text = (await res.text()).slice(0, MAX_BODY);
            return json({
                ok: res.status >= 200 && res.status < 300,
                status: res.status,
                body: text,
            }, 200, cors);
        } catch (e) {
            clearTimeout(timer);
            const msg = e && e.name === "AbortError" ? "Request timed out (10s)" : String(e && e.message || e);
            return json({ ok: false, status: 0, error: msg }, 200, cors);
        }
    },
};
