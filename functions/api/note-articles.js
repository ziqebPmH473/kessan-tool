// ============================================================
// CF Pages Function: /api/note-articles
// note の公開API（クリエイターの記事一覧）を中継する。
// ・ブラウザから note.com を直接叩くと CORS で弾かれるためサーバー側を通す
// ・関連記事リンク（あわせて読みたい）の候補を出すのに使う
// ・Cloudflare 無料プランは 1 実行あたり 50 subrequests までなので、
//   「指定期間より古い記事が出たら打ち切り」＋ページ数の上限で抑える
// ============================================================

const PAGE_MAX = 12;          // 1 回の呼び出しで取りに行くページ数の上限（1ページ6件）
const DAYS_DEFAULT = 90;

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

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const urlname = (url.searchParams.get("urlname") || "").trim().replace(/^@/, "");
  if (!urlname || !/^[A-Za-z0-9_-]{1,64}$/.test(urlname)) {
    return json({ ok: false, error: "urlname（note ID）を指定してください" }, 400);
  }
  const days = Math.min(3650, Math.max(1, parseInt(url.searchParams.get("days") || DAYS_DEFAULT, 10) || DAYS_DEFAULT));
  const paidOnly = url.searchParams.get("paid") !== "0";
  const cutoff = Date.now() - days * 86400000;

  const items = [];
  let page = 1, truncated = false;
  try {
    for (; page <= PAGE_MAX; page++) {
      const res = await fetch(
        `https://note.com/api/v2/creators/${encodeURIComponent(urlname)}/contents?kind=note&page=${page}`,
        { headers: { "User-Agent": "kessan-tool/1.0", Accept: "application/json" } }
      );
      if (!res.ok) {
        if (page === 1) return json({ ok: false, error: `note API エラー: HTTP ${res.status}` }, 502);
        break;
      }
      const data = await res.json();
      const contents = (data && data.data && data.data.contents) || [];
      if (!contents.length) break;

      let reachedOld = false;
      for (const c of contents) {
        const at = Date.parse(c.publishAt || "");
        if (isFinite(at) && at < cutoff) { reachedOld = true; continue; }
        if (c.status !== "published") continue;
        if (paidOnly && !(c.price > 0)) continue;
        items.push({
          title: c.name || "",
          url: c.noteUrl || `https://note.com/${urlname}/n/${c.key}`,
          key: c.key || "",
          publishAt: c.publishAt || "",
          price: c.price || 0,
          // ハッシュタグは「#」付きで入っているので外して保持する（#6278 → 6278）
          tags: ((c.hashtags || []).map((h) => (h && h.hashtag && h.hashtag.name) || "").filter(Boolean))
            .map((t) => t.replace(/^#/, "")),
        });
      }
      if (reachedOld) break;                       // 期間より古い記事まで来たら打ち切り
      if (data.data && data.data.isLastPage) break;
      if (page === PAGE_MAX) truncated = true;
    }
  } catch (e) {
    return json({ ok: false, error: "note API の取得に失敗しました: " + ((e && e.message) || e) }, 502);
  }

  return json({ ok: true, urlname, days, paidOnly, count: items.length, truncated, items });
}
