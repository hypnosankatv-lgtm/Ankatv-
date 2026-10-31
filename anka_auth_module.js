
// ANKA TV+ - Kullanıcı giriş ve oturum modülü
// Cihaz kilidi: UUID ve eski 16 karakterlik kimlik desteği

const encoder = new TextEncoder();

const SESSION_SECONDS = 60 * 60 * 24 * 7;
const MAX_BODY_BYTES = 8192;
const PBKDF2_ITERATIONS = 100000;

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

function error(message, status = 400) {
    return json({
        success: false,
        error: message
    }, status);
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function sha256(value) {
    const data = encoder.encode(value);

    const digest = await crypto.subtle.digest(
        "SHA-256",
        data
    );

    return bytesToHex(new Uint8Array(digest));
}

function normalizeDeviceId(request) {
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

    return id;
}

async function deviceHash(request) {
    const id = normalizeDeviceId(request);

    if (!id) {
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

function constantTimeEqual(a, b) {
    if (
        typeof a !== "string" ||
        typeof b !== "string"
    ) {
        return false;
    }

    const left = encoder.encode(a);
    const right = encoder.encode(b);

    let difference = left.length ^ right.length;

    for (
        let i = 0;
        i < Math.max(left.length, right.length);
        i++
    ) {
        difference |=
            (left[i] || 0) ^
            (right[i] || 0);
    }

    return difference === 0;
}

function createToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    return bytesToHex(bytes);
}

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

async function readJson(request) {
    const contentType = (
        request.headers.get("Content-Type") || ""
    ).toLowerCase();

    if (!contentType.startsWith("application/json")) {
        throw new Error("JSON içeriği gerekli.");
    }

    const contentLength = Number(
        request.headers.get("Content-Length") || 0
    );

    if (contentLength > MAX_BODY_BYTES) {
        throw new Error("İstek çok büyük.");
    }

    const raw = await request.text();

    if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) {
        throw new Error("İstek çok büyük.");
    }

    let body;

    try {
        body = JSON.parse(raw);
    } catch (_) {
        throw new Error("Geçersiz JSON.");
    }

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {
        throw new Error("Geçersiz JSON nesnesi.");
    }

    return body;
}

function getBearerToken(request) {
    const authorization = (
        request.headers.get("Authorization") || ""
    ).trim();

    const match =
        /^Bearer ([0-9a-f]{64})$/i.exec(authorization);

    return match ? match[1].toLowerCase() : null;
}

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status
    };
}

async function findSession(request, env) {
    const token = getBearerToken(request);
    const hashDevice = await deviceHash(request);

    if (!token || !hashDevice) {
        return null;
    }

    const tokenHash = await sha256(token);
    const now = nowSeconds();

    const session = await env.DB.prepare(`
        SELECT
            s.token_hash,
            s.user_id,
            s.expires_at,
            u.username,
            u.email,
            u.status,
            u.device_hash
        FROM app_sessions s
        INNER JOIN app_users u
            ON u.id = s.user_id
        WHERE
            s.token_hash = ?
            AND s.revoked_at IS NULL
            AND s.expires_at > ?
        LIMIT 1
    `).bind(
        tokenHash,
        now
    ).first();

    if (!session) {
        return null;
    }

    if (session.status !== "approved") {
        return null;
    }

    if (!session.device_hash) {
        return null;
    }

    if (!constantTimeEqual(
        session.device_hash,
        hashDevice
    )) {
        return null;
    }

    return {
        tokenHash,
        user: {
            id: session.user_id,
            username: session.username,
            email: session.email,
            status: session.status
        },
        expiresAt: session.expires_at
    };
}

export async function getAnkaAppSession(
    request,
    env
) {
    if (!env.DB) {
        return null;
    }

    return await findSession(request, env);
}

