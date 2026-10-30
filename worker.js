const APP_NAME = "ANKA TV+";
const VERSION = "1.0.0";

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status: status,
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
                success: false,
                error: "Method not allowed"
            }, 405);
        }

        if (url.pathname === "/") {
            return jsonResponse({
                success: true,
                app: APP_NAME,
                version: VERSION,
                status: "online"
            });
        }

        if (url.pathname === "/health") {
            return jsonResponse({
                success: true,
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
                success: false,
                error: "API not configured"
            }, 503);
        }

        return jsonResponse({
            success: false,
            error: "Not found"
        }, 404);
    }
};
