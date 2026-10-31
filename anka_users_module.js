
const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;
const MAX_BODY_BYTES = 8192;

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

function error(message, status = 400) {
    return json({
        success: false,
        error: message
    }, status);
}

function hex(bytes) {
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function sha256(value) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(value)
    );

    return hex(new Uint8Array(digest));
}

async function getDeviceHash(request) {
    const deviceId = String(
        request.headers.get("X-Anka-Device-Id") || ""
    ).trim().toLowerCase();

    const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    const legacy = /^[0-9a-f]{16}$/;

    if (!uuid.test(deviceId) && !legacy.test(deviceId)) {
        return null;
    }

    return sha256("anka-device-v1:" + deviceId);
}

function randomSalt() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return hex(bytes);
}

async function passwordHash(password, salt) {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        key,
        256
    );

    return hex(new Uint8Array(bits));
}

async function readBody(request) {
    const contentType = (
        request.headers.get("Content-Type") || ""
    ).toLowerCase();

    if (!contentType.startsWith("application/json")) {
        throw new Error("JSON içerik türü gerekli.");
    }

    const contentLength = Number(
        request.headers.get("Content-Length") || 0
    );

    if (contentLength > MAX_BODY_BYTES) {
        throw new Error("İstek verisi çok büyük.");
    }

    const raw = await request.text();

    if (encoder.encode(raw).length > MAX_BODY_BYTES) {
        throw new Error("İstek verisi çok büyük.");
    }

    let data;

    try {
        data = JSON.parse(raw);
    } catch (_) {
        throw new Error("Geçersiz JSON.");
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

function verifyAdminRequest(request) {
    if (request.headers.get("X-Anka-Admin") !== "1") {
        return false;
    }

    const origin = new URL(request.url).origin;
    const requestOrigin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    const fetchSite = request.headers.get("Sec-Fetch-Site");

    if (fetchSite === "cross-site") {
        return false;
    }

    if (requestOrigin && requestOrigin !== origin) {
        return false;
    }

    if (referer) {
        try {
            if (new URL(referer).origin !== origin) {
                return false;
            }
        } catch (_) {
            return false;
        }
    }

    if (
        !requestOrigin &&
        !referer &&
        fetchSite !== "same-origin"
    ) {
        return false;
    }

    return true;
}

function htmlPage() {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ANKA TV+ - Kullanıcı Yönetimi</title>
<style>
* {
    box-sizing: border-box;
}
body {
    margin: 0;
    background: #151419;
    color: #fff;
    font-family: Arial, sans-serif;
    font-size: 14px;
}
header {
    padding: 20px;
    background: #1d1c21;
    border-bottom: 1px solid #45454b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
header h1 {
    margin: 0;
    color: #2db88a;
    font-size: 20px;
}
header a {
    color: #2db88a;
    text-decoration: none;
}
main {
    max-width: 1150px;
    margin: auto;
    padding: 20px;
}
input {
    width: 100%;
    padding: 15px;
    background: #1d1c21;
    border: 1px solid #45454b;
    border-radius: 12px;
    color: white;
    font-size: 15px;
    outline: none;
}
input:focus {
    border-color: #2db88a;
}
.filters {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    margin: 20px 0;
}
button {
    padding: 11px 15px;
    border: 0;
    border-radius: 10px;
    background: #2db88a;
    color: #10251c;
    font-weight: bold;
    cursor: pointer;
}
button.secondary {
    background: #303038;
    color: white;
}
button.danger {
    background: #68333c;
    color: white;
}
button:disabled {
    opacity: .5;
}
.filters button {
    white-space: nowrap;
}
#notice {
    color: #ff9d9d;
    min-height: 20px;
}
#count {
    color: #b8b8be;
}
.cards {
    display: grid;
    gap: 15px;
}
.card {
    padding: 20px;
    border-radius: 14px;
    background: #1d1c21;
    border: 1px solid #45454b;
    overflow-wrap: anywhere;
}
.card h3 {
    margin: 0 0 12px;
    font-size: 18px;
}
.details {
    color: #b8b8be;
    line-height: 1.9;
}
.status {
    display: inline-block;
    padding: 5px 12px;
    background: #34343a;
    border-radius: 20px;
    color: white;
    font-size: 12px;
}
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
}
.empty {
    text-align: center;
    color: #b8b8be;
    padding: 40px 15px;
    border: 1px dashed #45454b;
    border-radius: 14px;
}
@media(min-width:750px) {
    .cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
@media(max-width:500px) {
    header {
        padding: 15px;
    }
    header h1 {
        font-size: 16px;
    }
    main {
        padding: 15px;
    }
}
</style>
</head>
<body>
<header>
    <h1>ANKA TV+ Kullanıcı Yönetimi</h1>
    <a href="/admin">Ana Panele Dön</a>
</header>
<main>
    <p id="count">Kullanıcılar yükleniyor...</p>

    <input
        type="search"
        id="search"
        placeholder="Kullanıcı adı veya e-posta ara"
        autocomplete="off"
    >

    <div class="filters">
        <button data-filter="pending">Onay Bekleyen</button>
        <button class="secondary" data-filter="approved">Onaylanan</button>
        <button class="secondary" data-filter="rejected">Reddedilen</button>
        <button class="secondary" data-filter="disabled">Pasif</button>
        <button class="secondary" data-filter="all">Tümü</button>
    </div>

    <p id="notice" role="status"></p>
    <div id="cards" class="cards"></div>
</main>

<script>
let filter = "pending";
let users = [];

const el = id => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[c]
    );
}

