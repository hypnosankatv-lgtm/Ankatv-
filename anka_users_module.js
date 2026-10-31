
// ANKA TV+ - Kullanıcı Kayıt ve Yönetim Modülü
// admin_users tablosundan bağımsızdır.
// D1 binding: DB
// Kullanıcı tablosu: app_users

const enc = new TextEncoder();

const json = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
};

const err = (message, status = 400) => {
    return json({
        success: false,
        error: message
    }, status);
};

const hex = bytes => {
    return Array.from(bytes)
        .map(x => x.toString(16).padStart(2, "0"))
        .join("");
};

function random() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return hex(bytes);
}

async function derive(password, salt) {
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: enc.encode(salt),
            iterations: 210000,
            hash: "SHA-256"
        },
        key,
        256
    );

    return hex(new Uint8Array(bits));
}

function safePost(request) {
    const origin = request.headers.get("Origin");
    const site = request.headers.get("Sec-Fetch-Site");
    const expected = new URL(request.url).origin;

    if (site === "cross-site") {
        return false;
    }

    if (origin && origin !== "null" && origin !== expected) {
        return false;
    }

    if (origin === "null") {
        return false;
    }

    return (
        request.headers.get("X-Anka-Admin") === "1" &&
        site === "same-origin"
    );
}

async function bodyJson(request) {
    const contentType = (
        request.headers.get("Content-Type") || ""
    ).toLowerCase();

    if (!contentType.startsWith("application/json")) {
        throw new Error("JSON gerekli.");
    }

    const contentLength = Number(
        request.headers.get("Content-Length") || 0
    );

    if (contentLength > 8192) {
        throw new Error("İstek çok büyük.");
    }

    const raw = await request.text();

    if (enc.encode(raw).byteLength > 8192) {
        throw new Error("İstek çok büyük.");
    }

    return JSON.parse(raw);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function adminPage() {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANKA TV+ Kullanıcı Yönetimi</title>
<style>
* {
    box-sizing: border-box;
}
body {
    margin: 0;
    background: #151419;
    color: #fff;
    font: 15px Arial, sans-serif;
}
header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 17px;
    background: #1d1c21;
    border-bottom: 1px solid #45454b;
}
h1 {
    font-size: 20px;
    color: #2db88a;
    margin: 0;
}
a {
    color: #2db88a;
    white-space: nowrap;
}
main {
    max-width: 1100px;
    margin: auto;
    padding: 18px;
}
.filters {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin: 18px 0;
    padding-bottom: 5px;
}
.filters button {
    white-space: nowrap;
}
button {
    background: #2db88a;
    color: #11251d;
    border: 0;
    border-radius: 10px;
    padding: 12px;
    font-weight: bold;
    cursor: pointer;
}
button.alt {
    background: #303038;
    color: #fff;
}
button.danger {
    background: #62343c;
    color: #fff;
}
button:disabled {
    opacity: .5;
    cursor: not-allowed;
}
.card {
    background: #1d1c21;
    border: 1px solid #45454b;
    border-radius: 13px;
    padding: 17px;
    margin: 12px 0;
    overflow-wrap: anywhere;
}
.card h3 {
    margin-top: 0;
}
.meta {
    color: #b8b8be;
    line-height: 1.8;
}
.actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 14px;
}
.badge {
    display: inline-block;
    background: #33343a;
    border-radius: 20px;
    padding: 5px 10px;
    font-size: 12px;
}
.count {
    color: #b8b8be;
}
#notice {
    color: #ffb0b0;
    min-height: 22px;
    overflow-wrap: anywhere;
}
input {
    padding: 12px;
    background: #1d1c21;
    border: 1px solid #45454b;
    border-radius: 10px;
    color: white;
    width: 100%;
    font-size: 16px;
}
@media (min-width: 700px) {
    .cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
    }
    .card {
        margin: 0;
    }
}
@media (max-width: 480px) {
    header {
        padding: 14px;
    }
    h1 {
        font-size: 17px;
    }
    main {
        padding: 14px;
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
    id="search"
    placeholder="Kullanıcı adı veya e-posta ara"
    autocomplete="off"
>
<div class="filters">
<button data-status="pending">Onay Bekleyen</button>
<button data-status="approved" class="alt">Onaylanan</button>
<button data-status="rejected" class="alt">Reddedilen</button>
<button data-status="disabled" class="alt">Pasif</button>
<button data-status="all" class="alt">Tümü</button>
</div>
<p id="notice" role="status"></p>
<div class="cards" id="rows"></div>
</main>
<script>
let status = "pending";
let users = [];

const $ = id => document.getElementById(id);

function esc(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[c])
    );
}

