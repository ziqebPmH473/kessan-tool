/*
 * 保存の層（KTStore）v2 — PJ 単位
 *
 * 画面の入力内容と、音声・PDF・画像などのファイルを、サーバー（Cloudflare D1 / R2）に保存する。
 * サーバーが無い（紐づけ前・ローカル開発）ときは、今までどおりブラウザ（localStorage / IndexedDB）だけに保存する。
 *
 * 用語
 * - kind：種別（earnings / stock / price / yt）。
 * - PJ：1つの作業。行 id は 'p:<kind>:<作成時刻>-<乱数>'。ブラウザのタブごとに「いま開いている PJ」を kind ごとに持つ（sessionStorage）。
 *   PJ が無い（空で開いている）kind は、何か変わった時点で初めて行を作る。
 * - shared：どの kind にも属さない欄・画面の状態・小さな設定。タブどうしで取り合うので、最後に書いた方を採る（force）。
 * - ファイル：mediaNs(名前空間, 端末内の保存先, {kindOf, legacy}) で包む。キーは '<pid>/<名前>'（端末内も同じ）。
 *
 * 起動 ready()：タブが覚えている PJ（無ければ「最後に開いた PJ」）の行をサーバーから読んで localStorage に写し、
 * そのあと今までの restoreState() が動く。サーバーが空なら、この端末の内容をまとめて取り込む（初回だけ）。
 * フェーズ1の行（'p:earnings' など）とファイルキー（pid 無し）は、見つけたら新しい形に移す。
 */
