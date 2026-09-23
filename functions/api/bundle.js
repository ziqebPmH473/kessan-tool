/**
 * PJ をひとまとめに取り出す（1回の通信で、行と、その PJ のファイル全部）。
 *
 *   POST /api/bundle  { id, etags: { '<ns>/<pid>/<名前>': etag, ... } }
 *   → { ok, doc, media: { '<ns>/<fk>': { etag, unchanged:true } | { etag, body:<保存した JSON> } }, keys: { ns: [fk...] }, more: [...] }
 *
 * - etags に画面側が持っている版を渡すと、同じものは中身を送らない（unchanged）。
 * - 名前空間は files / tts / ya / yn。ナレスラのひな形（yn/_common/tpl）も一緒に返す。
 * - Cloudflare の無料プランは1回の実行で使える呼び出しに上限があるので、ファイルは MAX_GET 個まで。超えた分は more に名前だけ返す（画面側が1つずつ取りに行く）。
 * - D1 / R2 が紐づいていないときは 503（画面側は今までどおり1つずつ読む）。
 */

const NS = ['files', 'tts', 'ya', 'yn'];
const MAX_GET = 36;

export async function onRequestPost(context) {
  const db = context.env.DB, b = context.env.MEDIA;
  if (!db || !b) return json({ ok: false, error: 'D1 / R2 が紐づいていません', notReady: true }, 503);
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ ok: false, error: '内容を読み取れませんでした' }, 400); }
  const id = body && body.id;
  if (!id || typeof id !== 'string') return json({ ok: false, error: 'id がありません' }, 400);
  const etags = (body.etags && typeof body.etags === 'object') ? body.etags : {};
  try {
    // 行
    const row = await db.prepare('SELECT id, kind, title, json, version, created_at, updated_at, meta FROM projects WHERE id = ?').bind(id).first();
    const parseJ = s => { try { return JSON.parse(s); } catch (e) { return null; } };
    const doc = row ? { kind: row.kind, title: row.title, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, meta: parseJ(row.meta) || {}, json: parseJ(row.json) } : null;

    // ファイルの名前（名前空間ごとに一覧）
    const keys = {};
    const want = [];   // R2 のキー
    const lists = await Promise.all(NS.map(ns => b.list({ prefix: ns + '/' + id + '/' })));
    NS.forEach((ns, i) => {
      const objs = (lists[i] && lists[i].objects) || [];
      keys[ns] = objs.map(o => o.key.slice(ns.length + 1));
      objs.forEach(o => want.push(o.key));
    });
    want.push('yn/_common/tpl');

    // 中身（同じ版は送らない）
    const take = want.slice(0, MAX_GET), more = want.slice(MAX_GET);
    const got = await Promise.all(take.map(k => {
      const et = etags[k];
      return b.get(k, et ? { onlyIf: { etagDoesNotMatch: String(et).replace(/"/g, '') } } : undefined).catch(() => null);
    }));
    // 本文は保存した JSON のまま埋め込む（読み直して組み立て直さない。大きい音声でも速いように）
    const parts = [];
    for (let i = 0; i < take.length; i++) {
      const o = got[i]; const k = take[i];
      if (!o) continue;   // 無い（ひな形が無いなど）
      if (!('body' in o) || !o.body) { parts.push(JSON.stringify(k) + ':' + JSON.stringify({ etag: o.etag, unchanged: true })); continue; }
      const text = await o.text();
      parts.push(JSON.stringify(k) + ':{"etag":' + JSON.stringify(o.etag) + ',"body":' + (text || 'null') + '}');
    }
    const out = '{"ok":true,"doc":' + JSON.stringify(doc) + ',"keys":' + JSON.stringify(keys) + ',"more":' + JSON.stringify(more) + ',"media":{' + parts.join(',') + '}}';
    return new Response(out, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
