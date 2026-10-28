
const SITE = "https://diziizle.cafe/";
const MAX_HTML_BYTES = 5 * 1024 * 1024;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return new Response("Yalnızca GET destekleniyor", {
        status: 405
      });
    }

    if (url.pathname !== "/" && url.pathname !== "/test") {
      return new Response("Sayfa bulunamadı", {
        status: 404
      });
    }

    try {
      const response = await fetch(SITE, {
        method: "GET",
        redirect: "manual",
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(25000)
      });

      const html = await response.text();
      const bytes = new TextEncoder().encode(html).byteLength;

      if (bytes > MAX_HTML_BYTES) {
        return Response.json({
          success: false,
          error: "HTML boyutu 5 MB sınırını aşıyor",
          bytes
        }, { status: 502 });
      }

      if (url.searchParams.get("info") === "1") {
        return Response.json({
          success: response.ok,
          source_url: SITE,
          source_status: response.status,
          content_type: response.headers.get("content-type"),
          html_bytes: bytes,
          html_length: html.length,
          page_title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "",
          has_html: /<html[\s>]/i.test(html),
          has_series_links: html.includes("/dizi/"),
          preview: html.substring(0, 500)
        }, {
          status: response.ok ? 200 : 502
        });
      }

      return new Response(html, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("content-type") || "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff"
        }
      });

    } catch (error) {
      return Response.json({
        success: false,
        error: "Ana sayfa çekilemedi",
        detail: String(error?.message || error)
      }, { status: 502 });
    }
  }
};
