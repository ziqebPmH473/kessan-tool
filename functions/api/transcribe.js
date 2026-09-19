// ============================================================
// CF Pages Function: /api/transcribe
// 音声を Groq の Whisper で文字起こしし、語単位・区間単位の時刻を返す。
// ・APIキーは環境変数 GROQ_API_KEY からサーバー側でのみ読む
// ・ブラウザ側でモノラル低ビットレートの mp3 に変換してから送る前提（Groq 無料枠は1ファイル25MBまで）
// ・リクエストは音声そのもの（body=バイナリ）。?lang=ja&model=… は任意
// ============================================================

const DEFAULT_MODEL = "whisper-large-v3";   // turbo より語の時刻が正確（2026-09-20 実音声で比較）
const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

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
  const key = env.GROQ_API_KEY;
  if (!key || key === "xxxxx") {
    return json({ ok: false, error: "APIキーが未設定です（.dev.vars / CF環境変数の GROQ_API_KEY）" }, 400);
  }

  const url = new URL(request.url);
  const model = url.searchParams.get("model") || DEFAULT_MODEL;
  const lang = url.searchParams.get("lang") || "ja";
  const audio = await request.arrayBuffer();
  if (!audio.byteLength) return json({ ok: false, error: "音声データが空です" }, 400);
  if (audio.byteLength > 25 * 1024 * 1024) return json({ ok: false, error: "音声が25MBを超えています" }, 400);

  const form = new FormData();
  form.append("file", new Blob([audio], { type: request.headers.get("Content-Type") || "audio/mpeg" }), "audio.mp3");
  form.append("model", model);
  form.append("language", lang);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");

  try {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: "Bearer " + key }, body: form });
    const data = await res.json();
    if (!res.ok) {
      const raw = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
      return json({ ok: false, error: "文字起こしエラー: " + raw, status: res.status }, 502);
    }
    return json({
      ok: true,
      duration: data.duration || 0,
      text: data.text || "",
      words: (data.words || []).map((w) => ({ w: w.word, s: w.start, e: w.end })),
      segments: (data.segments || []).map((s) => ({ t: s.text, s: s.start, e: s.end })),
    });
  } catch (e) {
    return json({ ok: false, error: "文字起こしに失敗: " + ((e && e.message) ? e.message : String(e)) }, 502);
  }
}
