/**
 * 音声・PDF・画像などの保存先（Cloudflare R2）。中身は画面側で JSON にしたもの（Blob は base64）。
 *
 *   GET    /api/media?ns=<名前空間>     … その名前空間のキー一覧
 *   GET    /api/media/<ns>/<key>        … 1件を返す（無ければ 404）
 *   PUT    /api/media/<ns>/<key>        … 1件を保存
 *   DELETE /api/media/<ns>/<key>        … 1件を消す
 *
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

export async function onRequestGet(context) {
  const b = context.env.MEDIA;
  if (!b) return notReady();
  const url = new URL(context.request.url);
  const seg = (context.params && context.params.path) || [];
  try {
    if (!seg.length) {
      const ns = url.searchParams.get('ns');
      if (!ns) return json({ ok: false, error: 'ns がありません' }, 400);
      const prefix = ns + '/';
      const keys = [];
      let cursor;
      do {
        const l = await b.list({ prefix, cursor });
        (l.objects || []).forEach(o => keys.push(o.key.slice(prefix.length)));
        cursor = l.truncated ? l.cursor : null;
      } while (cursor);
      return json({ ok: true, keys });
    }
    const key = keyOf(context.params);
    if (!key) return json({ ok: false, error: 'キーがありません' }, 400);
    const o = await b.get(key);
    if (!o) return json({ ok: false, error: 'なし' }, 404);
    return new Response(o.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
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
    await b.put(key, buf, { httpMetadata: { contentType: 'application/json' } });
    return json({ ok: true, size: buf.byteLength });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

export async function onRequestDelete(context) {
  const b = context.env.MEDIA;
  if (!b) return notReady();
  const key = keyOf(context.params);
  if (!key) return json({ ok: false, error: 'キーがありません' }, 400);
  try {
    await b.delete(key);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

function notReady() { return json({ ok: false, error: 'R2 が紐づいていません', notReady: true }, 503); }
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
