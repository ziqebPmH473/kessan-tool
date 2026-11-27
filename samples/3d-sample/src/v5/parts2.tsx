import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT } from '../lib';
import { Bar, K, Label, Text2D } from '../v2/kit';
import { PALE, Legend, PartProps, Scene3D, Titles, UNIT, clamp, floorLabel, fmt, grow, isRev, oku, useLand, yoyText } from './parts';
import type { PointItem } from './types';

// いまの分析動画から省いていた場面を、3Dの部品にしたもの（どれも主役版・さらっと版を持つ）

const ZeroPlate: React.FC<{ cx: number; w: number; z: number }> = ({ cx, w, z }) => (
  <mesh position={[cx, z, 0]}>
    <boxGeometry args={[w, 0.03, 1.6]} />
    <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
  </mesh>
);
const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${fmt(Math.abs(v))}`;

// ---------- 決算ハイライト（3D）：4つの数字を、前年（灰）と今年の棒の組で。4つとも同じ尺度 ----------
export const Kpi3D: React.FC<PartProps> = ({ d, dur, caption }) => {
  const f = useCurrentFrame();
  const land = useLand();
  const G = 1.75;
  const n = d.kpis.length;
  const anyNeg = d.kpis.some((k) => k.prev < 0 || k.cur < 0);
  // 4つとも同じ尺度（売上と利益の大きさの違いがそのまま見える）
  const H = 4.6;
  const allMx = Math.max(...d.kpis.flatMap((k) => [Math.abs(k.prev), Math.abs(k.cur)]));
  const negMax = Math.max(0, ...d.kpis.flatMap((k) => [-k.prev, -k.cur]));
  // 0の線の高さ：いちばん深いマイナスの棒が床に届かないように
  const Z = anyNeg ? (negMax / allMx) * H + 0.7 : 0;
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={(Z + H) / 2 + 0.2} dist={18.5 + Z * 0.8}>
        {anyNeg && <ZeroPlate cx={((n - 1) * G) / 2} w={(n - 1) * G + 2} z={Z} />}
        {d.kpis.map((k, i) => {
          const at = 2 + i * Math.min(8, dur * 0.06);
          const g = grow(f, at, Math.min(22, dur * 0.3));
          const mx = allMx;
          const bar = (v: number, x: number, color: string) => {
            const h = (Math.abs(v) / mx) * H * g;
            return <Bar x={x} y0={v < 0 ? Z - h : Z} h={h} w={0.6} d={0.6} color={color} />;
          };
          const x = i * G;
          const yy = yoyText(k.prev, k.cur);
          const curTop = k.cur < 0 ? Z : Z + (Math.abs(k.cur) / mx) * H * g;
          const showPill = f >= at + Math.min(22, dur * 0.3);
          return (
            <React.Fragment key={k.name}>
              {bar(k.prev, x - 0.36, k.prev < 0 ? '#f0a3a3' : PALE)}
              {bar(k.cur, x + 0.36, k.cur < 0 ? K.red : K.blue)}
              {f >= at + 4 && (
                <Label text={`${k.cur < 0 ? '−' : ''}${fmt(Math.abs(k.cur) * g)}`} height={0.3} position={[x + 0.36, curTop + 0.38, 0]} color={k.cur < 0 ? K.red : K.ink} />
              )}
              {showPill && <Label text={yy.t} height={0.3} position={[x, Math.max(curTop, Z + (Math.max(0, k.prev) / mx) * H) + 1.0, 0]} color="#ffffff" pill={yy.c} weight={900} />}
              {floorLabel(k.name, x, K.ink, 1.0)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag="決算ハイライト"
        at={Math.round(Math.min(30, dur * 0.3))}
        brief={!land}
        big={land && d.verdict ? <span style={{ color: /減|赤字/.test(d.verdict) && !/増益|黒字/.test(d.verdict) ? K.red : K.green }}>{d.verdict}</span> : undefined}
        sub={land ? d.headline : undefined}
        caption={caption}
      >
        {land && d.focus && d.focus.length > 0 && (
          <div style={{ fontFamily: FONT, marginTop: 10, opacity: interpolate(f, [40, 50], [0, 1], clamp) }}>
            <div style={{ fontWeight: 700, fontSize: 28, color: K.blue, marginBottom: 8 }}>今回の注目</div>
            {d.focus.slice(0, 3).map((t, i) => (
              <div key={i} style={{ fontWeight: 700, fontSize: 30, color: K.ink, padding: '8px 0', borderBottom: '2px solid #e2e8f0' }}>
                {i + 1}. {t}
              </div>
            ))}
          </div>
        )}
      </Titles>
      <Legend top="14%">
        <span style={{ color: '#94a3b8' }}>■</span> 前年　<span style={{ color: K.blue }}>■</span> 今年（{UNIT}）
      </Legend>
    </AbsoluteFill>
  );
};

// ---------- 貸借対照表：左に資産、右に負債＋純資産を積む。主役は内訳が前期末の高さから今期末へ動く。自己資本比率を強調 ----------
const BS_COLOR: Record<string, string> = {
  cash: '#0ea5e9',
  receivables: '#60a5fa',
  inventory: '#93c5fd',
  other_current_assets: '#bfdbfe',
  fixed_assets: '#2563eb',
  payables: '#fca5a5',
  debt: '#dc2626',
  other_liabilities: '#f8b4b4',
  equity: K.green,
};
const BS_ORDER_A = ['fixed_assets', 'other_current_assets', 'inventory', 'receivables', 'cash']; // 下から
const BS_ORDER_R = ['equity', 'other_liabilities', 'debt', 'payables'];
export const BSPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.bs) return null;
  const { assets, liabilities, equity, prevEquityRatio } = d.bs;
  const main = mode === 'main';
  const ratio = (equity / assets) * 100;
  const up = ratio >= prevEquityRatio;
  const blocks = d.bsBlocks ?? [];
  const detail = main && blocks.length >= 3;
  const k = main ? dur / 220 : 0.35;
  if (!detail) {
    const S = 4.4 / assets;
    const ga = grow(f, 4, 26 * k + 8);
    const gl = grow(f, 30 * k + 6, 22 * k + 8);
    const ge = grow(f, 56 * k + 8, 22 * k + 8);
    return (
      <AbsoluteFill>
        <Scene3D cx={0.9} cy={2.2} dist={15}>
          <Bar x={0} h={assets * S * ga} w={1.5} d={1.3} color={K.blue} />
          {ga > 0.5 && <Label text={`資産 ${fmt(assets)}`} height={0.3} position={[0, assets * S * ga + 0.4, 0]} color={K.blue} />}
          <Bar x={1.8} h={liabilities * S * gl} w={1.5} d={1.3} color="#f0a3a3" />
          {gl > 0.9 && <Label text={`負債 ${fmt(liabilities)}`} height={0.28} position={[1.8, (liabilities * S) / 2, 0.75]} color={K.ink} />}
          <Bar x={1.8} y0={liabilities * S} h={equity * S * ge} w={1.5} d={1.3} color={K.green} />
          {ge > 0.9 && <Label text={`純資産 ${fmt(equity)}`} height={0.28} position={[1.8, liabilities * S + (equity * S) / 2, 0.75]} color="#ffffff" />}
        </Scene3D>
        <Titles tag="財務の安全性" at={Math.round(80 * k + 12)} brief={!main} big={<>自己資本比率 <span style={{ color: up ? K.green : K.red }}>{ratio.toFixed(1)}%</span></>} sub={`前期末は ${prevEquityRatio.toFixed(1)}%`} caption={caption} />
      </AbsoluteFill>
    );
  }
  // 内訳：まず前期末の高さで積み、そこから今期末の高さへ動く（箱の高さ＝金額。左右とも同じ尺度）
  const byKey = (key: string) => blocks.find((b) => b.key === key);
  const prevTotal = Math.max(1, blocks.filter((b) => b.side === 'asset').reduce((a, b) => a + (b.prev ?? b.v), 0));
  const curTotal = Math.max(1, blocks.filter((b) => b.side === 'asset').reduce((a, b) => a + b.v, 0));
  const S = 4.6 / Math.max(prevTotal, curTotal);
  const buildAt = 4;
  const buildLen = dur * 0.3;
  const moveAt = buildAt + buildLen + dur * 0.08;
  const t = interpolate(f, [moveAt, moveAt + dur * 0.25], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const doneAt = moveAt + dur * 0.25;
  const W = 1.7;
  const stack = (order: string[], x: number, side: 'L' | 'R') => {
    let y = 0;
    const list = order.map(byKey).filter(Boolean) as NonNullable<ReturnType<typeof byKey>>[];
    return list.map((b, i) => {
      const g = grow(f, buildAt + (side === 'R' ? 6 : 0) + i * (buildLen / list.length), buildLen / list.length + 6);
      const v = (b.prev ?? b.v) + (b.v - (b.prev ?? b.v)) * t;
      const h = Math.max(0, v) * S * g;
      const y0 = y;
      y += h;
      const big = h > 0.42;
      const emph = b.key === 'cash' || b.key === 'debt' || b.key === 'equity';
      return (
        <React.Fragment key={b.key}>
          <Bar x={x} y0={y0} h={Math.max(0.001, h - 0.03)} w={W} d={1.3} color={BS_COLOR[b.key] ?? '#cbd5e1'} />
          {big && g > 0.9 && (
            <Label
              text={`${b.label} ${fmt(v)}`}
              height={(emph ? 0.22 : 0.18) * Math.min(1, 9 / Math.max(9, `${b.label} ${fmt(v)}`.length))}
              position={[x, y0 + h / 2, 0.68]}
              color={b.key === 'fixed_assets' || b.key === 'debt' || b.key === 'equity' || b.key === 'cash' ? '#ffffff' : K.ink}
              weight={emph ? 900 : 700}
            />
          )}
        </React.Fragment>
      );
    });
  };
  const prevAssets = prevTotal;
  return (
    <AbsoluteFill>
      <Scene3D cx={1.0} cy={2.5} dist={14.5}>
        {stack(BS_ORDER_A, 0, 'L')}
        {stack(BS_ORDER_R, 2.0, 'R')}
        {floorLabel('資産', 0, K.blue, 1.0)}
        {floorLabel('負債＋純資産', 2.0, K.ink, 1.0)}
        <Label text={t <= 0 ? '前期末' : t >= 1 ? '今期末' : '前期末 → 今期末'} height={0.3} position={[1.0, 4.6 * Math.max(prevAssets, curTotal) / Math.max(prevTotal, curTotal) + 0.6, 0]} color={K.sub} />
      </Scene3D>
      <Titles
        tag="貸借対照表（持っているもの・お金の出どころ）"
        at={Math.round(doneAt)}
        brief={!main}
        big={
          <>
            自己資本比率 <span style={{ color: up ? K.green : K.red }}>{ratio.toFixed(1)}%</span>
          </>
        }
        sub={`前期末 ${prevEquityRatio.toFixed(1)}%／総資産 ${oku(prevAssets)} → ${oku(curTotal)}`}
        caption={caption}
      />
      <Legend>箱の高さ＝金額（{UNIT}）。前期末の形から今期末へ</Legend>
    </AbsoluteFill>
  );
};

// ---------- キャッシュフロー：期首の現金 → 営業・投資・財務での出入り → 期末の現金 ----------
export const CFPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.cf) return null;
  const { begin, operating, investing, financing, end } = d.cf;
  const steps = [
    { l: '営業', v: operating },
    { l: '投資', v: investing },
    { l: '財務', v: financing },
    ...(d.cf.other ? [{ l: 'その他', v: d.cf.other }] : []),
  ];
  const cums: number[] = [];
  steps.reduce((a, s) => {
    cums.push(a + s.v);
    return a + s.v;
  }, begin);
  const hi = Math.max(begin, end, ...cums);
  const S = 5 / hi;
  const G = 1.25;
  const nC = steps.length + 2;
  const main = mode === 'main';
  const st = steps.map((_, i) => (main ? dur * 0.12 + i * dur * 0.12 : 8 + i * 6));
  const endAt = main ? dur * 0.52 : 30;
  const free = operating + investing;
  return (
    <AbsoluteFill>
      <Scene3D cx={((nC - 1) * G) / 2} cy={2.7} dist={Math.max(16.5, 6 + nC * 2.1)}>
        <Bar x={0} h={begin * S * grow(f, 0, 14)} w={0.95} d={0.95} color={K.gray} />
        {f >= 6 && <Label text={fmt(begin)} height={0.3} position={[0, begin * S + 0.4, 0]} color={K.sub} />}
        {floorLabel('期首', 0, K.sub)}
        {steps.map((s, i) => {
          const from = i === 0 ? begin : cums[i - 1];
          const to = cums[i];
          const t = f - st[i];
          const p = Math.min(1, Math.max(0, t / 12));
          const x = (i + 1) * G;
          const col = s.v >= 0 ? K.green : K.red;
          return (
            <React.Fragment key={s.l}>
              {t >= 0 && <Bar x={x} y0={Math.min(from, to) * S + (1 - p * p) * 3.5} h={Math.abs(s.v) * S} w={0.95} d={0.95} color={col} />}
              {p >= 1 && <Label text={signed(s.v)} height={0.3} position={[x, Math.max(from, to) * S + 0.4, 0]} color={col} />}
              {floorLabel(s.l, x, i === 0 ? K.ink : K.sub)}
            </React.Fragment>
          );
        })}
        <Bar x={(nC - 1) * G} h={end * S * grow(f, endAt, 16)} w={0.95} d={0.95} color={K.blue} />
        {f >= endAt + 8 && <Label text={fmt(end)} height={0.34} position={[(nC - 1) * G, end * S + 0.42, 0]} color={K.blue} />}
        {floorLabel('期末', (nC - 1) * G, K.ink)}
      </Scene3D>
      <Titles
        tag="お金の出入り（キャッシュフロー）"
        at={Math.round(endAt + 8)}
        brief={!main}
        big={
          <>
            自由に使えるお金 <span style={{ color: free >= 0 ? K.green : K.red }}>{signed(free)}{UNIT}</span>
          </>
        }
        sub={`稼いだお金 ${signed(operating)} ／ 投資 ${signed(investing)}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 直近の3か月（四半期単独）：累計では見えない「足もと」を、前年の同じ3か月と並べる。決算ハイライトと同じ形・同じ尺度 ----------
