// ============================================================
// CF Pages Function: /api/analyze
// Gemini API を呼び出す汎用エンドポイント。
// ・APIキーは環境変数 GEMINI_API_KEY からサーバー側でのみ読む
//   （ローカル: .dev.vars / 本番: CF Pages の環境変数）
// ・ブラウザからは prompt と（任意で）resources を受け取るだけ
// ・models に claude-〜 があれば Anthropic（環境変数 ANTHROPIC_API_KEY）を呼ぶ（2026-11-03）。
//   ふだんは画面の aiFetch が直接呼ぶので、ここを通るのはキーを画面に渡せないURL（プレビュー等）のときだけ
// ============================================================

const MODEL = "gemini-3.5-flash-lite";
// 少しずつ受け取る（stream）で呼ぶ。まとめて受け取ると、考える時間の長いモデル（3.8・3.7 Flash）は最初の返事まで
// 125秒を超え、途中の Cloudflare に切られていた（HTTP 524「error code: 524」。2026-10-18）
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

// 少しずつ届いた答え（data: {...} の行）をつなげる。考えている途中の文（thought）は外す
function readSse(raw) {
  let text = "", usage = null, error = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    let d;
    try { d = JSON.parse(line.slice(5)); } catch { continue; }
    if (d.error) error = d.error;
    const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    for (const p of parts) if (p.text && !p.thought) text += p.text;
    if (d.usageMetadata) usage = d.usageMetadata;
  }
  return { text: text.trim(), usage, error };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const key = env.GEMINI_API_KEY;
  const claudeKey = (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY === "xxxxx") ? "" : env.ANTHROPIC_API_KEY;
  if ((!key || key === "xxxxx") && !claudeKey) {
    return json({ ok: false, error: "APIキーが未設定です（.dev.vars の GEMINI_API_KEY を設定してください）" }, 400);
  }

  let payload;
  try { payload = await request.json(); }
  catch { return json({ ok: false, error: "リクエストの解析に失敗しました" }, 400); }

  const prompt = (payload && payload.prompt || "").trim();
  if (!prompt) return json({ ok: false, error: "prompt が空です" }, 400);

  // resources: 参考資料テキスト（URL取得結果や銘柄名一覧表など）を配列で渡せる
  const resources = Array.isArray(payload.resources) ? payload.resources : [];
  const resourceText = resources
    .map((r) => `【${r.label || "資料"}】\n${r.text || ""}`)
    .join("\n\n");

  const fullPrompt = resourceText
    ? `以下の資料のみを根拠として、指示に厳密に従って回答してください。資料に無い情報を創作しないでください。\n\n===== 資料 =====\n${resourceText}\n\n===== 指示 =====\n${prompt}`
    : prompt;

  // files: PDF等の添付（マルチモーダル）。{ mimeType, data(base64) } の配列。
  // 決算資料PDFなどをそのまま Gemini に読ませる用途。
  const files = Array.isArray(payload.files) ? payload.files : [];
  const parts = [{ text: fullPrompt }];
  for (const f of files) {
    if (f && f.data && f.mimeType) {
      parts.push({ inline_data: { mime_type: f.mimeType, data: f.data } });
    }
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: typeof payload.temperature === "number" ? payload.temperature : 0.4,
      // 考えている途中の要約も流させる（考えている間も少しずつ届くので、途中で切られない）。答えからは外す
      thinkingConfig: { includeThoughts: true },
    },
  };
  // search: true のときだけ Google 検索を使わせる（最近の出来事を根拠にしたいとき。エンディングの案で使う）。
  // 無料の枠では月5,000回まで（Gemini 3.x、2026-09 時点）。
  if (payload.search === true) body.tools = [{ google_search: {} }];
  // url: true のときは、プロンプトに書いたURLのページを読ませる（出典を自分で足すときに、資料名・表記を埋める）
  if (payload.url === true) body.tools = [...(body.tools || []), { url_context: {} }];
  // json: true のときは、答えを JSON の形式で返させる（書き方の崩れで読めなくなるのを防ぐ。検索・URL読みとは一緒に使えない）
  if (payload.json === true && !body.tools) body.generationConfig.responseMimeType = "application/json";

  // Claude 用の本文（資料・添付・検索・JSON指定を同じ意味で組み立てる。PDF は document、画像は image）
  const clContent = [];
  for (const f of files) {
    if (!(f && f.data && f.mimeType)) continue;
    const source = { type: "base64", media_type: f.mimeType, data: f.data };
    clContent.push(/^image\//.test(f.mimeType) ? { type: "image", source } : { type: "document", source });
  }
  clContent.push({ type: "text", text: fullPrompt });
  const clBody = { max_tokens: 16000, messages: [{ role: "user", content: clContent }] };
  const clTools = [];
  if (payload.search === true) clTools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 });
  if (payload.url === true) clTools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 });
  if (clTools.length) clBody.tools = clTools;
  if (payload.json === true && !clTools.length) clBody.system = "答えは JSON だけを出力してください。前置き・説明・コードブロックは付けないでください。";
  const isClaude = (m) => /^claude-/.test(String(m || ""));

  // モデルは配列(models)で優先順に受け取り、上限(429)なら次の下位モデルへフォールバックする。
  const models = (Array.isArray(payload.models) && payload.models.length)
    ? payload.models
    : [payload.model || MODEL];

  // 一時的エラー（上限・レート・過負荷・混雑・503・タイムアウト等）は、同じモデルでやり直さずに次のモデルへ（やり直すと回数が2回ずつ減るため。2026-10-10）
  const isTransient = (status, raw) =>
    status === 429 || status >= 500 ||
    /quota|rate|exhaust|limit:\s*0|overload|high demand|unavailable|temporarily|try again|resource has been exhausted/i.test(raw || "");
  // エラーの種類：quota＝回数の上限（下のモデルへ切り替えると通ることが多い）／busy＝相手側の混雑（下のモデルも混んでいることが多い）
  const kindOf = (status, raw) =>
    (status === 429 || /quota|exhaust|rate.?limit|limit:\s*0|per day|per minute|resource has been exhausted/i.test(raw || "")) ? "quota"
    : (status >= 500 || /overload|high demand|unavailable|temporarily|try again/i.test(raw || "")) ? "busy" : "other";

  let lastErr = "";
  // 降格した理由（モデル・HTTPステータス・所要秒・エラー文の先頭）。画面に出して原因を特定できるようにする
  const failures = [];
  const note = (m, status, t0, msg) =>
    failures.push({ model: m, status, kind: kindOf(status, msg), sec: Math.round((Date.now() - t0) / 100) / 10, error: String(msg || "").slice(0, 160) });
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const t0 = Date.now();
    try {
      if (isClaude(m)) {
        if (!claudeKey) { lastErr = "Claude のAPIキーが未設定です（ANTHROPIC_API_KEY）"; note(m, 0, t0, lastErr); continue; }
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2026-10-21" },
          body: JSON.stringify({ ...clBody, model: m }),
        });
        const raw0 = await res.text();
        let data;
        try { data = JSON.parse(raw0); }
        catch { throw new Error(`HTTP ${res.status} 応答がJSONではありません: ${raw0.slice(0, 80)}`); }
        if (res.ok) {
          if (data.stop_reason === "refusal") {
            lastErr = "Claude が回答を断りました" + (data.stop_details && data.stop_details.explanation ? "：" + data.stop_details.explanation : "");
            note(m, 0, t0, lastErr); continue;
          }
          const text = (data.content || []).filter((x) => x.type === "text").map((x) => x.text || "").join("").trim();
          const u = data.usage || {};
          const inTok = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          const usage = { promptTokenCount: inTok, candidatesTokenCount: u.output_tokens || 0, totalTokenCount: inTok + (u.output_tokens || 0) };
          return json({ ok: true, text, usage, model: m, fellBack: i > 0, failures });
        }
        const raw = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
        lastErr = raw;
        note(m, res.status, t0, raw);
        if (!isTransient(res.status, raw)) return json({ ok: false, error: "Claude API エラー: " + raw, model: m, failures }, 502);
        continue;
      }
      if (!key || key === "xxxxx") { lastErr = "Gemini のAPIキーが未設定です"; note(m, 0, t0, lastErr); continue; }
      const res = await fetch(ENDPOINT(m, key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw0 = await res.text();
      let data;
      if (res.ok) {
        const r = readSse(raw0);
        if (!r.error) return json({ ok: true, text: r.text, usage: r.usage, model: m, fellBack: i > 0, failures });
        data = { error: r.error };
      } else {
        try { data = JSON.parse(raw0); }
        catch { throw new Error(`HTTP ${res.status} 応答がJSONではありません: ${raw0.slice(0, 80)}`); }
        if (Array.isArray(data)) data = data[0];
      }
      const raw = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
      lastErr = raw;
      note(m, res.status, t0, raw);
      // 一時エラー以外（認証ミス等）は即中断
      if (!isTransient(res.status, raw)) return json({ ok: false, error: "Gemini API エラー: " + raw, model: m, failures }, 502);
    } catch (e) {
      lastErr = (e && e.message) ? e.message : String(e);
      note(m, 0, t0, lastErr);
    }
    // このモデルは諦めて次モデルへ
  }
  return json({ ok: false, error: "全モデルが混雑/上限のようです。少し待って再試行してください（最後のエラー: " + lastErr + "）", triedModels: models, failures }, 502);
}

export async function onRequestGet() {
  return json({ ok: true, hint: "POST {prompt, resources?} を送ってください" });
}
