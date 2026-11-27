import React from 'react';
import * as THREE from 'three';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { CameraRig, FONT, RenderAfter, fmt } from '../lib';
import { Bar, K, Label, LightStage, Text2D } from '../v2/kit';
import type { ShortData } from './types';

// 部品：どれも「主役版（main）」と「さらっと版（brief）」を持つ。長さ dur に合わせて動く
export type PartProps = { d: ShortData; mode: 'main' | 'brief'; dur: number; caption?: string };

export const PALE = '#dbe3ee';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const grow = (f: number, a: number, d: number) => {
  const t = Math.min(1, Math.max(0, (f - a) / Math.max(1, d)));
  return 1 - (1 - t) ** 3;
};
const pct = (a: number, b: number) => {
  const r = ((b - a) / Math.abs(a)) * 100;
  return `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`;
};
const oku = (v: number) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v))}億円`;
const floorLabel = (text: string, x: number, color: string, z = 0.95) => (
  <Label text={text} height={0.28} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} color={color} />
);

export const Scene3D: React.FC<{ children: React.ReactNode; cx: number; cy: number; dist: number; pos?: [number, number, number] }> = ({ children, cx, cy, dist, pos }) => {
  const { width, height } = useVideoConfig();
  const p = pos ?? ([cx + dist * 0.18, cy + dist * 0.22, dist] as [number, number, number]);
  return (
    <ThreeCanvas width={width} height={height} shadows="soft" flat camera={{ fov: 40, position: p }}>
      <LightStage center={[cx, 0, 0]} shadowSize={9} />
      <CameraRig pos={p} look={[cx, cy, 0]} fov={40} />
      {children}
      <RenderAfter />
    </ThreeCanvas>
  );
};

// 画面上の文字の置き場所（縦）：部品の名前・大きい一言・小さい補足・下の字幕
const Titles: React.FC<{ tag: string; big?: React.ReactNode; sub?: string; caption?: string; at: number; brief: boolean }> = ({ tag, big, sub, caption, at, brief }) => (
  <>
    <Text2D at={0} size={brief ? 40 : 46} top="9%" left="50%" color={K.sub} weight={700}>{tag}</Text2D>
    {big && <Text2D at={at} size={brief ? 62 : 72} top="15.5%" left="50%">{big}</Text2D>}
    {sub && <Text2D at={at + 8} size={brief ? 40 : 44} top="21.5%" left="50%" color={K.sub} weight={700}>{sub}</Text2D>}
    {caption && <Text2D at={at + 14} size={brief ? 40 : 44} top="88%" left="50%" weight={700} band>{caption}</Text2D>}
  </>
);

// ---------- 業績の推移 ----------
export const TrendPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const all = d.trend;
  const ys = mode === 'main' ? all : all.slice(-2);
  const max = Math.max(...ys.map((y) => y.v));
  const S = 5 / max;
  const G = mode === 'main' ? 1.35 : 1.9;
  // 主役：1年ずつ、だんだん速く。さらっと：2本を一度に
  const n = ys.length;
  const span = mode === 'main' ? dur * 0.45 : dur * 0.25;
  const st = ys.map((_, i) => (mode === 'main' ? span * (1 - ((n - i) / n) ** 0.6) : i * 4) + 4);
  const du = ys.map((_, i) => (mode === 'main' ? Math.max(12, 26 - i * 3) + (i === n - 1 ? 8 : 0) : 16));
  const prev = all[all.length - 2].v;
  const cur = all[all.length - 1].v;
  const textAt = Math.round(st[n - 1] + du[n - 1]);
  const up = cur >= prev;
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={2.4} dist={mode === 'main' ? 17 : 16}>
        {ys.map((y, i) => {
          const g = grow(f, st[i], du[i]);
          const last = i === n - 1;
          const h = y.v * S * g;
          return (
            <React.Fragment key={y.l}>
              <Bar x={i * G} h={h} w={mode === 'main' ? 0.95 : 1.2} d={mode === 'main' ? 0.95 : 1.2} color={last ? (up ? K.green : K.red) : PALE} />
              {f >= st[i] + 3 && <Label text={fmt(y.v * g)} height={0.3} position={[i * G, h + 0.4, 0]} color={last ? (up ? K.green : K.red) : K.sub} />}
              {f >= st[i] && floorLabel(y.l, i * G, last ? K.ink : K.sub)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag={`${d.metric}の推移`}
        at={textAt}
        brief={mode === 'brief'}
        big={<span style={{ color: up ? K.green : K.red }}>{pct(prev, cur)}</span>}
        sub={`${oku(prev)} → ${oku(cur)}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 事業ごと：売上の割合（立体の円グラフ）。注目の事業だけ持ち上がって前に出る ----------
