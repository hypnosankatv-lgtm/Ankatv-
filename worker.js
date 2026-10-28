
const SITE = 'https://diziizle.cafe';
const CACHE_TTL = 86400;
const CACHE_RETRY = 300;
const MAX_HTML_BYTES = 5 * 1024 * 1024;

const CATEGORIES = [
  ['Aile', 'aile'],
  ['Aksiyon', 'aksiyon'],
  ['Aksiyon & Macera', 'aksiyon-macera'],
  ['Animasyon', 'animasyon'],
  ['Belgesel', 'belgesel'],
  ['Bilim Kurgu & Fantazi', 'bilim-kurgu-fantastik'],
  ['Bilim-Kurgu', 'bilim-kurgu'],
  ['Çocuklar', 'cocuklar'],
  ['Dram', 'dram'],
  ['Fantastik', 'fantastik'],
  ['Gerçeklik', 'reality'],
  ['Gizem', 'gizem'],
  ['Komedi', 'komedi'],
  ['Macera', 'macera'],
  ['Savaş', 'savas'],
  ['Savaş & Politik', 'savas-politika'],
  ['Suç', 'suc'],
  ['Talk', 'talk'],
  ['Vahşi Batı', 'western']
];

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed',
  'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
]);

const HTML_ATTRIBUTES = [
  'href',
  'class',
  'src',
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-srcset',
  'srcset'
];

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function decodeEntities(value) {
  return String(value ?? '').replace(
    /&(#(?:x[0-9a-f]+|\d+)|amp|quot|apos|lt|gt|nbsp|hellip|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/gi,
    (match, entity) => {
      const named = {
        amp: '&',
        quot: '"',
        apos: "'",
        lt: '<',
        gt: '>',
        nbsp: ' ',
        hellip: '…',
        ndash: '–',
        mdash: '—',
        rsquo: '’',
        lsquo: '‘',
        ldquo: '“',
        rdquo: '”'
      };

      if (entity[0] === '#') {
        const hex = entity[1]?.toLowerCase() === 'x';
        const number = hex
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);

        if (
          Number.isInteger(number) &&
          number > 0 &&
          number <= 0x10ffff &&
          !(number >= 0xd800 && number <= 0xdfff)
        ) {
          return String.fromCodePoint(number);
        }

        return '';
      }

      return named[entity.toLowerCase()] ?? match;
    }
  );
}

function text(value) {
  return cleanText(
    decodeEntities(decodeEntities(value))
  );
}

function absoluteUrl(value) {
  const raw = decodeEntities(value).trim();

  if (!raw) return '';

  if (/^(data|blob|javascript):/i.test(raw)) {
    return '';
  }

  try {
    const url = new URL(raw, SITE + '/');

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return '';
    }

    return url.href;
  } catch {
    return '';
  }
}

function allowedUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname === 'diziizle.cafe' &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}

function imageCandidate(value, srcset = false) {
  let raw = String(value ?? '');

  if (srcset) {
    raw = raw
      .split(',')[0]
      .trim()
      .split(/\s+/)[0] || '';
  }

  return absoluteUrl(raw);
}

function imdb(value) {
  const match = String(value ?? '').match(
    /(?:10(?:[.,]0)?|[0-9](?:[.,][0-9])?)/
  );

  return match
    ? match[0].replace(',', '.')
    : '';
}

function positiveInt(value) {
  if (!/^\d+$/.test(String(value ?? ''))) {
    return null;
  }

  const number = Number(value);

  return (
    Number.isSafeInteger(number) &&
    number > 0
  ) ? number : null;
}

function apiLink(base, params) {
  const url = new URL(base);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.href;
}

function episodeApi(base, slug, season, episode) {
  return apiLink(base, {
    dizi: slug,
    sezon: season,
    bolum: episode
  });
}

function safePath(value) {
  try {
    return new URL(
      decodeEntities(value),
      SITE
    ).pathname;
  } catch {
    return '';
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);

  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes
  );

  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0')
  ).join('');
}

