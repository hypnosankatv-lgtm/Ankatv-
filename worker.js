const APP_NAME = "ANKA TV+";
const VERSION = "1.2.0";
const SESSION_SECONDS = 60 * 60 * 12;

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            ...extraHeaders
        }
    });
}

function htmlResponse(html, status = 200) {
    return new Response(html, {
        status,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
        }
    });
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

function randomToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(hash));
}

async function passwordHash(password, salt) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: new TextEncoder().encode(salt),
            iterations: 310000,
            hash: "SHA-256"
        },
        key,
        256
    );

    return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;

    let difference = 0;

    for (let i = 0; i < a.length; i++) {
        difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return difference === 0;
}

function getCookie(request, name) {
    const cookie = request.headers.get("Cookie") || "";

    for (const item of cookie.split(";")) {
        const part = item.trim();
        const separator = part.indexOf("=");

        if (separator > 0 &&
            part.slice(0, separator) === name) {
            return part.slice(separator + 1);
        }
    }

    return "";
}

async function getAdmin(request, env) {
    const token = getCookie(request, "anka_admin");

    if (!/^[a-f0-9]{64}$/.test(token)) {
        return null;
    }

    const tokenHash = await sha256(token);
    const now = Math.floor(Date.now() / 1000);

    return await env.DB.prepare(`
        SELECT u.id, u.username
        FROM admin_sessions s
        JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND s.expires_at > ?
          AND u.active = 1
        LIMIT 1
    `).bind(tokenHash, now).first();
}

