import { getAnkaAppSession } from "./anka_auth_module.js";

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

const SOURCE_TYPES = {
    "/api/app/dizi-sources": "dizi_sources",
    "/api/app/film-sources": "film_sources",
    "/api/app/tv-series": "media"
};

export async function handleAnkaSources(request, env) {
    if (request.method !== "GET") {
        return json({
            success: false,
            error: "GET gerekli."
        }, 405);
    }

    if (!env.DB) {
        return json({
            success: false,
            error: "D1 bağlantısı bulunamadı."
        }, 503);
    }

    const path = new URL(request.url).pathname;
    const type = SOURCE_TYPES[path];

    if (!type) {
        return json({
            success: false,
            error: "API bulunamadı."
        }, 404);
    }

    try {
        const session = await getAnkaAppSession(request, env);

        if (!session) {
            return json({
                success: false,
                error: "Oturum geçersiz veya süresi dolmuş."
            }, 401);
        }

        const result = await env.DB.prepare(`
            SELECT payload
            FROM anka_records
            WHERE type = ?
              AND active = 1
            ORDER BY updated_at DESC, id DESC
        `).bind(type).all();

        const sources = [];

        for (const row of result.results || []) {
            const source = JSON.parse(row.payload);

            if (source.active !== true) {
                continue;
            }

            sources.push(source);
        }

        return json({
            success: true,
            sources: sources,
            total: sources.length
        });

    } catch (e) {
        console.error(
            "ANKA_SOURCES_ERROR",
            e?.name,
            e?.message
        );

        return json({
            success: false,
            error: "Kaynaklar yüklenemedi."
        }, 500);
    }
}