async function downloadHtml(url) {
  if (!allowedUrl(url)) {
    return '';
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml',
        'Accept-Language':
          'tr-TR,tr;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      return '';
    }

    const contentType =
      response.headers.get('content-type') || '';

    if (
      contentType &&
      !/text\/html|application\/xhtml\+xml/i.test(contentType)
    ) {
      return '';
    }

    const contentLength = Number(
      response.headers.get('content-length') || 0
    );

    if (contentLength > MAX_HTML_BYTES) {
      return '';
    }

    const reader = response.body?.getReader();

    if (!reader) {
      return '';
    }

    const chunks = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > MAX_HTML_BYTES) {
        await reader.cancel();
        return '';
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder('utf-8').decode(bytes);

  } catch {
    return '';
  }
}

async function getPageHtml(url, refresh, env) {
  if (!allowedUrl(url)) {
    return '';
  }

  const kv = env?.DIZI_CACHE;

  if (!kv || typeof kv.get !== 'function') {
    return downloadHtml(url);
  }

  const hash = await sha256(url);

  const key = 'html:' + hash;
  const retryKey = 'retry:' + hash;

  let stale = '';

  try {
    const cached = await kv.get(key, 'json');

    if (
      cached &&
      typeof cached.html === 'string' &&
      cached.html
    ) {
      stale = cached.html;

      const age =
        Date.now() - Number(cached.time || 0);

      if (!refresh && age < CACHE_TTL * 1000) {
        return stale;
      }
    }

    if (!refresh) {
      const retry = await kv.get(retryKey);

      if (retry) {
        return stale;
      }
    }
  } catch {
    // Önbellek hatası indirmeyi engellemez.
  }

  const html = await downloadHtml(url);

  if (html) {
    try {
      await kv.put(
        key,
        JSON.stringify({
          html,
          time: Date.now()
        }),
        {
          expirationTtl: Math.max(
            CACHE_TTL * 7,
            604800
          )
        }
      );

      await kv.delete(retryKey);
    } catch {
      // KV yazma hatası önemsiz.
    }

    return html;
  }

  try {
    await kv.put(
      retryKey,
      '1',
      {
        expirationTtl: CACHE_RETRY
      }
    );
  } catch {}

  return stale;
}

class TreeNode {
  constructor(tag = '', attrs = {}, parent = null) {
    this.tag = tag;
    this.attrs = attrs;
    this.parent = parent;
    this.children = [];
    this.parts = [];
  }

  attr(name) {
    return this.attrs[name] || '';
  }

  allText() {
    return this.parts.map(part => {
      return typeof part === 'string'
        ? part
        : part.allText();
    }).join('');
  }

  descendants(test) {
    const result = [];

    for (const child of this.children) {
      if (test(child)) {
        result.push(child);
      }

      result.push(...child.descendants(test));
    }

    return result;
  }

  first(test) {
    for (const child of this.children) {
      if (test(child)) {
        return child;
      }

      const found = child.first(test);

      if (found) {
        return found;
      }
    }

    return null;
  }
}

class NodeBuilder {
  constructor() {
    this.root = new TreeNode('root');
    this.stack = [this.root];
  }

  addElement(element) {
    const tag = element.tagName.toLowerCase();
    const attrs = {};

    for (const name of HTML_ATTRIBUTES) {
      const value = element.getAttribute(name);

      if (value !== null) {
        attrs[name] = value;
      }
    }

    const parent =
      this.stack[this.stack.length - 1];

    const node = new TreeNode(
      tag,
      attrs,
      parent
    );

    parent.children.push(node);
    parent.parts.push(node);

    return node;
  }

  open(node) {
    this.stack.push(node);
  }

  close(node) {
    const index = this.stack.lastIndexOf(node);

    if (index > 0) {
      this.stack.length = index;
    }
  }

  addText(value) {
    const current =
      this.stack[this.stack.length - 1];

    current.parts.push(value);
  }
}

async function parseHtml(html) {
  if (!html) {
    return null;
  }

  const builder = new NodeBuilder();

  const rewriter = new HTMLRewriter().on('*', {
    element(element) {
      const tag = element.tagName.toLowerCase();

      const node = builder.addElement(element);

      // Void elemanların kapanış etiketi yoktur.
      if (
        VOID_TAGS.has(tag) ||
        element.canHaveContent === false
      ) {
        return;
      }

      builder.open(node);

      element.onEndTag(() => {
        builder.close(node);
      });
    },

    text(chunk) {
      builder.addText(chunk.text);
    }
  });

  const response = rewriter.transform(
    new Response(html, {
      headers: {
        'Content-Type':
          'text/html; charset=utf-8'
      }
    })
  );

  await response.arrayBuffer();

  return builder.root;
}