(function () {
  'use strict';
  const LS_KEY = 'kessanTool:v1';
  const LS_SYNC = ['kt-yt-ctx', 'kt-yt-fields-stock', 'kt-yt-fields-gen', 'yt-m-def38', 'kt-rel-days-365'];
  const META_KEY = 'kt-sync-meta';       // localStorage：{versions, media}
  const CUR_KEY = 'kt-cur';              // sessionStorage：このタブが開いている PJ {kind: id}／localStorage：最後に開いた PJ
  const PENDING_KEY = 'kt-pending';      // sessionStorage：送れていない行（リロードで拾う）
  const TABS = ['earnings', 'stock', 'price', 'yt'];
  const EXTRA = { earnings: 'earnFetched', stock: 'fetched', price: 'priceFetched' };
  const PUSH_DELAY = 900;
  const OPEN_LAST_ON_NEW_TAB = false;    // 新しいタブは空で始める（続きは PJ の一覧から選ぶ）。true にすると「最後に開いた PJ」を開く
  const LEGACY_ID = /^p:(earnings|stock|price|yt)$/;

  const S = {
    mode: 'local',          // 'local' | 'server'
    ready: null,
    cur: {},                // kind → id（このタブ）
    created: {},            // id → 作成時刻（新しく作った行）
    sub: {},                // id → 用途（株価分析のその後 など。今は入れ物だけ）
    base: {},               // kind → 空で開いているときの、いちばん最近の JSON（ユーザーが触るまで追いかける）
    touched: {},            // kind → 'input'（欄を打った・貼った）| 'click'（何か押した）。空の PJ に行を作る合図
    titleOf: null,          // (kind, fields) → 見出し。行の中身（持ち越し込み）から作る
    force: {},              // kind → true（ファイルを入れたので行を作る）
    versions: {},           // id → サーバーの version
    last: {},               // id → 最後にサーバーと合った JSON 文字列
    pending: {},            // id → 送る予定の行
    rows: {},               // id → 一覧の情報（?list=1）
    timer: null, pushing: false, again: false,
    ns: {},                 // 名前空間 → {local, kindOf, legacy}
    mediaQueue: {},         // 'ns/pid/key' → 1（送る予定のファイル）
    mediaRunning: false,
    status: 'local',
    conflict: null,
    readyResolve: null,
    suspended: false,       // PJ の切り替え中：欄の値を行に写さない（古い欄の値を新しい行に入れないため）
    onChange: null,         // 行の一覧が変わったとき（保存で見出しが変わった等）に呼ぶ
  };
  // 画面の初期化（vdInit など）は onload より前に走り、そこでファイルを読みに来る。ready() が終わるまで待たせる
  S.readyWait = new Promise(res => { S.readyResolve = res; });

  // ---- 小物 ----
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} };
  const parse = s => { try { return JSON.parse(s || 'null'); } catch (e) { return null; } };
  const nowIso = () => new Date().toISOString();
  function newId(kind) {
    const d = new Date(); const p = n => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return `p:${kind}:${ts}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const kindOfId = id => { const m = /^p:([a-z]+)(?::|$)/.exec(id || ''); return m ? m[1] : null; };
  function metaLoad() { const m = parse(lsGet(META_KEY)) || {}; S.versions = m.versions || {}; S.mediaQueue = m.media || {}; }
  function metaSave() { lsSet(META_KEY, JSON.stringify({ versions: S.versions, media: S.mediaQueue })); }
  function curSave() { ssSet(CUR_KEY, JSON.stringify(S.cur)); lsSet(CUR_KEY, JSON.stringify(Object.assign(parse(lsGet(CUR_KEY)) || {}, S.cur))); }
  function pendingSave() {
    const out = {};
    Object.keys(S.pending).forEach(id => { const d = S.pending[id]; out[id] = { kind: d.kind, title: d.title, meta: d.meta, json: d.json, force: !!d.force }; });
    ssSet(PENDING_KEY, Object.keys(out).length ? JSON.stringify(out) : null);
  }

  // Access のログインが切れると、API はログイン画面へ転送される。redirect:'manual' にして見分ける。
  async function api(url, opts) {
    const o = Object.assign({ redirect: 'manual', cache: 'no-store' }, opts || {});
    o.headers = Object.assign({}, o.headers || {});
    if (o.body && typeof o.body === 'string' && !o.headers['content-type']) o.headers['content-type'] = 'application/json';
    const r = await fetch(url, o);
    if (r.type === 'opaqueredirect' || r.status === 0) { const e = new Error('login'); e.login = true; setStatus('login'); throw e; }
    return r;
  }

  // ---- PJ の id ----
  // その kind で開いている PJ の id。無ければ作る（create=true）。ファイルを入れたときは行も作るので saveStateNow を呼ぶ
  function pidFor(kind, create) {
    if (S.cur[kind]) return S.cur[kind];
    if (!create) return null;
    const id = newId(kind);
    S.cur[kind] = id; S.created[id] = nowIso(); S.force[kind] = true; curSave();
    setTimeout(() => { try { if (typeof window.saveStateNow === 'function') window.saveStateNow(); } catch (e) {} }, 0);
    return id;
  }

  // ---- state ⇄ 行 ----
  // byTab[tab] = {fields, radios, title}（どの欄がどの種別のものか）。値は state.fields の方を使う。
  function buildKindDocs(state, byTab) {
    const docs = {}; const used = new Set(), usedR = new Set();
    TABS.forEach(t => {
      const c = (byTab && byTab[t]) || { fields: {}, radios: {} };
      const fields = {}, radios = {};
      Object.keys(c.fields || {}).forEach(id => { if (used.has(id)) return; used.add(id); fields[id] = (state.fields && state.fields[id] !== undefined) ? state.fields[id] : c.fields[id]; });
      Object.keys(c.radios || {}).forEach(n => { if (usedR.has(n)) return; usedR.add(n); radios[n] = (state.radios && state.radios[n] !== undefined) ? state.radios[n] : c.radios[n]; });
      const d = { fields, radios };
      if (EXTRA[t]) d[EXTRA[t]] = state[EXTRA[t]] || null;
      docs[t] = { kind: t, title: String(c.title || ''), json: d };
    });
    const sf = {}, sr = {};
    Object.keys(state.fields || {}).forEach(id => { if (!used.has(id)) sf[id] = state.fields[id]; });
    Object.keys(state.radios || {}).forEach(n => { if (!usedR.has(n)) sr[n] = state.radios[n]; });
    const ls = {}; LS_SYNC.forEach(k => { const v = lsGet(k); if (v != null) ls[k] = v; });
    docs.shared = { kind: 'shared', title: '', json: { fields: sf, radios: sr, ui: state.ui || null, ls, current: Object.assign({}, parse(lsGet(CUR_KEY)) || {}, S.cur) }, force: true };
    return docs;
  }
  // docs：id → {kind, json}。kind ごとの行と shared を合わせて、restoreState() が読む形にする
  function docsToState(docs) {
    const state = { fields: {}, radios: {}, fetched: null, earnFetched: null, priceFetched: null, ui: null };
    const mode = ssGet('kt-mode');
    const ordered = Object.keys(docs).sort((a, b) => ((docs[a] && docs[a].kind) === mode ? 1 : 0) - ((docs[b] && docs[b].kind) === mode ? 1 : 0));
    ordered.forEach(id => {
      const d = docs[id]; if (!d || !d.json || d.kind === 'shared') return;
      const t = d.kind || kindOfId(id); if (!TABS.includes(t)) return;
      Object.assign(state.fields, d.json.fields || {}); Object.assign(state.radios, d.json.radios || {});
      if (EXTRA[t]) state[EXTRA[t]] = d.json[EXTRA[t]] || null;
    });
    const sh = docs.shared && docs.shared.json;
    if (sh) { Object.assign(state.fields, sh.fields || {}); Object.assign(state.radios, sh.radios || {}); state.ui = sh.ui || null; }
    return state;
  }
  function applyDocsToLocal(docs) {
    lsSet(LS_KEY, JSON.stringify(docsToState(docs)));
    const ls = (docs.shared && docs.shared.json && docs.shared.json.ls) || {};
    LS_SYNC.forEach(k => lsSet(k, ls[k] != null ? ls[k] : null));
  }
  const metaOf = (id, title) => ({ created: S.created[id] || (S.rows[id] && (S.rows[id].meta || {}).created) || (S.rows[id] && S.rows[id].createdAt) || nowIso(), title: title || '', sub: S.sub[id] || (S.rows[id] && (S.rows[id].meta || {}).sub) || '' });

  // ---- 入力内容の保存 ----
  function saveState(state, byTab) {
    lsSet(LS_KEY, JSON.stringify(state));
    if (S.suspended) return;
    const kd = buildKindDocs(state, byTab);
    let changed = false;
    TABS.forEach(t => {
      const d = kd[t];
      let id = S.cur[t];
      if (id) {
        // 持ち越し：いま画面に無い欄（別の種別の側に移っている横動画の欄など）は、前に保存した値を残す。
        // 行の json は丸ごと置き換わるので、こうしないと消えてしまう
        const prev = S.last[id] ? parse(S.last[id]) : (S.pending[id] && S.pending[id].json);
        if (prev && prev.fields) d.json.fields = Object.assign({}, prev.fields, d.json.fields);
        if (prev && prev.radios) d.json.radios = Object.assign({}, prev.radios, d.json.radios);
      }
      const j = JSON.stringify(d.json);
      if (!id) {
        // 空で開いている：ユーザーが触るまでは行を作らない（初期化や描き直しで欄が変わっても増やさない）
        const touched = S.touched[t];
        if (!S.force[t]) {
          if (!touched) { S.base[t] = j; return; }
          if (touched === 'click' && j === S.base[t]) return;
        }
        id = newId(t); S.cur[t] = id; S.created[id] = nowIso(); delete S.touched[t]; delete S.base[t]; curSave();
      }
      delete S.force[t];
      if (j === S.last[id]) return;
      const title = (typeof S.titleOf === 'function') ? (S.titleOf(t, d.json.fields || {}) || '') : d.title;
      S.pending[id] = { kind: t, title, meta: metaOf(id, title), json: d.json, jsonStr: j }; changed = true;
    });
    const sj = JSON.stringify(kd.shared.json);
    if (sj !== S.last.shared) { S.pending.shared = { kind: 'shared', title: '', meta: {}, json: kd.shared.json, jsonStr: sj, force: true }; changed = true; }
    if (!changed) return;
    pendingSave();
    if (S.mode !== 'server') return;
    setStatus('saving'); schedulePush(PUSH_DELAY);
  }
  function schedulePush(ms) { clearTimeout(S.timer); S.timer = setTimeout(() => push(false), ms); }
  async function push(force) {
    if (S.mode !== 'server') return;
    if (S.pushing) { S.again = true; return; }
    const ids = Object.keys(S.pending); if (!ids.length) return;
    S.pushing = true;
    const sent = S.pending; S.pending = {};
    const body = { docs: {}, force: !!force };
    ids.forEach(id => { const d = sent[id]; body.docs[id] = { kind: d.kind, title: d.title, meta: d.meta, version: S.versions[id] || 0, json: d.json, force: !!d.force }; });
    const restore = () => { ids.forEach(id => { if (!S.pending[id]) S.pending[id] = sent[id]; }); pendingSave(); };
    try {
      const r = await api('/api/state', { method: 'PUT', body: JSON.stringify(body) });
      if (r.status === 409) {
        const j = await r.json(); restore(); S.conflict = { server: j.docs || {}, ids: j.conflicts || [] }; showConflict(); setStatus('conflict');
      } else if (!r.ok) {
        let msg = 'HTTP ' + r.status; try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) {}
        restore(); setStatus('error', msg); schedulePush(8000);
      } else {
        const j = await r.json();
        Object.keys(j.versions || {}).forEach(id => {
          S.versions[id] = j.versions[id]; S.last[id] = sent[id].jsonStr;
          if (!S.rows[id] && sent[id].kind !== 'shared') S.rows[id] = { kind: sent[id].kind, title: sent[id].title, createdAt: sent[id].meta.created, meta: sent[id].meta };
          else if (S.rows[id]) { S.rows[id].title = sent[id].title; S.rows[id].meta = sent[id].meta; }
        });
        metaSave(); pendingSave();
        if (!Object.keys(S.pending).length && !S.mediaRunning) setStatus('saved');
        try { if (typeof S.onChange === 'function') S.onChange(); } catch (e) {}
      }
    } catch (e) {
      restore(); if (!e.login) { setStatus('error'); schedulePush(8000); }
    } finally {
      S.pushing = false;
      if (S.again) { S.again = false; schedulePush(300); }
    }
  }
  // 閉じる直前：送り残しがあれば、小さいときだけその場で送る（大きいときは開き直したときに sessionStorage から拾う）
  function flushOnHide() {
    if (S.mode !== 'server' || S.pushing) return;
    const ids = Object.keys(S.pending); if (!ids.length) return;
    const body = { docs: {} };
    ids.forEach(id => { const d = S.pending[id]; body.docs[id] = { kind: d.kind, title: d.title, meta: d.meta, version: S.versions[id] || 0, json: d.json, force: !!d.force }; });
    const text = JSON.stringify(body);
    if (text.length > 60000) return;
    try {
      fetch('/api/state', { method: 'PUT', body: text, headers: { 'content-type': 'application/json' }, keepalive: true, redirect: 'manual' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          if (!j || !j.versions) return;
          Object.keys(j.versions).forEach(id => { S.versions[id] = j.versions[id]; if (S.pending[id]) S.last[id] = S.pending[id].jsonStr; delete S.pending[id]; });
          metaSave(); pendingSave();
        }).catch(() => {});
    } catch (e) {}
  }
  window.addEventListener('pagehide', flushOnHide);

  // ---- 別の端末と食い違ったとき ----
  function showConflict() {
    let bar = document.getElementById('kt-conflict');
    if (bar) return;
    bar = document.createElement('div'); bar.id = 'kt-conflict';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#fff7ed;border-bottom:2px solid #f59e0b;color:#7c2d12;padding:10px 14px;font-size:14px;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.15);';
    bar.innerHTML = '<span style="flex:1;min-width:200px;">別の端末（またはタブ）で同じPJが保存されています。どちらを残しますか？</span>'
      + '<button type="button" id="kt-conflict-load" style="padding:6px 12px;border:1px solid #f59e0b;background:#fff;border-radius:6px;cursor:pointer;">向こうの内容を読み込む</button>'
      + '<button type="button" id="kt-conflict-force" style="padding:6px 12px;border:1px solid #b45309;background:#b45309;color:#fff;border-radius:6px;cursor:pointer;">この画面の内容で上書き</button>';
    document.body.appendChild(bar);
    bar.querySelector('#kt-conflict-load').onclick = () => {
      // サーバーの内容を localStorage に書いてから開き直す（食い違った行だけ差し替え）
      const docs = {};
      Object.keys(S.last).forEach(id => { docs[id] = { kind: id === 'shared' ? 'shared' : kindOfId(id), json: parse(S.last[id]) }; });
      Object.keys(S.pending).forEach(id => { if (!docs[id]) docs[id] = { kind: S.pending[id].kind, json: S.pending[id].json }; });
      Object.assign(docs, S.conflict.server);
      applyDocsToLocal(docs);
      S.pending = {}; pendingSave();
      Object.keys(S.conflict.server).forEach(id => { S.versions[id] = S.conflict.server[id].version; });
      metaSave();
      location.reload();
    };
    bar.querySelector('#kt-conflict-force').onclick = () => {
      Object.keys(S.conflict.server).forEach(id => { S.versions[id] = S.conflict.server[id].version; });
      S.conflict = null; bar.remove(); push(true);
    };
  }

  // ---- 状態の表示（右下の小さな札） ----
  const STATUS_TEXT = {
    local: ['ブラウザに保存', '#6b7280', 'サーバーが紐づいていないので、この端末の中だけに保存しています'],
    saved: ['サーバーに保存済み', '#059669', '別の端末でも同じ内容が出ます'],
    saving: ['保存中…', '#2563eb', ''],
    error: ['保存できませんでした（あとで再試行）', '#dc2626', ''],
    conflict: ['別の端末と食い違い', '#d97706', '画面の上の案内から選んでください'],
    login: ['ログインが切れました。押して開き直す', '#dc2626', ''],
    migrating: ['この端末の内容を取り込み中…', '#2563eb', '初回だけ。終わるまで閉じないでください'],
  };
  function setStatus(st, detail) {
    S.status = st;
    let el = document.getElementById('kt-sync');
    if (!el) {
      if (!document.body) return;
      el = document.createElement('div'); el.id = 'kt-sync';
      el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99998;font-size:11px;line-height:1;padding:5px 9px;border-radius:999px;background:#fff;border:1px solid #d1d5db;color:#374151;box-shadow:0 1px 4px rgba(0,0,0,.12);cursor:default;user-select:none;';
      el.onclick = () => { if (S.status === 'login') location.reload(); };
      document.body.appendChild(el);
    }
    const t = STATUS_TEXT[st] || STATUS_TEXT.local;
    el.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + t[1] + ';margin-right:6px;vertical-align:middle;"></span>' + t[0];
    el.title = detail || t[2] || '';
    el.style.cursor = st === 'login' ? 'pointer' : 'default';
  }

  // ---- ファイル（Blob を base64 にして JSON で送る） ----
  const blobToUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  async function encode(v) {
    if (v == null) return v;
    if (typeof Blob !== 'undefined' && v instanceof Blob) return { __kt: 'blob', type: v.type || '', name: v.name || '', url: await blobToUrl(v) };
    if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await encode(x)); return out; }
    if (typeof v === 'object') { const out = {}; for (const k of Object.keys(v)) out[k] = await encode(v[k]); return out; }
    return v;
  }
  async function decode(v) {
    if (v == null) return v;
    if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await decode(x)); return out; }
    if (typeof v === 'object') {
      if (v.__kt === 'blob' && typeof v.url === 'string') {
        const b = await (await fetch(v.url)).blob();
        if (v.name) { try { return new File([b], v.name, { type: v.type || b.type }); } catch (e) {} }
        return b;
      }
      const out = {}; for (const k of Object.keys(v)) out[k] = await decode(v[k]); return out;
    }
    return v;
  }
  const mediaUrl = (ns, fullKey) => '/api/media/' + encodeURIComponent(ns) + '/' + encodeURIComponent(fullKey);

  // local = {get(key), put(key, val), del(key), list()}（端末内の IndexedDB）
  // kindOf(key) → kind または '_common'（PJ をまたいで共通）。legacy(key) → {kind, key}（pid 無しの古いキーの行き先）
  function mediaNs(ns, local, opts) {
    const kindOf = (opts && opts.kindOf) || (() => '_common');
    S.ns[ns] = { local, kindOf, legacy: (opts && opts.legacy) || (k => ({ kind: kindOf(k), key: k })) };
    const full = (key, create) => { const k = kindOf(key); const pid = k === '_common' ? '_common' : pidFor(k, create); return pid ? pid + '/' + key : null; };
    return {
      async get(key) {
        await S.readyWait;
        const fk = full(key, false); if (!fk) return null;
        if (S.mode !== 'server' || S.mediaQueue[ns + '/' + fk]) return local.get(fk);   // 送る途中のものは端末内の方が新しい
        try {
          const r = await api(mediaUrl(ns, fk), { method: 'GET' });
          if (r.status === 404) return null;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const v = await decode(await r.json());
          local.put(fk, v).catch(() => {});
          return v;
        } catch (e) { return local.get(fk); }
      },
      async put(key, val) {
        await S.readyWait;
        const fk = full(key, true);
        await local.put(fk, val);
        if (S.mode !== 'server') return;
        S.mediaQueue[ns + '/' + fk] = 1; metaSave(); runMedia();
      },
      async del(key) {
        await S.readyWait;
        const fk = full(key, false); if (!fk) return;
        await local.del(fk);
        if (S.mode !== 'server') return;
        S.mediaQueue[ns + '/' + fk] = 1; metaSave(); runMedia();
      },
      // sample：どの PJ のものかを決めるための代表のキー（'ev:' など）。返すキーは pid 抜き
      async list(sample) {
        await S.readyWait;
        const k = kindOf(sample || ''); const pid = k === '_common' ? '_common' : pidFor(k, false);
        if (!pid) return [];
        const prefix = pid + '/';
        const fromLocal = async () => (await local.list()).filter(x => x.startsWith(prefix)).map(x => x.slice(prefix.length));
        if (S.mode !== 'server') return fromLocal();
        try {
          const r = await api('/api/media?prefix=' + encodeURIComponent(ns + '/' + prefix), { method: 'GET' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const j = await r.json(); const keys = j.keys || [];
          Object.keys(S.mediaQueue).forEach(q => { if (q.startsWith(ns + '/' + prefix)) { const kk = q.slice(ns.length + 1 + prefix.length); if (!keys.includes(kk)) keys.push(kk); } });
          return keys;
        } catch (e) { return fromLocal(); }
      },
    };
  }
  async function runMedia() {
    if (S.mode !== 'server' || S.mediaRunning) return;
    S.mediaRunning = true;
    let failed = false;
    try {
      for (;;) {
        const keys = Object.keys(S.mediaQueue); if (!keys.length) break;
        const q = keys[0]; const i = q.indexOf('/'); const ns = q.slice(0, i), fk = q.slice(i + 1);
        const ent = S.ns[ns];
        if (!ent) { delete S.mediaQueue[q]; metaSave(); continue; }
        if (S.status !== 'migrating') setStatus('saving');
        try {
          const v = await ent.local.get(fk);
          const r = (v == null)
            ? await api(mediaUrl(ns, fk), { method: 'DELETE' })
            : await api(mediaUrl(ns, fk), { method: 'PUT', body: JSON.stringify(await encode(v)) });
          if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
          delete S.mediaQueue[q]; metaSave();
        } catch (e) {
          failed = true;
          if (!e.login) { setStatus('error', String((e && e.message) || e)); setTimeout(runMedia, 10000); }
          break;
        }
      }
    } finally {
      S.mediaRunning = false;
      if (!failed && !Object.keys(S.pending).length && !S.pushing) setStatus('saved');
    }
  }

  // ---- 古い形（pid 無し）のファイルキーを PJ ごとの形へ ----
  // 端末内：'earn' → '<pid>/earn'、'gen:audio' → '<yt の pid>/audio' など
  async function migrateLocalMedia() {
    for (const ns of Object.keys(S.ns)) {
      const ent = S.ns[ns];
      let keys = []; try { keys = await ent.local.list(); } catch (e) { continue; }
      for (const k of keys) {
        if (k.includes('/')) continue;
        const to = ent.legacy(k); if (!to) continue;
        const pid = to.kind === '_common' ? '_common' : pidFor(to.kind, true);
        try { const v = await ent.local.get(k); if (v != null) await ent.local.put(pid + '/' + to.key, v); await ent.local.del(k); } catch (e) { console.warn('[store] 端末内ファイルの移行に失敗', ns, k, e); }
      }
    }
  }
  // サーバー：同じことを R2 で（読んで書いて消す）
  async function migrateServerMedia() {
    for (const ns of Object.keys(S.ns)) {
      const ent = S.ns[ns];
      let keys = [];
      try { const r = await api('/api/media?ns=' + encodeURIComponent(ns), { method: 'GET' }); if (!r.ok) continue; keys = (await r.json()).keys || []; } catch (e) { continue; }
      for (const k of keys) {
        if (k.includes('/')) continue;
        const to = ent.legacy(k); if (!to) continue;
        const pid = to.kind === '_common' ? '_common' : pidFor(to.kind, true);
        try { await api('/api/media?from=' + encodeURIComponent(ns + '/' + k) + '&to=' + encodeURIComponent(ns + '/' + pid + '/' + to.key), { method: 'POST' }); } catch (e) { console.warn('[store] サーバーのファイルの移行に失敗', ns, k, e); }
      }
    }
  }

  // ---- 一覧・PJ の操作（フェーズ2b の画面から使う）----
  async function refreshRows() {
    if (S.mode !== 'server') return S.rows;
    const r = await api('/api/state?list=1', { method: 'GET' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); S.rows = j.rows || {};
    return S.rows;
  }
  function listProjects(kind) {
    return Object.keys(S.rows).filter(id => S.rows[id].kind === kind && !LEGACY_ID.test(id))
      .map(id => Object.assign({ id }, S.rows[id]))
      .sort((a, b) => String((b.meta || {}).created || b.createdAt || '').localeCompare(String((a.meta || {}).created || a.createdAt || '')));
  }
  async function fetchDocs(ids) {
    ids = ids.filter(Boolean); if (!ids.length) return {};
    const r = await api('/api/state?id=' + encodeURIComponent(ids.join(',')), { method: 'GET' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()).docs || {};
  }
  // その kind で開く PJ を切り替える（行の中身を返す。画面への反映は呼ぶ側）。id=null で空の PJ
  async function openProject(kind, id) {
    await flush();
    S.cur[kind] = id || null; delete S.base[kind]; delete S.force[kind]; delete S.touched[kind]; curSave();
    if (!id) return null;
    if (S.mode !== 'server') return null;
    const docs = await fetchDocs([id]); const d = docs[id];
    if (d) { S.versions[id] = d.version; S.last[id] = JSON.stringify(d.json); metaSave(); }
    return d ? d.json : null;
  }
  async function deleteProject(id) {
    const kind = kindOfId(id);
    if (S.mode === 'server') {
      const r = await api('/api/state?id=' + encodeURIComponent(id), { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      for (const ns of Object.keys(S.ns)) { try { await api('/api/media?prefix=' + encodeURIComponent(ns + '/' + id + '/'), { method: 'DELETE' }); } catch (e) {} }
    }
    for (const ns of Object.keys(S.ns)) {
      const ent = S.ns[ns];
      try { const keys = await ent.local.list(); for (const k of keys) if (k.startsWith(id + '/')) await ent.local.del(k); } catch (e) {}
    }
    Object.keys(S.mediaQueue).forEach(q => { if (q.includes('/' + id + '/')) delete S.mediaQueue[q]; });
    delete S.rows[id]; delete S.versions[id]; delete S.last[id]; delete S.pending[id];
    if (kind && S.cur[kind] === id) { S.cur[kind] = null; delete S.base[kind]; delete S.touched[kind]; curSave(); }
    metaSave(); pendingSave();
  }
  function flush() { clearTimeout(S.timer); return push(false); }

  // ---- 起動 ----
  // opts.collect(tab, state) → {fields, radios, title}（どの欄がどの種別かを知るため。値は state から取る）
  function ready(opts) {
    if (S.ready) return S.ready;
    S.ready = readyInner(opts).catch(e => { console.warn('[store] 起動に失敗', e); S.mode = 'local'; setStatus('error', String(e && e.message || e)); }).then(() => { S.readyResolve(); });
    return S.ready;
  }
  function readyInner(opts) {
    return (async () => {
      metaLoad();
      S.cur = parse(ssGet(CUR_KEY)) || null;
      const localState = parse(lsGet(LS_KEY));
      const collect = (opts && opts.collect) || (() => ({ fields: {}, radios: {} }));
      const byTab = {};
      TABS.forEach(t => { try { byTab[t] = collect(t, localState || { fields: {} }); } catch (e) { byTab[t] = { fields: {}, radios: {} }; } });
      const restorePending = () => { const p = parse(ssGet(PENDING_KEY)) || {}; Object.keys(p).forEach(id => { p[id].jsonStr = JSON.stringify(p[id].json); S.pending[id] = p[id]; }); };

      let r;
      try { r = await api('/api/state?list=1', { method: 'GET' }); }
      catch (e) { S.mode = 'local'; setStatus(e.login ? 'login' : 'local'); }
      if (r && r.status === 503) { S.mode = 'local'; setStatus('local'); }
      else if (r && !r.ok) { S.mode = 'local'; setStatus('error', 'HTTP ' + r.status); }
      else if (r) {
        let j = null; try { j = await r.json(); } catch (e) {}
        if (j && j.rows) { S.mode = 'server'; S.rows = j.rows; } else { S.mode = 'local'; setStatus('error'); }
      }

      if (S.mode !== 'server') {
        // ブラウザ保存：このタブの PJ（無ければ最後に開いたもの）。id は端末内だけの目印
        S.cur = S.cur || parse(lsGet(CUR_KEY)) || {};
        curSave();
        await migrateLocalMedia();
        restorePending();
        return;
      }

      const ids = Object.keys(S.rows);
      if (!ids.length) {
        // 初回：この端末の内容をまとめてサーバーへ。kind ごとに新しい行を作る
        S.cur = S.cur || parse(lsGet(CUR_KEY)) || {};
        if (localState) {
          const kd = buildKindDocs(localState, byTab);
          TABS.forEach(t => {
            const id = S.cur[t] || newId(t); S.cur[t] = id; S.created[id] = S.created[id] || nowIso();
            S.pending[id] = { kind: t, title: kd[t].title, meta: metaOf(id, kd[t].title), json: kd[t].json, jsonStr: JSON.stringify(kd[t].json) };
          });
          S.pending.shared = { kind: 'shared', title: '', meta: {}, json: kd.shared.json, jsonStr: JSON.stringify(kd.shared.json), force: true };
        }
        curSave(); pendingSave();
        setStatus('migrating');
        await migrateLocalMedia();
        await push(true);
        for (const ns of Object.keys(S.ns)) {
          let keys = []; try { keys = await S.ns[ns].local.list(); } catch (e) {}
          keys.forEach(k => { if (k.includes('/')) S.mediaQueue[ns + '/' + k] = 1; });
        }
        metaSave(); runMedia();
        return;
      }

      // フェーズ1の行（'p:earnings' など）があれば、新しい id の行へ移す
      const legacy = ids.filter(id => LEGACY_ID.test(id));
      let sharedDoc = null;
      if (legacy.length) {
        setStatus('migrating');
        const docs = await fetchDocs(legacy.concat(['shared']));
        sharedDoc = docs.shared || null;
        const body = { docs: {}, force: true };
        const moved = {};
        legacy.forEach(id => {
          const d = docs[id]; if (!d) return;
          const kind = kindOfId(id); const nid = newId(kind);
          const created = (d.json && d.json.meta && d.json.meta.created) || d.createdAt || nowIso();
          body.docs[nid] = { kind, title: d.title || '', meta: { created, title: d.title || '', sub: '' }, version: 0, json: d.json || {} };
          moved[kind] = nid;
        });
        if (Object.keys(body.docs).length) {
          const pr = await api('/api/state', { method: 'PUT', body: JSON.stringify(body) });
          if (!pr.ok) { setStatus('error', '行の移行に失敗'); S.mode = 'local'; return; }
          for (const id of legacy) { try { await api('/api/state?id=' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) {} }
          await refreshRows();
        }
        const lastCur = Object.assign({}, parse(lsGet(CUR_KEY)) || {}, moved);
        lsSet(CUR_KEY, JSON.stringify(lastCur));
        if (!S.cur) S.cur = {};
        Object.keys(moved).forEach(k => { if (!S.cur[k]) S.cur[k] = moved[k]; });
        await migrateServerMedia();
        await migrateLocalMedia();
      }

      // このタブの PJ。新しいタブなら「最後に開いた PJ」（shared.current → この端末の控え）
      if (!S.cur) {
        S.cur = {};
        if (OPEN_LAST_ON_NEW_TAB) {
          if (!sharedDoc) { try { sharedDoc = (await fetchDocs(['shared'])).shared || null; } catch (e) {} }
          const c = Object.assign({}, parse(lsGet(CUR_KEY)) || {}, (sharedDoc && sharedDoc.json && sharedDoc.json.current) || {});
          TABS.forEach(t => { if (c[t] && S.rows[c[t]]) S.cur[t] = c[t]; });
        }
      }
      TABS.forEach(t => { if (S.cur[t] && !S.rows[S.cur[t]]) S.cur[t] = null; });   // 消された PJ を指していたら空に
      curSave();
      await migrateLocalMedia();

      // 開く行を読む（このタブの PJ と shared）
      const want = TABS.map(t => S.cur[t]).filter(Boolean).concat(['shared']);
      let docs = {};
      try { docs = await fetchDocs(want); } catch (e) { setStatus('error', '読み込みに失敗'); }
      restorePending();
      // 送れていなかった行（同じタブのリロード）：サーバーが進んでいなければ送る。進んでいたら選ぶ
      // 閉じる直前に送った分は、サーバーには入ったのに手元の版が進んでいないことがある。中身が同じなら食い違いではない
      Object.keys(S.pending).forEach(id => {
        if (id === 'shared' || !docs[id]) return;
        if ((S.versions[id] || 0) !== docs[id].version && JSON.stringify(S.pending[id].json) === JSON.stringify(docs[id].json)) { S.versions[id] = docs[id].version; delete S.pending[id]; }
      });
      const clash = Object.keys(S.pending).filter(id => id !== 'shared' && docs[id] && (S.versions[id] || 0) !== docs[id].version);
      let useLocalForClash = false;
      if (clash.length) {
        useLocalForClash = !confirm('この画面に、まだサーバーへ送れていない変更があります。\nしかし、別の端末（またはタブ）でも同じPJが保存されていました。\n\nOK＝向こうの内容を使う（この画面の送れていない変更は捨てる）\nキャンセル＝この画面の内容で上書きする');
        clash.forEach(id => { if (useLocalForClash) S.versions[id] = docs[id].version; else delete S.pending[id]; });
      }
      const merged = {};
      Object.keys(docs).forEach(id => { merged[id] = docs[id]; S.versions[id] = docs[id].version; S.last[id] = JSON.stringify(docs[id].json); });
      Object.keys(S.pending).forEach(id => { merged[id] = S.pending[id]; });
      applyDocsToLocal(merged);
      metaSave(); pendingSave();
      if (Object.keys(S.pending).length) { setStatus('saving'); schedulePush(300); } else setStatus('saved');
      if (Object.keys(S.mediaQueue).length) runMedia();
    })();
  }

  window.KTStore = {
    ready, saveState, mediaNs, flush,
    pidFor, openProject, deleteProject, listProjects, refreshRows, fetchDocs,
    // ユーザーが触った合図（空の PJ に行を作る）。'input'＝欄を打った・貼った・ファイルを選んだ、'click'＝何か押した（欄が変わっていれば作る）
    touch(kind, type) { if (!kind || S.cur[kind]) return; if (type === 'input' || !S.touched[kind]) S.touched[kind] = type === 'input' ? 'input' : 'click'; },
    set titleOf(fn) { S.titleOf = fn; },
    get cur() { return Object.assign({}, S.cur); },
    get rows() { return S.rows; },
    get mode() { return S.mode; },
    get suspended() { return S.suspended; }, set suspended(v) { S.suspended = !!v; },
    set onChange(fn) { S.onChange = fn; },
    get status() { return S.status; },
    setSub(kind, sub) { const id = S.cur[kind]; if (!id) return; S.sub[id] = sub || ''; S.force[kind] = true; try { if (typeof window.saveStateNow === 'function') window.saveStateNow(); } catch (e) {} },
  };
})();