async function login(request, env) {
    if (request.method !== "POST") {
        return error("POST gerekli.", 405);
    }

    let body;

    try {
        body = await readJson(request);
    } catch (e) {
        return error(e.message, 400);
    }

    const hashDevice = await deviceHash(request);

    if (!hashDevice) {
        return error(
            "Geçerli cihaz kimliği gerekli. Uygulamayı güncelleyin.",
            422
        );
    }

    const username = String(
        body.username ?? body.email ?? ""
    ).trim();

    const password = String(
        body.password ?? ""
    );

    if (
        username.length < 3 ||
        username.length > 254 ||
        password.length < 1 ||
        password.length > 128
    ) {
        return error(
            "Kullanıcı adı veya şifre hatalı.",
            401
        );
    }

    const user = await env.DB.prepare(`
        SELECT
            id,
            username,
            email,
            password_hash,
            password_salt,
            status,
            device_hash
        FROM app_users
        WHERE
            username = ? COLLATE NOCASE
            OR email = ? COLLATE NOCASE
        LIMIT 1
    `).bind(
        username,
        username
    ).first();

    if (!user) {
        return error(
            "Kullanıcı adı veya şifre hatalı.",
            401
        );
    }

    let calculatedHash;

    try {
        calculatedHash = await derivePassword(
            password,
            user.password_salt
        );
    } catch (e) {
        console.error(
            "ANKA_AUTH_HASH_ERROR",
            e?.name,
            e?.message
        );

        return error(
            "Şifre doğrulama işlemi başarısız.",
            500
        );
    }

    if (!constantTimeEqual(
        calculatedHash,
        user.password_hash
    )) {
        return error(
            "Kullanıcı adı veya şifre hatalı.",
            401
        );
    }

    if (user.status === "pending") {
        return error(
            "Hesabınız yönetici onayı bekliyor.",
            403
        );
    }

    if (user.status === "rejected") {
        return error(
            "Hesap başvurunuz reddedildi.",
            403
        );
    }

    if (user.status === "disabled") {
        return error(
            "Hesabınız pasif duruma alınmıştır.",
            403
        );
    }

    if (user.status !== "approved") {
        return error(
            "Hesabınız giriş için uygun değil.",
            403
        );
    }

    if (
        user.device_hash &&
        !constantTimeEqual(
            user.device_hash,
            hashDevice
        )
    ) {
        return error(
            "Bu hesap başka bir cihaza kayıtlı. Yöneticiyle iletişime geçin.",
            403
        );
    }

    const now = nowSeconds();

    // Eski kullanıcı ilk başarılı girişte cihaza bağlanır.
    if (!user.device_hash) {
        try {
            const result = await env.DB.prepare(`
                UPDATE app_users
                SET
                    device_hash = ?,
                    device_bound_at = ?
                WHERE
                    id = ?
                    AND status = 'approved'
                    AND device_hash IS NULL
                    AND NOT EXISTS (
                        SELECT 1
                        FROM app_users
                        WHERE device_hash = ?
                        AND id <> ?
                    )
            `).bind(
                hashDevice,
                now,
                user.id,
                hashDevice,
                user.id
            ).run();

            if (!result.meta?.changes) {
                const current = await env.DB.prepare(`
                    SELECT device_hash, status
                    FROM app_users
                    WHERE id = ?
                `).bind(user.id).first();

                if (
                    current?.status !== "approved" ||
                    !current?.device_hash ||
                    !constantTimeEqual(
                        current.device_hash,
                        hashDevice
                    )
                ) {
                    return error(
                        "Bu cihaz başka bir hesaba bağlı veya hesap farklı cihazda etkinleştirildi.",
                        403
                    );
                }
            }

        } catch (e) {
            const message = String(
                e?.message || e
            );

            if (/UNIQUE constraint failed/i.test(message)) {
                return error(
                    "Bu cihaz başka bir hesaba bağlı.",
                    403
                );
            }

            throw e;
        }
    }

    const check = await env.DB.prepare(`
        SELECT device_hash, status
        FROM app_users
        WHERE id = ?
    `).bind(user.id).first();

    if (
        check?.status !== "approved" ||
        !constantTimeEqual(
            check.device_hash,
            hashDevice
        )
    ) {
        return error(
            "Cihaz doğrulaması başarısız.",
            403
        );
    }

    const token = createToken();
    const tokenHash = await sha256(token);
    const expiresAt = now + SESSION_SECONDS;

    await env.DB.prepare(`
        INSERT INTO app_sessions (
            token_hash,
            user_id,
            created_at,
            expires_at,
            revoked_at
        )
        SELECT ?, id, ?, ?, NULL
        FROM app_users
        WHERE
            id = ?
            AND status = 'approved'
            AND device_hash = ?
    `).bind(
        tokenHash,
        now,
        expiresAt,
        user.id,
        hashDevice
    ).run();

    const createdSession = await env.DB.prepare(`
        SELECT token_hash
        FROM app_sessions
        WHERE token_hash = ?
    `).bind(tokenHash).first();

    if (!createdSession) {
        return error(
            "Oturum oluşturulamadı. Tekrar deneyin.",
            403
        );
    }

    return json({
        success: true,
        message: "Giriş başarılı.",
        token_type: "Bearer",
        token,
        expires_at: expiresAt,
        expires_in: SESSION_SECONDS,
        user: publicUser(user)
    });
}

async function me(request, env) {
    if (request.method !== "GET") {
        return error("GET gerekli.", 405);
    }

    const session = await findSession(request, env);

    if (!session) {
        return error(
            "Oturum geçersiz, cihaz eşleşmiyor veya süresi dolmuş.",
            401
        );
    }

    return json({
        success: true,
        authenticated: true,
        expires_at: session.expiresAt,
        user: session.user
    });
}

async function logout(request, env) {
    if (request.method !== "POST") {
        return error("POST gerekli.", 405);
    }

    const session = await findSession(request, env);

    if (!session) {
        return error(
            "Oturum geçersiz veya cihaz eşleşmiyor.",
            401
        );
    }

    await env.DB.prepare(`
        UPDATE app_sessions
        SET revoked_at = ?
        WHERE
            token_hash = ?
            AND revoked_at IS NULL
    `).bind(
        nowSeconds(),
        session.tokenHash
    ).run();

    return json({
        success: true,
        message: "Çıkış yapıldı."
    });
}

export async function handleAnkaAuth(
    request,
    env
) {
    if (!env.DB) {
        return error(
            "D1 DB bağlantısı bulunamadı.",
            503
        );
    }

    const path = new URL(request.url).pathname;

    try {
        if (path === "/api/app/login") {
            return await login(request, env);
        }

        if (path === "/api/app/me") {
            return await me(request, env);
        }

        if (path === "/api/app/logout") {
            return await logout(request, env);
        }

        return error("API bulunamadı.", 404);

    } catch (e) {
        console.error(
            "ANKA_AUTH_ERROR",
            e?.name,
            e?.message
        );

        return error(
            "Sunucu işlemi tamamlanamadı.",
            500
        );
    }
}
