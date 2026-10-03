// Reads a shared Google Photos album, one page at a time.
//
//   GET /api/album?url=<share link>            -> first page + album id/key + next token
//   GET /api/album?id=<id>&key=<key>&token=<t> -> next page
//
// Response: { id, key, token, items: [{ u, w, h }] }   (token null = last page)
//
// Google offers no official API for shared-link albums, so this parses the
// album HTML (first page) and calls the same internal RPC ("snAcKc") that the
// Google Photos web client uses for scrolling. If Google changes the format,
// this file is the only place that needs fixing.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  // Skip the EU cookie-consent interstitial.
  Cookie: 'CONSENT=YES+cb; SOCS=CAI',
};
const SHARE_HOSTS = new Set(['photos.app.goo.gl', 'goo.gl', 'photos.google.com']);
const ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

export default async (req) => {
  const p = new URL(req.url).searchParams;
  try {
    if (p.has('token')) {
      const id = p.get('id');
      const key = p.get('key');
      const token = p.get('token');
      if (!ID_RE.test(id || '') || !ID_RE.test(key || '') || !token) throw new Error('Invalid parameters');
      return json(await fetchPage(id, key, token));
    }
    return json(await fetchFirst(p.get('url') || ''));
  } catch (e) {
    return json({ error: e.message || String(e) }, 502);
  }
};

export const config = { path: '/api/album' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function fetchFirst(shareUrl) {
  let u;
  try {
    u = new URL(shareUrl.trim());
  } catch {
    throw new Error('That is not a valid link');
  }
  if (u.protocol !== 'https:' || !SHARE_HOSTS.has(u.hostname)) {
    throw new Error('Use a Google Photos share link (https://photos.app.goo.gl/... or https://photos.google.com/share/...)');
  }

  const res = await fetch(u, { headers: HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`Google Photos answered HTTP ${res.status}`);
  const html = await res.text();

  // The short link normally redirects to /share/<id>?key=<key>; fall back to
  // searching the page in case it redirects with JavaScript instead.
  let finalUrl = res.url;
  if (!/\/share\/[^/?]+/.test(finalUrl) || !/[?&]key=/.test(finalUrl)) {
    const m = html.match(/https:\/\/photos\.google\.com\/share\/[A-Za-z0-9_-]+\?key=[A-Za-z0-9_-]+/);
    if (m) finalUrl = m[0];
  }
  const f = new URL(finalUrl);
  const id = (f.pathname.match(/\/share\/([^/?]+)/) || [])[1];
  const key = f.searchParams.get('key');
  if (!id || !key) throw new Error('Could not find the album id in the link. Is the album still shared?');

  const page = parseHtml(html.includes('AF_initDataCallback') ? html : await fetchText(finalUrl));
  return { id, key, ...page };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Google Photos answered HTTP ${res.status}`);
  return res.text();
}

export function parseHtml(html) {
  const re = /AF_initDataCallback\(\{[^]*?data:([^]*?), sideChannel: \{\}\}\);<\/script>/g;
  let best = null;
  for (const m of html.matchAll(re)) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const page = pageFromData(data);
    if (page.items.length && (!best || page.items.length > best.items.length)) best = page;
  }
  if (!best) throw new Error('No photos found on the album page (album empty, not shared, or Google changed the page format)');
  return best;
}

export async function fetchPage(id, key, token) {
  const freq = JSON.stringify([[['snAcKc', JSON.stringify([id, token, null, key]), null, 'generic']]]);
  const url =
    'https://photos.google.com/_/PhotosUi/data/batchexecute?rpcids=snAcKc' +
    `&source-path=${encodeURIComponent('/share/' + id)}&hl=en`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'f.req=' + encodeURIComponent(freq),
  });
  if (!res.ok) throw new Error(`Google Photos answered HTTP ${res.status} for the next page`);
  return parseBatch(await res.text());
}

export function parseBatch(text) {
  const body = text.replace(/^\)\]\}'/, '');
  const candidates = [];
  try {
    candidates.push(JSON.parse(body));
  } catch {
    // Chunked format: length lines interleaved with JSON lines.
    for (const line of body.split('\n')) {
      if (!line.startsWith('[')) continue;
      try {
        candidates.push(JSON.parse(line));
      } catch {}
    }
  }
  for (const c of candidates) {
    const env = findEnvelope(c);
    if (env) {
      if (typeof env[2] !== 'string') throw new Error('Google Photos returned an empty page');
      return pageFromData(JSON.parse(env[2]));
    }
  }
  throw new Error('Unexpected response from Google Photos for the next page');
}

function findEnvelope(node) {
  if (!Array.isArray(node)) return null;
  if (node[0] === 'wrb.fr' && node[1] === 'snAcKc') return node;
  for (const child of node) {
    const hit = findEnvelope(child);
    if (hit) return hit;
  }
  return null;
}

// Album data: [ albumInfo, [item, ...], nextPageToken, ... ]
// item:       [ mediaKey, [ "https://lh3.googleusercontent.com/...", width, height, ... ], timestamp, ... ]
function pageFromData(data) {
  const isItem = (it) =>
    Array.isArray(it) && Array.isArray(it[1]) && typeof it[1][0] === 'string' && /^https:\/\/[^/]*googleusercontent\.com\//.test(it[1][0]);
  let list = Array.isArray(data) && Array.isArray(data[1]) && data[1].some(isItem) ? data[1] : findItemList(data, isItem);
  const items = (list || []).filter(isItem).map((it) => ({ u: it[1][0], w: it[1][1] | 0, h: it[1][2] | 0 }));
  const token = Array.isArray(data) && typeof data[2] === 'string' && data[2] ? data[2] : null;
  return { token, items };
}

function findItemList(node, isItem, depth = 0) {
  if (!Array.isArray(node) || depth > 6) return null;
  if (node.length && node.some(isItem)) return node;
  for (const child of node) {
    const hit = findItemList(child, isItem, depth + 1);
    if (hit) return hit;
  }
  return null;
}
