import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Bar, K, Label } from '../v2/kit';
import { PALE, Legend, PartProps, Scene3D, Titles, UNIT, clamp, floorLabel, fmt, grow, isRev, oku, pct } from './parts';

// 売上と利益をいっしょに見せる部品（業績の推移・来期の予想・予想の修正）

const ZeroPlate: React.FC<{ cx: number; w: number; z: number }> = ({ cx, w, z }) => (
  <mesh position={[cx, z, 0]}>
    <boxGeometry args={[w, 0.03, 1.6]} />
    <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
  </mesh>
);
const num = (v: number) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
const sgn = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : '±'}${fmt(Math.abs(v))}`;
const UPC = K.green;
const DNC = K.red;
const MIX = '#ea580c';

// ---------- 業績の推移（赤字転落も同じ部品）：売上と営業利益を同じ尺度で。1年ずつ、だんだん速く ----------
export const TrendPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  // 通期の推移でくらべられないとき（実績1年だけ・予想なし）は、決算ハイライトの前年・今年（同じ時期の累計）でくらべる
  const kr = d.kpis.find((k) => k.key === 'revenue') ?? d.kpis[0];
  const ko = d.kpis.find((k) => k.key === 'operating_income') ?? d.kpis[1];
  const pairOk = d.trend.filter((y) => !y.fc).length >= 2 || (d.trend.some((y) => !y.fc) && d.trend.some((y) => y.fc));
  const all = pairOk || !kr || !ko ? d.trend : [{ l: '前年', rev: kr.prev, op: ko.prev }, { l: '今回', rev: kr.cur, op: ko.cur }];
  if (all.length < 2) return null;
  const main = mode === 'main';
  const ys = main ? all : all.slice(-2);
  const n = ys.length;
  const mx = Math.max(...ys.flatMap((y) => [Math.abs(y.rev), Math.abs(y.op)]));
  const H = 4.6;
  const S = H / mx;
  const negMax = Math.max(0, ...ys.map((y) => -y.op));
  const Z = negMax > 0 ? negMax * S + 0.7 : 0;
  const G = main ? 1.45 : 2.2;
  const span = main ? dur * 0.45 : dur * 0.25;
  const st = ys.map((_, i) => (main ? span * (1 - ((n - i) / n) ** 0.6) : i * 4) + 4);
  const du = ys.map((_, i) => (main ? Math.max(12, 26 - i * 3) + (i === n - 1 ? 8 : 0) : 16));
  // くらべる2年：実績が2年以上あれば実績どうし。実績が1年だけなら、その年と今期の会社予想（fc）
  const acts = all.filter((y) => !y.fc);
  const fcs = all.filter((y) => y.fc);
  const byFc = acts.length < 2 && fcs.length > 0;
  const p = byFc ? acts[acts.length - 1] ?? all[0] : acts[acts.length - 2];
  const c = byFc ? fcs[0] : acts[acts.length - 1];
  const opUp = c.op >= p.op;
  const flip = p.op > 0 && c.op < 0 ? '営業赤字に転落' : p.op < 0 && c.op > 0 ? '営業黒字に転換' : null;
  const flipCol = p.op < 0 && c.op > 0 ? UPC : DNC;
  const hasFc = ys.some((y) => y.fc);
  const textAt = Math.round(st[n - 1] + du[n - 1]);
  const bw = main ? 0.55 : 0.75;
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={(Z + H) / 2 + 0.1} dist={(main ? 17 : 16.5) + Z * 0.6}>
        {Z > 0 && <ZeroPlate cx={((n - 1) * G) / 2} w={(n - 1) * G + 2} z={Z} />}
        {ys.map((y, i) => {
          const g = grow(f, st[i], du[i]);
          const go = grow(f, st[i] + 5, du[i]);
          const last = y === c;
          const x = i * G;
          const op = y.fc ? 0.45 : 1; // 会社予想の年はうすく
          const rh = Math.abs(y.rev) * S * g;
          const oh = Math.abs(y.op) * S * go;
          const opCol = last ? (y.op < 0 ? DNC : opUp ? UPC : DNC) : y.op < 0 ? '#f0a3a3' : '#9ad9ae';
          return (
            <React.Fragment key={y.l}>
              <Bar x={x - bw * 0.55} y0={Z} h={rh} w={bw} d={bw} color={last || y.fc ? K.blue : '#a9c1f5'} opacity={op} />
              <Bar x={x + bw * 0.55} y0={y.op < 0 ? Z - oh : Z} h={oh} w={bw} d={bw} color={opCol} opacity={op} />
              {f >= st[i] + 3 && <Label text={num(y.rev * g)} height={0.26} position={[x - bw * 0.55, Z + rh + 0.34, 0]} color={last ? K.blue : K.sub} />}
              {f >= st[i] + 8 && (
                <Label text={num(y.op * go)} height={last ? 0.32 : 0.26} position={[x + bw * 0.55, y.op < 0 ? Z - oh - 0.36 : Z + oh + 0.36, 0.5]} color={last ? opCol : K.sub} />
              )}
              {f >= st[i] && floorLabel(y.fc ? `${y.l}予想` : y.l, x, last ? K.ink : K.sub)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag="業績の推移（売上・営業利益）"
        at={textAt}
        brief={!main}
        big={
          flip ? (
            <span style={{ color: flipCol }}>{byFc ? `${flip}の予想` : flip}</span>
          ) : (
            <>
              {byFc ? '今期の予想 ' : ''}営業利益 <span style={{ color: opUp ? UPC : DNC }}>{pct(p.op, c.op)}</span>
            </>
          )
        }
        sub={`売上 ${oku(p.rev)} → ${oku(c.rev)}（${pct(p.rev, c.rev)}）`}
        caption={caption}
      />
      <Legend>
        <span style={{ color: K.blue }}>■</span> 売上　<span style={{ color: UPC }}>■</span> 営業利益（{UNIT}）{hasFc ? '　うすい＝会社予想' : ''}
      </Legend>
    </AbsoluteFill>
  );
};

// 本業の利益（営業利益。無い会社は事業利益・税引前利益など、売上の次の項目）
const mainProfit = <T extends { key?: string; name: string }>(xs: T[]) =>
  xs.find((it) => it.key === 'operating_income') ?? xs.find((it) => it.name === '営業利益') ?? xs.find((it) => !isRev(it)) ?? xs[xs.length - 1];
const briefItems = <T extends { key?: string; name: string }>(xs: T[]) => {
  const mp = mainProfit(xs);
  return xs.filter((it) => isRev(it) || it === mp);
};

// 売上と利益を枠に分けて並べる配置（枠ごとに同じ尺度）
type Item = { key?: string; name: string; a: number; b: number };
const layout = (items: Item[]) => {
  const rev = items.filter((it) => isRev(it));
  const prof = items.filter((it) => !isRev(it));
  return [
    { title: '売上', items: rev },
    { title: '利益', items: prof },
  ].filter((p) => p.items.length);
};

// ---------- 会社予想：売上・利益ごとに、実績（濃い）と会社の予想（うすい）
// basis='next'（通期の決算）＝今期の実績と来期の予想。basis='this'（四半期の決算）＝前期の実績と今期（通期）の予想 ----------
export const ForecastPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.forecast) return null;
  const main = mode === 'main';
  const items: Item[] = d.forecast.items.map((it) => ({ key: it.key, name: it.name, a: it.cur, b: it.next }));
  const panels = layout(main ? items : briefItems(items));
  const a0 = main ? dur * 0.22 : 10;
  const nx = d.forecast.basis === 'this' ? { tag: '今期の会社予想（通期）', who: '今期は', leg: '濃い＝前期の実績　うすい＝今期の予想' } : { tag: '来期の会社予想', who: '来期は', leg: '濃い＝今期の実績　うすい＝来期の予想' };
  const GP = 1.5; // 項目の間
  const GAP = 1.4; // 枠の間
  let x = 0;
  const placed = panels.map((p) => {
    const mx = Math.max(...p.items.flatMap((it) => [Math.abs(it.a), Math.abs(it.b)]));
    const xs = p.items.map(() => {
      const v = x;
      x += GP;
      return v;
    });
    x += GAP - GP + 0.6;
    return { ...p, mx, xs };
  });
  const width = x - GAP - 0.6 + GP;
  const negMax = Math.max(0, ...placed.flatMap((p) => p.items.map((it) => Math.max(-it.a, -it.b) / p.mx)));
  const H = negMax > 0 ? 3.0 : 4.2;
  const Z = negMax > 0 ? negMax * H + 0.7 : 0;
  const top = Z + H + 1.4;
  const op = mainProfit(items);
  const rv = items.find((it) => isRev(it));
  const up = op.b >= op.a;
  const word = op.a < 0 && op.b > 0 ? '黒字に戻る予想' : op.a > 0 && op.b < 0 ? '赤字になる予想' : up ? '増益の予想' : '減益の予想';
  return (
    <AbsoluteFill>
      <Scene3D cx={(width - GP) / 2} cy={top / 2 + 0.3} dist={13 + top * 0.9}>
        {Z > 0 && <ZeroPlate cx={(width - GP) / 2} w={width + 1.5} z={Z} />}
        {placed.map((p) => (
          <React.Fragment key={p.title}>
            <Label text={`${p.title}（${UNIT}）`} height={0.28} position={[(p.xs[0] + p.xs[p.xs.length - 1]) / 2, Z + H + 1.0, 0]} color={K.sub} />
            {p.items.map((it, j) => {
              const S = H / p.mx;
              const ga = grow(f, 2 + j * 3, 14);
              const gb = grow(f, a0 + j * 4, main ? 26 : 14);
              const ha = Math.abs(it.a) * S * ga;
              const hb = Math.abs(it.b) * S * gb;
              const X = p.xs[j];
              const rv = isRev(it);
              const base = rv ? K.blue : it.a < 0 ? DNC : UPC;
              const nb = rv ? K.blue : it.b < 0 ? DNC : UPC;
              return (
                <React.Fragment key={it.name}>
                  <Bar x={X - 0.33} y0={it.a < 0 ? Z - ha : Z} h={ha} w={0.6} d={0.6} color={base} />
                  <Bar x={X + 0.33} y0={it.b < 0 ? Z - hb : Z} h={hb} w={0.6} d={0.6} color={nb} opacity={0.42} />
                  {ga > 0.9 && <Label text={num(it.a)} height={0.24} position={[X - 0.33, it.a < 0 ? Z - ha - 0.32 : Z + ha + 0.32, 0.4]} color={K.ink} />}
                  {gb > 0.9 && <Label text={num(it.b)} height={0.24} position={[X + 0.33, it.b < 0 ? Z - hb - 0.32 : Z + hb + 0.32, 0.4]} color={nb} />}
                  {floorLabel(it.name.replace('売上高', '売上'), X, K.ink, 0.95)}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        ))}
      </Scene3D>
      <Titles
        tag={nx.tag}
        at={Math.round(a0 + (main ? 30 : 16))}
        brief={!main}
        big={
          <>
            {nx.who}<span style={{ color: up ? UPC : DNC }}>{word}</span>
          </>
        }
        sub={`${op.name} ${oku(op.a)} → ${oku(op.b)}${rv ? `／売上 ${pct(rv.a, rv.b)}` : ''}`}
        caption={caption}
      />
      <Legend>
        {nx.leg}
      </Legend>
    </AbsoluteFill>
  );
};

// ---------- 予想の修正：項目ごとに棒1本。修正前の数字が修正後へ変わり、差の分に色（修正前の高さの線は付けない）。据え置きは灰色の札 ----------
export const revisionWord = (items: { key?: string; name: string; before: number; after: number }[]) => {
  const ch = items.map((it) => ({ ...it, dir: Math.sign(it.after - it.before) }));
  const rev = ch.filter((c) => isRev(c));
  const prof = ch.filter((c) => !isRev(c));
  const dirOf = (xs: typeof ch) => {
    const ds = [...new Set(xs.map((x) => x.dir).filter((v) => v !== 0))];
    return ds.length === 0 ? 0 : ds.length === 1 ? ds[0] : 2; // 2＝ばらばら
  };
  const r = dirOf(rev);
  const p = dirOf(prof);
  const w = (v: number) => (v > 0 ? '上方' : '下方');
  if (r === 0 && p === 0) return { word: '据え置き', color: K.sub };
  if (r === p && r !== 2) return { word: `${w(r)}修正`, color: r > 0 ? UPC : DNC };
  if (r === 0 && p !== 2) return { word: `利益だけ${w(p)}修正`, color: p > 0 ? UPC : DNC };
  if (p === 0 && r !== 2) return { word: `売上だけ${w(r)}修正`, color: r > 0 ? UPC : DNC };
  if (r !== 2 && p !== 2) return { word: `売上は${w(r)}・利益は${w(p)}`, color: MIX };
  return { word: '項目で向きがちがう修正', color: MIX };
};

export const RevisionPart: React.FC<PartProps> = ({ d, mode, dur, caption, ctx }) => {
  const f = useCurrentFrame();
  if (!d.revision) return null;
  const main = mode === 'main';
  const all: Item[] = d.revision.items.map((it) => ({ key: it.key, name: it.name, a: it.before, b: it.after }));
  const panels = layout(main ? all : briefItems(all));
  const a0 = main ? dur * 0.28 : 14;
  const len = main ? 32 : 16;
  const t = interpolate(f, [a0, a0 + len], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const GP = 1.55;
  const GAP = 1.0;
  let x = 0;
  const placed = panels.map((p) => {
    const mx = Math.max(...p.items.flatMap((it) => [Math.abs(it.a), Math.abs(it.b)]));
    const xs = p.items.map(() => {
      const v = x;
      x += GP;
      return v;
    });
    x += GAP;
    return { ...p, mx, xs };
  });
  const width = x - GAP - GP;
  const negMax = Math.max(0, ...placed.flatMap((p) => p.items.map((it) => Math.max(-it.a, -it.b) / p.mx)));
  const H = negMax > 0 ? 3.0 : 4.2;
  const Z = negMax > 0 ? negMax * H + 0.7 : 0;
  const top = Z + H + 1.9;
  const v = revisionWord(d.revision.items);
  return (
    <AbsoluteFill>
      <Scene3D cx={width / 2} cy={top / 2 - 0.2} dist={13.5 + top * 0.9}>
        {Z > 0 && <ZeroPlate cx={width / 2} w={width + 2} z={Z} />}
        {placed.map((p) => (
          <React.Fragment key={p.title}>
            <Label text={`${p.title}（${UNIT}）`} height={0.28} position={[(p.xs[0] + p.xs[p.xs.length - 1]) / 2, Z + H + 1.6, 0]} color={K.sub} />
            {p.items.map((it, j) => {
              const S = H / p.mx;
              const Y = (val: number) => Z + val * S;
              const gb = grow(f, 2 + j * 3, main ? 20 : 12);
              const val = t > 0 ? it.a + (it.b - it.a) * t : it.a * gb;
              const up = it.b > it.a;
              const same = it.b === it.a;
              const col = same ? K.sub : up ? UPC : DNC;
              const X = p.xs[j];
              const sp = (q: number, r: number) => ({ y0: Math.min(Y(q), Y(r)), h: Math.abs(Y(r) - Y(q)) });
              const solid = sp(0, val);
              const diff = up ? sp(it.a, val) : it.a > 0 ? sp(it.a, Math.max(val, 0)) : sp(it.a, val);
              const rv = isRev(it);
              return (
                <React.Fragment key={it.name}>
                  <Bar x={X} y0={solid.y0} h={solid.h} w={0.95} d={0.95} color={val < 0 ? DNC : rv ? K.blue : '#60a5fa'} />
                  {t > 0 && !same && diff.h > 0.01 && <Bar x={X} y0={diff.y0} h={diff.h} w={0.99} d={0.99} color={col} opacity={up || it.a <= 0 ? 1 : 0.3} />}
                  <Label text={num(val)} height={0.28} position={val >= 0 ? [X, Y(val) + 0.36, 0.55] : [X, Y(val) - 0.36, 0.55]} color={t > 0 ? col : K.ink} />
                  {t >= 1 && <Label text={same ? '据え置き' : sgn(it.b - it.a)} height={0.24} position={[X, Y(Math.max(it.a, it.b, 0)) + 0.85, 0]} color="#ffffff" pill={col} weight={900} />}
                  {floorLabel(it.name.replace('売上高', '売上'), X, K.ink, 0.95)}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        ))}
      </Scene3D>
      <Titles
        tag={`会社予想の修正（${d.revision.label}）`}
        at={Math.round(a0 + len)}
        brief={!main}
        big={<span style={{ color: v.color }}>{v.word}</span>}
        sub={ctx === 'video' && d.revision.reason ? d.revision.reason : undefined}
        caption={caption}
      />
    </AbsoluteFill>
  );
};
