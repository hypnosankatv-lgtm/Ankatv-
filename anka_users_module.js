
const ANKA_USERS_MAX_BODY = 8192;
const ANKA_USERS_PBKDF2_ITERATIONS = 100000;
const ANKA_USERS_ENCODER = new TextEncoder();

function usersJson(data, status = 200) {
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

function usersError(message, status = 400) {
    return usersJson({
        success: false,
        error: message
    }, status);
}

function usersHex(bytes) {
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function usersSha256(value) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        ANKA_USERS_ENCODER.encode(String(value))
    );

    return usersHex(new Uint8Array(digest));
}

function usersRandomSalt() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return usersHex(bytes);
}

async function usersPasswordHash(password, salt) {
    const key = await crypto.subtle.importKey(
        "raw",
        ANKA_USERS_ENCODER.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: ANKA_USERS_ENCODER.encode(salt),
            iterations: ANKA_USERS_PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        key,
        256
    );

    return usersHex(new Uint8Array(bits));
}

async function usersDeviceHash(request) {
    const deviceId = String(
        request.headers.get("X-Anka-Device-Id") || ""
    ).trim().toLowerCase();

    const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    const legacyPattern = /^[0-9a-f]{16}$/;

    if (
        !uuidPattern.test(deviceId) &&
        !legacyPattern.test(deviceId)
    ) {
        return null;
    }

    return await usersSha256(
        "anka-device-v1:" + deviceId
    );
}

async function usersReadJson(request) {
    const contentType = String(
        request.headers.get("Content-Type") || ""
    ).toLowerCase();

    if (!contentType.startsWith("application/json")) {
        throw new Error("JSON içerik türü gerekli.");
    }

    const length = Number(
        request.headers.get("Content-Length") || 0
    );

    if (
        !Number.isFinite(length) ||
        length > ANKA_USERS_MAX_BODY
    ) {
        throw new Error("İstek boyutu geçersiz.");
    }

    const raw = await request.text();

    if (
        ANKA_USERS_ENCODER.encode(raw).byteLength >
        ANKA_USERS_MAX_BODY
    ) {
        throw new Error("İstek verisi çok büyük.");
    }

    let body;

    try {
        body = JSON.parse(raw);
    } catch (_) {
        throw new Error("Geçersiz JSON verisi.");
    }

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {
        throw new Error("JSON nesnesi gerekli.");
    }

    return body;
}

function usersValidAdminPost(request) {
    if (request.headers.get("X-Anka-Admin") !== "1") {
        return false;
    }

    const expectedOrigin = new URL(request.url).origin;
    const origin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    const fetchSite = request.headers.get("Sec-Fetch-Site");

    if (fetchSite === "cross-site") {
        return false;
    }

    if (origin && origin !== expectedOrigin) {
        return false;
    }

    if (referer) {
        try {
            if (
                new URL(referer).origin !== expectedOrigin
            ) {
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

    return true;
}

function usersValidId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(id || "")
    );
}

function usersPage() {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ANKA TV+ - Kullanıcı Yönetimi</title>
<style>
:root {
    color-scheme: dark;
    --background: #151419;
    --surface: #1d1c21;
    --primary: #2db88a;
    --border: #45454b;
    --secondary: #b8b8be;
}
* {
    box-sizing: border-box;
}
body {
    margin: 0;
    min-height: 100vh;
    background: var(--background);
    color: #fff;
    font-family: Arial, sans-serif;
    font-size: 14px;
}
button, input {
    font: inherit;
}
button {
    cursor: pointer;
    border: 0;
    border-radius: 10px;
    padding: 11px 15px;
    background: var(--primary);
    color: #102119;
    font-weight: 700;
    min-height: 40px;
}
button:disabled {
    opacity: .5;
    cursor: not-allowed;
}
.topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 68px;
    padding: 15px 22px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
}
.brand {
    font-size: 21px;
    color: var(--primary);
    font-weight: 800;
}
.back {
    color: var(--primary);
    text-decoration: none;
    font-weight: 700;
    white-space: nowrap;
}
main {
    max-width: 1150px;
    margin: auto;
    padding: 25px 20px;
}
.heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 18px;
}
.heading h1 {
    margin: 0;
    font-size: 23px;
}
.refresh {
    background: #303038;
    color: #fff;
}
.summary {
    color: var(--secondary);
    margin: 0 0 20px;
}
.search {
    display: block;
    width: 100%;
    padding: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: #fff;
    outline: none;
    font-size: 15px;
}
.search:focus {
    border-color: var(--primary);
}
.filters {
    display: flex;
    gap: 9px;
    overflow-x: auto;
    padding: 20px 0;
}
.filters button {
    white-space: nowrap;
    background: #303038;
    color: #fff;
}
.filters button.selected {
    background: var(--primary);
    color: #102119;
}
.notice {
    min-height: 20px;
    color: #a5ebc9;
    margin: 0 0 15px;
    overflow-wrap: anywhere;
}
.notice.error {
    color: #ff9999;
}
.cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 15px;
}
.card {
    min-width: 0;
    padding: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 15px;
    overflow-wrap: anywhere;
}
.card h3 {
    margin: 0 0 12px;
    font-size: 18px;
}
.detail {
    color: var(--secondary);
    line-height: 1.9;
    font-size: 13px;
}
.status {
    display: inline-block;
    padding: 4px 11px;
    border-radius: 20px;
    background: #34343a;
    color: #fff;
    font-size: 12px;
}
.status.approved {
    background: #203d31;
    color: #9df2c8;
}
.status.pending {
    background: #504126;
    color: #ffe0a0;
}
.status.rejected,
.status.disabled {
    background: #503036;
    color: #ffb6c1;
}
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 17px;
}
.actions button {
    font-size: 12px;
    padding: 9px 12px;
    min-height: 38px;
}
.secondary {
    background: #33323a;
    color: #fff;
}
.danger {
    background: #62343c;
    color: #fff;
}
.empty {
    grid-column: 1 / -1;
    padding: 40px 20px;
    text-align: center;
    color: var(--secondary);
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: 15px;
}
@media(max-width:750px) {
    .cards {
        grid-template-columns: 1fr;
    }
    .topbar {
        padding: 15px;
    }
    .brand {
        font-size: 17px;
    }
    main {
        padding: 20px 14px;
    }
    .heading h1 {
        font-size: 20px;
    }
}
</style>
</head>
<body>
<header class="topbar">
    <div class="brand">ANKA TV+</div>
    <a class="back" href="/admin/manage">Ana Panele Dön</a>
