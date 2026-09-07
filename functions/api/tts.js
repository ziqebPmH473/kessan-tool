// ============================================================
// CF Pages Function: /api/tts
// Gemini TTS で台本を音声(WAV)に変換する。gemini-voice ツールと同一仕様。
// ・APIキーは環境変数 GEMINI_API_KEY からサーバー側でのみ読む
// ・Gemini は生PCM(L16)を返すため、WAVコンテナに包んで返す
// ============================================================

const DEFAULT_MODEL = "gemini-3.1-flash-tts-preview";
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

function parseSampleRate(mime) {
  const m = (mime || "").match(/rate=(\d+)/);
  return m ? parseInt(m[1], 10) : 24000;
}

// 生PCM(16bit LE mono) → WAV
function pcmToWav(pcm, rate) {
  const numCh = 1, bps = 16;
  const byteRate = rate * numCh * bps / 8, blockAlign = numCh * bps / 8;
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
  v.setUint32(24, rate, true); v.setUint32(28, byteRate, true); v.setUint16(32, blockAlign, true); v.setUint16(34, bps, true);
  w(36, "data"); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const key = env.GEMINI_API_KEY;
  if (!key || key === "xxxxx") {
    return json({ ok: false, error: "APIキーが未設定です（.dev.vars / CF環境変数の GEMINI_API_KEY）" }, 400);
  }

  let payload;
  try { payload = await request.json(); }
  catch { return json({ ok: false, error: "リクエストの解析に失敗しました" }, 400); }

  const text = (payload && payload.text || "").trim();
  if (!text) return json({ ok: false, error: "台本テキストが空です" }, 400);
  const voice = payload.voice || "Erinome";
  const model = payload.model || DEFAULT_MODEL;

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };

  // 混雑(503/high demand)や一時的な空応答はリトライ（最大3回）
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastErr = "音声データが返りませんでした";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT(model, key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const raw = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
        if (res.status === 429 && /limit:\s*0|free_tier/i.test(raw)) {
          return json({ ok: false, error: "このTTSモデルは無料枠では利用できません。別モデルを選ぶか、課金(有料枠)を有効化してください。（元: " + raw.slice(0, 120) + "…）", status: res.status }, 502);
        }
        lastErr = raw;
        const transient = res.status === 429 || res.status >= 500 || /overload|high demand|unavailable|temporarily|try again/i.test(raw);
        if (transient && attempt < 2) { await delay(1500); continue; }
        return json({ ok: false, error: "Gemini TTS エラー: " + raw, status: res.status }, 502);
      }
      const part = (data.candidates && data.candidates[0] && data.candidates[0].content &&
                    data.candidates[0].content.parts || [])
        .find((p) => p.inlineData && (p.inlineData.mimeType || "").startsWith("audio/"));
      if (!part) { lastErr = "音声データが空"; if (attempt < 2) { await delay(1500); continue; } return json({ ok: false, error: "音声データが返りませんでした（台本を短くするか別モデルを試してください）" }, 502); }

      const rate = parseSampleRate(part.inlineData.mimeType);
      const pcm = b64ToBytes(part.inlineData.data);
      const wav = pcmToWav(pcm, rate);
      return json({ ok: true, mimeType: "audio/wav", audioBase64: bytesToB64(wav), seconds: +(pcm.length / 2 / rate).toFixed(1) });
    } catch (e) {
      lastErr = (e && e.message) ? e.message : String(e);
      if (attempt < 2) { await delay(1500); continue; }
    }
  }
  return json({ ok: false, error: "音声生成に失敗（混雑の可能性）: " + lastErr }, 502);
}