function statusText(status) {
    return ({
        pending: "Onay Bekliyor",
        approved: "Onaylandı",
        rejected: "Reddedildi",
        disabled: "Pasif"
    })[status] || status;
}

async function api(action, body) {
    const isPost = body !== undefined;

    const url = "/admin/users/api?action=" +
        encodeURIComponent(action) +
        (isPost
            ? ""
            : "&status=" + encodeURIComponent(filter));

    const response = await fetch(url, {
        method: isPost ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: isPost
            ? {
                "Content-Type": "application/json",
                "X-Anka-Admin": "1"
            }
            : {},
        body: isPost ? JSON.stringify(body) : undefined
    });

    let result;

    try {
        result = await response.json();
    } catch (_) {
        throw new Error(
            "Sunucudan geçerli JSON yanıtı alınamadı."
        );
    }

    if (!response.ok || !result.success) {
        throw new Error(
            result.error || "İşlem başarısız."
        );
    }

    return result;
}

function render() {
    const search = el("search")
        .value
        .toLocaleLowerCase("tr-TR");

    const filtered = users.filter(user => {
        const value = (
            user.username + " " + user.email
        ).toLocaleLowerCase("tr-TR");

        return value.includes(search);
    });

    el("count").textContent =
        filtered.length + " kullanıcı gösteriliyor";

    if (!filtered.length) {
        el("cards").innerHTML =
            '<div class="empty">Kullanıcı bulunamadı.</div>';
        return;
    }

    el("cards").innerHTML = filtered.map(user => {
        let buttons = "";

        for (const status of [
            "approved",
            "rejected",
            "disabled"
        ]) {
            if (user.status === status) {
                continue;
            }

            const label =
                status === "approved"
                    ? "Onayla"
                    : status === "rejected"
                        ? "Reddet"
                        : "Pasif Yap";

            buttons +=
                '<button class="' +
                (status === "disabled"
                    ? "danger"
                    : "secondary") +
                '" data-id="' +
                escapeHtml(user.id) +
                '" data-status="' +
                status +
                '">' +
                label +
                '</button>';
        }

        if (user.device_bound) {
            buttons +=
                '<button class="secondary" data-id="' +
                escapeHtml(user.id) +
                '" data-reset="1">Cihazı Sıfırla</button>';
        }

        const created = Number(user.created_at);

        const createdText = Number.isFinite(created)
            ? new Date(created * 1000)
                .toLocaleString("tr-TR")
            : "-";

        return '<article class="card">' +
            '<h3>' + escapeHtml(user.username) + '</h3>' +
            '<div class="details">' +
            'E-posta: ' + escapeHtml(user.email) +
            '<div>Durum: <span class="status">' +
            escapeHtml(statusText(user.status)) +
            '</span></div>' +
            '<div>Kayıt: ' +
            escapeHtml(createdText) +
            '</div>' +
            '<div>Cihaz: ' +
            (user.device_bound
                ? "Bağlı"
                : "Bağlı değil") +
            '</div>' +
            '</div>' +
            '<div class="actions">' +
            buttons +
            '</div>' +
            '</article>';
    }).join("");
}

async function loadUsers() {
    el("notice").textContent = "";

    try {
        const result = await api("list");

        users = Array.isArray(result.items)
            ? result.items
            : [];

        render();
    } catch (e) {
        el("notice").textContent = e.message;
    }
}

