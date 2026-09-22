/**
 * 作業内容の保存先（Cloudflare D1）。
 *
 *   GET /api/state  … 保存されている PJ（行）をすべて返す
 *   PUT /api/state  … 送られてきた行を保存する（version で上書き事故を防ぐ）
 *
 * 1PJ＝1行。id は 'p:earnings' 'p:stock' 'p:price' 'p:yt'（今は種別ごとに1件。フェーズ2で複数になる）と
 * 'shared'（どの種別にも属さない欄・画面の状態・ブラウザ側の小さな設定）。
 * D1 が紐づいていない（env.DB が無い）ときは 503 を返し、画面側はブラウザ保存のまま動く。
 * テーブルは初回に自動で作る。
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
const MAX_JSON = 1900000;   // D1 の1値の上限（2MB）より少し小さく
let ensured = false;
async function ensure(db) {
  if (ensured) return;
  await db.prepare(SCHEMA).run();
  ensured = true;
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return notReady();
  try {
    await ensure(db);
    const rs = await db.prepare('SELECT id, kind, title, json, version, updated_at FROM projects').all();
    const docs = {};
    (rs.results || []).forEach(r => {
      let j = null;
      try { j = JSON.parse(r.json); } catch (e) { j = null; }
      docs[r.id] = { kind: r.kind, title: r.title, version: r.version, updatedAt: r.updated_at, json: j };
    });
    return json({ ok: true, docs });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

export async function onRequestPut(context) {
  const db = context.env.DB;
  if (!db) return notReady();
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ ok: false, error: '内容を読み取れませんでした' }, 400); }
  const docs = body && body.docs;
  if (!docs || typeof docs !== 'object') return json({ ok: false, error: 'docs がありません' }, 400);
  const ids = Object.keys(docs);
  if (!ids.length) return json({ ok: true, versions: {} });

  try {
    await ensure(db);
    const cur = {};
    const rs = await db.prepare(`SELECT id, version FROM projects WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    (rs.results || []).forEach(r => { cur[r.id] = r.version; });

    // 別の端末が先に保存していたら、上書きせずに知らせる（force のときは上書き）
    const conflicts = [];
    if (!body.force) {
      ids.forEach(id => {
        const have = cur[id] || 0;
        const expect = Number(docs[id].version) || 0;
        if (have !== expect) conflicts.push(id);
      });
    }
    if (conflicts.length) {
      const rows = await db.prepare(`SELECT id, kind, title, json, version, updated_at FROM projects WHERE id IN (${conflicts.map(() => '?').join(',')})`).bind(...conflicts).all();
      const out = {};
      (rows.results || []).forEach(r => { let j = null; try { j = JSON.parse(r.json); } catch (e) {} out[r.id] = { kind: r.kind, title: r.title, version: r.version, updatedAt: r.updated_at, json: j }; });
      return json({ ok: false, conflict: true, conflicts, docs: out }, 409);
    }

    const now = new Date().toISOString();
    const versions = {};
    const stmts = [];
    for (const id of ids) {
      const d = docs[id] || {};
      const text = JSON.stringify(d.json == null ? {} : d.json);
      if (text.length > MAX_JSON) return json({ ok: false, error: `${id} の内容が大きすぎて保存できません（${Math.round(text.length / 1024)}KB）` }, 413);
      const next = (cur[id] || 0) + 1;
      versions[id] = next;
      stmts.push(db.prepare(
        `INSERT INTO projects (id, kind, title, json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, json = excluded.json, version = excluded.version, updated_at = excluded.updated_at`
      ).bind(id, String(d.kind || 'shared'), String(d.title || ''), text, next, now, now));
    }
    await db.batch(stmts);
    return json({ ok: true, versions, updatedAt: now });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

function notReady() { return json({ ok: false, error: 'D1 が紐づいていません（ブラウザ保存で動きます）', notReady: true }, 503); }
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
