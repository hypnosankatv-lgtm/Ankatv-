function respond(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(hash))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function getAppUser(request, env) {
    const authorization =
        request.headers.get("Authorization") || "";

    const match = /^Bearer ([a-f0-9]{64})$/i.exec(
        authorization.trim()
    );

    if (!match) {
        return null;
    }

    const tokenHash = await sha256(match[1].toLowerCase());
    const now = Math.floor(Date.now() / 1000);

    return await env.DB.prepare(`
        SELECT u.id, u.username, u.email, u.status
        FROM app_sessions s
        JOIN app_users u ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND s.expires_at > ?
          AND s.revoked_at IS NULL
          AND u.status = 'approved'
        LIMIT 1
    `).bind(tokenHash, now).first();
}

export async function handleAnkaPlatforms(request, env) {
    if (request.method !== "GET") {
        return respond({
            success: false,
            error: "GET gerekli."
        }, 405);
    }

    if (!env.DB) {
        return respond({
            success: false,
            error: "D1 bağlantısı bulunamadı."
        }, 503);
    }

    const user = await getAppUser(request, env);

    if (!user) {
        return respond({
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
            title: platform.title,
            logo: platform.logo || "",
            list_url: platform.list_url || "",
            js_url: platform.js_url || ""
        });
    }

    return respond({
        success: true,
        platforms: platforms
    });
}