export const quarterVerdict = (items: { key?: string; name: string; prev: number; cur: number }[]) => {
  const r = items.find((it) => isRev(it));
  const p = items.find((it) => it.key === 'operating_income') ?? items.find((it) => !isRev(it));
  if (!r || !p) return null;
  const pw = p.prev < 0 && p.cur > 0 ? '黒字転換' : p.prev > 0 && p.cur < 0 ? '赤字転落' : p.cur >= p.prev ? '増益' : '減益';
  const good = p.cur >= p.prev;
  return { t: `${r.cur >= r.prev ? '増収' : '減収'}・${pw}`, c: good ? K.green : K.red };
};
export const QuarterPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.quarter || !d.quarter.items.length) return null;
  const main = mode === 'main';
  const qs = main ? d.quarter.items : d.quarter.items.filter((it) => isRev(it) || it.key === 'operating_income').slice(0, 2);
  const n = qs.length;
  const H = 4.0;
  const mx = Math.max(...qs.flatMap((q) => [Math.abs(q.prev), Math.abs(q.cur)]));
  const negMax = Math.max(0, ...qs.flatMap((q) => [-q.prev, -q.cur]));
  const Z = negMax > 0 ? (negMax / mx) * H + 0.7 : 0;
  const G = main ? 1.75 : 2.2;
  const v = quarterVerdict(d.quarter.items);
  const lastAt = 2 + (n - 1) * Math.min(8, dur * 0.06) + Math.min(22, dur * 0.3);
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={(Z + H) / 2 + 0.9} dist={(main ? 17.5 : 15) + Z * 0.8}>
        {Z > 0 && <ZeroPlate cx={((n - 1) * G) / 2} w={(n - 1) * G + 2} z={Z} />}
        {qs.map((q, i) => {
          const at = 2 + i * Math.min(8, dur * 0.06);
          const g = grow(f, at, Math.min(22, dur * 0.3));
          const bar = (val: number, x: number, color: string) => {
            const h = (Math.abs(val) / mx) * H * g;
            return <Bar x={x} y0={val < 0 ? Z - h : Z} h={h} w={0.6} d={0.6} color={color} />;
          };
          const x = i * G;
          const yy = yoyText(q.prev, q.cur);
          const ch = (Math.abs(q.cur) / mx) * H * g;
          const curTop = q.cur < 0 ? Z : Z + ch;
          return (
            <React.Fragment key={q.name}>
              {bar(q.prev, x - 0.36, q.prev < 0 ? '#f0a3a3' : PALE)}
              {bar(q.cur, x + 0.36, q.cur < 0 ? K.red : K.blue)}
              {f >= at + 4 && <Label text={`${q.cur < 0 ? '−' : ''}${fmt(Math.abs(q.cur) * g)}`} height={0.3} position={[x + 0.36, q.cur < 0 ? Z - ch - 0.38 : curTop + 0.38, 0.3]} color={q.cur < 0 ? K.red : K.ink} />}
              {f >= at + Math.min(22, dur * 0.3) && <Label text={yy.t} height={0.3} position={[x, Math.max(curTop, Z + (Math.max(0, q.prev) / mx) * H) + 1.0, 0]} color="#ffffff" pill={yy.c} weight={900} />}
              {floorLabel(q.name, x, K.ink, 1.0)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag={`直近の3か月だけ：${d.quarter.label}`}
        at={Math.round(lastAt + 4)}
        brief={!main}
        big={v ? <span style={{ color: v.c }}>{v.t}</span> : undefined}
        sub="前年の同じ3か月とくらべて"
        caption={caption}
      />
      <Legend>
        <span style={{ color: '#94a3b8' }}>■</span> 前年の同じ時期　<span style={{ color: K.blue }}>■</span> 今回（{UNIT}）
      </Legend>
    </AbsoluteFill>
  );
};

// ---------- 注目ポイント：GOOD と WATCH の札が、奥から順に立ち上がる。前後の数字があれば「16.6% → 18.7%」も ----------
const pointText = (p: PointItem) => (typeof p === 'string' ? { t: p } : p);
export const PointsPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const land = useLand();
  const main = mode === 'main';
  const nEach = land ? (main ? 3 : 2) : main ? 2 : 1;
  const good = d.points.good.slice(0, nEach).map((p) => ({ ...pointText(p), good: true }));
  const watch = d.points.watch.slice(0, nEach).map((p) => ({ ...pointText(p), good: false }));
  const items = land ? [...good, ...watch] : [...good, ...watch];
  const step = main ? Math.min(18, dur / (items.length + 2)) : 8;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, perspective: 1400 }}>
      <Titles tag="注目ポイント" at={Math.round(4 + items.length * step)} brief={!main} caption={caption} />
      {items.map((it, i) => {
        const at = 4 + i * step;
        const rx = interpolate(f, [at, at + 14], [-80, 0], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
        const o = interpolate(f, [at, at + 6], [0, 1], clamp);
        const col = it.good ? K.green : K.orange;
        const j = it.good ? good.indexOf(it as never) : watch.indexOf(it as never);
        const pos = land
          ? { top: 150 + j * 255, left: it.good ? 64 : 990, width: 866 }
          : { top: `${(items.some((x) => x.before) ? 17 : 20) + i * (items.some((x) => x.before) ? 17 : 15)}%`, left: 90, right: 90 };
        const nums = it.before && it.after ? `${it.metric ? it.metric + '　' : ''}${it.before} → ${it.after}${it.change ? `（${it.change}）` : ''}` : null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              opacity: o,
              transform: `rotateX(${rx}deg)`,
              transformOrigin: 'bottom center',
              background: '#fff',
              borderRadius: 26,
              padding: land ? '26px 34px' : '34px 40px',
              borderLeft: `14px solid ${col}`,
              boxShadow: '0 18px 44px rgba(15,23,42,0.12)',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: land ? 26 : 32, color: col, letterSpacing: '0.08em' }}>{it.good ? 'GOOD' : 'WATCH'}</div>
            <div style={{ fontWeight: 700, fontSize: land ? 40 : 50, color: K.ink, marginTop: 6 }}>{it.t}</div>
            {nums && <div style={{ fontWeight: 700, fontSize: land ? 30 : 36, color: col, marginTop: 6 }}>{nums}</div>}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
