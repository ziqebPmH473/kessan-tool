// 分析動画の JSON（決算PJの ev-viz-json：analysis ＋ visualization）から、超ショートの材料（ShortData）を機械的に作る
// AI は使わない。AI が選ぶのは ShortPlan（どの部品を主役にするか）だけ。
import { shortName } from './names';
import type { Grade, ItemKey, ShortData } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

const val = (x: J): number | null => (x == null ? null : typeof x === 'number' ? x : typeof x === 'object' && typeof x.value === 'number' ? x.value : null);
const disp = (s: J): number | null => {
  if (typeof s !== 'string' || !s || s === '—') return null;
  const n = parseFloat(s.replace(/,/g, '').replace('−', '-'));
  return Number.isFinite(n) ? n : null;
};
const has = (...xs: (number | null | undefined)[]) => xs.every((x) => typeof x === 'number' && Number.isFinite(x));
const r1 = (n: number) => Math.round(n * 10) / 10;
// 決算期の書き方を短く：2024/11期 → 24/11、2027年3月期 → 27/3
const shortPeriod = (s: string) => {
  const m = s.match(/(\d{4})[\/年](\d{1,2})/);
  return m ? `${m[1].slice(2)}/${Number(m[2])}` : s.replace(/期.*$/, '');
};
const PACE: Record<string, number> = { Q1: 25, Q2: 50, Q3: 75 };
const GRADES: Grade[] = ['strong', 'good', 'neutral', 'caution', 'weak'];
// 専門用語をやさしく（財務健全性 → 財務の安全性、キャッシュ創出力 → お金を生む力）
const RATING_LABEL: Record<string, string> = { financial_health: '財務の安全性', cash_generation: 'お金を生む力' };

