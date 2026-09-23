/**
 * 音声・PDF・画像などの保存先（Cloudflare R2）。中身は画面側で JSON にしたもの（Blob は base64）。
 *
 *   GET    /api/media?prefix=<ns>/<pid>/   … その前置きで始まるキー一覧（前置きを除いた形で返す）
 *   GET    /api/media?ns=<名前空間>          … 名前空間の全キー（前置き ns/ を除いた形）
 *   GET    /api/media/<ns>/<key>            … 1件を返す（無ければ 404）
 *   PUT    /api/media/<ns>/<key>            … 1件を保存
 *   DELETE /api/media/<ns>/<key>            … 1件を消す
 *   DELETE /api/media?prefix=<ns>/<pid>/    … 前置きで始まるものを全部消す（PJ の削除）
 *   POST   /api/media?from=<a>&to=<b>       … キーを移す（初回移行用。読んで書いて消す）
 *
 * key は PJ ごとに '<pid>/<名前>'。URL では key を丸ごと encodeURIComponent する。
 * R2 が紐づいていない（env.MEDIA が無い）ときは 503 を返し、画面側は端末内（IndexedDB）保存のまま動く。
 */

function keyOf(params) {
  const seg = (params && params.path) || [];
  if (seg.length < 2) return null;
  const ns = seg[0];
  let rest = seg.slice(1).join('/');
  try { rest = decodeURIComponent(rest); } catch (e) {}
  return ns + '/' + rest;
}

async function listKeys(b, prefix) {
  const keys = [];
  let cursor;
  do {
    const l = await b.list({ prefix, cursor });
    (l.objects || []).forEach(o => keys.push(o.key));
    cursor = l.truncated ? l.cursor : null;
  } while (cursor);
  return keys;
}

export async function onRequestGet(context) {
  const b = context.env.MEDIA;
  if (!b) return notReady();
  const url = new URL(context.request.url);
  const seg = (context.params && context.params.path) || [];
  try {
    if (!seg.length) {
      let prefix = url.searchParams.get('prefix');
      if (!prefix) { const ns = url.searchParams.get('ns'); if (!ns) return json({ ok: false, error: 'prefix がありません' }, 400); prefix = ns + '/'; }
      const keys = await listKeys(b, prefix);
      return json({ ok: true, keys: keys.map(k => k.slice(prefix.length)) });
    }
    const key = keyOf(context.params);
    if (!key) return json({ ok: false, error: 'キーがありません' }, 400);
    // If-None-Match：画面側が持っている版と同じなら中身を送らない（304）。同じ端末で開き直すたびに音声やスライドを丸ごと読まないように
    const inm = (context.request.headers.get('if-none-match') || '').replace(/^W\//, '').replace(/"/g, '');
    const o = await b.get(key, inm ? { onlyIf: { etagDoesNotMatch: inm } } : undefined);
    if (!o) return json({ ok: false, error: 'なし' }, 404);
    const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-kt-etag': o.etag };
    if (!('body' in o) || !o.body) return new Response(null, { status: 304, headers: h });
    return new Response(o.body, { headers: h });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

export async function onRequestPut(context) {
  const b = context.env.MEDIA;
  if (!b) return notReady();
  const key = keyOf(context.params);
  if (!key) return json({ ok: false, error: 'キーがありません' }, 400);
  try {
    const buf = await context.request.arrayBuffer();
    const o = await b.put(key, buf, { httpMetadata: { contentType: 'application/json' } });
    return json({ ok: true, size: buf.byteLength, etag: o && o.etag });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

export async function onRequestDelete(context) {
  const b = context.env.MEDIA;
  if (!b) return notReady();
  const url = new URL(context.request.url);
  const seg = (context.params && context.params.path) || [];
  try {
    if (!seg.length) {
      const prefix = url.searchParams.get('prefix');
      if (!prefix || prefix.length < 3) return json({ ok: false, error: 'prefix がありません' }, 400);
      const keys = await listKeys(b, prefix);
      for (let i = 0; i < keys.length; i += 500) await b.delete(keys.slice(i, i + 500));
      return json({ ok: true, deleted: keys.length });
    }
    const key = keyOf(context.params);
    if (!key) return json({ ok: false, error: 'キーがありません' }, 400);
    await b.delete(key);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

export async function onRequestPost(context) {
  const b = context.env.MEDIA;
  if (!b) return notReady();
  const url = new URL(context.request.url);
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!from || !to) return json({ ok: false, error: 'from / to がありません' }, 400);
  try {
    const o = await b.get(from);
    if (!o) return json({ ok: true, moved: false });
    await b.put(to, await o.arrayBuffer(), { httpMetadata: { contentType: 'application/json' } });
    await b.delete(from);
    return json({ ok: true, moved: true });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

function notReady() { return json({ ok: false, error: 'R2 が紐づいていません', notReady: true }, 503); }
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
