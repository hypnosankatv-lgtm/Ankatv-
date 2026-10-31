
// ANKA TV+ - Kullanıcı Kayıt ve Yönetim Modülü
// Yönetim paneli: /admin/manage
// Cihaz kilidi: UUID ve eski 16 karakterlik kimlik desteği

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
        .map(v => v.toString(16).padStart(2, "0"))
        .join("");
}

function randomSalt() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

async function sha256(value) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(value)
    );

    return bytesToHex(new Uint8Array(digest));
}

async function deviceHash(request) {
    const id = (
        request.headers.get("X-Anka-Device-Id") || ""
    ).trim().toLowerCase();

    const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    const legacyPattern = /^[0-9a-f]{16}$/;

    if (
        !uuidPattern.test(id) &&
        !legacyPattern.test(id)
    ) {
        return null;
    }

    return await sha256("anka-device-v1:" + id);
}

async function derivePassword(password, salt) {
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

    return bytesToHex(new Uint8Array(bits));
}

function safeAdminPost(request) {
    const expected = new URL(request.url).origin;
    const origin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    const fetchSite = request.headers.get("Sec-Fetch-Site");

    if (fetchSite === "cross-site") {
        return false;
    }

    if (
        origin &&
        origin !== "null" &&
        origin !== expected
    ) {
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
    const type = (
        request.headers.get("Content-Type") || ""
    ).toLowerCase();

    if (!type.startsWith("application/json")) {
        throw new Error("JSON içerik türü gerekli.");
    }

    const length = Number(
        request.headers.get("Content-Length") || 0
    );

    if (length > MAX_BODY_BYTES) {
        throw new Error("İstek verisi çok büyük.");
    }

    const raw = await request.text();

    if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) {
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
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANKA TV+ Kullanıcı Yönetimi</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#151419;color:#fff;font-family:Arial,sans-serif;font-size:15px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px;background:#1d1c21;border-bottom:1px solid #45454b}
h1{margin:0;color:#2db88a;font-size:20px}
header a{color:#2db88a;text-decoration:none}
main{max-width:1100px;margin:auto;padding:18px}
.count,.meta{color:#b8b8be}
.search{display:block;width:100%;padding:14px;background:#1d1c21;border:1px solid #45454b;border-radius:12px;color:#fff;font-size:16px}
.filters{display:flex;gap:9px;overflow-x:auto;margin:20px 0;padding-bottom:5px}
button{border:0;border-radius:11px;padding:12px 15px;background:#2db88a;color:#10231a;font-weight:bold;cursor:pointer}
button.alt{background:#303038;color:#fff}
button.danger{background:#62343c;color:#fff}
button:disabled{opacity:.5}
.filters button{white-space:nowrap}
#notice{min-height:20px;color:#ffaaaa}
.cards{display:grid;gap:14px}
.card{background:#1d1c21;border:1px solid #45454b;border-radius:14px;padding:18px;overflow-wrap:anywhere}
.card h3{margin:0 0 12px}
.meta{line-height:1.9}
.badge{display:inline-block;padding:5px 11px;border-radius:20px;background:#34343a;color:#fff;font-size:12px}
.actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px}
.empty{color:#b8b8be;text-align:center;padding:40px 15px;border:1px dashed #45454b;border-radius:14px}
@media(min-width:750px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:480px){header,main{padding:15px}h1{font-size:16px}button{padding:12px}}
</style>
</head>
<body>
<header>
    <h1>ANKA TV+ - Kullanıcı Yönetimi</h1>
    <a href="/admin">Panele Dön</a>
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
    const post = data !== undefined;

    const response = await fetch(
        "/admin/users/api?action=" +
        encodeURIComponent(action) +
        (post ? "" : "&status=" + encodeURIComponent(currentStatus)),
        {
            method: post ? "POST" : "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: post
                ? {
                    "Content-Type": "application/json",
                    "X-Anka-Admin": "1"
                }
                : {},
            body: post ? JSON.stringify(data) : undefined
        }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.error || "İşlem başarısız."
        );
    }

    return result;
}

function statusName(status) {
    return ({
        pending: "Onay Bekliyor",
        approved: "Onaylandı",
        rejected: "Reddedildi",
        disabled: "Pasif"
    })[status] || status;
}

function render() {
    const query = $("search")
        .value
        .toLocaleLowerCase("tr-TR");

    const rows = users.filter(user => (
        user.username + " " + user.email
    ).toLocaleLowerCase("tr-TR").includes(query));

    $("count").textContent =
        users.length + " kullanıcı";

    if (!rows.length) {
        $("rows").innerHTML =
            '<div class="empty">Bu bölümde kullanıcı bulunamadı.</div>';
        return;
    }

    $("rows").innerHTML = rows.map(user => {
        let actions = "";

        for (const status of [
            "approved",
            "rejected",
            "disabled"
        ]) {
            if (user.status !== status) {
                actions +=
                    '<button class="' +
                    (status === "disabled" ? "danger" : "alt") +
                    '" data-id="' + esc(user.id) +
                    '" data-status="' + status + '">' +
                    (status === "approved"
                        ? "Onayla"
                        : status === "rejected"
                            ? "Reddet"
                            : "Pasif Yap") +
                    '</button>';
            }
        }

        if (user.device_bound) {
            actions +=
                '<button class="alt" data-id="' +
                esc(user.id) +
                '" data-reset="1">Cihazı Sıfırla</button>';
        }

        return '<article class="card">' +
            '<h3>' + esc(user.username) + '</h3>' +
            '<div class="meta">' +
            'E-posta: ' + esc(user.email) +
            '<div><span class="badge">' +
            esc(statusName(user.status)) +
            '</span></div>' +
            'Kayıt: ' +
            esc(new Date(Number(user.created_at) * 1000)
                .toLocaleString("tr-TR")) +
            '<div>Cihaz: ' +
            (user.device_bound
                ? "Bağlı"
                : "Henüz bağlanmadı") +
            '</div></div>' +
            '<div class="actions">' +
            actions +
            '</div></article>';
    }).join("");
}

async function load() {
    $("notice").textContent = "";

    try {
        const result = await api("list");
        users = result.items || [];
        render();
    } catch (e) {
        $("notice").textContent = e.message;
    }
}

document.querySelectorAll(".filters button")
    .forEach(button => {
        button.addEventListener("click", () => {
            currentStatus = button.dataset.filter;

            document.querySelectorAll(".filters button")
                .forEach(item => {
                    item.className =
                        item === button ? "" : "alt";
                });

            load();
        });
    });

$("search").addEventListener("input", render);

$("rows").addEventListener("click", async event => {
    const button = event.target.closest("button[data-id]");

    if (!button) {
        return;
    }

    const reset = button.dataset.reset === "1";
    const next = button.dataset.status;

    const question = reset
        ? "Cihaz bağlantısı sıfırlansın mı? Kullanıcının mevcut oturumları da kapatılacak."
        : "Kullanıcının durumu " +
          statusName(next) +
          " olarak değiştirilsin mi?";

    if (!confirm(question)) {
        return;
    }

    button.disabled = true;

    try {
        await api(
            reset ? "reset-device" : "status",
            reset
                ? { id: button.dataset.id }
                : {
                    id: button.dataset.id,
                    status: next
                }
        );

        await load();

    } catch (e) {
        $("notice").textContent = e.message;
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
    } catch (e) {
        return err(e.message, 400);
    }

    const hashDevice = await deviceHash(request);

    if (!hashDevice) {
        return err(
            "Geçerli cihaz kimliği gerekli. Uygulamayı güncelleyin.",
            422
        );
    }

    const username = String(body.username ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!/^[a-zA-Z0-9_]{3,40}$/.test(username)) {
        return err(
            "Kullanıcı adı 3-40 karakter olmalıdır.",
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

    const salt = randomSalt();
    const hash = await derivePassword(password, salt);
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
            hashDevice,
            now
        ).run();

        return json({
            success: true,
            status: "pending",
            message:
                "Kayıt başarılı. Hesabınız yönetici onayı bekliyor."
        }, 201);

    } catch (e) {
        const message = String(e?.message || e);

        console.error(
            "ANKA_REGISTER_DATABASE_ERROR",
            message
        );

        if (
            /UNIQUE constraint failed.*device_hash/i.test(message) ||
            /idx_app_users_device_hash/i.test(message)
        ) {
            return err(
                "Bu cihazda zaten bir hesap oluşturulmuş.",
                409
            );
        }

        if (/UNIQUE constraint failed/i.test(message)) {
            return err(
                "Kullanıcı adı veya e-posta zaten kayıtlı.",
                409
            );
        }

        return err(
            "Kayıt veritabanına yazılamadı.",
            500
        );
    }
}

async function listUsers(request, env) {
    if (request.method !== "GET") {
        return err("GET gerekli.", 405);
    }

    const status =
        new URL(request.url).searchParams.get("status") ||
        "pending";

    if (![
        "pending",
        "approved",
        "rejected",
        "disabled",
        "all"
    ].includes(status)) {
        return err(
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
        ${status === "all" ? "" : "WHERE status = ?"}
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
    } catch (e) {
        return err(e.message, 400);
    }

    const id = String(body.id ?? "");
    const status = String(body.status ?? "");

    if (
        !/^[0-9a-f-]{36}$/i.test(id) ||
        !["approved", "rejected", "disabled"].includes(status)
    ) {
        return err(
            "Geçersiz kullanıcı işlemi.",
            422
        );
    }

    const now = Math.floor(Date.now() / 1000);

    const results = await env.DB.batch([
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
            admin.id,
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

    if (!results[0]?.meta?.changes) {
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

async function resetDevice(request, env) {
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
    } catch (e) {
        return err(e.message, 400);
    }

    const id = String(body.id ?? "");

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return err(
            "Geçersiz kullanıcı kimliği.",
            422
        );
    }

    const now = Math.floor(Date.now() / 1000);

    const results = await env.DB.batch([
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

    if (!results[0]?.meta?.changes) {
        return err(
            "Kullanıcı bulunamadı.",
            404
        );
    }

    return json({
        success: true,
        message:
            "Cihaz bağlantısı sıfırlandı. Kullanıcı ilk başarılı girişte yeni cihaza bağlanacak."
    });
}

export async function handleAnkaUsers(
    request,
    env,
    getAdmin
) {
    if (!env.DB) {
        return err(
            "Cloudflare D1 DB bağlantısı bulunamadı.",
            503
        );
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const action = url.searchParams.get("action");

    try {
        if (path === "/api/app/register") {
            return await registerUser(request, env);
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

            return err(
                "Yönetici oturumu gerekli.",
                401
            );
        }

        if (path === "/admin/manage") {
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
            return err(
                "Sayfa bulunamadı.",
                404
            );
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

        if (action === "reset-device") {
            return await resetDevice(request, env);
        }

        return err(
            "Bilinmeyen işlem.",
            404
        );

    } catch (e) {
        console.error(
            "ANKA_USERS_ERROR",
            e?.name,
            e?.message
        );

        return err(
            "Sunucu işlemi tamamlanamadı.",
            500
        );
    }
}
