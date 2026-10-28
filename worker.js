
const SITE = "https://diziizle.cafe";
const CACHE_TTL = 86400;

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

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed",
  "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    }
  });
}

function decode(value) {
  const named = {
    amp: "&", quot: '"', apos: "'",
    lt: "<", gt: ">", nbsp: " ",
    hellip: "…", ndash: "–", mdash: "—",
    rsquo: "’", lsquo: "‘",
    ldquo: "“", rdquo: "”"
  };

  return String(value ?? "").replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    (match, entity) => {
      if (entity.startsWith("#")) {
        const hex = entity[1]?.toLowerCase() === "x";
        const number = parseInt(
          entity.slice(hex ? 2 : 1),
          hex ? 16 : 10
        );
        return number > 0 &&
          number <= 0x10ffff &&
          !(number >= 0xd800 && number <= 0xdfff)
          ? String.fromCodePoint(number)
          : match;
      }
      return named[entity.toLowerCase()] ?? match;
    }
  );
}

function clean(value) {
  return decode(decode(value))
    .replace(/\s+/g, " ")
    .trim();
}

function absolute(value) {
  if (!value || /^(javascript|data|blob):/i.test(value)) {
    return "";
  }
  try {
    const url = new URL(decode(value), SITE);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function apiLink(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.href;
}

function positiveInt(value) {
  if (!/^\d+$/.test(String(value ?? ""))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? number : null;
}

function rating(value) {
  const match = clean(value).match(
    /(?:10(?:[.,]0)?|[0-9](?:[.,][0-9])?)/
  );
  return match ? match[0].replace(",", ".") : "";
}

function attrsFromTag(tag) {
  const attrs = {};
  const start = tag.match(/^<[\w:-]+\b/i);
  if (!start) return attrs;

  const body = tag.slice(start[0].length).replace(/\/?>$/, "");
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = pattern.exec(body))) {
    attrs[match[1].toLowerCase()] =
      decode(match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attrs;
}

class Node {
  constructor(tag = "", attrs = {}, parent = null) {
    this.tag = tag;
    this.attrs = attrs;
    this.parent = parent;
    this.children = [];
    this.parts = [];
  }

  attr(name) {
    return this.attrs[name] || "";
  }

  allText() {
    return this.parts.map(part =>
      typeof part === "string" ? part : part.allText()
    ).join("");
  }

  descendants(test) {
    const result = [];
    const stack = [...this.children].reverse();

    while (stack.length) {
      const node = stack.pop();
      if (test(node)) result.push(node);

      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }

    return result;
  }

  first(test) {
    const stack = [...this.children].reverse();

    while (stack.length) {
      const node = stack.pop();
      if (test(node)) return node;

      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }

    return null;
  }
}

function parseHtml(html) {
  if (!html) return null;

  const root = new Node("root");
  const stack = [root];

  const source = html.replace(
    /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/gi,
    ""
  ).replace(
    /<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ""
  );

  const tokens = source.match(
    /<\/?[a-zA-Z][\w:-]*(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?\s*\/?>|[^<]+|</g
  ) || [];

  const current = () => stack[stack.length - 1];

  for (const token of tokens) {
    if (!token.startsWith("<") || token === "<") {
      current().parts.push(token);
      continue;
    }

    const closing = token.match(/^<\/([\w:-]+)/);

    if (closing) {
      const tag = closing[1].toLowerCase();

      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const opening = token.match(/^<([\w:-]+)/);
    if (!opening) continue;

    const tag = opening[1].toLowerCase();

    if (tag === "li" && current().tag === "li") {
      stack.pop();
    }

    if (tag === "p" && current().tag === "p") {
      stack.pop();
    }

    if (tag === "a") {
      const index = stack.findLastIndex(
        node => node.tag === "a"
      );
      if (index > 0) stack.length = index;
    }

    const parent = current();
    const node = new Node(tag, attrsFromTag(token), parent);

    parent.children.push(node);
    parent.parts.push(node);

    if (!VOID_TAGS.has(tag) && !/\/>$/.test(token)) {
      stack.push(node);
    }
  }

  return root;
}

function hasClass(node, className) {
  return node.attr("class").split(/\s+/).includes(className);
}

function firstText(node, test) {
  const found = node?.first(test);
  return found ? clean(found.allText()) : "";
}

function nodeImage(node) {
  if (!node) return "";

  const images = node.descendants(
    item => item.tag === "img" || item.tag === "source"
  );

  for (const image of images) {
    for (const key of [
      "data-src", "data-original", "data-lazy-src",
      "data-srcset", "srcset", "src"
    ]) {
      let value = image.attr(key);
      if (!value) continue;

      if (key.includes("srcset")) {
        value = value.split(",")[0].trim().split(/\s+/)[0];
      }

      const url = absolute(value);
      if (url) return url;
    }
  }

  return "";
}

function pathOf(value) {
  try {
    return new URL(value, SITE).pathname;
  } catch {
    return "";
  }
}

async function getHtml(url, refresh = false, env = {}) {
  const cache = env.DIZI_CACHE;
  const key = "html:" + url;

  if (cache && !refresh) {
    try {
      const saved = await cache.get(key, "json");
      if (
        saved?.html &&
        Date.now() - saved.time < CACHE_TTL * 1000
      ) {
        return saved.html;
      }
    } catch {}
  }

  let stale = "";

  if (cache) {
    try {
      const saved = await cache.get(key, "json");
      stale = saved?.html || "";
    } catch {}
  }

  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) return stale;

    const html = await response.text();

    if (!html || html.length > 5 * 1024 * 1024) {
      return stale;
    }

    if (cache) {
      try {
        await cache.put(
          key,
          JSON.stringify({
            html,
            time: Date.now()
          }),
          { expirationTtl: 604800 }
        );
      } catch {}
    }

    return html;
  } catch {
    return stale;
  }
}

async function getSeries(category, page, refresh, env, base) {
  const url = new URL("/diziler", SITE);
  url.searchParams.set("tur", category);
  url.searchParams.set("sirala", "populer");
  url.searchParams.set("page", String(page));

  const root = parseHtml(
    await getHtml(url.href, refresh, env)
  );

  if (!root) return [];

  const result = [];
  const seen = new Set();

  const cards = root.descendants(node =>
    node.tag === "a" &&
    node.attr("href").includes("/dizi/") &&
    node.first(child => child.tag === "h3") !== null
  );

  for (const card of cards) {
    const match = pathOf(card.attr("href")).match(
      /^\/dizi\/([a-zA-Z0-9_-]+)\/?$/
    );

    if (!match || seen.has(match[1])) continue;

    const slug = match[1];
    const name = firstText(card, node => node.tag === "h3");

    if (!name) continue;

    const h3 = card.first(node => node.tag === "h3");
    let year = "";

    if (h3?.parent) {
      const siblings = h3.parent.children;
      const index = siblings.indexOf(h3);

      for (let i = index + 1; i < siblings.length; i++) {
        if (siblings[i].tag === "p") {
          year = clean(siblings[i].allText());
          break;
        }
      }
    }

    if (!/^(19|20)\d{2}$/.test(year)) {
      const yearMatch = clean(card.allText()).match(
        /\b(?:19|20)\d{2}\b/
      );
      year = yearMatch ? yearMatch[0] : "";
    }

    const score = firstText(card, node =>
      node.tag === "span" &&
      hasClass(node, "badge-rating")
    );

    result.push({
      link: apiLink(base, { dizi: slug }),
      resim: nodeImage(card),
      isim: name,
      imdb: rating(score),
      yil: year
    });

    seen.add(slug);
  }

  return result;
}

function getSeasonNumbers(root, slug) {
  const numbers = new Set();

  const links = root.descendants(node =>
    node.tag === "a" &&
    (
      node.attr("href").includes("sezon=") ||
      node.attr("href").includes("/sezon-")
    )
  );

  for (const link of links) {
    let url;

    try {
      url = new URL(link.attr("href"), SITE);
    } catch {
      continue;
    }

    const match = url.pathname.match(
      new RegExp(
        "^/dizi/" + slug +
        "/sezon-(\\d+)/bolum-\\d+/?$"
      )
    );

    if (match) {
      const number = positiveInt(match[1]);
      if (number) numbers.add(number);
    }

    if (
      url.pathname.replace(/\/$/, "") ===
      "/dizi/" + slug
    ) {
      const number = positiveInt(
        url.searchParams.get("sezon")
      );
      if (number) numbers.add(number);
    }
  }

  if (!numbers.size) numbers.add(1);

  return [...numbers].sort((a, b) => a - b);
}

function getEpisodes(root, slug, season, poster, base) {
  if (!root) return [];

  const episodes = new Map();

  const expression = new RegExp(
    "^/dizi/" + slug +
    "/sezon-(\\d+)/bolum-(\\d+)/?$"
  );

  const links = root.descendants(node =>
    node.tag === "a" &&
    node.attr("href").includes("/sezon-")
  );

  for (const link of links) {
    const match = pathOf(link.attr("href")).match(expression);

    if (!match || Number(match[1]) !== season) continue;

    const number = positiveInt(match[2]);
    if (!number) continue;

    const pageUrl = absolute(link.attr("href"));
    const image = nodeImage(link);

    const title = firstText(
      link,
      node => node.tag === "p"
    ) || number + ". Bölüm";

    const item = {
      bolum: number,
      isim: title,
      resim: image || poster,
      api_link: apiLink(base, {
        dizi: slug,
        sezon: season,
        bolum: number
      }),
      page_url: pageUrl,
      episode_url: pageUrl
    };

    if (!episodes.has(number)) {
      episodes.set(number, item);
    } else if (image) {
      episodes.get(number).resim = image;
    }
  }

  return [...episodes.values()].sort(
    (a, b) => a.bolum - b.bolum
  );
}

function getDetailSection(root) {
  const sections = root.descendants(
    node => node.tag === "section"
  );

  return sections.find(section =>
    section.first(node => node.tag === "h1") &&
    section.descendants(node => node.tag === "h3")
      .some(node => clean(node.allText()).includes("Tüm Veriler"))
  ) || sections.find(section =>
    section.first(node => node.tag === "h1")
  ) || null;
}

function getDetailFields(section) {
  const result = {};

  const lists = section.descendants(
    node => node.tag === "dl"
  );

  for (const list of lists) {
    for (const row of list.children) {
      const dt = row.first(node => node.tag === "dt");
      const dd = row.first(node => node.tag === "dd");

      if (!dt || !dd) continue;

      const key = clean(dt.allText());
      const value = clean(dd.allText());

      if (key) result[key] = value;
    }
  }

  return result;
}

async function getDetails(slug, requestedSeason, refresh, env, base) {
  const source = SITE + "/dizi/" + encodeURIComponent(slug);

  const root = parseHtml(
    await getHtml(source, refresh, env)
  );

  if (!root) {
    return { error: "Dizi sayfasına ulaşılamadı" };
  }

  const section = getDetailSection(root);

  if (!section) {
    return { error: "Dizi detay alanı bulunamadı" };
  }

  const name = firstText(
    section,
    node => node.tag === "h1"
  );

  const poster = nodeImage(section);

  const summary = firstText(section, node =>
    node.tag === "p" &&
    hasClass(node, "leading-relaxed")
  );

  const genres = [];

  for (const link of section.descendants(node =>
    node.tag === "a" &&
    node.attr("href").includes("/tur/")
  )) {
    const genre = clean(link.allText());
    if (genre && !genres.includes(genre)) {
      genres.push(genre);
    }
  }

  const data = getDetailFields(section);
  const allSeasons = getSeasonNumbers(root, slug);

  if (
    requestedSeason !== null &&
    !allSeasons.includes(requestedSeason)
  ) {
    return { error: "İstenen sezon bulunamadı" };
  }

  const selectedSeasons = requestedSeason === null
    ? allSeasons
    : [requestedSeason];

  const seasons = await Promise.all(
    selectedSeasons.map(async season => {
      const seasonHtml = await getHtml(
        source + "?sezon=" + season,
        refresh,
        env
      );

      const seasonRoot = parseHtml(seasonHtml) || root;

      let episodes = getEpisodes(
        seasonRoot,
        slug,
        season,
        poster,
        base
      );

      if (!episodes.length) {
        episodes = getEpisodes(
          root,
          slug,
          season,
          poster,
          base
        );
      }

      return {
        sezon: season,
        isim: season + ". Sezon",
        api_link: apiLink(base, {
          dizi: slug,
          sezon
        }),
        bolum_sayisi: episodes.length,
        bolumler: episodes
      };
    })
  );

  return {
    isim: name,
    resim: poster,
    ozet: summary,
    turler: genres,
    imdb: rating(data["IMDB Puanı"] || ""),
    izlenme: data["İzlenme Sayısı"] || "",
    tur: data["Tür"] || "",
    yil: data["Yapım Yılı"] || "",
    durum: data["Durum"] || "",
    platform: data["Platform"] || "",
    eklenme_tarihi: data["Eklenme Tarihi"] || "",
    tum_veriler: data,
    sezon_sayisi: allSeasons.length,
    sezonlar: seasons
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    try {
      if (request.method !== "GET") {
        return json({ error: "Yalnızca GET destekleniyor" }, 405);
      }

      const url = new URL(request.url);

      if (url.pathname !== "/api/diziler") {
        return json({ error: "API bulunamadı" }, 404);
      }

      const query = url.searchParams;
      const refresh = query.get("refresh") === "1";
      const page = positiveInt(query.get("page") ?? "1") ?? 1;
      const base = url.origin + "/api/diziler";

      if (query.has("dizi")) {
        const slug = (query.get("dizi") || "").trim();

        if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
          return json({ error: "Geçersiz dizi adresi" }, 400);
        }

        const season = query.has("sezon")
          ? positiveInt(query.get("sezon"))
          : null;

        if (query.has("sezon") && season === null) {
          return json({ error: "Geçersiz sezon" }, 400);
        }

        const episode = query.has("bolum")
          ? positiveInt(query.get("bolum"))
          : null;

        if (
          query.has("bolum") &&
          (episode === null || season === null)
        ) {
          return json({
            error: "Geçerli sezon ve bölüm gerekli"
          }, 400);
        }

        const details = await getDetails(
          slug,
          season,
          refresh,
          env,
          base
        );

        if (details.error) {
          return json(details, 404);
        }

        if (episode !== null) {
          for (const seasonData of details.sezonlar) {
            const found = seasonData.bolumler.find(
              item => item.bolum === episode
            );

            if (found) {
              return json({
                dizi_adi: details.isim,
                sezon: season,
                bolum: found
              });
            }
          }

          return json({ error: "Bölüm bulunamadı" }, 404);
        }

        return json(details);
      }

      if (query.has("tur")) {
        const category = (query.get("tur") || "").trim();

        if (!CATEGORIES.some(item => item[1] === category)) {
          return json({ error: "Geçersiz kategori" }, 400);
        }

        return json(
          await getSeries(category, page, refresh, env, base)
        );
      }

      const categories = await Promise.all(
        CATEGORIES.map(async ([name, slug]) => ({
          category_name: name,
          category_link: apiLink(base, {
            tur: slug,
            page
          }),
          movies: await getSeries(
            slug,
            page,
            refresh,
            env,
            base
          )
        }))
      );

      return json(categories);

    } catch (error) {
      return json({
        error: "Sunucu hatası",
        detail: String(error?.message || error)
      }, 500);
    }
  }
};
