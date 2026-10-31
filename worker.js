const APP_NAME = "ANKA TV+";
const VERSION = "1.1.0";

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

async function checkServices(env) {
    const services = {
        worker: true,
        d1: false,
        kv: false,
        r2: false
    };

    const errors = {};

    try {
        if (!env.DB) {
            throw new Error("DB binding bulunamadı");
        }

        await env.DB.prepare("SELECT 1 AS ok").first();
        services.d1 = true;
    } catch (error) {
        errors.d1 = error.message;
    }

    try {
        if (!env.CONFIG) {
            throw new Error("CONFIG binding bulunamadı");
        }

        await env.CONFIG.get("__anka_health_check__");
        services.kv = true;
    } catch (error) {
        errors.kv = error.message;
    }

    try {
        if (!env.STORAGE) {
            throw new Error("STORAGE binding bulunamadı");
        }

        await env.STORAGE.head("__anka_health_check__");
        services.r2 = true;
    } catch (error) {
        errors.r2 = error.message;
    }

    return {
        services,
        errors
    };
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
            const result = await checkServices(env);

            const healthy =
                result.services.d1 &&
                result.services.kv &&
                result.services.r2;

            return jsonResponse({
                success: healthy,
                app: APP_NAME,
                status: healthy ? "healthy" : "degraded",
                services: result.services,
                errors: result.errors
            }, healthy ? 200 : 503);
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