const Slice: React.FC<{ a0: number; len: number; h: number; color: string; out: number }> = ({ a0, len, h, color, out }) => {
  const geo = React.useMemo(() => {
    if (len <= 0.002) return null;
    const R = 2.5, r = 1.35;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, R, a0, a0 + len, false);
    sh.absarc(0, 0, r, a0 + len, a0, true);
    return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 48 });
  }, [a0, len, h]);
  React.useLayoutEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return null;
  const mid = a0 + len / 2;
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[Math.cos(mid) * out, 0, -Math.sin(mid) * out]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.45} />
    </mesh>
  );
};

export const SegmentsPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const segs = d.segments;
  const total = segs.reduce((a, s) => a + s.rev, 0);
  const yoy = (s: { rev: number; prevRev: number }) => (s.rev - s.prevRev) / s.prevRev;
  // 注目：前年からの増減がいちばん大きい事業
  const top = segs.reduce((a, s) => (Math.abs(s.rev - s.prevRev) > Math.abs(a.rev - a.prevRev) ? s : a), segs[0]);
  const main = mode === 'main';
  const sweep = interpolate(f, [4, main ? dur * 0.35 : 22], [0, Math.PI * 2], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const popAt = main ? dur * 0.42 : 26;
  const pop = interpolate(f, [popAt, popAt + 16], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });
  const colors = [K.blue, '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];
  const up = top.rev >= top.prevRev;
  let acc = Math.PI / 2; // 12時の位置から時計回り
  const slices = segs.map((s, i) => {
    const len = (s.rev / total) * Math.PI * 2;
    const a0 = acc - len;
    acc = a0;
    return { s, i, a0, len };
  });
  let swept = 0;
  return (
    <AbsoluteFill>
      <Scene3D cx={0} cy={-0.9} dist={21} pos={[0, 14, 16.5]}>
        {slices.map(({ s, i, a0, len }) => {
          const vis = Math.max(0, Math.min(len, sweep - swept));
          swept += len;
          const isTop = s === top;
          const col = isTop ? (up ? K.green : K.red) : colors[Math.min(i, colors.length - 1)];
          const h = 0.45 + (isTop ? 0.55 * pop : 0);
          const out = isTop ? 0.35 * pop : 0;
          const mid = a0 + len / 2;
          const lr = 3.25 + out;
          const show = vis >= len - 0.01;
          return (
            <React.Fragment key={s.name}>
              {/* 時計回りに描くので、始まりは a0+len 側 */}
              <Slice a0={a0 + len - vis} len={vis} h={h} color={col} out={out} />
            </React.Fragment>
          );
        })}
        {sweep >= Math.PI * 2 - 0.01 && <Label text={`売上 ${fmt(total)}億円`} height={0.3} position={[0, 0.5, 0]} rotation={[-0.75, 0, 0]} color={K.ink} />}
      </Scene3D>
      <Titles
        tag="事業ごとの売上"
        at={Math.round(popAt + 6)}
        brief={!main}
        big={
          <>
            <span style={{ color: up ? K.green : K.red }}>{top.name}</span>が {pct(top.prevRev, top.rev)}
          </>
        }
        sub={`売上の約${Math.round((top.rev / total) * 10)}割を占める事業`}
        caption={caption}
      />
      {/* 事業名と割合は下に一覧で（縦の画面は横が狭いので） */}
      <div style={{ position: 'absolute', top: '64%', left: 150, right: 150, fontFamily: FONT }}>
        {slices.map(({ s, i }) => {
          const at = (main ? dur * 0.35 : 22) + i * 4;
          const o = interpolate(f, [at, at + 8], [0, 1], clamp);
          const isTop = s === top;
          const col = isTop ? (up ? K.green : K.red) : colors[Math.min(i, colors.length - 1)];
          const g = yoy(s);
          return (
            <div key={s.name} style={{ opacity: o, display: 'flex', alignItems: 'center', gap: 20, padding: '10px 0', borderBottom: '2px solid #e2e8f0', fontWeight: 700, fontSize: isTop ? 42 : 36, color: isTop ? K.ink : K.sub }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: col }} />
              <div style={{ flex: 1 }}>{s.name}</div>
              <div style={{ width: 120, textAlign: 'right' }}>{Math.round((s.rev / total) * 100)}%</div>
              <div style={{ width: 170, textAlign: 'right', color: isTop ? col : K.sub }}>{`${g >= 0 ? '+' : ''}${(g * 100).toFixed(1)}%`}</div>
            </div>
          );
        })}
        <div style={{ opacity: interpolate(f, [(main ? dur * 0.35 : 22), (main ? dur * 0.35 : 22) + 8], [0, 1], clamp), textAlign: 'right', fontSize: 24, color: K.sub, fontWeight: 700, marginTop: 6 }}>割合・前年比（売上）</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 売上→利益の構造：売上の棒から原価・販管費の分が抜け出し、営業利益が残る ----------
export const PLPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.pl) return null;
  const { sales, cost, sga } = d.pl;
  const gross = sales - cost;
  const op = gross - sga;
  const lo = Math.min(0, op);
  const S = 5 / (sales - lo);
  const Z = lo < 0 ? -lo * S + 0.8 : 0;
  const Y = (v: number) => Z + v * S;
  const G = 1.3;
  const main = mode === 'main';
  const k = main ? dur / 200 : 0.42; // 主役はゆっくり、さらっとは速く
  const T = { s: 2, c: 18 * k + 4, cE: 60 * k + 4, g: 64 * k + 4, sg: 90 * k + 4, sgE: 125 * k + 4, o: 130 * k + 4 };
  const slide = (a: number, b: number, x0: number, x1: number) => {
    const t = interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    return { x: x0 + (x1 - x0) * t, dy: Math.sin(t * Math.PI) * 0.5, t };
  };
  const sH = sales * S * grow(f, T.s, 14);
  const c = slide(T.c, T.cE, 0, G);
  const gH = gross * S * grow(f, T.g, 12);
  const s2 = slide(T.sg, T.sgE, 2 * G, 3 * G);
  const og = grow(f, T.o, 14);
  const oSpan = { y0: Math.min(Y(0), Y(op * og)), h: Math.abs(op * og) * S };
  const opCol = op >= 0 ? K.green : K.red;
  const name = (t: string, x: number, col: string) => floorLabel(t, x, col, 0.95);
  const val = (t: string, x: number, y: number, col: string) => <Label text={t} height={0.3} position={[x, y + 0.4, 0]} color={col} />;
  return (
    <AbsoluteFill>
      <Scene3D cx={2 * G} cy={2.6 + Z * 0.6} dist={16 + Z}>
        {lo < 0 && (
          <mesh position={[2 * G, Z, 0]}>
            <boxGeometry args={[4 * G + 2, 0.03, 1.6]} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
          </mesh>
        )}
        <Bar x={0} y0={Z} h={sH} w={1.0} d={1.0} color={K.blue} />
        {f >= T.s + 4 && val(fmt(sales), 0, Y(sales), K.blue)}
        {name('売上高', 0, K.blue)}
        {f >= T.c && <Bar x={c.x} y0={Y(gross) + c.dy} h={cost * S} w={0.98} d={0.98} color={K.red} />}
        {c.t >= 1 && val(`−${fmt(cost)}`, G, Y(sales), K.red)}
        {c.t >= 1 && name('原価', G, K.red)}
        <Bar x={2 * G} y0={Z} h={gH} w={1.0} d={1.0} color={K.teal} />
        {f >= T.g + 4 && val(fmt(gross), 2 * G, Y(gross), K.teal)}
        {f >= T.g && name('粗利', 2 * G, K.teal)}
        {f >= T.sg && <Bar x={s2.x} y0={Math.min(Y(op), Y(gross)) + s2.dy} h={sga * S} w={0.98} d={0.98} color={K.red} />}
        {s2.t >= 1 && val(`−${fmt(sga)}`, 3 * G, Y(gross), K.red)}
        {s2.t >= 1 && name('販管費', 3 * G, K.red)}
        <Bar x={4 * G} y0={oSpan.y0} h={oSpan.h} w={1.0} d={1.0} color={opCol} />
        {f >= T.o + 6 && <Label text={`${op < 0 ? '−' : ''}${fmt(Math.abs(op))}`} height={0.36} position={[4 * G, op >= 0 ? Y(op) + 0.42 : Y(op) - 0.42, 0.6]} color={opCol} />}
        {f >= T.o && name('営業利益', 4 * G, opCol)}
      </Scene3D>
      <Titles
        tag="売上から利益へ"
        at={Math.round(T.o + 10)}
        brief={!main}
        big={
          op >= 0 ? (
            <>
              営業利益率 <span style={{ color: K.green }}>{((op / sales) * 100).toFixed(1)}%</span>
            </>
          ) : (
            <span style={{ color: K.red }}>費用が売上を上回った</span>
          )
        }
        sub={`売上 ${oku(sales)} → 営業利益 ${oku(op)}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 来期の会社予想 ----------
export const ForecastPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.forecast) return null;
  const { cur, next } = d.forecast;
  const S = 5 / Math.max(Math.abs(cur), Math.abs(next));
  const G = 1.8;
  const main = mode === 'main';
  const a = main ? dur * 0.25 : 10;
  const fh = next * S * grow(f, a, main ? 30 : 16);
  const up = next >= cur;
  return (
    <AbsoluteFill>
      <Scene3D cx={G / 2} cy={2.8} dist={15}>
        <Bar x={0} h={cur * S * grow(f, 0, 14)} w={1.1} d={1.1} color={cur >= 0 ? K.green : K.red} />
        {f >= 6 && <Label text={fmt(cur)} height={0.32} position={[0, Math.max(0, cur) * S + 0.42, 0]} color={K.ink} />}
        {floorLabel('今期の実績', 0, K.ink, 1.0)}
        <Bar x={G} h={fh} w={1.1} d={1.1} color={up ? K.green : K.red} opacity={0.4} />
        {f >= a + 6 && <Label text={fmt(next * grow(f, a, main ? 30 : 16))} height={0.32} position={[G, fh + 0.42, 0]} color={up ? K.green : K.red} />}
        {floorLabel('来期の予想', G, K.sub, 1.0)}
      </Scene3D>
      <Titles
        tag="この先は？"
        at={Math.round(a + (main ? 30 : 14))}
        brief={!main}
        big={
          <>
            来期は<span style={{ color: up ? K.green : K.red }}>{up ? '増益' : '減益'}</span>の予想
          </>
        }
        sub={`${oku(cur)} → ${oku(next)}（${pct(cur, next)}）`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 赤字転落（0の線から下へ沈む） ----------
export const LossPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const ys = mode === 'main' ? d.trend : d.trend.slice(-2);
  const n = ys.length;
  const maxAbs = Math.max(...ys.map((y) => Math.abs(y.v)));
  const S = 2.6 / maxAbs;
  const Z = 3.0; // 0の線の高さ
  const G = mode === 'main' ? 1.35 : 1.9;
  const main = mode === 'main';
  const st = ys.map((_, i) => (main ? 4 + i * (dur * 0.3) / n : 4 + i * 5));
  const lastAt = main ? dur * 0.42 : st[n - 1];
  const sink = main ? 40 : 18;
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={3.2} dist={main ? 17 : 14}>
        {/* 0の線（うすい板） */}
        <mesh position={[((n - 1) * G) / 2, Z, 0]} receiveShadow>
          <boxGeometry args={[(n - 1) * G + 2.4, 0.03, 1.6]} />
          <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
        </mesh>
        <Label text="0" height={0.3} position={[-1.3, Z + 0.05, 0]} color={K.sub} />
        {ys.map((y, i) => {
          const last = i === n - 1;
          const a = last ? lastAt : st[i];
          const g = last ? interpolate(f, [a, a + sink], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : grow(f, a, 18);
          const v = y.v * g;
          const h = Math.abs(v) * S;
          const neg = v < 0;
          return (
            <React.Fragment key={y.l}>
              <Bar x={i * G} y0={neg ? Z - h : Z} h={h} w={0.95} d={0.95} color={neg ? K.red : last ? K.gray : PALE} />
              {f >= a + 3 && <Label text={`${v < 0 ? '−' : ''}${fmt(Math.abs(v))}`} height={0.3} position={[i * G, neg ? Z - h - 0.4 : Z + h + 0.4, 0.6]} color={neg ? K.red : K.sub} />}
              {floorLabel(y.l, i * G, last ? K.ink : K.sub)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag={`${d.metric}の推移`}
        at={Math.round(lastAt + sink)}
        brief={!main}
        big={<span style={{ color: K.red }}>{d.metric.replace('利益', '')}赤字に転落</span>}
        sub={`${oku(ys[n - 2].v)} → ${oku(ys[n - 1].v)}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 数字以外（配当・自社株買い・M&A など） ----------
export const TopicPart: React.FC<PartProps> = ({ d, mode, caption }) => {
  const f = useCurrentFrame();
  const items = mode === 'main' ? d.topics : d.topics.slice(0, 1);
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Text2D at={0} size={mode === 'main' ? 46 : 40} top="9%" left="50%" color={K.sub} weight={700}>数字のほかに</Text2D>
      {items.map((t, i) => {
        const at = 6 + i * 12;
        const o = interpolate(f, [at, at + 8], [0, 1], clamp);
        const y = interpolate(f, [at, at + 14], [60, 0], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
        return (
          <div key={t.title} style={{ position: 'absolute', top: `${34 + i * 15}%`, left: 100, right: 100, opacity: o, transform: `translateY(${y}px)`, background: '#fff', borderRadius: 28, padding: '40px 44px', boxShadow: '0 16px 48px rgba(15,23,42,0.10)', display: 'flex', gap: 34, alignItems: 'center' }}>
            <div style={{ fontSize: 96, lineHeight: 1 }}>{t.icon}</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 60, color: K.ink }}>{t.title}</div>
              {t.sub && <div style={{ fontWeight: 700, fontSize: 40, color: K.sub, marginTop: 8 }}>{t.sub}</div>}
            </div>
          </div>
        );
      })}
      {caption && <Text2D at={20} size={40} top="88%" left="50%" weight={700} band>{caption}</Text2D>}
    </AbsoluteFill>
  );
};

export const PARTS = {
  trend: TrendPart,
  segments: SegmentsPart,
  pl: PLPart,
  forecast: ForecastPart,
  loss: LossPart,
  topic: TopicPart,
} as const;
