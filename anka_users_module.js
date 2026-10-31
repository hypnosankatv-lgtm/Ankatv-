
// ANKA TV+ - Kullanıcı Kayıt ve Yönetim Modülü
// Cloudflare Workers + D1
// Yönetici hesapları admin_users tablosunda tutulur.
// Uygulama kullanıcıları app_users tablosunda tutulur.

const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;
const MAX_BODY_BYTES = 8192;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer"
        }
    });
}

function err(message, status = 400) {
    return json({
        success: false,
        error: message
    }, status);
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(value => value.toString(16).padStart(2, "0"))
        .join("");
}

function randomSalt() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

async function derivePassword(password, salt) {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        {
            name: "PBKDF2"
        },
        false,
        ["deriveBits"]
    );

    const derived = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        key,
        256
    );

    return bytesToHex(new Uint8Array(derived));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function safeAdminPost(request) {
    const expected = new URL(request.url).origin;
    const origin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    const fetchSite = request.headers.get("Sec-Fetch-Site");

    if (fetchSite === "cross-site") {
        return false;
    }

    if (origin && origin !== "null" && origin !== expected) {
        return false;
    }

    if (referer) {
        try {
            if (new URL(referer).origin !== expected) {
                return false;
            }
        } catch (_) {
            return false;
        }
    }

    if (
        !origin &&
        !referer &&
        fetchSite !== "same-origin"
    ) {
        return false;
    }

    return request.headers.get("X-Anka-Admin") === "1";
}

async function readJson(request) {
    const contentType = (
        request.headers.get("Content-Type") || ""
    ).toLowerCase();

    if (!contentType.startsWith("application/json")) {
        throw new Error("JSON içerik türü gerekli.");
    }

    const raw = await request.text();

    if (
        encoder.encode(raw).byteLength >
        MAX_BODY_BYTES
    ) {
        throw new Error("İstek verisi çok büyük.");
    }

    let data;

    try {
        data = JSON.parse(raw);
    } catch (_) {
        throw new Error("Geçersiz JSON verisi.");
    }

    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw new Error("JSON nesnesi gerekli.");
    }

    return data;
}

function adminPage() {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ANKA TV+ Kullanıcı Yönetimi</title>
<style>
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    background: #151419;
    color: #ffffff;
    font-family: Arial, sans-serif;
    font-size: 15px;
}

header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px;
    background: #1d1c21;
    border-bottom: 1px solid #45454b;
}

h1 {
    margin: 0;
    color: #2db88a;
    font-size: 20px;
}

header a {
    color: #2db88a;
    text-decoration: none;
    white-space: nowrap;
}

main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 18px;
}

.count {
    color: #b8b8be;
}

.search {
    display: block;
    width: 100%;
    padding: 14px;
    background: #1d1c21;
    border: 1px solid #45454b;
    border-radius: 12px;
    color: #ffffff;
    font-size: 16px;
    outline: none;
}

.search:focus {
    border-color: #2db88a;
}

.filters {
    display: flex;
    gap: 9px;
    overflow-x: auto;
    margin: 20px 0;
    padding-bottom: 5px;
    scrollbar-width: thin;
}

button {
    border: none;
    border-radius: 11px;
    padding: 12px 15px;
    background: #2db88a;
    color: #10231a;
    font-weight: bold;
    font-size: 14px;
    cursor: pointer;
}

button.alt {
    background: #303038;
    color: #ffffff;
}

button.danger {
    background: #62343c;
    color: #ffffff;
}

button:disabled {
    opacity: 0.5;
    cursor: wait;
}

.filters button {
    white-space: nowrap;
    flex-shrink: 0;
}

#notice {
    min-height: 20px;
    color: #ffaaaa;
    overflow-wrap: anywhere;
}

.cards {
    display: grid;
    gap: 14px;
}

