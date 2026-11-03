// ============================================================
// CF Pages Function: /api/hot-stocks
// 「いま注目の銘柄」。株サイトのランキングを集めて、銘柄コードごとに点をつけて並べる。AIは使わない。
//   集める元（どれも公開ページ。読めなかった元は failed に入れて、残りで返す）
//     株探     ：本日の活況銘柄（売買代金。3ページ＝45件）／動意株ニュース（2ページ）／ストップ高／
//                取引時間中・取引終了後に決算発表した銘柄／人気の株式テーマ（3日間）の関連銘柄／人気ニュース（直近8時間）
//     Yahoo!ファイナンス：売買代金上位（50件）
//     みんかぶ ：買い予想数上昇（20件）／人気テーマの代表銘柄
//   点のつけ方：表ごとに重みがあり、上位ほど高い（重み × (1 − (順位−1)/件数)）。いくつもの表に載るほど点が重なる。
//   結果は Cloudflare のキャッシュに 1 時間置く（?fresh=1 で読み直す）。外部取得は 1 回の実行で 14 回ほど（上限 50 回）。
//   ページの作りが変わると取れなくなる。そのときは failed にその表の名前が入るので、画面で分かる。
// ============================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const TTL = 3600;

function json(obj, status = 200, cache = false) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": cache ? `public, max-age=${TTL}` : "no-store",
    },
  });
}

const txt = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
// 全角英数字を半角へ（株探・みんかぶの銘柄名は全角で書かれている）
const half = (s) => String(s || "").replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, " ").trim();
const rows = (html) => [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
const cells = (tr) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1]);

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "ja,en;q=0.9" },
    redirect: "follow",
    cf: { cacheTtl: 0 },
  });
  if (!(res.status >= 200 && res.status < 300)) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ---- 株探：株価注意報の表（コード／銘柄名／市場／株価／前日比％ … ）。mode ごとに列は少し違うが、コードは最初の <a href="/stock/?code=">、％は "<span class=up|down>±x</span>%" ----
function parseKabutanWarning(html) {
  const out = [];
  for (const tr of rows(html)) {
    const m = tr.match(/<a href="\/stock\/\?code=([0-9A-Z]{4})">\1<\/a>/);
    if (!m) continue;
    const code = m[1];
    const name = half(txt((tr.match(/<th[^>]*class="tal"[^>]*>([\s\S]*?)<\/th>/) || [])[1]));
    const market = txt((tr.match(/<td class="tac">(東[ＰＳＧ]|名[ＰＭＮ]|札|福|東Ｐ|東Ｓ|東Ｇ)[^<]*<\/td>/) || [])[1]).replace("東Ｐ", "プライム").replace("東Ｓ", "スタンダード").replace("東Ｇ", "グロース");
    const pct = (tr.match(/<span class="(?:up|down)">([+\-−][\d.,]+)<\/span>\s*%/) || [])[1] || "";
    const price = txt((tr.match(/<\/td>\s*<td>([\d,.]+)<\/td>\s*<td>/) || [])[1]);
    // 決算ポイント（mode=4_2/4_3）：/news/?b=k… のリンク文
    const point = txt((tr.match(/<a href="\/news\/\?b=k\d+">([\s\S]*?)<\/a>/) || [])[1]);
    const stop = /<span class="up">S<\/span>/.test(tr) ? "S高" : /<span class="down">S<\/span>/.test(tr) ? "S安" : "";
    out.push({ code, name, market, price, pct: pct.replace("−", "-"), point, stop });
  }
  return out;
}
async function kabutanWarning(mode, pages) {
  let all = [];
  for (let p = 1; p <= pages; p++) {
    const html = await fetchHtml(`https://kabutan.jp/warning/?mode=${mode}&market=0&capitalization=-1&dispmode=normal&stc=&stm=0&page=${p}`);
    const got = parseKabutanWarning(html);
    all = all.concat(got);
    if (got.length < 15) break;                          // 最後のページ
  }
  // 同じコードが 2 ページにまたがって重なることがある
  const seen = new Set();
  return all.filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
}