async function api(action, data) {
    const isPost = data !== undefined;

    const url = "/admin/users/api?action=" +
        encodeURIComponent(action) +
        (isPost ? "" : "&status=" + encodeURIComponent(status));

    const response = await fetch(url, {
        method: isPost ? "POST" : "GET",
        credentials: "same-origin",
        headers: isPost
            ? {
                "Content-Type": "application/json",
                "X-Anka-Admin": "1"
            }
            : {},
        body: isPost ? JSON.stringify(data) : undefined,
        cache: "no-store"
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.error || "İşlem başarısız."
        );
    }

    return result;
}

function render() {
    const query = $("search").value.toLocaleLowerCase("tr");

    const filtered = users.filter(user => {
        const text = (
            user.username + " " + user.email
        ).toLocaleLowerCase("tr");

        return text.includes(query);
    });

    $("count").textContent = users.length + " kullanıcı";

    $("rows").innerHTML = filtered.map(user => {
        const date = Number(user.created_at);

        const created = Number.isFinite(date)
            ? new Date(date * 1000).toLocaleString("tr-TR")
            : "-";

        return '<article class="card">' +
            '<h3>' + esc(user.username) + '</h3>' +
            '<div class="meta">' +
            esc(user.email) +
            '<br><span class="badge">' +
            esc(user.status) +
            '</span><br>Kayıt: ' +
            esc(created) +
            '</div>' +
            '<div class="actions">' +
            (user.status !== "approved"
                ? '<button data-id="' + esc(user.id) +
                  '" data-status="approved">Onayla</button>'
                : '') +
            (user.status !== "rejected"
                ? '<button class="alt" data-id="' +
                  esc(user.id) +
                  '" data-status="rejected">Reddet</button>'
                : '') +
            (user.status !== "disabled"
                ? '<button class="danger" data-id="' +
                  esc(user.id) +
                  '" data-status="disabled">Pasif Yap</button>'
                : '') +
            '</div></article>';
    }).join("") ||
        '<p class="count">Bu bölümde kullanıcı bulunamadı.</p>';
}

async function load() {
    try {
        const result = await api("list");
        users = result.items;
        render();
        $("notice").textContent = "";
    } catch (error) {
        $("notice").textContent = error.message;
    }
}

document.querySelectorAll(".filters button").forEach(button => {
    button.onclick = () => {
        status = button.dataset.status;

        document.querySelectorAll(".filters button").forEach(item => {
            item.className = item === button ? "" : "alt";
        });

        load();
    };
});

$("search").oninput = render;

$("rows").onclick = async event => {
    const button = event.target.closest("button[data-id]");

    if (!button) {
        return;
    }

    if (!confirm("Kullanıcı durumu değiştirilsin mi?")) {
        return;
    }

    button.disabled = true;

    try {
        await api("status", {
            id: button.dataset.id,
            status: button.dataset.status
        });

        await load();
    } catch (error) {
        $("notice").textContent = error.message;
    } finally {
        button.disabled = false;
    }
};

