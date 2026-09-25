// ============================================================
// CF Pages Function: /api/calendar
// 決算カレンダー（これから決算を発表する会社の一覧）。AIは使わない。
//   ?market=jp&src=jpx                 … 日本株。JPX（東証）の「決算発表予定日」の Excel を全部読んで返す
//                                        （JPX は 3月期・9月期の会社を「翌営業日の分」しか載せないので、日経でおぎなう）
//   ?market=jp&month=YYYY-MM&hm=1      … 日本株。日経の決算発表スケジュールのその月（50件ずつのページを hm から最大40ページ。残りは next）
//   ?market=us&month=YYYY-MM           … 米国株。Nasdaq の決算カレンダーを、その月の平日ぶん読んで返す
// どれも結果を Cloudflare のキャッシュに 6 時間置く（1実行 50 回の外部取得の上限に当たらないよう、日ごとではなく丸ごと1つで置く）。
// ============================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const TTL = 6 * 3600;
const JPX_PAGE = "https://www.jpx.co.jp/listing/event-schedules/financial-announcement/index.html";

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

// ---- xlsx（zip）を読む：必要なファイルだけ取り出す ----
async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf, want) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error("zip が読めません");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {}, dec = new TextDecoder("utf-8");
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (!want(name)) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const data = u8.subarray(start, start + csize);
    out[name] = dec.decode(method === 8 ? await inflateRaw(data) : data);
  }
  return out;
}
const unxml = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, c) => String.fromCharCode(+c)).replace(/&amp;/g, "&");
// Excel の日付（1900年方式の通し番号）→ YYYY-MM-DD
const serialDate = (v) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(+v) * 86400000); return d.toISOString().slice(0, 10); };

// 1つ目のシートを行ごと（{A:..,B:..}）に読む
async function readXlsx(buf) {
  const files = await unzip(buf, (nm) => nm === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(nm));
  const ss = [];
  for (const m of (files["xl/sharedStrings.xml"] || "").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    ss.push(unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }
  const sheetName = Object.keys(files).filter((k) => k.startsWith("xl/worksheets/")).sort()[0];
  const rows = [];
  for (const rm of (files[sheetName] || "").matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = cm[1], attr = cm[2], body = cm[3] || "";
      const t = (attr.match(/t="(\w+)"/) || [])[1] || "";
      let v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (t === "s") v = ss[+v];
      else if (t === "inlineStr") v = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
      if (v != null) row[col] = { v: unxml(v).trim(), num: !t };
    }
    rows.push(row);
  }
  return rows;
}