function loginPage(error = "") {
    const safeError = error
        ? `<p class="error">${error}</p>`
        : "";

    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANKA TV+ Yönetim Paneli</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#151419;color:#fff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}
.panel{width:100%;max-width:390px;background:#1d1c21;border:1px solid #45454b;border-radius:18px;padding:30px}
.logo{color:#2db88a;font-size:27px;font-weight:800;text-align:center}
.subtitle{text-align:center;color:#b8b8be;margin:12px 0 28px}
label{display:block;font-size:13px;margin:15px 0 8px}
input{width:100%;padding:14px;border-radius:10px;border:1px solid #45454b;background:#151419;color:#fff;font-size:15px}
button{width:100%;background:#2db88a;color:#101714;border:0;border-radius:10px;padding:14px;margin-top:25px;font-size:15px;font-weight:bold;cursor:pointer}
.error{color:#ff8080;text-align:center}
</style>
</head>
<body>
<div class="panel">
<div class="logo">ANKA TV+</div>
<p class="subtitle">Yönetim Paneli</p>
${safeError}
<form action="/admin/login" method="POST">
<label>Kullanıcı adı</label>
<input name="username" required autocomplete="username">
<label>Şifre</label>
<input name="password" type="password" required autocomplete="current-password">
<button type="submit">Giriş Yap</button>
</form>
</div>
</body>
</html>`;
}

function dashboardPage() {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANKA TV+ Admin</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#151419;color:white;font-family:Arial,sans-serif}
header{background:#1d1c21;padding:22px;border-bottom:1px solid #45454b}
h1{margin:0;color:#2db88a;font-size:23px}
main{padding:24px;max-width:900px;margin:auto}
.card{background:#1d1c21;border:1px solid #45454b;border-radius:14px;padding:24px;margin-bottom:16px}
p{color:#b8b8be;line-height:1.6}
button{background:#2db88a;color:#101714;border:0;padding:12px 22px;border-radius:9px;font-weight:bold}
</style>
</head>
<body>
<header><h1>ANKA TV+ Yönetim Paneli</h1></header>
<main>
<div class="card">
<h2>Hoş Geldiniz</h2>
<p>Yönetici oturumunuz aktif.</p>
<p>Platform, film ve dizi yönetimi sonraki aşamada eklenecek.</p>
<form method="POST" action="/admin/logout">
<button type="submit">Çıkış Yap</button>
</form>
</div>
</main>
</body>
</html>`;
}

async function login(request, env) {
    const type = request.headers.get("Content-Type") || "";

    if (!type.toLowerCase().startsWith(
        "application/x-www-form-urlencoded"
    )) {
        return jsonResponse({
            success: false,
            error: "Unsupported content type"
        }, 415);
    }

    const form = await request.formData();

    const username = String(
        form.get("username") || ""
    ).trim();

    const password = String(
        form.get("password") || ""
    );

    if (!username || !password ||
        username.length > 100 ||
        password.length > 1024) {
        return htmlResponse(
            loginPage("Geçersiz giriş bilgileri."),
            400
        );
    }

    const user = await env.DB.prepare(`
        SELECT id, username, password_hash, salt
        FROM admin_users
        WHERE username = ? AND active = 1
        LIMIT 1
    `).bind(username).first();

    let valid = false;

    if (user) {
        const calculated = await passwordHash(
            password,
            user.salt
        );

        valid = constantTimeEqual(
            calculated,
            user.password_hash
        );
    }

    if (!valid) {
        return htmlResponse(
            loginPage("Kullanıcı adı veya şifre hatalı."),
            401
        );
    }

    const token = randomToken();
    const tokenHash = await sha256(token);
    const expires = Math.floor(Date.now() / 1000)
        + SESSION_SECONDS;

    await env.DB.prepare(`
        INSERT INTO admin_sessions
        (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
    `).bind(user.id, tokenHash, expires).run();

    return new Response(null, {
        status: 303,
        headers: {
            "Location": "/admin",
            "Cache-Control": "no-store",
            "Set-Cookie":
                `anka_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${SESSION_SECONDS}`
        }
    });
}

async function logout(request, env) {
    const token = getCookie(request, "anka_admin");

    if (/^[a-f0-9]{64}$/.test(token)) {
        const tokenHash = await sha256(token);

        await env.DB.prepare(`
            DELETE FROM admin_sessions
            WHERE token_hash = ?
        `).bind(tokenHash).run();
    }

    return new Response(null, {
        status: 303,
        headers: {
            "Location": "/admin",
            "Set-Cookie":
                "anka_admin=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0",
            "Cache-Control": "no-store"
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

    try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        services.d1 = true;
    } catch (_) {}

    try {
        await env.CONFIG.get("__anka_health_check__");
        services.kv = true;
    } catch (_) {}

    try {
        await env.STORAGE.head("__anka_health_check__");
        services.r2 = true;
    } catch (_) {}

    return services;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            if (path === "/") {
                if (request.method !== "GET") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                return jsonResponse({
                    success: true,
                    app: APP_NAME,
                    version: VERSION,
                    status: "online"
                });
            }

            if (path === "/health") {
                if (request.method !== "GET") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                const services = await checkServices(env);

                const healthy = services.d1 &&
                    services.kv && services.r2;

                return jsonResponse({
                    success: healthy,
                    app: APP_NAME,
                    status: healthy ? "healthy" : "degraded",
                    services
                }, healthy ? 200 : 503);
            }

            if (path === "/admin") {
                if (request.method !== "GET") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                const user = await getAdmin(request, env);

                return htmlResponse(
                    user ? dashboardPage() : loginPage()
                );
            }

            if (path === "/admin/login") {
                if (request.method !== "POST") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                return await login(request, env);
            }

            if (path === "/admin/logout") {
                if (request.method !== "POST") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                const user = await getAdmin(request, env);

                if (!user) {
                    return jsonResponse({
                        success: false,
                        error: "Unauthorized"
                    }, 401);
                }

                return await logout(request, env);
            }

            if (path === "/admin/me") {
                if (request.method !== "GET") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                const user = await getAdmin(request, env);

                if (!user) {
                    return jsonResponse({
                        success: false,
                        error: "Unauthorized"
                    }, 401);
                }

                return jsonResponse({
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username
                    }
                });
            }

            if (path === "/api") {
                return jsonResponse({
                    success: false,
                    error: "API not configured"
                }, 503);
            }

            return jsonResponse({
                success: false,
                error: "Not found"
            }, 404);

        } catch (error) {
            console.error("Worker error:", error);

            return jsonResponse({
                success: false,
                error: "Internal server error"
            }, 500);
        }
    }
};