const isTag = tag => node => node.tag === tag;

function hasClass(node, className) {
  return node
    .attr('class')
    .split(/\s+/)
    .includes(className);
}

function nodeImage(node) {
  const candidates = node.descendants(
    item => (
      item.tag === 'img' ||
      item.tag === 'source'
    )
  );

  for (const item of candidates) {
    for (const attribute of [
      'data-src',
      'data-original',
      'data-lazy-src',
      'data-srcset',
      'srcset',
      'src'
    ]) {
      const value = item.attr(attribute);

      if (!value) continue;

      const url = imageCandidate(
        value,
        attribute.includes('srcset')
      );

      if (url) {
        return url;
      }
    }
  }

  return '';
}

function firstText(node, test) {
  const found = node.first(test);

  return found
    ? text(found.allText())
    : '';
}

function findSeriesCards(root) {
  return root.descendants(node => {
    return (
      node.tag === 'a' &&
      node.attr('href').includes('/dizi/') &&
      node.first(isTag('h3')) !== null
    );
  });
}

async function getSeries(
  categorySlug,
  page,
  refresh,
  env,
  base
) {
  const url = new URL('/diziler', SITE);

  url.searchParams.set('tur', categorySlug);
  url.searchParams.set('sirala', 'populer');
  url.searchParams.set('page', String(page));

  const html = await getPageHtml(
    url.href,
    refresh,
    env
  );

  const root = await parseHtml(html);

  if (!root) {
    return [];
  }

  const result = [];
  const seen = new Set();

  for (const card of findSeriesCards(root)) {
    const path = safePath(card.attr('href'));

    const match = path.match(
      /^\/dizi\/([a-zA-Z0-9_-]+)\/?$/
    );

    if (!match) {
      continue;
    }

    const slug = match[1];

    if (seen.has(slug)) {
      continue;
    }

    const name = firstText(
      card,
      isTag('h3')
    );

    if (!name) {
      continue;
    }

    const h3 = card.first(isTag('h3'));
    let year = '';

    if (h3 && h3.parent) {
      const siblings = h3.parent.children;
      const index = siblings.indexOf(h3);

      for (
        let i = index + 1;
        i < siblings.length;
        i++
      ) {
        if (siblings[i].tag === 'p') {
          year = text(
            siblings[i].allText()
          );
          break;
        }
      }
    }

    if (!/^(19|20)\d{2}$/.test(year)) {
      year = '';
    }

    const rating = firstText(
      card,
      node => (
        node.tag === 'span' &&
        hasClass(node, 'badge-rating')
      )
    );

    result.push({
      link: apiLink(base, {
        dizi: slug
      }),
      resim: nodeImage(card),
      isim: name,
      imdb: imdb(rating),
      yil: year
    });

    seen.add(slug);
  }

  return result;
}

function seasonNumbers(root, slug) {
  const numbers = new Set();

  const links = root.descendants(node => {
    return (
      node.tag === 'a' &&
      (
        node.attr('href').includes('sezon=') ||
        node.attr('href').includes('/sezon-')
      )
    );
  });

  for (const link of links) {
    const href = decodeEntities(
      link.attr('href')
    );

    let url;

    try {
      url = new URL(href, SITE);
    } catch {
      continue;
    }

    const expression = new RegExp(
      '^/dizi/' +
      slug +
      '/sezon-(\\d+)/bolum-\\d+/?$'
    );

    const match = url.pathname.match(expression);

    if (match) {
      const season = positiveInt(match[1]);

      if (season) {
        numbers.add(season);
      }
    }

    const path = url.pathname.replace(/\/$/, '');

    if (path === '/dizi/' + slug) {
      const season = positiveInt(
        url.searchParams.get('sezon')
      );

      if (season) {
        numbers.add(season);
      }
    }
  }

  if (numbers.size === 0) {
    numbers.add(1);
  }

  return [...numbers].sort(
    (a, b) => a - b
  );
}

