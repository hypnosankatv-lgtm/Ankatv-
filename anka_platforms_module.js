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

export async function handleAnkaPlatforms(request, env) {
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
        WHERE type = 'platforms'
          AND active = 1
        ORDER BY updated_at DESC, id DESC
    `).all();

    const platforms = [];

    for (const row of result.results || []) {
        const platform = JSON.parse(row.payload);

        if (platform.active !== true) {
            continue;
        }

        platforms.push({
            id: platform.id,
            title: platform.title || "",
            logo: platform.logo || "",
            list_url: platform.list_url || "",
            js_url: platform.js_url || ""
        });
    }

    return json({
        success: true,
        platforms
    });
}
