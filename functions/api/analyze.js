// ============================================================
// CF Pages Function: /api/analyze
// Gemini API を呼び出す汎用エンドポイント。
// ・APIキーは環境変数 GEMINI_API_KEY からサーバー側でのみ読む
//   （ローカル: .dev.vars / 本番: CF Pages の環境変数）
// ・ブラウザからは prompt と（任意で）resources を受け取るだけ
// ============================================================

const MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

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
  if (!key || key === "xxxxx") {
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
    },
  };

  // モデルは配列(models)で優先順に受け取り、上限(429)なら次の下位モデルへフォールバックする。
  const models = (Array.isArray(payload.models) && payload.models.length)
    ? payload.models
    : [payload.model || MODEL];

  // 一時的エラー（上限・レート・過負荷・混雑・503等）は リトライ→次モデル へ
  const isTransient = (status, raw) =>
    status === 429 || status >= 500 ||
    /quota|rate|exhaust|limit:\s*0|overload|high demand|unavailable|temporarily|try again|resource has been exhausted/i.test(raw || "");
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  let lastErr = "";
  // 降格した理由（モデル・HTTPステータス・所要秒・エラー文の先頭）。画面に出して原因を特定できるようにする
  const failures = [];
  const note = (m, status, t0, msg) =>
    failures.push({ model: m, status, sec: Math.round((Date.now() - t0) / 100) / 10, error: String(msg || "").slice(0, 160) });
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    for (let attempt = 0; attempt < 2; attempt++) {   // 各モデル最大2回（一時エラー時に1回リトライ）
      const t0 = Date.now();
      try {
        const res = await fetch(ENDPOINT(m, key), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const raw0 = await res.text();
        let data;
        try { data = JSON.parse(raw0); }
        catch { throw new Error(`HTTP ${res.status} 応答がJSONではありません: ${raw0.slice(0, 80)}`); }
        if (res.ok) {
          const text =
            (data.candidates && data.candidates[0] && data.candidates[0].content &&
             data.candidates[0].content.parts || [])
              .map((p) => p.text || "").join("").trim();
          return json({ ok: true, text, usage: data.usageMetadata || null, model: m, fellBack: i > 0, failures });
        }
        const raw = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
        lastErr = raw;
        note(m, res.status, t0, raw);
        // 一時エラー以外（認証ミス等）は即中断
        if (!isTransient(res.status, raw)) return json({ ok: false, error: "Gemini API エラー: " + raw, model: m, failures }, 502);
        if (attempt === 0) { await delay(800); continue; }  // 同モデルで1回リトライ
      } catch (e) {
        lastErr = (e && e.message) ? e.message : String(e);
        note(m, 0, t0, lastErr);
        if (attempt === 0) { await delay(800); continue; }
      }
      break;   // このモデルは諦めて次モデルへ
    }
  }
  return json({ ok: false, error: "全モデルが混雑/上限のようです。少し待って再試行してください（最後のエラー: " + lastErr + "）", triedModels: models, failures }, 502);
}

export async function onRequestGet() {
  return json({ ok: true, hint: "POST {prompt, resources?} を送ってください" });
}