function getEpisodes(
  root,
  slug,
  season,
  poster,
  base
) {
  if (!root) {
    return [];
  }

  const episodes = new Map();

  const links = root.descendants(node => {
    return (
      node.tag === 'a' &&
      node.attr('href').includes('/sezon-')
    );
  });

  const expression = new RegExp(
    '^/dizi/' +
    slug +
    '/sezon-(\\d+)/bolum-(\\d+)/?$'
  );

  for (const link of links) {
    const href = decodeEntities(
      link.attr('href')
    );

    const path = safePath(href);
    const match = path.match(expression);

    if (!match) {
      continue;
    }

    const foundSeason = Number(match[1]);
    const number = positiveInt(match[2]);

    if (
      foundSeason !== season ||
      !number
    ) {
      continue;
    }

    const pageUrl = absoluteUrl(href);

    if (!allowedUrl(pageUrl)) {
      continue;
    }

    const title = firstText(
      link,
      isTag('p')
    ) || number + '. Bölüm';

    const image = nodeImage(link);

    const item = {
      bolum: number,
      isim: title,
      resim: image || poster,
      api_link: episodeApi(
        base,
        slug,
        season,
        number
      ),
      page_url: pageUrl,
      episode_url: pageUrl
    };

    if (!episodes.has(number)) {
      episodes.set(number, item);
    } else {
      const existing = episodes.get(number);

      if (
        image &&
        existing.resim === poster
      ) {
        existing.resim = image;
      }
    }
  }

  return [...episodes.values()].sort(
    (a, b) => a.bolum - b.bolum
  );
}

function sectionForDetails(root) {
  const sections = root.descendants(
    isTag('section')
  );

  const detailed = sections.find(section => {
    const hasTitle =
      section.first(isTag('h1')) !== null;

    const hasAllData = section
      .descendants(isTag('h3'))
      .some(node => (
        text(node.allText()).includes('Tüm Veriler')
      ));

    return hasTitle && hasAllData;
  });

  if (detailed) {
    return detailed;
  }

  return sections.find(section => (
    section.first(isTag('h1')) !== null
  )) || null;
}

function detailData(section) {
  const result = {};

  const lists = section.descendants(
    isTag('dl')
  );

  for (const list of lists) {
    const rows = list.children.filter(
      node => node.tag === 'div'
    );

    for (const row of rows) {
      const dt = row.first(isTag('dt'));
      const dd = row.first(isTag('dd'));

      if (!dt || !dd) {
        continue;
      }

      const key = text(dt.allText());

      if (key) {
        result[key] = text(
          dd.allText()
        );
      }
    }
  }

  return result;
}

