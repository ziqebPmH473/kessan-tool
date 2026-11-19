/*
 * AI ブリッジの受け口（2026-11-18）。Chrome 拡張「AI ブリッジ」（リポジトリ xppen-shortcut-tool）とやり取りする。
 * 拡張が入っていなければ何もしない（今までどおり動く）。
 * 元はリポジトリ xppen-shortcut-tool の tool-adapter/ai-bridge.js。直したら、各ツールの assets/ai-bridge.js に写す。
 *
 *   AiBridge.init(tool, onResult, opts)
 *       tool … ツールの名前（'affiri' / 'kessan' / 'tosho' / 'sumikko'）
 *       onResult(job) … ChatGPT の返答が届いたら呼ばれる。入れられたら true（false なら、入れられるようになるまで拡張が持っておく）
 *                       画像のジョブ（kind: 'image'）は job.images に File の配列（ChatGPT が作った画像）が入る
 *       opts.onHandoff(handoff, file) … 別のツールからファイルが届いたら呼ばれる。Promise で { ok, message } を返す
 *       opts.onStep(ref, step) … FC の次の段（'fc'／'ck'：FC CK／'fix'：修正）を頼まれたら呼ばれる。ref はジョブに付けた stepRef。
 *                              そのボタンを押して AiBridge.job が呼ばれたら true。押せなければ false か、押せない理由の文
 *                              （例「別の記事を開いています」）。理由は拡張の一覧に出る。開いたらまた頼まれる
 *   AiBridge.job({ thread, newChat, project, step, stepRef, prompt, returnTo, label, extract }) … プロンプトを「準備」として渡す（ACK05 の送るボタンで送る）
 *       project … 'fc'（FC のプロジェクト）／'make'（作成のプロジェクト）。step … 'fc' / 'ck' / 'fix' / 'make'
 *       files … ChatGPT に添付するファイル（File の配列。ZIP など）。stepRef.fcable … 作成のあと FC へ続けられる（全自動）
 *       kind: 'image' … 画像生成のプロンプト。拡張の一覧に「ためて」おき、「画像をまとめて作る」で作る（2026-11-19 段2）
 *   AiBridge.handoff({ to, action, file, name, hash, label }) … ファイルを別のツールへ渡す。Promise（受け付けたら true）
 *   AiBridge.busy(true / false) … 動画の書き出しの始まりと終わり（書き出し中は拡張がタブを切り替えない）
 *   AiBridge.mayOpen() … 返答・次の段のために、ツールが別の記事・銘柄を自動で開いてよいか。よければ true、だめなら理由の文
 *                        （書き出し中・入力中・直前に開いた／入れたばかり）。開いたら AiBridge.opened() を呼ぶ（2026-11-19）
 *   AiBridge.connected … 拡張とつながっているか
 */
