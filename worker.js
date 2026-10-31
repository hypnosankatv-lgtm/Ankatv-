const APP_NAME = "ANKA TV+";
const VERSION = "1.2.2";
const SESSION_SECONDS = 60 * 60 * 12;
const MAX_FORM_BYTES = 8192;
const PBKDF2_ITERATIONS = 100000;

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
            "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy":
                "default-src 'none'; " +
                "style-src 'unsafe-inline'; " +
                "form-action 'self'; " +
                "base-uri 'none'; " +
                "frame-ancestors 'none'"
        }
    });
}

function redirect(path, cookie = null) {
    const headers = {
        "Location": path,
        "Cache-Control": "no-store"
    };

    if (cookie !== null) {
        headers["Set-Cookie"] = cookie;
    }

    return new Response(null, {
        status: 303,
        headers
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
    const bytes = new TextEncoder().encode(
        String(value)
    );

    const hash = await crypto.subtle.digest(
        "SHA-256",
        bytes
    );

    return bytesToHex(
        new Uint8Array(hash)
    );
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
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        key,
        256
    );

    return bytesToHex(
        new Uint8Array(bits)
    );
}

function constantTimeEqual(a, b) {
    const left = String(a);
    const right = String(b);

    let difference = left.length ^ right.length;
    const length = Math.max(
        left.length,
        right.length
    );

    for (let i = 0; i < length; i++) {
        difference |=
            (left.charCodeAt(i) || 0) ^
            (right.charCodeAt(i) || 0);
    }

    return difference === 0;
}

function getCookie(request, name) {
    const cookie =
        request.headers.get("Cookie") || "";

    for (const item of cookie.split(";")) {
        const part = item.trim();
        const separator = part.indexOf("=");

        if (
            separator > 0 &&
            part.slice(0, separator) === name
        ) {
            return part.slice(separator + 1);
        }
    }

    return "";
}

function sessionCookie(token) {
    return (
        `anka_admin=${token}; ` +
        "HttpOnly; Secure; SameSite=Strict; " +
        `Path=/admin; Max-Age=${SESSION_SECONDS}`
    );
}

function expiredSessionCookie() {
    return (
        "anka_admin=; HttpOnly; Secure; " +
        "SameSite=Strict; Path=/admin; Max-Age=0"
    );
}






    
function validFormOrigin(request) {
    const expectedOrigin = new URL(request.url).origin;

    const origin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    const fetchSite = request.headers.get("Sec-Fetch-Site");

    if (fetchSite === "cross-site") {
        return false;
    }

    if (origin && origin !== "null") {
        return origin === expectedOrigin;
    }

    if (referer) {
        try {
            return new URL(referer).origin === expectedOrigin;
        } catch (_) {
            return false;
        }
    }

    return fetchSite === "same-origin";
}





async function readForm(request) {
    const contentType =
        request.headers.get("Content-Type") || "";

    if (!contentType.toLowerCase().startsWith(
        "application/x-www-form-urlencoded"
    )) {
        throw new HttpError(
            415,
            "Geçersiz form içerik türü."
        );
    }

    const contentLength = Number(
        request.headers.get("Content-Length") || 0
    );

    if (contentLength > MAX_FORM_BYTES) {
        throw new HttpError(
            413,
            "Form verisi çok büyük."
        );
    }

    const raw = await request.text();

    if (
        new TextEncoder().encode(raw).byteLength >
        MAX_FORM_BYTES
    ) {
        throw new HttpError(
            413,
            "Form verisi çok büyük."
        );
    }

    return new URLSearchParams(raw);
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

function databaseRequired(env) {
    if (!env.DB) {
        throw new Error(
            "D1 binding bulunamadı. Beklenen ad: DB"
        );
    }
}

async function checkAdminTables(env) {
    databaseRequired(env);

    const required = {
        admin_users: [
            "id",
            "username",
            "password_hash",
            "salt",
            "active"
        ],
        admin_sessions: [
            "user_id",
            "token_hash",
            "expires_at"
        ]
    };

    for (const [table, columns] of Object.entries(required)) {
        const result = await env.DB.prepare(
            `PRAGMA table_info(${table})`
        ).all();

        const existing = new Set(
            (result.results || []).map(
                row => row.name
            )
        );

        const missing = columns.filter(
            column => !existing.has(column)
        );

        if (missing.length > 0) {
            throw new Error(
                `D1 tablo yapısı eksik: ${table}. ` +
                `Eksik sütunlar: ${missing.join(", ")}`
            );
        }
    }
}

async function getAdmin(request, env) {
    databaseRequired(env);

    const token = getCookie(
        request,
        "anka_admin"
    );

    if (!/^[a-f0-9]{64}$/.test(token)) {
        return null;
    }

    const tokenHash = await sha256(token);
    const now = Math.floor(
        Date.now() / 1000
    );

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

function pageStyles() {
    return `
*{box-sizing:border-box}
body{
    margin:0;
    min-height:100vh;
    background:#151419;
    color:#fff;
    font-family:Arial,sans-serif
}
.auth{
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px
}
.panel{
    width:100%;
    max-width:420px;
    background:#1d1c21;
    border:1px solid #45454b;
    border-radius:18px;
    padding:28px
}
.logo{
    color:#2db88a;
    font-size:27px;
    font-weight:800;
    text-align:center
}
.subtitle{
    color:#b8b8be;
    text-align:center;
    margin:12px 0 28px;
    line-height:1.6
}
label{
    display:block;
    font-size:13px;
    margin:15px 0 8px
}
input{
    width:100%;
    padding:14px;
    border-radius:10px;
    border:1px solid #45454b;
    background:#151419;
    color:#fff;
    font-size:15px
}
input:focus{
    outline:none;
    border-color:#2db88a
}
button{
    width:100%;
    background:#2db88a;
    color:#101714;
    border:0;
    border-radius:10px;
    padding:14px;
    margin-top:25px;
    font-size:15px;
    font-weight:bold;
    cursor:pointer
}
.error{
    color:#ff9090;
    background:#442529;
    border:1px solid #824148;
    padding:12px;
    border-radius:9px;
    font-size:13px;
    line-height:1.5
}
.success{
    color:#72dfb3;
    background:#20392e;
    border:1px solid #2db88a;
    padding:12px;
    border-radius:9px;
    font-size:13px
}
`;
}

function loginPage(error = "", success = "") {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANKA TV+ Yönetim Paneli</title>
<style>${pageStyles()}</style>
</head>
<body class="auth">
<div class="panel">
<div class="logo">ANKA TV+</div>
<p class="subtitle">Yönetim Paneli</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
${success ? `<p class="success">${escapeHtml(success)}</p>` : ""}
<form action="/admin/login" method="POST">
<label>Kullanıcı adı</label>
<input name="username" required maxlength="100" autocomplete="username">
<label>Şifre</label>
<input name="password" type="password" required autocomplete="current-password">
<button type="submit">Giriş Yap</button>
</form>
</div>
</body>
</html>`;
}

function setupPage(error = "") {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANKA TV+ İlk Kurulum</title>
<style>${pageStyles()}</style>
</head>
<body class="auth">
<div class="panel">
<div class="logo">ANKA TV+</div>
<p class="subtitle">İlk Yönetici Hesabı Oluşturma</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
<form method="POST" action="/admin/setup">
<label>Kurulum Anahtarı</label>
<input type="password" name="setup_key" required autocomplete="off">
<label>Yönetici Kullanıcı Adı</label>
<input name="username" minlength="3" maxlength="50" required autocomplete="username">
<label>Yönetici Şifresi</label>
<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password">
<button type="submit">Yönetici Hesabını Oluştur</button>
</form>
</div>
</body>
</html>`;
}

function dashboardPage(username) {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANKA TV+ Admin</title>
<style>
${pageStyles()}
header{
    background:#1d1c21;
    padding:22px;
    border-bottom:1px solid #45454b
}
h1{
    margin:0;
    color:#2db88a;
    font-size:23px
}
main{
    padding:24px;
    max-width:900px;
    margin:auto
}
.card{
    background:#1d1c21;
    border:1px solid #45454b;
    border-radius:14px;
    padding:24px;
    margin-bottom:16px
}
.card p{
    color:#b8b8be;
    line-height:1.6
}
.card button{
    max-width:180px
}
</style>
</head>
<body>
<header><h1>ANKA TV+ Yönetim Paneli</h1></header>
<main>
<div class="card">
<h2>Hoş Geldiniz, ${escapeHtml(username)}</h2>
<p>Yönetici oturumunuz aktif.</p>
<p>Cloudflare Worker, D1, KV ve R2 altyapısı üzerinden platform, film ve dizi yönetimi sonraki aşamada eklenecek.</p>
<form method="POST" action="/admin/logout">
<button type="submit">Çıkış Yap</button>
</form>
</div>
</main>
</body>
</html>`;
}

async function handleAdminSetup(request, env) {
    if (!env.ADMIN_SETUP_KEY) {
        return htmlResponse(
            setupPage(
                "Kurulum anahtarı tanımlanmamış."
            ),
            403
        );
    }

    await checkAdminTables(env);

    const existing = await env.DB.prepare(
        "SELECT id FROM admin_users LIMIT 1"
    ).first();

    if (existing) {
        return redirect("/admin");
    }

    if (request.method === "GET") {
        return htmlResponse(
            setupPage()
        );
    }

    if (request.method !== "POST") {
        return jsonResponse({
            success: false,
            error: "Method not allowed"
        }, 405);
    }

    if (!validFormOrigin(request)) {
        return htmlResponse(
            setupPage(
                "Geçersiz istek kaynağı."
            ),
            403
        );
    }

    let form;

    try {
        form = await readForm(request);
    } catch (error) {
        if (error instanceof HttpError) {
            return htmlResponse(
                setupPage(error.message),
                error.status
            );
        }

        throw error;
    }

    const setupKey = String(
        form.get("setup_key") || ""
    );

    const username = String(
        form.get("username") || ""
    ).trim();

    const password = String(
        form.get("password") || ""
    );

    const providedHash = await sha256(
        setupKey
    );

    const expectedHash = await sha256(
        env.ADMIN_SETUP_KEY
    );

    if (!constantTimeEqual(
        providedHash,
        expectedHash
    )) {
        return htmlResponse(
            setupPage(
                "Kurulum anahtarı hatalı."
            ),
            403
        );
    }

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
        return htmlResponse(
            setupPage(
                "Kullanıcı adı 3-50 karakter olmalı; harf, rakam ve alt çizgi içermelidir."
            ),
            400
        );
    }

    if (
        password.length < 12 ||
        password.length > 128
    ) {
        return htmlResponse(
            setupPage(
                "Şifre 12-128 karakter arasında olmalıdır."
            ),
            400
        );
    }

    const salt = randomToken();

    const hash = await passwordHash(
        password,
        salt
    );

    const result = await env.DB.prepare(`
        INSERT INTO admin_users
        (username, password_hash, salt, active)
        SELECT ?, ?, ?, 1
        WHERE NOT EXISTS (
            SELECT 1 FROM admin_users
        )
    `).bind(
        username,
        hash,
        salt
    ).run();

    if (
        !result.success ||
        result.meta?.changes !== 1
    ) {
        return htmlResponse(
            setupPage(
                "Yönetici hesabı oluşturulamadı veya zaten mevcut."
            ),
            409
        );
    }

    console.log(
        "İlk yönetici hesabı başarıyla oluşturuldu."
    );

    return redirect("/admin");
}

async function login(request, env) {
    databaseRequired(env);

    if (!validFormOrigin(request)) {
        return htmlResponse(
            loginPage(
                "Geçersiz istek kaynağı."
            ),
            403
        );
    }

    let form;

    try {
        form = await readForm(request);
    } catch (error) {
        if (error instanceof HttpError) {
            return htmlResponse(
                loginPage(error.message),
                error.status
            );
        }

        throw error;
    }

    const username = String(
        form.get("username") || ""
    ).trim();

    const password = String(
        form.get("password") || ""
    );

    if (
        !username ||
        !password ||
        username.length > 100 ||
        password.length > 1024
    ) {
        return htmlResponse(
            loginPage(
                "Geçersiz giriş bilgileri."
            ),
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
            loginPage(
                "Kullanıcı adı veya şifre hatalı."
            ),
            401
        );
    }

    const token = randomToken();
    const tokenHash = await sha256(token);

    const expires =
        Math.floor(Date.now() / 1000) +
        SESSION_SECONDS;

    await env.DB.prepare(`
        INSERT INTO admin_sessions
        (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
    `).bind(
        user.id,
        tokenHash,
        expires
    ).run();

    return redirect(
        "/admin",
        sessionCookie(token)
    );
}

async function logout(request, env) {
    const token = getCookie(
        request,
        "anka_admin"
    );

    if (/^[a-f0-9]{64}$/.test(token)) {
        const tokenHash = await sha256(
            token
        );

        await env.DB.prepare(`
            DELETE FROM admin_sessions
            WHERE token_hash = ?
        `).bind(tokenHash).run();
    }

    return redirect(
        "/admin",
        expiredSessionCookie()
    );
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
            throw new Error(
                "DB binding missing"
            );
        }

        await env.DB.prepare(
            "SELECT 1 AS ok"
        ).first();

        services.d1 = true;
    } catch (error) {
        errors.d1 = String(
            error.message || error
        );
    }

    try {
        if (!env.CONFIG) {
            throw new Error(
                "CONFIG binding missing"
            );
        }

        await env.CONFIG.get(
            "__anka_health_check__"
        );

        services.kv = true;
    } catch (error) {
        errors.kv = String(
            error.message || error
        );
    }

    try {
        if (!env.STORAGE) {
            throw new Error(
                "STORAGE binding missing"
            );
        }

        await env.STORAGE.head(
            "__anka_health_check__"
        );

        services.r2 = true;
    } catch (error) {
        errors.r2 = String(
            error.message || error
        );
    }

    return {
        services,
        errors
    };
}

function handleError(error, path) {
    const errorId = crypto.randomUUID();

    console.error(
        "ANKA_WORKER_ERROR",
        JSON.stringify({
            errorId,
            path,
            name: error?.name || "Error",
            message: String(
                error?.message || error
            ),
            stack: String(
                error?.stack || ""
            )
        })
    );

    if (error instanceof HttpError) {
        return jsonResponse({
            success: false,
            error: error.message
        }, error.status);
    }

    if (path === "/admin/setup") {
        return htmlResponse(
            setupPage(
                "Kurulum sırasında sunucu hatası oluştu. " +
                "Cloudflare Workers Logs bölümünü kontrol edin. " +
                "Hata kodu: " + errorId
            ),
            500
        );
    }

    if (
        path === "/admin" ||
        path === "/admin/login"
    ) {
        return htmlResponse(
            loginPage(
                "Sunucu hatası oluştu. " +
                "Hata kodu: " + errorId
            ),
            500
        );
    }

    return jsonResponse({
        success: false,
        error: "Internal server error",
        errorId
    }, 500);
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

                const result = await checkServices(
                    env
                );

                const services = result.services;

                const healthy =
                    services.d1 &&
                    services.kv &&
                    services.r2;

                return jsonResponse({
                    success: healthy,
                    app: APP_NAME,
                    status: healthy
                        ? "healthy"
                        : "degraded",
                    services,
                    errors: result.errors
                }, healthy ? 200 : 503);
            }

            if (path === "/admin/setup") {
                return await handleAdminSetup(
                    request,
                    env
                );
            }

            if (path === "/admin") {
                if (request.method !== "GET") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                const user = await getAdmin(
                    request,
                    env
                );

                return htmlResponse(
                    user
                        ? dashboardPage(
                            user.username
                        )
                        : loginPage()
                );
            }

            if (path === "/admin/login") {
                if (request.method !== "POST") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                return await login(
                    request,
                    env
                );
            }

            if (path === "/admin/logout") {
                if (request.method !== "POST") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                if (!validFormOrigin(request)) {
                    return jsonResponse({
                        success: false,
                        error: "Forbidden"
                    }, 403);
                }

                const user = await getAdmin(
                    request,
                    env
                );

                if (!user) {
                    return jsonResponse({
                        success: false,
                        error: "Unauthorized"
                    }, 401);
                }

                return await logout(
                    request,
                    env
                );
            }

            if (path === "/admin/me") {
                if (request.method !== "GET") {
                    return jsonResponse({
                        success: false,
                        error: "Method not allowed"
                    }, 405);
                }

                const user = await getAdmin(
                    request,
                    env
                );

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
            return handleError(
                error,
                path
            );
        }
    }
};
