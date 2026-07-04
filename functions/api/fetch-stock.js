// ============================================================
// CF Pages Function: /api/fetch-stock?code=XXXX&market=jp
// 株探の個別銘柄ページをサーバー側で取得・パースし、
// 個別銘柄分析ツールが必要とする値（株価・出来高・時価総額・PER等）を返す。
// ・CORS回避のためサーバー側で fetch する（AIは使わない：取得＋パースのみ）
// ・market-image-app / stock-slide-generator の Function パターンを踏襲
// ・株探ページは HTML 構造変更で壊れ得るため、取れない項目は空で返し
//   フロント側は手入力／NotebookLM にフォールバックする想定。
// ============================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

function cellText(c) {
  return String(c || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// 数値と単位の間の空白を詰める（例: "132 倍" → "132倍"）
function tightUnit(s) {
  return String(s || "").replace(/(\d)\s+(倍|%|％|円|株|億円|兆円|万円|ドル)/g, "$1$2");
}

// 数値化（カンマ・通貨・単位を除去）。パース失敗は null
function toNum(s) {
  const n = parseFloat(String(s || "").replace(/[,，円$¥%％倍株\s　]/g, ""));
  return isNaN(n) ? null : n;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "ja,en;q=0.9" },
    redirect: "follow",
    cf: { cacheTtl: 0 },
  });
  if (!(res.status >= 200 && res.status < 300)) throw new Error(`HTTP ${res.status}`);
  return await res.text(); // 株探は UTF-8
}

// --- 株探トップページ（/stock/?code=）：会社名・PER・PBR・利回り・時価総額 ---
function parseTopPage(html) {
  const out = {};
  // 会社名（stockinfo_i1 の h2、コード span を除去）
  const nameM = html.match(/id="stockinfo_i1"[\s\S]*?<h2>([\s\S]*?)<\/h2>/);
  if (nameM) {
    // 先頭のコード数字（例: 3778）を除去して会社名だけ残す
    out.name = cellText(nameM[1]).replace(/^\d{3,4}[A-Za-z]?\s*/, "").trim();
  }
  // stockinfo_i3：thead=PER/PBR/利回り/信用倍率、tbody 先頭行に各値
  const i3 = html.match(/id="stockinfo_i3"([\s\S]*?)<\/div>/);
  const scope = i3 ? i3[1] : html;
  const firstRow = scope.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/);
  if (firstRow) {
    const tds = (firstRow[1].match(/<td[\s\S]*?<\/td>/g) || []).map(cellText);
    if (tds[0]) out.per   = tightUnit(tds[0].replace(/％/g, "%"));
    if (tds[1]) out.pbr   = tightUnit(tds[1].replace(/％/g, "%"));
    if (tds[2]) out.yield = tightUnit(tds[2].replace(/％/g, "%"));
  }
  // 時価総額（v_zika2）
  const zikaM = scope.match(/v_zika2[^>]*>([\s\S]*?)<\/td>/);
  if (zikaM) out.marketCap = tightUnit(cellText(zikaM[1]));
  return out;
}

// --- 株探 日足ページ（/stock/kabuka?code=）：日次OHLCV表 ---
// 列: 日付, 始値, 高値, 安値, 終値, 前日比, 前日比％, 売買高(株)
function parseKabuka(html) {
  const out = { rows: [] };
  const tableM = html.match(/stock_kabuka_dwm[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (!tableM) return out;
  const trs = tableM[1].match(/<tr>[\s\S]*?<\/tr>/g) || [];
  for (const tr of trs) {
    const dateM = tr.match(/datetime="([\d-]+)"/);
    const tds = (tr.match(/<td[\s\S]*?<\/td>/g) || []).map(cellText);
    if (tds.length < 7) continue;
    out.rows.push({
      date: dateM ? dateM[1] : "",
      open: tds[0], high: tds[1], low: tds[2], close: tds[3],
      volume: tds[6],
    });
  }
  return out;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const code = (url.searchParams.get("code") || "").trim();
  const market = (url.searchParams.get("market") || "jp").trim();

  const cors = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });

  if (!code) return json({ ok: false, reason: "証券コードが指定されていません" }, 400);
  if (market === "us") {
    // 米国株は構造が異なるため現時点は未対応（手入力／NotebookLMにフォールバック）
    return json({ ok: false, reason: "米国株の自動取得は未対応です。手入力またはNotebookLMをご利用ください。" });
  }

  try {
    const topUrl    = `https://kabutan.jp/stock/?code=${encodeURIComponent(code)}`;
    const kabukaUrl = `https://kabutan.jp/stock/kabuka?code=${encodeURIComponent(code)}`;
    const [topHtml, kabukaHtml] = await Promise.all([fetchHtml(topUrl), fetchHtml(kabukaUrl)]);

    const top = parseTopPage(topHtml);
    const kab = parseKabuka(kabukaHtml);

    const rows = kab.rows;
    if (!rows.length && !top.name) {
      return json({ ok: false, reason: "株探ページからデータを取得できませんでした（コードをご確認ください）" });
    }

    const current = rows[0] ? { date: rows[0].date, close: rows[0].close, volume: rows[0].volume } : null;
    const prev    = rows[1] ? { date: rows[1].date, close: rows[1].close, volume: rows[1].volume } : null;

    // 取得範囲内の高値（期間・基準比較の基準候補）
    let high = null;
    for (const r of rows) {
      const n = toNum(r.high);
      if (n != null && (!high || n > high._n)) high = { date: r.date, price: r.high, _n: n };
    }
    if (high) delete high._n;

    return json({
      ok: true,
      code,
      name: top.name || "",
      per: top.per || "",
      pbr: top.pbr || "",
      yield: top.yield || "",
      marketCap: top.marketCap || "",
      current,
      prev,
      high,
      source: { top: topUrl, kabuka: kabukaUrl },
    });
  } catch (e) {
    return json({ ok: false, reason: String(e && e.message ? e.message : e) });
  }
}
