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



export async function handleAnkaPlatformAccess(request, env) {
    if (request.method !== "POST") {
        return new Response(JSON.stringify({
            success: false,
            error: "POST gerekli."
        }), {
            status: 405,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            }
        });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({
            success: false,
            error: "D1 bağlantısı bulunamadı."
        }), {
            status: 503,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            }
        });
    }

    const session = await getAnkaAppSession(request, env);

    if (!session) {
        return new Response(JSON.stringify({
            success: false,
            error: "Oturum geçersiz veya süresi dolmuş."
        }), {
            status: 401,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            }
        });
    }

    let body;

    try {
        body = await request.json();
    } catch (_) {
        return new Response(JSON.stringify({
            success: false,
            error: "Geçersiz JSON."
        }), {
            status: 400,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            }
        });
    }

    const platformId = String(
        body.platform_id || ""
    ).trim();

    if (!platformId) {
        return new Response(JSON.stringify({
            success: false,
            error: "Platform ID gerekli."
        }), {
            status: 400,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            }
        });
    }

    const row = await env.DB.prepare(`
        SELECT payload
        FROM anka_records
        WHERE type = 'platforms'
          AND id = ?
          AND active = 1
        LIMIT 1
    `).bind(platformId).first();

    if (!row) {
        return new Response(JSON.stringify({
            success: false,
            error: "Platform bulunamadı veya pasif."
        }), {
            status: 404,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            }
        });
    }

    const platform = JSON.parse(row.payload);

    if (!platform.active) {
        return new Response(JSON.stringify({
            success: false,
            error: "Platform pasif."
        }), {
            status: 403,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            }
        });
    }

    return new Response(JSON.stringify({
        success: true,
        ok: true,
        token: platform.token || "",
        js_url: platform.js_url || ""
    }), {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}