// ---- 株探：人気の株式テーマ（3日間）。テーマ名と関連銘柄 3 つ ----
async function kabutanThemes() {
  const html = await fetchHtml("https://kabutan.jp/info/accessranking/3_2");
  const out = [];
  for (const tr of rows(html)) {
    if (!/acrank_url/.test(tr)) continue;
    const theme = txt((tr.match(/<td class="acrank_url"><a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    if (!theme) continue;
    const stocks = [...tr.matchAll(/<a href="\/stock\/\?code=([0-9A-Z]{4})">([\s\S]*?)<\/a>/g)].map((m) => ({ code: m[1], name: half(txt(m[2])) }));
    out.push({ theme, stocks });
  }
  return out;
}

// ---- 株探：人気ニュース（直近8時間）。見出しと URL ----
async function kabutanNews() {
  const html = await fetchHtml("https://kabutan.jp/info/accessranking/2_1");
  const out = [];
  for (const tr of rows(html)) {
    const m = tr.match(/<td class="acrank_title"><a href="([^"]+)">([\s\S]*?)<\/a>/);
    if (!m) continue;
    const cat = txt((tr.match(/<div class="newslist_ctg[^"]*">([\s\S]*?)<\/div>/) || [])[1]);
    out.push({ title: half(txt(m[2])), url: "https://kabutan.jp" + m[1], cat });
  }
  return out;
}

// ---- Yahoo!ファイナンス：売買代金上位（1ページ 50 件） ----
async function yahooTradingValue() {
  const html = await fetchHtml("https://finance.yahoo.co.jp/stocks/ranking/tradingValueHigh?market=all&term=daily");
  const out = [];
  for (const tr of rows(html)) {
    const m = tr.match(/<a href="https:\/\/finance\.yahoo\.co\.jp\/quote\/([0-9A-Z]{4})\.T"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    const name = half(txt(m[2])).replace(/\(株\)|株式会社/g, "").trim();
    const market = txt((tr.match(/<li class="RankingTable__supplement[^"]*">(東証[^<]*|名証[^<]*|札証[^<]*|福証[^<]*)<\/li>/) || [])[1]).replace("東証PRM", "プライム").replace("東証STD", "スタンダード").replace("東証GRT", "グロース");
    const nums = [...tr.matchAll(/<span class="StyledNumber__value__[^"]*">([^<]*)<\/span>/g)].map((x) => x[1]);
    // 取引値／前日比（円）／前日比（％）／売買代金 の順
    out.push({ code: m[1], name, market, price: nums[0] || "", pct: nums[2] || "", value: nums[3] || "" });
  }
  return out;
}

// ---- みんかぶ：買い予想数上昇（20 件） ----
async function minkabuBuyPicks() {
  const html = await fetchHtml("https://minkabu.jp/financial_item_ranking/buy_picks_rise");
  const out = [];
  for (const tr of rows(html)) {
    const m = tr.match(/<a href="\/stock\/([0-9A-Z]{4})"[^>]*>\s*<div[^>]*>\1<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/);
    if (!m) continue;
    out.push({ code: m[1], name: half(txt(m[2])) });
  }
  return out;
}

// ---- みんかぶ：人気テーマランキング（テーマ名と代表銘柄 1 つ） ----
async function minkabuThemes() {
  const html = await fetchHtml("https://minkabu.jp/theme/popular_ranking");
  const out = [];
  for (const tr of rows(html)) {
    const t = tr.match(/href="\/theme\/([^"]+)"/);
    if (!t) continue;
    const theme = decodeURIComponent(t[1]);
    const s = tr.match(/<a href="\/stock\/([0-9A-Z]{4})">\s*<p[^>]*>\1<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/);
    out.push({ theme, stocks: s ? [{ code: s[1], name: half(txt(s[2])) }] : [] });
  }
  return out;
}

// ---- 集める。表ごとの重み（ひとつの表の 1 位がもらう点） ----
const SRC = [
  { key: "yv",  label: "Yahoo 売買代金",   w: 30 },
  { key: "kk",  label: "株探 活況銘柄",     w: 30 },
  { key: "kd",  label: "株探 動意株",       w: 25 },
  { key: "ks",  label: "株探 ストップ高",   w: 20 },
  { key: "ke",  label: "株探 決算発表",     w: 25 },
  { key: "kt",  label: "株探 人気テーマ",   w: 20 },
  { key: "mb",  label: "みんかぶ 買い予想", w: 25 },
  { key: "mt",  label: "みんかぶ 人気テーマ", w: 15 },
  { key: "kn",  label: "株探 人気ニュース", w: 20 },
];

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const cache = caches.default;
  const key = new Request("https://kessan-cache.local/hot-stocks/v1");
  if (url.searchParams.get("fresh") !== "1") {
    const hit = await cache.match(key);
    if (hit) return hit;
  }

  const failed = [];
  const get = async (label, fn, fallback) => { try { return await fn(); } catch (e) { failed.push(label + "：" + String((e && e.message) || e)); return fallback; } };
  // 株探は同時に叩きすぎないよう 2 つずつ
  const [yv, mb, mt] = await Promise.all([
    get("Yahoo 売買代金", yahooTradingValue, []),
    get("みんかぶ 買い予想", minkabuBuyPicks, []),
    get("みんかぶ 人気テーマ", minkabuThemes, []),
  ]);
  const [kk, kd] = await Promise.all([get("株探 活況銘柄", () => kabutanWarning("2_9", 3), []), get("株探 動意株", () => kabutanWarning("3_5", 2), [])]);
  const [ks, ke1] = await Promise.all([get("株探 ストップ高", () => kabutanWarning("3_1", 1), []), get("株探 決算発表（引け後）", () => kabutanWarning("4_3", 2), [])]);
  const [ke2, kt] = await Promise.all([get("株探 決算発表（取引時間中）", () => kabutanWarning("4_2", 1), []), get("株探 人気テーマ", kabutanThemes, [])]);
  const kn = await get("株探 人気ニュース", kabutanNews, []);
  const ke = ke1.concat(ke2.filter((r) => !ke1.some((x) => x.code === r.code)));

  // 銘柄ごとにまとめる
  const by = new Map();
  const st = (code, name) => {
    if (!by.has(code)) by.set(code, { code, name: name || "", market: "", price: "", pct: "", score: 0, hits: [], why: [] });
    const o = by.get(code);
    if (!o.name && name) o.name = name;
    return o;
  };
  const add = (srcKey, list, pick) => {
    const s = SRC.find((x) => x.key === srcKey), n = list.length || 1;
    list.forEach((r, i) => {
      const o = st(r.code, r.name);
      const pts = Math.round(s.w * (1 - i / n) * 10) / 10;
      o.score += pts;
      o.hits.push({ src: srcKey, rank: i + 1, pts });
      if (r.market && !o.market) o.market = r.market;
      if (r.price && !o.price) o.price = r.price;
      if (r.pct && !o.pct) o.pct = r.pct;
      const w = pick && pick(r);
      if (w && !o.why.includes(w)) o.why.push(w);
    });
  };
  add("yv", yv);
  add("kk", kk);
  add("kd", kd, () => "動意株");
  add("ks", ks, () => "ストップ高");
  add("ke", ke, (r) => r.point ? "決算：" + r.point : "決算発表");
  // テーマ：テーマの順位をそのまま銘柄の順位にする（1 位のテーマの関連銘柄 3 つは同じ点）
  // 指数の構成銘柄のテーマ（TOPIXコア30・JPX日経400・読売333 など）は「注目」ではないので外す
  const IDX = /TOPIX|JPX|日経|読売|S&P|ETF/;
  const themeRows = (ths) => ths.filter((t) => !IDX.test(t.theme)).flatMap((t, i) => t.stocks.map((s) => ({ ...s, _rank: i, theme: t.theme })));
  const addTheme = (srcKey, ths) => {
    const s = SRC.find((x) => x.key === srcKey), n = ths.length || 1;
    for (const r of themeRows(ths)) {
      const o = st(r.code, r.name);
      const pts = Math.round(s.w * (1 - r._rank / n) * 10) / 10;
      o.score += pts;
      o.hits.push({ src: srcKey, rank: r._rank + 1, pts });
      const w = "テーマ：" + r.theme;
      if (!o.why.includes(w)) o.why.push(w);
    }
  };
  addTheme("kt", kt);
  addTheme("mt", mt);
  add("mb", mb, () => "買い予想が増加");
  // 人気ニュース：見出しに、ここまでに集まった銘柄名（3文字以上）が入っていたら足す
  const names = [...by.values()].filter((o) => o.name.length >= 3).map((o) => ({ o, key: o.name.replace(/ホールディングス|HD$|グループ|製作所|工業$/, "") })).filter((x) => x.key.length >= 3);
  kn.forEach((nw, i) => {
    const s = SRC.find((x) => x.key === "kn"), n = kn.length || 1;
    for (const { o, key } of names) {
      if (!nw.title.includes(key)) continue;
      if (o.hits.some((h) => h.src === "kn")) continue;
      const pts = Math.round(s.w * (1 - i / n) * 10) / 10;
      o.score += pts;
      o.hits.push({ src: "kn", rank: i + 1, pts });
      const w = "ニュース：" + nw.title;
      if (!o.why.includes(w)) o.why.push(w);
    }
  });

  // ETF・指数連動の投信は銘柄ではないので外す
  for (const [c, o] of by) if (/ETF/.test(o.market) || /上場投信|ETF|投資信託/.test(o.name)) by.delete(c);
  const list = [...by.values()].map((o) => ({ ...o, score: Math.round(o.score * 10) / 10 })).sort((a, b) => b.score - a.score || b.hits.length - a.hits.length);
  const body = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    sources: SRC,
    stocks: list.slice(0, 80),
    themes: { kabutan: kt, minkabu: mt },
    news: kn,
    earnings: ke.map((r) => ({ code: r.code, name: r.name, pct: r.pct, point: r.point })),
    failed,
  };
  const res = json(body, 200, true);
  // 読めなかった元があるときは置かない（次に開いたとき読み直す）
  if (!failed.length) context.waitUntil(cache.put(key, res.clone()));
  return res;
}
