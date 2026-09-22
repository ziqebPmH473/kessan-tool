/**
 * 作業内容の保存先（Cloudflare D1）。
 *
 *   GET    /api/state            … 保存されている行をすべて返す（json つき。初回の移行にだけ使う）
 *   GET    /api/state?list=1     … 行の一覧（json 抜き：id, kind, title, version, created_at, updated_at, meta）
 *   GET    /api/state?id=a,b,c   … 指定した行（json つき）
 *   PUT    /api/state            … 送られてきた行を保存する（version で上書き事故を防ぐ）
 *   DELETE /api/state?id=xxx     … 行を消す
 *
 * 1PJ＝1行。id は 'p:<kind>:<作成時刻>'（フェーズ2〜）。'shared' はどの種別にも属さない欄・画面の状態。
 * meta は {created, title, sub} の JSON（一覧に出すための小さな情報。本文の json とは別の列に持つ）。
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
  try { await db.prepare(`ALTER TABLE projects ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'`).run(); } catch (e) { /* すでにある */ }
  ensured = true;
}
const parseJ = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const rowMeta = r => ({ kind: r.kind, title: r.title, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, meta: parseJ(r.meta) || {} });
const rowFull = r => Object.assign(rowMeta(r), { json: parseJ(r.json) });

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return notReady();
  const url = new URL(context.request.url);
  try {
    await ensure(db);
    if (url.searchParams.get('list')) {
      const rs = await db.prepare('SELECT id, kind, title, version, created_at, updated_at, meta FROM projects ORDER BY created_at DESC').all();
      const rows = {};
      (rs.results || []).forEach(r => { rows[r.id] = rowMeta(r); });
      return json({ ok: true, rows });
    }
    const idq = url.searchParams.get('id');
    let rs;
    if (idq) {
      const ids = idq.split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length) return json({ ok: true, docs: {} });
      rs = await db.prepare(`SELECT id, kind, title, json, version, created_at, updated_at, meta FROM projects WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    } else {
      rs = await db.prepare('SELECT id, kind, title, json, version, created_at, updated_at, meta FROM projects').all();
    }
    const docs = {};
    (rs.results || []).forEach(r => { docs[r.id] = rowFull(r); });
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
    const rs = await db.prepare(`SELECT id, version, created_at FROM projects WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    (rs.results || []).forEach(r => { cur[r.id] = r; });

    // 別の端末が先に保存していたら、上書きせずに知らせる（force のときは上書き）
    const conflicts = [];
    ids.forEach(id => {
        if (body.force || (docs[id] && docs[id].force)) return;   // 行ごとの force（shared は最後に書いた方を採る）
        const have = cur[id] ? cur[id].version : 0;
        const expect = Number(docs[id].version) || 0;
        if (have !== expect) conflicts.push(id);
      });
    if (conflicts.length) {
      const rows = await db.prepare(`SELECT id, kind, title, json, version, created_at, updated_at, meta FROM projects WHERE id IN (${conflicts.map(() => '?').join(',')})`).bind(...conflicts).all();
      const out = {};
      (rows.results || []).forEach(r => { out[r.id] = rowFull(r); });
      return json({ ok: false, conflict: true, conflicts, docs: out }, 409);
    }

    const now = new Date().toISOString();
    const versions = {};
    const stmts = [];
    for (const id of ids) {
      const d = docs[id] || {};
      const text = JSON.stringify(d.json == null ? {} : d.json);
      if (text.length > MAX_JSON) return json({ ok: false, error: `${id} の内容が大きすぎて保存できません（${Math.round(text.length / 1024)}KB）` }, 413);
      const next = (cur[id] ? cur[id].version : 0) + 1;
      versions[id] = next;
      const meta = (d.meta && typeof d.meta === 'object') ? d.meta : {};
      // 作成日時は meta.created（画面側が決める）を優先。無ければ今
      const created = (cur[id] && cur[id].created_at) || (typeof meta.created === 'string' && meta.created) || now;
      stmts.push(db.prepare(
        `INSERT INTO projects (id, kind, title, json, version, created_at, updated_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, json = excluded.json, version = excluded.version, updated_at = excluded.updated_at, meta = excluded.meta`
      ).bind(id, String(d.kind || 'shared'), String(d.title || ''), text, next, created, now, JSON.stringify(meta)));
    }
    await db.batch(stmts);
    return json({ ok: true, versions, updatedAt: now });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

export async function onRequestDelete(context) {
  const db = context.env.DB;
  if (!db) return notReady();
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ ok: false, error: 'id がありません' }, 400);
  try {
    await ensure(db);
    await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}

function notReady() { return json({ ok: false, error: 'D1 が紐づいていません（ブラウザ保存で動きます）', notReady: true }, 503); }
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
