const APP_NAME = "ANKA TV+";
const VERSION = "1.0.0";

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method !== "GET") {
            return jsonResponse({
                ok: false,
                error: "Method not allowed"
            }, 405);
        }

        if (url.pathname === "/") {
            return jsonResponse({
                ok: true,
                app: APP_NAME,
                service: "Cloudflare Workers",
                status: "online",
                version: VERSION
            });
        }

        if (url.pathname === "/health") {
            return jsonResponse({
                ok: true,
                app: APP_NAME,
                services: {
                    worker: true,
                    d1: Boolean(env.DB),
                    kv: Boolean(env.CONFIG),
                    r2: Boolean(env.STORAGE)
                }
            });
        }

        if (url.pathname === "/api") {
            return jsonResponse({
                ok: false,
                error: "API initialization pending"
            }, 503);
        }

        return jsonResponse({
            ok: false,
            error: "Endpoint not found"
        }, 404);
    }
};
