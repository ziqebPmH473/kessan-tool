// ============================================================
// CF Pages Function: /api/earnings-day
// 「その日に決算を発表した会社」の一覧。TDnet（適時開示）の日付別一覧から、表題に「決算短信」が入るもの（訂正は除く）を拾う。AIは使わない。
//   ?date=YYYY-MM-DD            … その日の発表ぜんぶ（場中・引け後）
//   ?date=YYYY-MM-DD&prev=YYYY-MM-DD … さらに prev の日の「引け後」（15:30 以降）の発表も足す（前営業日の引け後。営業日の判定は画面側）
//   返り：{ ok, date, prev, items:[{ code, name, time, day, timing:"場中"|"引け後", title }], failed }
//   TDnet の一覧は 100 件 / ページで新しい順（I_list_001 が最新）。決算の多い日は 1,500 件 ≒ 15 ページある。
//   prev の日は新しい順に読んで 15:30 より前の行が出たら止めるので、ページ数は少なくてすむ。
//   結果は日ごとに Cloudflare のキャッシュに置く（きのうより前の日は 7 日、今日は 10 分）。外部取得は多い日で 25 回ほど（上限 50 回）。
// ============================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const CLOSE = "15:30";           // 東証の大引け（2024-11-05 から 15:30）
const MAX_PAGES = 30;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

const txt = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// 全角英数字を半角へ。市場を表す頭の「Ｇ－」「Ｓ－」などは落とす
const half = (s) => String(s || "").replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, " ").replace(/^[A-Z]-/, "").trim();

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "ja,en;q=0.9" }, redirect: "follow", cf: { cacheTtl: 0 } });
  if (res.status === 404) return "";                       // その日の一覧が無い（土日祝・古すぎる日）
  if (!(res.status >= 200 && res.status < 300)) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// 1 ページぶんの行 → [{ time, code, name, title }]（決算短信だけ。訂正は除く）。stopped は「15:30 より前の行に当たった」
function parsePage(html, afterCloseOnly) {
  const items = [];
  let stopped = false, rowsSeen = 0;
  for (const m of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tr = m[1];
    const time = txt((tr.match(/kjTime[^>]*>([\s\S]*?)<\/td>/) || [])[1]);
    if (!/^\d\d:\d\d$/.test(time)) continue;
    rowsSeen++;
    if (afterCloseOnly && time < CLOSE) { stopped = true; break; }
    const title = txt((tr.match(/kjTitle[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    if (!/決算短信/.test(title) || /訂正/.test(title)) continue;
    const code = txt((tr.match(/kjCode[^>]*>([\s\S]*?)<\/td>/) || [])[1]).slice(0, 4);
    const name = half(txt((tr.match(/kjName[^>]*>([\s\S]*?)<\/td>/) || [])[1]));
    if (!/^[0-9A-Z]{4}$/.test(code)) continue;
    items.push({ time, code, name, title });
  }
  return { items, stopped, rowsSeen };
}

// その日の決算短信を集める。afterCloseOnly なら 15:30 以降だけ
async function tdnetDay(ymd, afterCloseOnly) {
  const d = ymd.replace(/-/g, "");
  let all = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const html = await fetchHtml(`https://www.release.tdnet.info/inbs/I_list_${String(p).padStart(3, "0")}_${d}.html`);
    if (!html) break;
    const { items, stopped, rowsSeen } = parsePage(html, afterCloseOnly);
    all = all.concat(items);
    if (stopped || rowsSeen < 100) break;                  // 最後のページ
  }
  // 同じ会社が連結・非連結などで 2 本出すことがあるので、会社ごとに最初（新しい方）の 1 本
  const seen = new Set();
  return all.filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)))
    .map((r) => ({ ...r, day: ymd, timing: r.time >= CLOSE ? "引け後" : "場中" }));
}

// 日本時間の今日（YYYY-MM-DD）
function todayJst() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }

// 日ごとのキャッシュ。過去の日は変わらないので長く、今日は短く
async function cachedDay(context, ymd, afterCloseOnly, failed) {
  const cache = caches.default;
  const key = new Request(`https://kessan-cache.local/earnings-day/v1/${ymd}/${afterCloseOnly ? "after" : "all"}`);
  const hit = await cache.match(key);
  if (hit) return await hit.json();
  let items;
  try { items = await tdnetDay(ymd, afterCloseOnly); }
  catch (e) { failed.push(`TDnet ${ymd}：` + String((e && e.message) || e)); return []; }
  const ttl = ymd < todayJst() ? 7 * 86400 : 600;
  context.waitUntil(cache.put(key, new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` } })));
  return items;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const date = url.searchParams.get("date") || "", prev = url.searchParams.get("prev") || "";
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!ok(date)) return json({ ok: false, error: "date を YYYY-MM-DD で指定してください" }, 400);
  if (prev && (!ok(prev) || prev >= date)) return json({ ok: false, error: "prev は date より前の日にしてください" }, 400);

  const failed = [];
  const cur = await cachedDay(context, date, false, failed);
  const pre = prev ? await cachedDay(context, prev, true, failed) : [];
  // 同じ会社が両方に居たら、選んだ日の方を残す
  const codes = new Set(cur.map((r) => r.code));
  const items = cur.concat(pre.filter((r) => !codes.has(r.code)));
  return json({ ok: true, date, prev: prev || null, fetchedAt: new Date().toISOString(), items, failed });
}