.card {
    background: #1d1c21;
    border: 1px solid #45454b;
    border-radius: 14px;
    padding: 18px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.card h3 {
    margin: 0 0 12px;
    font-size: 18px;
}

.meta {
    color: #b8b8be;
    line-height: 1.9;
}

.badge {
    display: inline-block;
    padding: 5px 11px;
    border-radius: 20px;
    background: #34343a;
    color: #ffffff;
    font-size: 12px;
}

.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 16px;
}

.empty {
    color: #b8b8be;
    text-align: center;
    padding: 40px 15px;
    border: 1px dashed #45454b;
    border-radius: 14px;
}

@media (min-width: 750px) {
    .cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 480px) {
    header {
        padding: 15px;
    }

    h1 {
        font-size: 16px;
    }

    main {
        padding: 15px;
    }

    button {
        padding: 12px;
    }
}
</style>
</head>
<body>
<header>
    <h1>ANKA TV+ · Kullanıcı Yönetimi</h1>
    <a href="/admin/manage">Panele Dön</a>
</header>

<main>
    <p class="count" id="count">Yükleniyor...</p>

    <input
        class="search"
        id="search"
        type="search"
        placeholder="Kullanıcı adı veya e-posta ara"
        autocomplete="off"
    >

    <div class="filters">
        <button data-filter="pending">Onay Bekleyen</button>
        <button class="alt" data-filter="approved">Onaylanan</button>
        <button class="alt" data-filter="rejected">Reddedilen</button>
        <button class="alt" data-filter="disabled">Pasif</button>
        <button class="alt" data-filter="all">Tümü</button>
    </div>

    <p id="notice" role="status"></p>

    <div class="cards" id="rows"></div>
</main>

<script>
let currentStatus = "pending";
let users = [];

const $ = id => document.getElementById(id);

function escapeValue(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[character])
    );
}

async function api(action, data) {
    const isPost = data !== undefined;

    const endpoint =
        "/admin/users/api?action=" +
        encodeURIComponent(action) +
        (isPost
            ? ""
            : "&status=" + encodeURIComponent(currentStatus));

    const response = await fetch(endpoint, {
        method: isPost ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: isPost
            ? {
                "Content-Type": "application/json",
                "X-Anka-Admin": "1"
            }
            : {},
        body: isPost ? JSON.stringify(data) : undefined
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.error || "İşlem başarısız."
        );
    }

    return result;
}

function statusName(status) {
    const names = {
        pending: "Onay Bekliyor",
        approved: "Onaylandı",
        rejected: "Reddedildi",
        disabled: "Pasif"
    };

    return names[status] || status;
}

function render() {
    const query = $("search")
        .value
        .toLocaleLowerCase("tr-TR");

    const filtered = users.filter(user => {
        const value = (
            user.username + " " + user.email
        ).toLocaleLowerCase("tr-TR");

        return value.includes(query);
    });

    $("count").textContent =
        users.length + " kullanıcı";

    if (filtered.length === 0) {
        $("rows").innerHTML =
            '<div class="empty">Bu bölümde kullanıcı bulunamadı.</div>';
        return;
    }

    $("rows").innerHTML = filtered.map(user => {
        const date = new Date(
            Number(user.created_at) * 1000
        ).toLocaleString("tr-TR");

        let actions = "";

        if (user.status !== "approved") {
            actions +=
                '<button data-id="' +
                escapeValue(user.id) +
                '" data-status="approved">Onayla</button>';
        }

        if (user.status !== "rejected") {
            actions +=
                '<button class="alt" data-id="' +
                escapeValue(user.id) +
                '" data-status="rejected">Reddet</button>';
        }

        if (user.status !== "disabled") {
            actions +=
                '<button class="danger" data-id="' +
                escapeValue(user.id) +
                '" data-status="disabled">Pasif Yap</button>';
        }

        return '<article class="card">' +
            '<h3>' + escapeValue(user.username) + '</h3>' +
            '<div class="meta">' +
            'E-posta: ' + escapeValue(user.email) +
            '<div><span class="badge">' +
            escapeValue(statusName(user.status)) +
            '</span></div>' +
            'Kayıt: ' + escapeValue(date) +
            '</div>' +
            '<div class="actions">' + actions + '</div>' +
            '</article>';
    }).join("");
}