(function (g) {
  'use strict';
  var tool = null;
  var onResult = null;
  var opts = {};
  var applied = {};
  var waiting = {};
  var seq = 0;
  var stepping = null;
  var waitNote = {};     // 次の段を押せなかった理由（同じものを何度も送らない）   // 次の段のボタンを押している間：その押下で作られるジョブを「次の段」として送る
  var api = { connected: false, counts: {} };
  // 自動で開いてよいかの見分け（2026-11-19 すみぽん：返答が届いたら、その記事・銘柄を自動で開く。ただし作業の邪魔はしない）
  var isBusy = false;    // 動画の書き出し中
  var lastUser = 0;      // あなたが最後にキーを打った・入力した時刻（ツールのタブで）
  var lastOpen = 0;      // 自動で開いた時刻
  var lastDone = 0;      // 返答を入れた・次の段を押した時刻（ツールが処理し終わるのを待つ）
  ['keydown', 'input', 'paste', 'compositionstart'].forEach(function (t) {
    g.addEventListener(t, function (e) { if (e.isTrusted) lastUser = Date.now(); }, true);
  });

  function post(msg) {
    msg.source = 'ai-bridge-tool';
    g.postMessage(msg, g.location.origin);
  }

  g.addEventListener('message', function (ev) {
    if (ev.source !== g || ev.origin !== g.location.origin) return;
    var d = ev.data;
    if (!d || d.source !== 'ai-bridge') return;
    if (d.type === 'present') {
      // build なし＝拡張が今読み込まれた合図。こちらから名乗り直す
      if (!d.build) { if (tool) post({ type: 'hello', tool: tool }); return; }
      api.connected = true;
      return;
    }
    if (d.type === 'counts') { api.counts = d.counts || {}; return; }
    if (d.type === 'result' && d.job) {
      var j = d.job;
      var key = j.id + '@' + (j.v || 0);   // 読み直し・もう一度入れる のときは v が変わるので、もう一度入れる
      if (applied[key]) { post({ type: 'ack', id: j.id }); return; }
      var ok = false;
      try { ok = !!(onResult && onResult(j)); } catch (e) { ok = false; }
      if (ok) { applied[key] = true; lastDone = Date.now(); post({ type: 'ack', id: j.id }); }
      return;
    }
    if (d.type === 'step' && d.step) {
      var s = d.step;
      if (applied['step:' + s.parent] || !opts.onStep) return;
      stepping = { parent: s.parent, at: Date.now() };
      var ok = false;
      try { ok = opts.onStep(s.ref || {}, s.step); } catch (e) { ok = String(e && e.message || e); }
      if (ok === true) { applied['step:' + s.parent] = true; lastDone = Date.now(); return; }
      stepping = null;
      // 押せなかった理由を拡張へ（一覧に出る）。同じ理由は1分に1回だけ
      var why = typeof ok === 'string' && ok ? ok : 'ボタンを押せませんでした';
      var last = waitNote[s.parent];
      if (!last || last.why !== why || Date.now() - last.at > 60000) {
        waitNote[s.parent] = { why: why, at: Date.now() };
        post({ type: 'step-wait', parent: s.parent, why: why });
      }
      return;
    }
    if (d.type === 'handoff-accepted' && waiting[d.ref]) {
      waiting[d.ref](d);
      delete waiting[d.ref];
      return;
    }
    if (d.type === 'handoff' && d.handoff) {
      var h = d.handoff;
      if (applied[h.id]) return;
      applied[h.id] = true;
      var file = new File([d.blob], h.name || 'file', { type: d.blob.type });
      var run = opts.onHandoff ? Promise.resolve().then(function () { return opts.onHandoff(h, file); })
        : Promise.resolve({ ok: false, message: 'このツールは受け取りに対応していません' });
      run.then(function (r) {
        post({ type: 'handoff-done', id: h.id, ok: !!(r && r.ok), message: (r && r.message) || '' });
      }, function (e) {
        post({ type: 'handoff-done', id: h.id, ok: false, message: String(e && e.message || e) });
      });
    }
  });

  api.init = function (name, handler, options) {
    tool = name;
    onResult = handler || null;
    opts = options || {};
    post({ type: 'hello', tool: tool });
  };
  api.job = function (job, sendNow) {
    if (!api.connected || !job || !job.prompt) return false;
    if (stepping && Date.now() - stepping.at < 60000) { job.parent = stepping.parent; sendNow = true; }
    stepping = null;
    post({ type: 'job', job: job, send: !!sendNow });
    return true;
  };
  api.handoff = function (h) {
    if (!api.connected || !h || !h.file) return Promise.resolve(false);
    var ref = 'r' + (++seq);
    return new Promise(function (resolve) {
      waiting[ref] = function (d) { resolve(!d.error); };
      post({ type: 'handoff', ref: ref, to: h.to, action: h.action, name: h.name || h.file.name || 'file', hash: h.hash || '', label: h.label || '', blob: h.file });
    });
  };
  api.busy = function (b) { isBusy = !!b; if (api.connected) post({ type: 'busy', busy: !!b }); };
  api.mayOpen = function () {
    var now = Date.now();
    if (isBusy) return '動画の書き出し中です。終わったら自動で開きます';
    if (now - lastUser < 30000) return 'ツールで入力中なので待っています。手を止めて 30 秒たつと自動で開きます';
    if (now - lastOpen < 20000 || now - lastDone < 20000) return 'もうすぐ自動で開きます';
    return true;
  };
  api.opened = function () { lastOpen = Date.now(); };

  g.AiBridge = api;
})(window);