document.querySelectorAll("[data-filter]")
    .forEach(button => {
        button.addEventListener("click", () => {
            filter = button.dataset.filter;

            document.querySelectorAll("[data-filter]")
                .forEach(item => {
                    item.className =
                        item === button
                            ? ""
                            : "secondary";
                });

            loadUsers();
        });
    });

el("search").addEventListener("input", render);

el("cards").addEventListener("click", async event => {
    const button = event.target.closest(
        "button[data-id]"
    );

    if (!button) {
        return;
    }

    const id = button.dataset.id;
    const reset = button.dataset.reset === "1";
    const status = button.dataset.status;

    const message = reset
        ? "Cihaz bağlantısı sıfırlansın mı? Mevcut oturumlar kapatılacak."
        : "Kullanıcı durumu " +
          statusText(status) +
          " olarak değiştirilsin mi?";

    if (!confirm(message)) {
        return;
    }

    button.disabled = true;

    try {
        if (reset) {
            await api("reset-device", { id });
        } else {
            await api("status", { id, status });
        }

        await loadUsers();
    } catch (e) {
        el("notice").textContent = e.message;
    } finally {
        button.disabled = false;
    }
});

loadUsers();
</script>
</body>
</html>`;
}

async function registerUser(request, env) {
    if (request.method !== "POST") {
        return error("POST gerekli.", 405);
    }

    let body;

    try {
        body = await readBody(request);
    } catch (e) {
        return error(e.message, 400);
    }

    const device = await getDeviceHash(request);

    if (!device) {
        return error(
            "Geçerli cihaz kimliği gerekli.",
            422
        );
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
        return error(
            "Kullanıcı adı 3-40 karakter olmalıdır.",
            422
        );
    }

    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return error(
            "Geçerli e-posta adresi giriniz.",
            422
        );
    }

    if (
        password.length < 12 ||
        password.length > 128
    ) {
        return error(
            "Şifre 12-128 karakter olmalıdır.",
            422
        );
    }

    const salt = randomSalt();
    const hash = await passwordHash(password, salt);
    const now = Math.floor(Date.now() / 1000);

    try {
        await env.DB.prepare(`
            INSERT INTO app_users (
                id,
                username,
                email,
                password_hash,
                password_salt,
                status,
                created_at,
                device_hash,
                device_bound_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            crypto.randomUUID(),
            username,
            email,
            hash,
            salt,
            "pending",
            now,
            device,
            now
        ).run();

        return json({
            success: true,
            status: "pending",
            message:
                "Kayıt başarılı. Yönetici onayı bekleniyor."
        }, 201);

    } catch (e) {
        const message = String(
            e?.message || e
        );

        console.error(
            "ANKA_REGISTER_ERROR",
            message
        );

        if (
            /UNIQUE constraint failed.*device_hash/i.test(message) ||
            /idx_app_users_device_hash/i.test(message)
        ) {
            return error(
                "Bu cihazda zaten bir hesap bulunmaktadır.",
                409
            );
        }

        if (/UNIQUE constraint failed/i.test(message)) {
            return error(
                "Kullanıcı adı veya e-posta zaten kayıtlı.",
                409
            );
        }

        return error(
            "Kayıt sırasında veritabanı hatası oluştu.",
            500
        );
    }
}

async function listUsers(request, env) {
    if (request.method !== "GET") {
        return error("GET gerekli.", 405);
    }

    const status = new URL(request.url)
        .searchParams.get("status") || "pending";

    const allowed = [
        "pending",
        "approved",
        "rejected",
        "disabled",
        "all"
    ];

    if (!allowed.includes(status)) {
        return error(
            "Geçersiz filtre.",
            400
        );
    }

    const sql = `
        SELECT
            id,
            username,
            email,
            status,
            created_at,
            reviewed_at,
            CASE
                WHEN device_hash IS NULL THEN 0
                ELSE 1
            END AS device_bound
        FROM app_users
        ${status === "all"
            ? ""
            : "WHERE status = ?"}
        ORDER BY created_at DESC
        LIMIT 500
    `;

    const statement = env.DB.prepare(sql);

    const result = await (
        status === "all"
            ? statement
            : statement.bind(status)
    ).all();

    return json({
        success: true,
        items: result.results || []
    });
}