load();
</script>
</body>
</html>`;
}

export async function handleAnkaUsers(request, env, getAdmin) {
    if (!env.DB) {
        return err("D1 DB binding bulunamadı.", 503);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const action = url.searchParams.get("action");

    // ========================================
    // HERKESE AÇIK KULLANICI KAYDI
    // ========================================

    if (path === "/api/app/register") {
        if (request.method !== "POST") {
            return err("POST gerekli.", 405);
        }

        let body;

        try {
            body = await bodyJson(request);
        } catch (error) {
            return err("Geçersiz JSON veya istek.", 400);
        }

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            return err("Geçersiz kayıt bilgileri.", 400);
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
                "Kullanıcı adı 3-40 karakter olmalı; harf, rakam veya alt çizgi içermelidir.",
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

        // ====================================
        // AŞAMA 1: ŞİFRELEME
        // ====================================

        let salt;
        let hash;
        let id;
        let now;

        try {
            console.log(
                "ANKA_REGISTER: Şifreleme başlıyor"
            );

            salt = random();

            hash = await derive(
                password,
                salt
            );

            id = crypto.randomUUID();

            now = Math.floor(
                Date.now() / 1000
            );

            console.log(
                "ANKA_REGISTER: Şifreleme başarılı"
            );

        } catch (error) {
            console.error(
                "ANKA_REGISTER_CRYPTO_ERROR",
                error
            );

            return err(
                "Kayıt işleminin şifreleme aşamasında hata oluştu.",
                500
            );
        }

        // ====================================
        // AŞAMA 2: D1 VERİTABANI KAYDI
        // ====================================

        try {
            console.log(
                "ANKA_REGISTER: D1 kayıt işlemi başlıyor"
            );

            const result = await env.DB.prepare(`
                INSERT INTO app_users
                (
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
                    "D1 kayıt işlemi başarısız döndü."
                );
            }

            console.log(
                "ANKA_REGISTER: Kullanıcı başarıyla kaydedildi"
            );

        } catch (error) {
            console.error(
                "ANKA_REGISTER_DB_ERROR",
                error
            );

            if (
                /UNIQUE constraint failed/i.test(
                    String(error.message || error)
                )
            ) {
                return err(
                    "Kullanıcı adı veya e-posta zaten kayıtlı.",
                    409
                );
            }

            return err(
                "Kayıt sırasında veritabanı hatası oluştu. Cloudflare Logs bölümünü kontrol edin.",
                500
            );
        }

        return json({
            success: true,
            status: "pending",
            message: "Kayıt alındı. Yönetici onayı bekleniyor."
        }, 201);
    }

    // ========================================
    // YÖNETİCİ OTURUM KONTROLÜ
    // ========================================

    const admin = await getAdmin(
        request,
        env
    );

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

    // ========================================
    // KULLANICI YÖNETİMİ SAYFASI
    // ========================================

    if (path === "/admin/users") {
        if (request.method !== "GET") {
            return err("GET gerekli.", 405);
        }

        return new Response(adminPage(), {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Frame-Options": "DENY",
                "X-Content-Type-Options": "nosniff",
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
        return err("Not found.", 404);
    }

    // ========================================
    // KULLANICILARI LİSTELE
    // ========================================

    if (action === "list") {
        if (request.method !== "GET") {
            return err("GET gerekli.", 405);
        }

        const status = (
            url.searchParams.get("status") || "pending"
        );

        const allowed = [
            "pending",
            "approved",
            "rejected",
            "disabled",
            "all"
        ];

        if (!allowed.includes(status)) {
            return err("Geçersiz filtre.", 400);
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

    // ========================================
    // KULLANICI ONAY / RED / PASİF
    // ========================================

    if (action === "status") {
        if (request.method !== "POST") {
            return err("POST gerekli.", 405);
        }

        if (!safePost(request)) {
            return err(
                "Geçersiz istek kaynağı.",
                403
            );
        }

        let body;

        try {
            body = await bodyJson(request);
        } catch (error) {
            return err(
                "Geçersiz JSON.",
                400
            );
        }

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            !["approved", "rejected", "disabled"].includes(
                body.status
            ) ||
            typeof body.id !== "string" ||
            !/^[0-9a-f-]{36}$/.test(body.id)
        ) {
            return err(
                "Geçersiz işlem.",
                422
            );
        }

        const result = await env.DB.prepare(`
            UPDATE app_users
            SET
                status = ?,
                reviewed_at = ?,
                reviewed_by = ?
            WHERE id = ?
        `).bind(
            body.status,
            Math.floor(Date.now() / 1000),
            admin.id,
            body.id
        ).run();

        if (!result.meta?.changes) {
            return err(
                "Kullanıcı bulunamadı.",
                404
            );
        }

        return json({
            success: true,
            message: "Kullanıcı durumu güncellendi."
        });
    }

    return err(
        "Bilinmeyen işlem.",
        404
    );
}