async function getSeriesDetails(
  slug,
  requestedSeason,
  refresh,
  env,
  base
) {
  const source =
    SITE + '/dizi/' + encodeURIComponent(slug);

  const html = await getPageHtml(
    source,
    refresh,
    env
  );

  const root = await parseHtml(html);

  if (!root) {
    return {
      error: 'Dizi sayfasına ulaşılamadı'
    };
  }

  const section = sectionForDetails(root);

  if (!section) {
    return {
      error: 'Dizi detay alanı bulunamadı'
    };
  }

  const name = firstText(
    section,
    isTag('h1')
  );

  const poster = nodeImage(section);

  const summary = firstText(
    section,
    node => (
      node.tag === 'p' &&
      hasClass(node, 'leading-relaxed')
    )
  );

  const genres = [];

  const genreLinks = section.descendants(
    node => (
      node.tag === 'a' &&
      node.attr('href').includes('/tur/')
    )
  );

  for (const link of genreLinks) {
    const genre = text(
      link.allText()
    );

    if (
      genre &&
      !genres.includes(genre)
    ) {
      genres.push(genre);
    }
  }

  const data = detailData(section);

  const allSeasons = seasonNumbers(
    root,
    slug
  );

  if (
    requestedSeason !== null &&
    !allSeasons.includes(requestedSeason)
  ) {
    return {
      error: 'İstenen sezon bulunamadı'
    };
  }

  const selectedSeasons =
    requestedSeason === null
      ? allSeasons
      : [requestedSeason];

  const seasons = [];

  for (const season of selectedSeasons) {
    const seasonUrl =
      source + '?sezon=' + season;

    const seasonHtml = await getPageHtml(
      seasonUrl,
      refresh,
      env
    );

    let seasonRoot = await parseHtml(
      seasonHtml
    );

    if (!seasonRoot && season === 1) {
      seasonRoot = root;
    }

    let episodes = getEpisodes(
      seasonRoot,
      slug,
      season,
      poster,
      base
    );

    if (episodes.length === 0) {
      episodes = getEpisodes(
        root,
        slug,
        season,
        poster,
        base
      );
    }

    seasons.push({
      sezon: season,
      isim: season + '. Sezon',
      api_link: apiLink(base, {
        dizi: slug,
        sezon: season
      }),
      bolum_sayisi: episodes.length,
      bolumler: episodes
    });
  }

  return {
    isim: name,
    resim: poster,
    ozet: summary,
    turler: genres,
    imdb: imdb(data['IMDB Puanı'] || ''),
    izlenme: data['İzlenme Sayısı'] || '',
    tur: data['Tür'] || '',
    yil: data['Yapım Yılı'] || '',
    durum: data['Durum'] || '',
    platform: data['Platform'] || '',
    eklenme_tarihi:
      data['Eklenme Tarihi'] || '',
    tum_veriler: data,
    sezon_sayisi: allSeasons.length,
    sezonlar: seasons
  };
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods':
              'GET, OPTIONS',
            'Access-Control-Allow-Headers':
              'Content-Type, Authorization'
          }
        });
      }

      if (request.method !== 'GET') {
        return json({
          error: 'Yalnızca GET destekleniyor'
        }, 405);
      }

      const url = new URL(request.url);

      if (url.pathname !== '/api/diziler') {
        return json({
          error: 'API bulunamadı'
        }, 404);
      }

      const params = url.searchParams;

      const refresh =
        params.get('refresh') === '1';

      const page = positiveInt(
        params.get('page') ?? '1'
      ) ?? 1;

      const base =
        url.origin + '/api/diziler';

      // Dizi detayları, sezon ve bölüm
      if (params.has('dizi')) {
        const slug = (
          params.get('dizi') || ''
        ).trim();

        if (
          !/^[a-zA-Z0-9_-]+$/.test(slug)
        ) {
          return json({
            error: 'Geçersiz dizi adresi'
          }, 400);
        }

        const season = params.has('sezon')
          ? positiveInt(params.get('sezon'))
          : null;

        if (
          params.has('sezon') &&
          season === null
        ) {
          return json({
            error: 'Geçersiz sezon numarası'
          }, 400);
        }

        const episode = params.has('bolum')
          ? positiveInt(params.get('bolum'))
          : null;

        if (
          params.has('bolum') &&
          (
            episode === null ||
            season === null
          )
        ) {
          return json({
            error:
              'Geçerli sezon ve bölüm numarası gerekli'
          }, 400);
        }

        const details = await getSeriesDetails(
          slug,
          season,
          refresh,
          env,
          base
        );

        if (details.error) {
          const status =
            details.error === 'İstenen sezon bulunamadı'
              ? 404
              : 502;

          return json(details, status);
        }

        if (episode !== null) {
          for (const seasonData of details.sezonlar) {
            for (const item of seasonData.bolumler) {
              if (item.bolum === episode) {
                return json({
                  dizi_adi: details.isim,
                  sezon: season,
                  bolum: item
                });
              }
            }
          }

          return json({
            error: 'Bölüm bulunamadı'
          }, 404);
        }

        return json(details);
      }

      // Tek kategori
      if (params.has('tur')) {
        const categorySlug = (
          params.get('tur') || ''
        ).trim();

        const exists = CATEGORIES.some(
          category => category[1] === categorySlug
        );

        if (!exists) {
          return json({
            error: 'Geçersiz kategori'
          }, 400);
        }

        const movies = await getSeries(
          categorySlug,
          page,
          refresh,
          env,
          base
        );

        return json(movies);
      }

      // Bütün kategoriler
      const result = [];

      for (const [name, slug] of CATEGORIES) {
        const movies = await getSeries(
          slug,
          page,
          refresh,
          env,
          base
        );

        result.push({
          category_name: name,
          category_link: apiLink(base, {
            tur: slug,
            page: page
          }),
          movies: movies
        });
      }

      return json(result);

    } catch (error) {
      return json({
        error: 'Sunucu hatası',
        detail: String(
          error?.message || error
        )
      }, 500);
    }
  }
};