</header>

<main>
    <div class="heading">
        <h1>Kullanıcı Yönetimi</h1>
        <button class="refresh" id="refresh" type="button">
            Yenile
        </button>
    </div>

    <p class="summary" id="summary">
        Kullanıcılar yükleniyor...
    </p>

    <input
        id="search"
        class="search"
        type="search"
        placeholder="Kullanıcı adı veya e-posta ara..."
        autocomplete="off"
    >

    <div class="filters">
        <button class="selected" data-filter="pending">
            Onay Bekleyen
        </button>
        <button data-filter="approved">
            Onaylanan
        </button>
        <button data-filter="rejected">
            Reddedilen
        </button>
        <button data-filter="disabled">
            Pasif
        </button>
        <button data-filter="all">
            Tümü
        </button>
    </div>

    <p id="notice" class="notice" role="status"></p>

    <section id="cards" class="cards"></section>
</main>

<script>
let currentFilter = "pending";
let users = [];

const byId = id => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );
}

function statusLabel(status) {
    const labels = {
        pending: "Onay Bekliyor",
        approved: "Onaylandı",
        rejected: "Reddedildi",
        disabled: "Pasif"
    };

    return labels[status] || status;
}

function showNotice(message, isError = false) {
    const element = byId("notice");
    element.textContent = message;
    element.classList.toggle("error", isError);
}

async function api(action, body) {
    const isPost = body !== undefined;

    const params = new URLSearchParams({
        action: action
    });

    if (!isPost) {
        params.set("status", currentFilter);
    }

    const response = await fetch(
        "/admin/users/api?" + params.toString(),
        {
            method: isPost ? "POST" : "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: isPost
                ? {
                    "Content-Type": "application/json",
                    "X-Anka-Admin": "1"
                }
                : {},
            body: isPost
                ? JSON.stringify(body)
                : undefined
        }
    );

    let result;

    try {
        result = await response.json();
    } catch (_) {
        throw new Error(
            "API geçerli JSON döndürmedi. HTTP " +
            response.status
        );
    }

    if (!response.ok || !result.success) {
        throw new Error(
            result.error ||
            "İşlem başarısız. HTTP " +
            response.status
        );
    }

    return result;
}

