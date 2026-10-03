// GET /api/orient?u=<googleusercontent image url>  ->  { o, w, h }
//
// o    = EXIF orientation (1-8, 1 = upright)
// w, h = pixel size as stored in the file (before applying o)
//
// Older browsers (e.g. many Samsung TV browsers) ignore the EXIF orientation
// tag, so photos taken in portrait show up on their side. The page uses this
// to rotate those photos itself. Only the first 64 KB of the image is read.

const MAX = 65536;

export default async (req) => {
  const raw = new URL(req.url).searchParams.get('u') || '';
  let u;
  try {
    u = new URL(raw);
  } catch {
    return json({ error: 'Invalid url' }, 400);
  }
  if (u.protocol !== 'https:' || !/(^|\.)googleusercontent\.com$/.test(u.hostname)) return json({ error: 'Invalid url' }, 400);

  try {
    const res = await fetch(u, { headers: { Range: `bytes=0-${MAX - 1}`, Accept: 'image/jpeg,image/*;q=0.8' } });
    if (!res.ok) return json({ o: 1, w: 0, h: 0 });
    return json(jpegInfo(await readHead(res)), 200, 'public, max-age=86400');
  } catch {
    return json({ o: 1, w: 0, h: 0 });
  }
};

export const config = { path: '/api/orient' };

function json(body, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
}

// The server may ignore the Range header, so stop reading after MAX bytes ourselves.
async function readHead(res) {
  const reader = res.body.getReader();
  const out = new Uint8Array(MAX);
  let n = 0;
  while (n < MAX) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.length, MAX - n);
    out.set(value.subarray(0, take), n);
    n += take;
  }
  reader.cancel().catch(() => {});
  return out.subarray(0, n);
}

export function jpegInfo(buf) {
  const info = { o: 1, w: 0, h: 0 };
  try {
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (v.getUint16(0) !== 0xffd8) return info;
    let p = 2;
    while (p + 4 <= v.byteLength) {
      const marker = v.getUint16(p);
      if ((marker & 0xff00) !== 0xff00) break;
      const len = v.getUint16(p + 2);
      if (marker === 0xffe1 && v.getUint32(p + 4) === 0x45786966) info.o = exifOrientation(v, p + 10);
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xffc0 && marker <= 0xffcf && marker !== 0xffc4 && marker !== 0xffc8 && marker !== 0xffcc) {
        info.h = v.getUint16(p + 5);
        info.w = v.getUint16(p + 7);
        break;
      }
      if (marker === 0xffda) break; // image data starts, no more headers
      p += 2 + len;
    }
  } catch {}
  return info;
}

function exifOrientation(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const ifd = tiff + v.getUint32(tiff + 4, le);
  const count = v.getUint16(ifd, le);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (v.getUint16(e, le) === 0x0112) {
      const o = v.getUint16(e + 8, le);
      return o >= 1 && o <= 8 ? o : 1;
    }
  }
  return 1;
}
