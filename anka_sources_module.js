import { getAnkaAppSession } from "./anka_auth_module.js";

const ROUTES = Object.freeze({
    "/api/app/dizi-sources": { type: "dizi_sources", field: "sources" },
    "/api/app/film-sources": { type: "film_sources", field: "sources" },
    "/api/app/tv-series": { type: "media", field: "sources" }
});

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

export async function handleAnkaSources(request, env) {
    if (request.method !== "GET") {
        return json({ success: false, error: "GET gerekli." }, 405);
    }

    const route = ROUTES[new URL(request.url).pathname];
    if (!route) {
        return json({ success: false, error: "API bulunamadı." }, 404);
    }
    if (!env.DB) {
        return json({ success: false, error: "D1 bağlantısı bulunamadı." }, 503);
    }

    try {
        const session = await getAnkaAppSession(request, env);
        if (!session) {
            return json({ success: false, error: "Oturum geçersiz veya süresi dolmuş." }, 401);
        }

        const result = await env.DB.prepare(`
            SELECT id, payload
            FROM anka_records
            WHERE type = ? AND active = 1
            ORDER BY updated_at DESC, id DESC
        `).bind(route.type).all();

        const sources = [];
        for (const row of result.results || []) {
            let source;
            try {
                source = JSON.parse(row.payload);
            } catch (_) {
                console.warn("Invalid source JSON", route.type, row.id);
                continue;
            }
            if (!source || typeof source !== "object" || Array.isArray(source)) continue;
            if (source.active === false || source.active === 0 || source.active === "0") continue;
            const { token, password, secret, api_key, apiKey, ...publicSource } = source;
            publicSource.id = String(publicSource.id || row.id);
            publicSource.active = true;
            sources.push(publicSource);
        }

        return json({ success: true, sources, total: sources.length });
    } catch (error) {
        console.error("ANKA_SOURCES_ERROR", error?.message || String(error));
        return json({ success: false, error: "Kaynaklar yüklenemedi." }, 500);
    }
}