function render() {
    const query = byId("search")
        .value
        .trim()
        .toLocaleLowerCase("tr-TR");

    const filtered = users.filter(user => {
        const value = (
            String(user.username || "") +
            " " +
            String(user.email || "")
        ).toLocaleLowerCase("tr-TR");

        return value.includes(query);
    });

    byId("summary").textContent =
        filtered.length +
        " kullanıcı gösteriliyor";

    if (!filtered.length) {
        byId("cards").innerHTML =
            '<div class="empty">Kullanıcı bulunamadı.</div>';
        return;
    }

    byId("cards").innerHTML = filtered.map(user => {
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

        if (Number(user.device_bound) === 1) {
            buttons +=
                '<button class="secondary" data-id="' +
                escapeHtml(user.id) +
                '" data-reset="1">' +
                'Cihazı Sıfırla</button>';
        }

        const createdAt = Number(user.created_at);

        const createdText =
            Number.isFinite(createdAt) &&
            createdAt > 0
                ? new Date(createdAt * 1000)
                    .toLocaleString("tr-TR")
                : "-";

        return '<article class="card">' +
            '<h3>' +
            escapeHtml(user.username) +
            '</h3>' +
            '<div class="detail">' +
            '<div>E-posta: ' +
            escapeHtml(user.email) +
            '</div>' +
            '<div>Durum: <span class="status ' +
            escapeHtml(user.status) +
            '">' +
            escapeHtml(statusLabel(user.status)) +
            '</span></div>' +
            '<div>Kayıt: ' +
            escapeHtml(createdText) +
            '</div>' +
            '<div>Cihaz: ' +
            (Number(user.device_bound) === 1
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
    showNotice("Kullanıcılar yükleniyor...");

    try {
        const result = await api("list");

        users = Array.isArray(result.items)
            ? result.items
            : [];

        showNotice("");
        render();

    } catch (error) {
        users = [];
        render();
        showNotice(error.message, true);
    }
}

document.querySelectorAll("[data-filter]")
    .forEach(button => {
        button.addEventListener("click", () => {
            currentFilter = button.dataset.filter;

            document.querySelectorAll("[data-filter]")
                .forEach(item => {
                    item.classList.toggle(
                        "selected",
                        item === button
                    );
                });

            loadUsers();
        });
    });

byId("search").addEventListener("input", render);
byId("refresh").addEventListener("click", loadUsers);

byId("cards").addEventListener("click", async event => {
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
        ? "Cihaz bağlantısı sıfırlansın mı? Mevcut oturumlar da kapatılacak."
        : "Kullanıcı durumu " +
          statusLabel(status) +
          " olarak değiştirilsin mi?";

    if (!confirm(message)) {
        return;
    }

    button.disabled = true;

    try {
        if (reset) {
            await api("reset-device", {
                id: id
            });
        } else {
            await api("status", {
                id: id,
                status: status
            });
        }

        await loadUsers();

    } catch (error) {
        showNotice(error.message, true);
    } finally {
        button.disabled = false;
    }
});

loadUsers();
</script>
</body>
</html>`;
}

async function usersRegister(request, env) {
    if (request.method !== "POST") {
        return usersError("POST gerekli.", 405);
    }

    let body;

    try {
        body = await usersReadJson(request);
    } catch (error) {
        return usersError(error.message, 400);
    }

    const deviceHash = await usersDeviceHash(request);

    if (!deviceHash) {
        return usersError(
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
        return usersError(
            "Kullanıcı adı 3-40 karakter olmalıdır.",
            422
        );
    }

    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return usersError(
            "Geçerli e-posta adresi giriniz.",
            422
        );
    }

    if (
        password.length < 12 ||
        password.length > 128
    ) {
        return usersError(
            "Şifre 12-128 karakter olmalıdır.",
            422
        );
    }

    const salt = usersRandomSalt();
    const passwordHash = await usersPasswordHash(
        password,
        salt
    );

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
            passwordHash,
            salt,
            "pending",
            now,
            deviceHash,
            now
        ).run();

        return usersJson({
            success: true,
            status: "pending",
            message:
                "Kayıt başarılı. Yönetici onayı bekleniyor."
        }, 201);

    } catch (error) {
        const message = String(
            error?.message || error
        );

        console.error(
            "ANKA_USERS_REGISTER_ERROR",
            message
        );

        if (
            /UNIQUE constraint failed.*device_hash/i.test(message) ||
            /idx_app_users_device_hash/i.test(message)
        ) {
            return usersError(
                "Bu cihazda zaten bir hesap oluşturulmuş.",
                409
            );
        }

        if (/UNIQUE constraint failed/i.test(message)) {
            return usersError(
                "Kullanıcı adı veya e-posta zaten kayıtlı.",
                409
            );
        }

        return usersError(
            "Kayıt sırasında veritabanı hatası oluştu.",
            500
        );
    }
}

async function usersList(request, env) {
    if (request.method !== "GET") {
        return usersError("GET gerekli.", 405);
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
        return usersError(
            "Geçersiz kullanıcı filtresi.",
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

    return usersJson({
        success: true,
        items: result.results || []
    });
}

async function usersUpdateStatus(request, env, admin) {
    if (request.method !== "POST") {
        return usersError("POST gerekli.", 405);
    }

    if (!usersValidAdminPost(request)) {
        return usersError(
            "Geçersiz yönetici istek kaynağı.",
            403
        );
    }

    let body;

    try {
        body = await usersReadJson(request);
    } catch (error) {
        return usersError(error.message, 400);
    }

    const id = String(body.id ?? "");
    const status = String(body.status ?? "");

    if (
        !usersValidId(id) ||
        ![
            "approved",
            "rejected",
            "disabled"
        ].includes(status)
    ) {
        return usersError(
            "Geçersiz kullanıcı işlemi.",
            422
        );
    }

    const existing = await env.DB.prepare(`
        SELECT id, status
        FROM app_users
        WHERE id = ?
        LIMIT 1
    `).bind(id).first();

    if (!existing) {
        return usersError(
            "Kullanıcı bulunamadı.",
            404
        );
    }

    const now = Math.floor(Date.now() / 1000);

    await env.DB.batch([
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

    return usersJson({
        success: true,
        message: "Kullanıcı durumu güncellendi."
    });
}

async function usersResetDevice(request, env) {
    if (request.method !== "POST") {
        return usersError("POST gerekli.", 405);
    }

    if (!usersValidAdminPost(request)) {
        return usersError(
            "Geçersiz yönetici istek kaynağı.",
            403
        );
    }

    let body;

    try {
        body = await usersReadJson(request);
    } catch (error) {
        return usersError(error.message, 400);
    }

    const id = String(body.id ?? "");

    if (!usersValidId(id)) {
        return usersError(
            "Geçersiz kullanıcı kimliği.",
            422
        );
    }

    const existing = await env.DB.prepare(`
        SELECT id
        FROM app_users
        WHERE id = ?
        LIMIT 1
    `).bind(id).first();

    if (!existing) {
        return usersError(
            "Kullanıcı bulunamadı.",
            404
        );
    }

    const now = Math.floor(Date.now() / 1000);

    await env.DB.batch([
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

    return usersJson({
        success: true,
        message:
            "Cihaz bağlantısı sıfırlandı. Yeni girişte cihaz tekrar bağlanacak."
    });
}

export async function handleAnkaUsers(
    request,
    env,
    getAdmin
) {
    if (!env.DB) {
        return usersError(
            "Cloudflare D1 DB bağlantısı bulunamadı.",
            503
        );
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const action = url.searchParams.get("action");

    try {
        if (path === "/api/app/register") {
            return await usersRegister(request, env);
        }

        if (typeof getAdmin !== "function") {
            return usersError(
                "Yönetici doğrulama fonksiyonu bulunamadı.",
                500
            );
        }

        const admin = await getAdmin(request, env);

        if (!admin) {
            if (path === "/admin/users") {
                return new Response(null, {
                    status: 303,
                    headers: {
                        "Location": "/admin",
                        "Cache-Control": "no-store"
                    }
                });
            }

            return usersError(
                "Yönetici oturumu gerekli.",
                401
            );
        }

        if (path === "/admin/users") {
            if (request.method !== "GET") {
                return usersError(
                    "GET gerekli.",
                    405
                );
            }

            return new Response(usersPage(), {
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

        if (path === "/admin/users/api") {
            if (action === "list") {
                return await usersList(
                    request,
                    env
                );
            }

            if (action === "status") {
                return await usersUpdateStatus(
                    request,
                    env,
                    admin
                );
            }

            if (action === "reset-device") {
                return await usersResetDevice(
                    request,
                    env
                );
            }

            return usersError(
                "Bilinmeyen kullanıcı işlemi.",
                404
            );
        }

        return usersError(
            "Kullanıcı yönetimi adresi bulunamadı.",
            404
        );

    } catch (error) {
        const errorId = crypto.randomUUID();

        console.error(
            "ANKA_USERS_ERROR",
            JSON.stringify({
                errorId: errorId,
                path: path,
                name: error?.name || "Error",
                message: String(
                    error?.message || error
                )
            })
        );

        return usersError(
            "Kullanıcı yönetimi sunucu hatası. Hata kodu: " +
            errorId,
            500
        );
    }
}
