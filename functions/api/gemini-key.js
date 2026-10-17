// ============================================================
// CF Pages Function: /api/gemini-key
// 画面から Gemini に直接頼むときの APIキーを渡す（2026-10-18）。
// ・/api/analyze 経由だと、Cloudflare が Google の最初の返事を125秒までしか待たず、
//   考える時間の長いモデル（3.8・3.7 Flash）が毎回切られていた（HTTP 524）。
// ・キーは今までどおり環境変数 GEMINI_API_KEY に置いたまま。ファイルには書かない。
// ・渡すのは、ログイン（Cloudflare Access）を通った本番の画面と、ローカルの確認だけ。
//   デプロイごとの別URL（<hash>.〜.pages.dev）はログインが掛かっていないことがあるので渡さない。
// ============================================================

const PROD_HOST = "kessan-tool-n9bqr59wv383lwpcyki3cnqhiktjzf0u6nxkcjlyq4kz8x.pages.dev";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequestGet({ request, env }) {
  const host = new URL(request.url).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  if (!local && (host !== PROD_HOST || !request.headers.get("Cf-Access-Jwt-Assertion"))) {
    return json({ ok: false, error: "このURLでは使えません" }, 403);
  }
  const key = env.GEMINI_API_KEY;
  if (!key || key === "xxxxx") return json({ ok: false, error: "APIキーが未設定です" }, 400);
  return json({ ok: true, key });
}