// ---- 日本株：JPX の決算発表予定日 ----
async function loadJp() {
  const page = await fetch(JPX_PAGE, { headers: { "User-Agent": UA } });
  if (!page.ok) throw new Error(`JPX のページを開けません（${page.status}）`);
  const html = await page.text();
  const links = [...new Set([...html.matchAll(/href="([^"]+\.xlsx)"/g)].map((m) => new URL(m[1], JPX_PAGE).href))];
  if (!links.length) throw new Error("JPX のページに一覧（Excel）が見つかりません");
  const out = [], files = [];
  for (const url of links.slice(0, 20)) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) continue;
    const rows = await readXlsx(await res.arrayBuffer());
    let asOf = "";
    for (const r of rows) {
      const a = r.A;
      if (!a) continue;
      if (!asOf) { const m = a.v.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); if (m) asOf = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`; }
      if (!a.num || !/^\d{5}$/.test(a.v) || !r.B) continue;   // 日付の入った行だけ（見出し・注記は飛ばす）
      out.push({
        date: serialDate(a.v),
        code: r.B.v,
        name: r.C ? r.C.v : "",
        fy: r.E && r.E.num && /^\d+$/.test(r.E.v) ? serialDate(r.E.v).slice(0, 7) : (r.E ? r.E.v : ""),
        industry: r.F ? r.F.v : "",
        kind: r.H && r.H.v !== "-" ? r.H.v : "",
        segment: r.J ? r.J.v : "",
      });
    }
    files.push({ url, asOf });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  return { ok: true, market: "jp", source: "JPX", files, rows: out };
}

// ---- 日本株：日経の決算発表スケジュール（月ごと・50件ずつのページ） ----
const NK = "https://www.nikkei.com/markets/kigyo/money-schedule/kessan/";
const NK_KIND = { "第１": "第１四半期", "第２": "第２四半期", "第３": "第３四半期", "本": "本決算" };
const cellText = (s) => unxml(String(s).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")).replace(/\s+/g, " ").trim();
async function loadNikkeiPage(month, hm) {
  const [y, m] = month.split("-");
  const q = `?ResultFlag=1&kwd=&KessanMonth=&SearchDate1=${encodeURIComponent(`${y}年${m}`)}&SearchDate2=${encodeURIComponent("選択なし")}&Gcode=%20&hm=${hm}`;
  const res = await fetch(NK + q, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!res.ok) throw new Error(`日経 ${res.status}`);
  const html = await res.text();
  const total = +((html.match(/での検索結果：([\d,]+)件/) || [])[1] || "0").replace(/,/g, "");
  const table = (html.match(/summary="決算発表スケジュール表"[\s\S]*?<\/table>/) || [""])[0];
  const rows = [];
  for (const tr of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const d = (tr[1].match(/<th[^>]*>\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s*<\/th>/) || []);
    if (!d[1]) continue;
    const td = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => cellText(x[1]));
    const kind = td[4] || "";
    rows.push({
      date: `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`,
      code: td[0] || "", name: td[1] || "", fy: td[3] || "",
      kind: NK_KIND[kind] || kind, industry: td[5] || "", segment: td[6] || "",
    });
  }
  return { total, rows };
}
async function loadNikkei(month, hm) {
  const first = await loadNikkeiPage(month, hm);
  const pages = Math.ceil(first.total / 50), last = Math.min(pages, hm + 39);
  const rows = [...first.rows];
  for (let p = hm + 1; p <= last; p += 8) {   // 8ページずつ（相手に負担をかけすぎない）
    const batch = [];
    for (let k = p; k < p + 8 && k <= last; k++) batch.push(loadNikkeiPage(month, k));
    for (const r of await Promise.allSettled(batch)) if (r.status === "fulfilled") rows.push(...r.value.rows);
  }
  return { ok: true, market: "jp", source: "日経", month, total: first.total, next: last < pages ? last + 1 : 0, rows };
}

// ---- 米国株：Nasdaq の決算カレンダー（1日ずつ） ----
const TIME = { "time-pre-market": "寄り前", "time-after-hours": "引け後", "time-not-supplied": "" };
async function loadUsDay(date) {
  const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
    headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
  });
  if (!res.ok) throw new Error(`Nasdaq ${res.status}`);
  const j = await res.json();
  return ((j && j.data && j.data.rows) || []).map((r) => ({
    date,
    time: TIME[r.time] != null ? TIME[r.time] : "",
    symbol: r.symbol || "",
    name: r.name || "",
    cap: +String(r.marketCap || "").replace(/[$,]/g, "") || 0,
    fq: r.fiscalQuarterEnding || "",
    eps: r.epsForecast || "",
  }));
}
async function loadUs(month) {
  const [y, m] = month.split("-").map(Number);
  const days = [];
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) break;
    const w = dt.getUTCDay();
    if (w !== 0 && w !== 6) days.push(dt.toISOString().slice(0, 10));
  }
  const res = await Promise.allSettled(days.map(loadUsDay));
  const rows = [], failed = [];
  res.forEach((r, i) => (r.status === "fulfilled" ? rows.push(...r.value) : failed.push(days[i])));
  if (failed.length === days.length) throw new Error("Nasdaq から読めませんでした（" + (res[0].reason && res[0].reason.message) + "）");
  return { ok: true, market: "us", source: "Nasdaq", month, failed, rows };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const market = url.searchParams.get("market") || "";
  const month = url.searchParams.get("month") || "";
  if (market !== "jp" && market !== "us") return json({ ok: false, error: "market は jp か us" }, 400);
  const jpx = market === "jp" && url.searchParams.get("src") === "jpx";
  const hm = Math.max(1, parseInt(url.searchParams.get("hm") || "1", 10) || 1);
  if (!jpx && !/^\d{4}-\d{2}$/.test(month)) return json({ ok: false, error: "month は YYYY-MM" }, 400);

  const cache = caches.default;
  const key = new Request(`https://kessan-cache.local/calendar/v1/${market}/${jpx ? "jpx" : month + (market === "jp" ? "/" + hm : "")}`);
  if (url.searchParams.get("fresh") !== "1") {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  try {
    const body = jpx ? await loadJp() : market === "jp" ? await loadNikkei(month, hm) : await loadUs(month);
    body.fetchedAt = new Date().toISOString();
    const res = json(body, 200, true);
    // 一部の日が読めなかったときは置かない（次に開いたとき読み直す）
    if (!(body.failed && body.failed.length)) context.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 502);
  }
}
