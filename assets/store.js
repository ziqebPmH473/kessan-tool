/*
 * 保存の層（KTStore）
 *
 * 画面の入力内容と、音声・PDF・画像などのファイルを、サーバー（Cloudflare D1 / R2）に保存する。
 * サーバーが無い（紐づけ前・ローカル開発）ときは、今までどおりブラウザ（localStorage / IndexedDB）だけに保存する。
 *
 * - 入力内容：saveStateNow() が作る state を受け取り、localStorage（kessanTool:v1）に書いたうえで、
 *   種別ごとの行（p:earnings / p:stock / p:price / p:yt）と shared に分けて /api/state に送る（900ms 後にまとめて）。
 *   version が食い違ったら（別の端末が先に保存していたら）上書きせず、画面の上に知らせを出す。
 * - ファイル：mediaNs(名前空間, 端末内の保存先) で包んだものを使う。端末内にも書き、サーバーにも送る。
 *   読むときはサーバーを先に見る（別の端末で作ったものが見える）。
 * - 起動時 ready()：サーバーの内容を localStorage に書き戻してから、今までの restoreState() が動く。
 *   サーバーが空なら、この端末の内容をまとめて取り込む（初回だけ）。
 */
(function () {
  'use strict';
  const LS_KEY = 'kessanTool:v1';
  const LS_SYNC = ['kt-yt-ctx', 'kt-yt-fields-stock', 'kt-yt-fields-gen', 'yt-m-def38', 'kt-rel-days-365'];
  const META_KEY = 'kt-sync-meta';
  const TABS = ['earnings', 'stock', 'price', 'yt'];
  const EXTRA = { earnings: 'earnFetched', stock: 'fetched', price: 'priceFetched' };
  const PUSH_DELAY = 900;

  const S = {
    mode: 'local',          // 'local' | 'server'
    ready: null,
    versions: {},           // id → サーバーの version
    last: {},               // id → 最後にサーバーと合った JSON 文字列
    dirty: {},              // id → 1（送れていない変更あり）
    pending: {},            // id → 送る予定の行
    timer: null, pushing: false, again: false,
    ns: {},                 // 名前空間 → 端末内の保存先
    mediaQueue: {},         // 'ns/key' → 1（送る予定のファイル）
    mediaRunning: false,
    status: 'local',
    conflict: null,
  };

  // ---- 小物 ----
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  const parse = s => { try { return JSON.parse(s || 'null'); } catch (e) { return null; } };
  function metaLoad() { const m = parse(lsGet(META_KEY)) || {}; S.versions = m.versions || {}; S.dirty = m.dirty || {}; S.mediaQueue = m.media || {}; }
  function metaSave() { lsSet(META_KEY, JSON.stringify({ versions: S.versions, dirty: S.dirty, media: S.mediaQueue })); }

  // Access のログインが切れると、API はログイン画面へ転送される。redirect:'manual' にして見分ける。
  async function api(url, opts) {
    const o = Object.assign({ redirect: 'manual', cache: 'no-store' }, opts || {});
    o.headers = Object.assign({}, o.headers || {});
    if (o.body && typeof o.body === 'string' && !o.headers['content-type']) o.headers['content-type'] = 'application/json';
    const r = await fetch(url, o);
    if (r.type === 'opaqueredirect' || r.status === 0) { const e = new Error('login'); e.login = true; setStatus('login'); throw e; }
    return r;
  }

  // ---- state ⇄ 行 ----
  // byTab[tab] = {fields, radios, title}（どの欄がどの種別のものか）。値は state.fields の方を使う。
  function buildDocs(state, byTab) {
    const docs = {}; const used = new Set(), usedR = new Set();
    TABS.forEach(t => {
      const c = (byTab && byTab[t]) || { fields: {}, radios: {} };
      const fields = {}, radios = {};
      Object.keys(c.fields || {}).forEach(id => { if (used.has(id)) return; used.add(id); fields[id] = (state.fields && state.fields[id] !== undefined) ? state.fields[id] : c.fields[id]; });
      Object.keys(c.radios || {}).forEach(n => { if (usedR.has(n)) return; usedR.add(n); radios[n] = (state.radios && state.radios[n] !== undefined) ? state.radios[n] : c.radios[n]; });
      const d = { fields, radios };
      if (EXTRA[t]) d[EXTRA[t]] = state[EXTRA[t]] || null;
      docs['p:' + t] = { kind: t, title: String(c.title || ''), json: d };
    });
    const sf = {}, sr = {};
    Object.keys(state.fields || {}).forEach(id => { if (!used.has(id)) sf[id] = state.fields[id]; });
    Object.keys(state.radios || {}).forEach(n => { if (!usedR.has(n)) sr[n] = state.radios[n]; });
    const ls = {}; LS_SYNC.forEach(k => { const v = lsGet(k); if (v != null) ls[k] = v; });
    docs.shared = { kind: 'shared', title: '', json: { fields: sf, radios: sr, ui: state.ui || null, ls } };
    return docs;
  }
  function docsToState(docs) {
    const state = { fields: {}, radios: {}, fetched: null, earnFetched: null, priceFetched: null, ui: null };
    TABS.forEach(t => {
      const d = docs['p:' + t] && docs['p:' + t].json; if (!d) return;
      Object.assign(state.fields, d.fields || {}); Object.assign(state.radios, d.radios || {});
      if (EXTRA[t]) state[EXTRA[t]] = d[EXTRA[t]] || null;
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

  // ---- 入力内容の保存 ----
  function saveState(state, byTab) {
    lsSet(LS_KEY, JSON.stringify(state));
    if (S.mode !== 'server') return;
    const docs = buildDocs(state, byTab);
    let changed = false;
    Object.keys(docs).forEach(id => {
      const j = JSON.stringify(docs[id].json);
      if (j === S.last[id]) return;
      docs[id].jsonStr = j; S.pending[id] = docs[id]; S.dirty[id] = 1; changed = true;
    });
    if (changed) { metaSave(); setStatus('saving'); schedulePush(PUSH_DELAY); }
  }
  function schedulePush(ms) { clearTimeout(S.timer); S.timer = setTimeout(() => push(false), ms); }
  async function push(force) {
    if (S.mode !== 'server') return;
    if (S.pushing) { S.again = true; return; }
    const ids = Object.keys(S.pending); if (!ids.length) return;
    S.pushing = true;
    const sent = S.pending; S.pending = {};
    const body = { docs: {}, force: !!force };
    ids.forEach(id => { const d = sent[id]; body.docs[id] = { kind: d.kind, title: d.title, version: S.versions[id] || 0, json: d.json }; });
    const restore = () => ids.forEach(id => { if (!S.pending[id]) S.pending[id] = sent[id]; });
    try {
      const r = await api('/api/state', { method: 'PUT', body: JSON.stringify(body) });
      if (r.status === 409) {
        const j = await r.json(); restore(); S.conflict = { server: j.docs || {}, ids: j.conflicts || [] }; showConflict(); setStatus('conflict');
      } else if (!r.ok) {
        let msg = 'HTTP ' + r.status; try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) {}
        restore(); setStatus('error', msg); schedulePush(8000);
      } else {
        const j = await r.json();
        Object.keys(j.versions || {}).forEach(id => { S.versions[id] = j.versions[id]; S.last[id] = sent[id].jsonStr; if (!S.pending[id]) delete S.dirty[id]; });
        metaSave(); if (!Object.keys(S.pending).length && !S.mediaRunning) setStatus('saved');
      }
    } catch (e) {
      restore(); if (!e.login) { setStatus('error'); schedulePush(8000); }
    } finally {
      S.pushing = false;
      if (S.again) { S.again = false; schedulePush(300); }
    }
  }
  // 閉じる直前：送り残しがあれば、小さいときだけその場で送る（大きいときは次に開いたときに送る）
  function flushOnHide() {
    if (S.mode !== 'server' || S.pushing) return;
    const ids = Object.keys(S.pending); if (!ids.length) return;
    const body = { docs: {} };
    ids.forEach(id => { const d = S.pending[id]; body.docs[id] = { kind: d.kind, title: d.title, version: S.versions[id] || 0, json: d.json }; });
    const text = JSON.stringify(body);
    if (text.length > 60000) return;
    try {
      fetch('/api/state', { method: 'PUT', body: text, headers: { 'content-type': 'application/json' }, keepalive: true, redirect: 'manual' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          if (!j || !j.versions) return;
          Object.keys(j.versions).forEach(id => { S.versions[id] = j.versions[id]; if (S.pending[id]) S.last[id] = S.pending[id].jsonStr; delete S.dirty[id]; delete S.pending[id]; });
          metaSave();
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
    bar.innerHTML = '<span style="flex:1;min-width:200px;">別の端末で保存された内容があります。どちらを残しますか？</span>'
      + '<button type="button" id="kt-conflict-load" style="padding:6px 12px;border:1px solid #f59e0b;background:#fff;border-radius:6px;cursor:pointer;">別の端末の内容を読み込む</button>'
      + '<button type="button" id="kt-conflict-force" style="padding:6px 12px;border:1px solid #b45309;background:#b45309;color:#fff;border-radius:6px;cursor:pointer;">この端末の内容で上書き</button>';
    document.body.appendChild(bar);
    bar.querySelector('#kt-conflict-load').onclick = () => {
      // サーバーの内容を localStorage に書いてから開き直す（食い違った行だけ差し替え）
      const docs = {};
      Object.keys(S.last).forEach(id => { docs[id] = { json: parse(S.last[id]) }; });
      Object.keys(S.pending).forEach(id => { if (!docs[id]) docs[id] = { json: S.pending[id].json }; });
      Object.assign(docs, S.conflict.server);
      applyDocsToLocal(docs);
      S.dirty = {};
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
  const mediaUrl = (ns, key) => '/api/media/' + encodeURIComponent(ns) + '/' + encodeURIComponent(key);

  // local = {get(key), put(key, val), del(key), list()}（端末内の IndexedDB）
  function mediaNs(ns, local) {
    S.ns[ns] = local;
    return {
      async get(key) {
        if (S.mode !== 'server' || S.mediaQueue[ns + '/' + key]) return local.get(key);   // 送る途中のものは端末内の方が新しい
        try {
          const r = await api(mediaUrl(ns, key), { method: 'GET' });
          if (r.status === 404) return null;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const v = await decode(await r.json());
          local.put(key, v).catch(() => {});
          return v;
        } catch (e) { return local.get(key); }
      },
      async put(key, val) {
        await local.put(key, val);
        if (S.mode !== 'server') return;
        S.mediaQueue[ns + '/' + key] = 1; metaSave(); runMedia();
      },
      async del(key) {
        await local.del(key);
        if (S.mode !== 'server') return;
        S.mediaQueue[ns + '/' + key] = 1; metaSave(); runMedia();
      },
      async list() {
        if (S.mode !== 'server') return local.list();
        try {
          const r = await api('/api/media?ns=' + encodeURIComponent(ns), { method: 'GET' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const j = await r.json(); const keys = j.keys || [];
          Object.keys(S.mediaQueue).forEach(k => { if (k.startsWith(ns + '/')) { const kk = k.slice(ns.length + 1); if (!keys.includes(kk)) keys.push(kk); } });
          return keys;
        } catch (e) { return local.list(); }
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
        const full = keys[0]; const i = full.indexOf('/'); const ns = full.slice(0, i), key = full.slice(i + 1);
        const local = S.ns[ns];
        if (!local) { delete S.mediaQueue[full]; metaSave(); continue; }
        if (S.status !== 'migrating') setStatus('saving');
        try {
          const v = await local.get(key);
          const r = (v == null)
            ? await api(mediaUrl(ns, key), { method: 'DELETE' })
            : await api(mediaUrl(ns, key), { method: 'PUT', body: JSON.stringify(await encode(v)) });
          if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
          delete S.mediaQueue[full]; metaSave();
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

  // ---- 起動 ----
  // opts.collect(tab, state) → {fields, radios, title}（どの欄がどの種別かを知るため。値は state から取る）
  function ready(opts) {
    if (S.ready) return S.ready;
    S.ready = (async () => {
      metaLoad();
      const localState = parse(lsGet(LS_KEY));
      const collect = (opts && opts.collect) || (() => ({ fields: {}, radios: {} }));
      const byTab = {};
      TABS.forEach(t => { try { byTab[t] = collect(t, localState || { fields: {} }); } catch (e) { byTab[t] = { fields: {}, radios: {} }; } });

      let r;
      try { r = await api('/api/state', { method: 'GET' }); }
      catch (e) { S.mode = 'local'; setStatus(e.login ? 'login' : 'local'); return; }
      if (r.status === 503) { S.mode = 'local'; setStatus('local'); return; }
      if (!r.ok) { S.mode = 'local'; setStatus('error', 'HTTP ' + r.status); return; }
      let j; try { j = await r.json(); } catch (e) { S.mode = 'local'; setStatus('error'); return; }
      S.mode = 'server';
      const server = j.docs || {};
      const local = localState ? buildDocs(localState, byTab) : null;

      if (!Object.keys(server).length) {
        // 初回：この端末の内容をまとめてサーバーへ
        if (local) {
          Object.keys(local).forEach(id => { local[id].jsonStr = JSON.stringify(local[id].json); S.pending[id] = local[id]; S.dirty[id] = 1; });
          S.versions = {}; metaSave();
          setStatus('migrating');
          await push(true);
          // ファイルも全部（端末内にあるものを列挙して送る）
          for (const ns of Object.keys(S.ns)) {
            let keys = []; try { keys = await S.ns[ns].list(); } catch (e) {}
            keys.forEach(k => { S.mediaQueue[ns + '/' + k] = 1; });
          }
          metaSave(); runMedia();
        } else setStatus('saved');
        return;
      }

      // 2回目以降：サーバーの内容をこの端末に写す。送れていない変更があれば、それは残す
      const keep = {};   // この端末の内容を使う行
      if (local) {
        const dirtyIds = Object.keys(S.dirty).filter(id => local[id]);
        const clash = dirtyIds.filter(id => server[id] && (S.versions[id] || 0) !== server[id].version);
        let useLocalForClash = false;
        if (clash.length) {
          useLocalForClash = !confirm('この端末に、まだサーバーへ送れていない変更があります。\nしかし、別の端末でも保存されていました。\n\nOK＝別の端末の内容を使う（この端末の送れていない変更は捨てる）\nキャンセル＝この端末の内容で上書きする');
        }
        dirtyIds.forEach(id => { if (!clash.includes(id) || useLocalForClash) keep[id] = local[id]; });
      }
      const merged = {};
      Object.keys(server).forEach(id => { merged[id] = server[id]; S.versions[id] = server[id].version; S.last[id] = JSON.stringify(server[id].json); });
      S.dirty = {};
      Object.keys(keep).forEach(id => { merged[id] = keep[id]; keep[id].jsonStr = JSON.stringify(keep[id].json); S.pending[id] = keep[id]; S.dirty[id] = 1; });
      applyDocsToLocal(merged);
      metaSave();
      if (Object.keys(S.pending).length) { setStatus('saving'); schedulePush(300); } else setStatus('saved');
      if (Object.keys(S.mediaQueue).length) runMedia();
    })();
    return S.ready;
  }

  window.KTStore = {
    ready, saveState, mediaNs,
    get mode() { return S.mode; },
    get status() { return S.status; },
    flush() { clearTimeout(S.timer); return push(false); },
  };
})();
