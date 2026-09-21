// ============================================================
// CF Pages Function: /api/grab?url=...
// 出典（根拠資料）の PDF・画像をサーバー側で取得して返す（ブラウザのCORS回避）。
// ・返すのは application/pdf と image/* だけ（HTMLページは画面に写せないので受け付けない）
// ・30MB まで。AIは使わない：取得して素通しするだけ。
// ============================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const MAX = 30 * 1024 * 1024;

// 「見つからない」「なくなった」ことを知らせるページの言い回し（エラー番号を返さないサイト向け）
const GONE = /お探しのページ|(ページ|記事|ファイル|コンテンツ|URL|情報)[^。\n]{0,24}(見つかりません|みつかりません|見つけられません|存在しません|削除され|なくなりました|公開を終了|公開は終了|掲載を終了|掲載は終了|掲載期間[^。\n]{0,8}(終了|過ぎ))|404\s*not\s*found|page\s*(was\s*)?not\s*found|the page you (are|were) looking for/i;
const plain = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
// 先頭の limit バイトだけ読む
async function readHead(res, limit) {
  const reader = res.body.getReader(); const chunks = []; let n = 0;
  while (n < limit) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; }
  try { await reader.cancel(); } catch (e) {}
  const out = new Uint8Array(Math.min(n, limit)); let o = 0;
  for (const c of chunks) { const k = Math.min(c.length, out.length - o); out.set(c.subarray(0, k), o); o += k; if (o >= out.length) break; }
  return out;
}
// 文字コードは、ヘッダー → <meta> の順に見る。使えない指定なら UTF-8 で読む
function decodeHtml(buf, ctype) {
  let cs = (String(ctype).match(/charset=([\w-]+)/i) || [])[1] || "";
  if (!cs) { const head = new TextDecoder("utf-8").decode(buf.subarray(0, 4096)); cs = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || "utf-8"; }
  try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch (e) { return new TextDecoder("utf-8").decode(buf); }
}

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
    if (new URL(request.url).searchParams.get("check")) {
      return new Response(JSON.stringify({ ok: false, status: 0, type: "", error: String(e.message || e) }), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      });
    }
    return err("取得できませんでした：" + (e.message || e));
  }
  // ?check=1 … リンクの確認。中身は返さないが、判定の材料を返す：
  //   finalUrl＝転送を追いかけた先のURL、type＝種類、title＝ページの題名、hit＝「見つかりません」などの文が本文にあればその前後
  //   （エラー番号を返さずに「この記事はなくなりました」と表示するサイトを拾うため）
  if (new URL(request.url).searchParams.get("check")) {
    const ctype = res.headers.get("Content-Type") || "";
    const type = ctype.split(";")[0].trim().toLowerCase();
    let title = "", hit = "";
    if (res.ok && /html|xml|text\/plain/.test(type)) {
      try {
        const buf = await readHead(res, 300 * 1024);
        const text = decodeHtml(buf, ctype);
        const t = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        title = t ? plain(t[1]).slice(0, 120) : "";
        if (title.includes("\uFFFD")) title = "";
        const all = title + " ／ " + plain(text.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " "));
        const m = all.match(GONE);
        if (m) hit = all.slice(Math.max(0, m.index - 20), m.index + m[0].length + 30).trim();
      } catch (e) {}
    } else { try { await res.body?.cancel(); } catch (e) {} }
    return new Response(JSON.stringify({ ok: res.ok, status: res.status, type, finalUrl: res.url, title, hit }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
    });
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