export const fromAnalysis = (json: J): ShortData => {
  const a = json.analysis ?? {};
  const v = json.visualization ?? {};
  const co = v.company ?? a.company ?? {};
  // 金額は会社の単位（百万円・千円・億円）→ 画面の単位（億）へ
  const F = a.company?.unit === '千円' ? 1e-5 : a.company?.unit === '億円' ? 1 : 1e-2;
  const M = (x: J) => {
    const n = val(x);
    return n == null ? null : n * F;
  };
  const labels: Record<string, string> = a.item_labels ?? {};
  const nameOf = (key: ItemKey, fallback: string) => shortName(labels[key] || fallback);
  const pt = (co.period_type ?? 'FY') as 'Q1' | 'Q2' | 'Q3' | 'FY';
  const isNow = a.income_statement?.current ?? {};
  const isPrev = a.income_statement?.previous ?? {};

  // 決算ハイライト
  const kpis = (v.summary?.kpis ?? [])
    .filter((k: J) => has(k.current?.value, k.previous?.value))
    .map((k: J) => ({ key: k.key as ItemKey, name: shortName(k.label), prev: k.previous.value * F, cur: k.current.value * F }));

  // 業績の推移（通期。表示用の数字は億の単位で入っている）
  const trend = (v.trends ?? [])
    .map((t: J) => ({ l: shortPeriod(t.period_label ?? ''), rev: disp(t.revenue_display), op: disp(t.operating_income_display), fc: !!t.is_forecast }))
    .filter((t: J) => has(t.rev, t.op)) as ShortData['trend'];

  // 事業ごと（売上は visualization、利益は analysis から名前で合わせる）
  const segItemsA: J[] = a.segments?.items ?? [];
  const segments =
    v.segments?.basis === 'profit'
      ? []
      : (v.segments?.items ?? [])
          .filter((s: J) => has(s.revenue, s.previous_revenue))
          .map((s: J) => {
            const sa = segItemsA.find((x) => x.name === s.name);
            return { name: s.name, rev: s.revenue * F, prevRev: s.previous_revenue * F, op: M(sa?.operating_income), prevOp: M(sa?.previous_operating_income) };
          });
  const segLabel = String(v.segments?.type_label ?? '事業').replace(/別$/, '') || '事業';

  // 売上→利益の構造・利益率
  const rv = M(isNow.revenue);
  const cost = M(isNow.cost_of_sales);
  const sga = M(isNow.sga);
  const pl = has(rv, cost, sga) && rv! > 0 ? { sales: rv!, cost: cost!, sga: sga! } : null;
  const margins: ShortData['margins'] = [];
  const prv = M(isPrev.revenue);
  const gp = M(isNow.gross_profit);
  const pgp = M(isPrev.gross_profit);
  const op = M(isNow.operating_income);
  const pop = M(isPrev.operating_income);
  if (has(rv, prv, gp, pgp) && rv! > 0 && prv! > 0) margins.push({ name: '粗利率', prev: r1((pgp! / prv!) * 100), cur: r1((gp! / rv!) * 100) });
  if (has(rv, prv, op, pop) && rv! > 0 && prv! > 0) margins.push({ name: `${nameOf('operating_income', '営業利益')}率`, prev: r1((pop! / prv!) * 100), cur: r1((op! / rv!) * 100) });

  // 営業利益から純利益まで
  const steps = (
    [
      ['operating_income', '営業利益'],
      ['ordinary_income', '経常利益'],
      ['pretax_income', '税引前利益'],
      ['net_income', '純利益'],
    ] as [ItemKey, string][]
  )
    .map(([key, nm]) => ({ key, name: nameOf(key, nm), v: M(isNow[key]) }))
    .filter((s) => s.v != null) as { key: ItemKey; name: string; v: number }[];
  // 「税引前利益」を本業の利益として出している会社（営業利益が無い）は、同じ段が2つにならないように
  const uniq = steps.filter((s, i) => i === 0 || Math.abs(s.v - steps[i - 1].v) > 1e-9 || s.key === 'net_income');
  const pNet = M(isPrev.net_income);
  const netgap = uniq.length >= 2 && uniq[0].key === 'operating_income' && uniq[uniq.length - 1].key === 'net_income' && has(pop, pNet) ? { steps: uniq, prevOp: pop!, prevNet: pNet! } : null;

  // 会社予想（修正前→修正後・進み具合）
  const fc = v.forecast_compare;
  const rows: J[] = fc?.rows ?? [];
  const lastAct = [...trend].reverse().find((t) => !t.fc);
  const trendNet = (v.trends ?? []).filter((t: J) => !t.is_forecast).map((t: J) => disp(t.net_income_display));
  const baseOf = (key: string): number | null => {
    if (pt === 'FY') {
      const k = kpis.find((x: J) => x.key === key);
      return k ? k.cur : null;
    }
    if (key === 'revenue') return lastAct?.rev ?? null;
    if (key === 'operating_income') return lastAct?.op ?? null;
    if (key === 'net_income') return trendNet.length ? trendNet[trendNet.length - 1] : null;
    return null;
  };
  const fItems = rows
    .filter((r) => has(r.after_oku) && baseOf(r.key) != null)
    .map((r) => ({ key: r.key as ItemKey, name: shortName(r.label), cur: baseOf(r.key)!, next: r.after_oku }));
  const forecast = a.company?.has_forecast === false || !fItems.length ? null : { basis: (pt === 'FY' ? 'next' : 'this') as 'next' | 'this', items: fItems };

  const progress =
    PACE[pt] && rows.some((r) => has(r.progress_pct))
      ? {
          pace: PACE[pt],
          items: rows
            .filter((r) => has(r.after_oku, r.progress_pct) && r.after_oku > 0)
            .map((r) => ({ key: r.key as ItemKey, name: shortName(r.label), actual: (r.after_oku * r.progress_pct) / 100, forecast: r.after_oku })),
        }
      : null;

  const revRows = rows.filter((r) => has(r.before_oku, r.after_oku));
  const revision =
    fc && ['up', 'down', 'flat', 'other'].includes(fc.status_kind) && revRows.length
      ? { label: `${pt === 'FY' ? '通期' : pt.replace('Q', '') + 'Q'}の発表時`, items: revRows.map((r) => ({ key: r.key as ItemKey, name: shortName(r.label), before: r.before_oku, after: r.after_oku })) }
      : null;
  // 配当：「（株式分割前）」「（中間）」のような注記つき、2倍以上・半分以下の変化は、くらべ方が揃っていないおそれがあるので出さない
  // （保存データ：サンリオ 69円（分割前）→16円（分割後）、三井不動産 18.5円（中間）→37円（年間））
  const dbs = String(fc?.dividend?.before_display ?? '');
  const das = String(fc?.dividend?.after_display ?? '');
  const db = disp(dbs);
  const da = disp(das);
  const plain = !/（|\(/.test(dbs + das);
  const sane = has(db, da) && db! > 0 && da! / db! >= 0.5 && da! / db! <= 2.2;
  const dividend = has(db, da) && plain && (sane || db === 0 || da === 0) ? { before: db!, after: da!, label: '年間・予想' } : null;

  // 直近の3か月（四半期単独）
  const qs = v.quarter_standalone;
  const quarter =
    qs?.kpis?.length
      ? {
          label: String(qs.label ?? '').replace(/（.*$/, ''),
          items: qs.kpis.filter((k: J) => has(k.current?.value, k.previous?.value)).map((k: J) => ({ key: k.key as ItemKey, name: shortName(k.label), prev: k.previous.value * F, cur: k.current.value * F })),
        }
      : null;

  // 貸借対照表・キャッシュフロー（合計が合わないときは出さない）
  const bsc = a.balance_sheet?.current ?? {};
  const ta = M(bsc.total_assets);
  const tl = M(bsc.total_liabilities);
  const te = M(bsc.total_equity);
  const per = v.balance_sheet?.previous_equity_ratio?.value;
  const bs = has(ta, tl, te, per) && v.balance_sheet?.balance_check?.ok !== false && ta! > 0 ? { assets: ta!, liabilities: tl!, equity: te!, prevEquityRatio: per } : null;
  const cfc = a.cash_flow?.current ?? {};
  const cfv = [M(cfc.cash_begin), M(cfc.operating), M(cfc.investing), M(cfc.financing), M(cfc.cash_end)];
  const cf = has(...cfv) && cfv[0]! > 0 ? { begin: cfv[0]!, operating: cfv[1]!, investing: cfv[2]!, financing: cfv[3]!, end: cfv[4]! } : null;

  // 株価：発表の前の40日分＋発表の翌日
  const sp = v.stock_price;
  let stock: ShortData['stock'] = null;
  if (sp?.points?.length && has(sp.pre?.value, sp.post?.value)) {
    const ai = Math.min(sp.announcement_index ?? sp.points.length - 1, sp.points.length - 1);
    const pre = sp.points.slice(Math.max(0, ai - 39), ai + 1).map((p: J) => p.close);
    const prices = [...pre, sp.post.value];
    stock = { prices, at: prices.length - 1, days: '発表の翌日', pre: sp.pre.value, post: sp.post.value, unit: sp.price_unit };
  }

  const text = (x: J) => (typeof x === 'string' ? x : x?.title ?? x?.text ?? '');
  return {
    company: co.name ?? '',
    period: co.fiscal_period_label ?? '',
    metric: nameOf('operating_income', '営業利益'),
    unit: v.display_unit ?? '億円',
    periodType: pt,
    trend,
    segLabel,
    segments,
    pl,
    margins,
    netgap,
    forecast,
    progress,
    revision,
    dividend,
    topics: (a.ai_insights?.unusual_points ?? []).slice(0, 3).map((u: J) => ({ icon: '📌', title: u.title, sub: undefined })),
    kpis,
    stock,
    bs,
    cf,
    quarter,
    ratings: (v.ratings ?? [])
      .filter((r: J) => r.available !== false && GRADES.includes(r.grade))
      .map((r: J) => ({ label: RATING_LABEL[r.key] ?? r.label, grade: r.grade as Grade, reason: r.reason })),
    points: { good: (v.highlights?.good ?? []).map(text).filter(Boolean), watch: (v.highlights?.watch ?? []).map(text).filter(Boolean) },
  };
};
