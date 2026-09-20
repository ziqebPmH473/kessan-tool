// ============================================================
// CF Pages Function: /api/grab?url=...
// 出典（根拠資料）の PDF・画像をサーバー側で取得して返す（ブラウザのCORS回避）。
// ・返すのは application/pdf と image/* だけ（HTMLページは画面に写せないので受け付けない）
// ・30MB まで。AIは使わない：取得して素通しするだけ。
// ============================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const MAX = 30 * 1024 * 1024;

function err(msg, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const target = new URL(request.url).searchParams.get("url") || "";
  let u;
  try { u = new URL(target); } catch (e) { return err("URLの形式が正しくありません"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") return err("http／https のURLだけ取得できます");

  let res;
  try {
    res = await fetch(u.toString(), { headers: { "User-Agent": UA, "Accept": "application/pdf,image/*,*/*" }, redirect: "follow" });
  } catch (e) {
    return err("取得できませんでした：" + (e.message || e));
  }
  if (!res.ok) return err(`取得できませんでした（${res.status}）`, 502);

  const type = (res.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/pdf" && !type.startsWith("image/")) {
    return err(`PDFか画像ではありません（${type || "種類不明"}）。ページの場合は、画面を撮った画像を選んでください`);
  }
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) return err("中身が空でした");
  if (buf.byteLength > MAX) return err("30MBを超えています");

  return new Response(buf, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(buf.byteLength),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
