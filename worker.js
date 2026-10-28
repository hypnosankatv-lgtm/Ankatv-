
const CATEGORIES = [
    ["Aile", "aile"],
    ["Aksiyon", "aksiyon"],
    ["Aksiyon & Macera", "aksiyon-macera"],
    ["Animasyon", "animasyon"],
    ["Belgesel", "belgesel"],
    ["Bilim Kurgu & Fantazi", "bilim-kurgu-fantastik"],
    ["Bilim-Kurgu", "bilim-kurgu"],
    ["Çocuklar", "cocuklar"],
    ["Dram", "dram"],
    ["Fantastik", "fantastik"],
    ["Gerçeklik", "reality"],
    ["Gizem", "gizem"],
    ["Komedi", "komedi"],
    ["Macera", "macera"],
    ["Savaş", "savas"],
    ["Savaş & Politik", "savas-politika"],
    ["Suç", "suc"],
    ["Talk", "talk"],
    ["Vahşi Batı", "western"]
];

function json(data, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

export default {
    async fetch(request, env) {

        const authorization =
            request.headers.get("Authorization") || "";

        if (
            !env.API_TOKEN ||
            authorization !== "Bearer " + env.API_TOKEN
        ) {
            return json({
                success: false,
                message: "Yetkisiz erişim"
            }, 401);
        }

        if (request.method !== "GET") {
            return json({
                error: "Yalnızca GET destekleniyor"
            }, 405);
        }

        const url = new URL(request.url);

        if (url.pathname !== "/api/diziler") {
            return json({
                error: "API bulunamadı"
            }, 404);
        }

        if (
            url.searchParams.has("tur") ||
            url.searchParams.has("dizi")
        ) {
            return json({
                error: "Dizi listeleme ve detay ayrıştırıcısı henüz eklenmedi"
            }, 501);
        }

        const page = Math.max(
            1,
            parseInt(
                url.searchParams.get("page") || "1",
                10
            ) || 1
        );

        const categories = CATEGORIES.map(
            ([category_name, slug]) => ({
                category_name,
                category_link:
                    url.origin +
                    "/api/diziler?tur=" +
                    encodeURIComponent(slug) +
                    "&page=" +
                    page,
                movies: []
            })
        );

        return json(categories);
    }
};