async function load() {
    $("notice").textContent = "";

    try {
        const result = await api("list");
        users = result.items || [];
        render();
    } catch (error) {
        $("notice").textContent = error.message;
    }
}

document.querySelectorAll(
    ".filters button"
).forEach(button => {
    button.addEventListener("click", () => {
        currentStatus = button.dataset.filter;

        document.querySelectorAll(
            ".filters button"
        ).forEach(item => {
            item.className =
                item === button ? "" : "alt";
        });

        load();
    });
});

$("search").addEventListener("input", render);

$("rows").addEventListener("click", async event => {
    const button = event.target.closest(
        "button[data-id]"
    );

    if (!button) {
        return;
    }

    const nextStatus = button.dataset.status;

    if (!confirm(
        "Kullanıcının durumu " +
        statusName(nextStatus) +
        " olarak değiştirilsin mi?"
    )) {
        return;
    }

    button.disabled = true;

    try {
        await api("status", {
            id: button.dataset.id,
            status: nextStatus
        });

        await load();
    } catch (error) {
        $("notice").textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

load();
</script>
</body>
</html>`;
}

async function registerUser(request, env) {
    if (request.method !== "POST") {
        return err("POST gerekli.", 405);
    }

    let body;

    try {
        body = await readJson(request);
    } catch (error) {
        return err(error.message, 400);
    }

    const username = String(
        body.username ?? ""
    ).trim();

    const email = String(
        body.email ?? ""
    ).trim().toLowerCase();

    const password = String(
        body.password ?? ""
    );

    if (!/^[a-zA-Z0-9_]{3,40}$/.test(username)) {
        return err(
            "Kullanıcı adı 3-40 karakter olmalıdır. " +
            "Harf, rakam ve alt çizgi kullanılabilir.",
            422
        );
    }

    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return err(
            "Geçerli bir e-posta adresi giriniz.",
            422
        );
    }

    if (
        password.length < 12 ||
        password.length > 128
    ) {
        return err(
            "Şifre 12-128 karakter arasında olmalıdır.",
            422
        );
    }

    let salt;
    let hash;
    let id;

    try {
        salt = randomSalt();

        hash = await derivePassword(
            password,
            salt
        );

        id = crypto.randomUUID();
    } catch (error) {
        const errorName = String(
            error?.name || "UnknownError"
        );

        const errorMessage = String(
            error?.message || "Bilinmeyen hata"
        );

        console.error(
            "ANKA_REGISTER_CRYPTO_ERROR",
            JSON.stringify({
                name: errorName,
                message: errorMessage
            })
        );

        return err(
            "Şifreleme hatası: " +
            errorName + " - " + errorMessage,
            500
        );
    }

    const now = Math.floor(Date.now() / 1000);

    try {
        const result = await env.DB.prepare(`
            INSERT INTO app_users (
                id,
                username,
                email,
                password_hash,
                password_salt,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            id,
            username,
            email,
            hash,
            salt,
            "pending",
            now
        ).run();

        if (!result.success) {
            throw new Error(
                "D1 kayıt işlemi başarısız."
            );
        }

        return json({
            success: true,
            status: "pending",
            message:
                "Kayıt başarılı. " +
                "Hesabınız yönetici onayı bekliyor."
        }, 201);

    } catch (error) {
        const message = String(
            error?.message || error
        );

        console.error(
            "ANKA_REGISTER_DATABASE_ERROR",
            message
        );

        if (/UNIQUE constraint failed/i.test(message)) {
            return err(
                "Kullanıcı adı veya e-posta zaten kayıtlı.",
                409
            );
        }

        return err(
            "Kayıt veritabanına yazılamadı. " +
            "D1 tablo yapısını kontrol edin.",
            500
        );
    }
}

async function listUsers(request, env) {
    if (request.method !== "GET") {
        return err("GET gerekli.", 405);
    }

    const url = new URL(request.url);

    const status =
        url.searchParams.get("status") || "pending";

    const allowed = [
        "pending",
        "approved",
        "rejected",
        "disabled",
        "all"
    ];

    if (!allowed.includes(status)) {
        return err("Geçersiz kullanıcı filtresi.", 400);
    }

    let statement;

    if (status === "all") {
        statement = env.DB.prepare(`
            SELECT
                id,
                username,
                email,
                status,
                created_at,
                reviewed_at
            FROM app_users
            ORDER BY created_at DESC
            LIMIT 500
        `);
    } else {
        statement = env.DB.prepare(`
            SELECT
                id,
                username,
                email,
                status,
                created_at,
                reviewed_at
            FROM app_users
            WHERE status = ?
            ORDER BY created_at DESC
            LIMIT 500
        `).bind(status);
    }

    const result = await statement.all();

    return json({
        success: true,
        items: result.results || []
    });
}

async function changeUserStatus(request, env, admin) {
    if (request.method !== "POST") {
        return err("POST gerekli.", 405);
    }

    if (!safeAdminPost(request)) {
        return err(
            "Geçersiz yönetici istek kaynağı.",
            403
        );
    }

    let body;

    try {
        body = await readJson(request);
    } catch (error) {
        return err(error.message, 400);
    }

    const id = String(body.id ?? "");
    const status = String(body.status ?? "");

    const allowed = [
        "approved",
        "rejected",
        "disabled"
    ];

    if (
        !/^[0-9a-f-]{36}$/i.test(id) ||
        !allowed.includes(status)
    ) {
        return err("Geçersiz kullanıcı işlemi.", 422);
    }

    const now = Math.floor(Date.now() / 1000);

    const result = await env.DB.prepare(`
        UPDATE app_users
        SET
            status = ?,
            reviewed_at = ?,
            reviewed_by = ?
        WHERE id = ?
    `).bind(
        status,
        now,
        admin.id,
        id
    ).run();

    if (!result.meta?.changes) {
        return err("Kullanıcı bulunamadı.", 404);
    }

    return json({
        success: true,
        message: "Kullanıcı durumu güncellendi."
    });
}

export async function handleAnkaUsers(
    request,
    env,
    getAdmin
) {
    if (!env.DB) {
        return err(
            "Cloudflare D1 DB binding bulunamadı.",
            503
        );
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const action = url.searchParams.get("action");

    // Herkese açık kullanıcı kayıt API'si.
    if (path === "/api/app/register") {
        return await registerUser(request, env);
    }

    // Bundan sonraki bütün işlemler yönetici oturumu ister.
    const admin = await getAdmin(request, env);

    if (!admin) {
        if (path === "/admin/users") {
            return new Response(null, {
                status: 303,
                headers: {
                    Location: "/admin",
                    "Cache-Control": "no-store"
                }
            });
        }

        return err(
            "Yönetici oturumu gerekli.",
            401
        );
    }

    if (path === "/admin/users") {
        if (request.method !== "GET") {
            return err("GET gerekli.", 405);
        }

        return new Response(adminPage(), {
            status: 200,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Frame-Options": "DENY",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                "Content-Security-Policy":
                    "default-src 'none'; " +
                    "style-src 'unsafe-inline'; " +
                    "script-src 'unsafe-inline'; " +
                    "connect-src 'self'; " +
                    "base-uri 'none'; " +
                    "frame-ancestors 'none'"
            }
        });
    }

    if (path !== "/admin/users/api") {
        return err("Sayfa bulunamadı.", 404);
    }

    if (action === "list") {
        return await listUsers(request, env);
    }

    if (action === "status") {
        return await changeUserStatus(
            request,
            env,
            admin
        );
    }

    return err("Bilinmeyen işlem.", 404);
}