async function updateStatus(request, env, admin) {
    if (request.method !== "POST") {
        return error("POST gerekli.", 405);
    }

    if (!verifyAdminRequest(request)) {
        return error(
            "Yetkisiz yönetici isteği.",
            403
        );
    }

    let body;

    try {
        body = await readBody(request);
    } catch (e) {
        return error(e.message, 400);
    }

    const id = String(body.id ?? "");
    const status = String(body.status ?? "");

    if (
        !/^[0-9a-f-]{36}$/i.test(id) ||
        ![
            "approved",
            "rejected",
            "disabled"
        ].includes(status)
    ) {
        return error(
            "Geçersiz kullanıcı işlemi.",
            422
        );
    }

    const now = Math.floor(Date.now() / 1000);

    const result = await env.DB.batch([
        env.DB.prepare(`
            UPDATE app_users
            SET
                status = ?,
                reviewed_at = ?,
                reviewed_by = ?
            WHERE id = ?
        `).bind(
            status,
            now,
            String(admin.id),
            id
        ),
        env.DB.prepare(`
            UPDATE app_sessions
            SET revoked_at = ?
            WHERE
                user_id = ?
                AND revoked_at IS NULL
                AND ? != 'approved'
        `).bind(
            now,
            id,
            status
        )
    ]);

    if (!result[0]?.meta?.changes) {
        return error(
            "Kullanıcı bulunamadı.",
            404
        );
    }

    return json({
        success: true,
        message: "Kullanıcı güncellendi."
    });
}

async function resetDevice(request, env) {
    if (request.method !== "POST") {
        return error("POST gerekli.", 405);
    }

    if (!verifyAdminRequest(request)) {
        return error(
            "Yetkisiz yönetici isteği.",
            403
        );
    }

    let body;

    try {
        body = await readBody(request);
    } catch (e) {
        return error(e.message, 400);
    }

    const id = String(body.id ?? "");

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return error(
            "Geçersiz kullanıcı kimliği.",
            422
        );
    }

    const now = Math.floor(Date.now() / 1000);

    const result = await env.DB.batch([
        env.DB.prepare(`
            UPDATE app_users
            SET
                device_hash = NULL,
                device_bound_at = NULL
            WHERE id = ?
        `).bind(id),
        env.DB.prepare(`
            UPDATE app_sessions
            SET revoked_at = ?
            WHERE
                user_id = ?
                AND revoked_at IS NULL
        `).bind(now, id)
    ]);

    if (!result[0]?.meta?.changes) {
        return error(
            "Kullanıcı bulunamadı.",
            404
        );
    }

    return json({
        success: true,
        message:
            "Cihaz sıfırlandı. Yeni girişte cihaz yeniden bağlanacak."
    });
}

export async function handleAnkaUsers(
    request,
    env,
    getAdmin
) {
    if (!env.DB) {
        return error(
            "Cloudflare D1 veritabanı bulunamadı.",
            503
        );
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const action = url.searchParams.get("action");

    try {
        // Eski kullanıcı yönetimi adresini yeni adrese yönlendir.
        if (path === "/admin/users") {
            return new Response(null, {
                status: 302,
                headers: {
                    Location: "/admin/manage",
                    "Cache-Control": "no-store"
                }
            });
        }

        // Android kayıt işlemi.
        if (path === "/api/app/register") {
            return await registerUser(request, env);
        }

        // Yönetici yetkilendirmesi.
        if (typeof getAdmin !== "function") {
            return error(
                "Yönetici doğrulama fonksiyonu bulunamadı.",
                500
            );
        }

        const admin = await getAdmin(request, env);

        if (!admin) {
            if (path === "/admin/manage") {
                return new Response(null, {
                    status: 303,
                    headers: {
                        Location: "/admin",
                        "Cache-Control": "no-store"
                    }
                });
            }

            return error(
                "Yönetici oturumu gerekli.",
                401
            );
        }

        // Yönetici paneli.
        if (path === "/admin/manage") {
            if (request.method !== "GET") {
                return error("GET gerekli.", 405);
            }

            return new Response(htmlPage(), {
                status: 200,
                headers: {
                    "Content-Type":
                        "text/html; charset=utf-8",
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

        // Yönetici API.
        if (path === "/admin/users/api") {
            if (action === "list") {
                return await listUsers(request, env);
            }

            if (action === "status") {
                return await updateStatus(
                    request,
                    env,
                    admin
                );
            }

            if (action === "reset-device") {
                return await resetDevice(
                    request,
                    env
                );
            }

            return error(
                "Bilinmeyen işlem.",
                404
            );
        }

        return error(
            "Sayfa bulunamadı.",
            404
        );

    } catch (e) {
        console.error(
            "ANKA_USERS_ERROR",
            e?.name,
            e?.message
        );

        return error(
            "Sunucu işlemi tamamlanamadı.",
            500
        );
    }
}
