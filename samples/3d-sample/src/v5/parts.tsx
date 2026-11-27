import React from 'react';
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

export const Scene3D: React.FC<{ children: React.ReactNode; cx: number; cy: number; dist: number }> = ({ children, cx, cy, dist }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} shadows="soft" flat camera={{ fov: 40, position: [cx, cy, dist] }}>
      <LightStage center={[cx, 0, 0]} shadowSize={9} />
      <CameraRig pos={[cx + dist * 0.18, cy + dist * 0.22, dist]} look={[cx, cy, 0]} fov={40} />
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

// ---------- 事業ごとの増減（前年 → 事業ごとの増減 → 今年）。0を割るときは0の線を持ち上げる ----------
export const SegmentsPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const prev = d.trend[d.trend.length - 2].v;
  const cur = d.trend[d.trend.length - 1].v;
  const segs = d.segments;
  const top = segs.reduce((a, s) => (Math.abs(s.delta) > Math.abs(a.delta) ? s : a), segs[0]);
  const cums = segs.map((_, i) => prev + segs.slice(0, i + 1).reduce((a, s) => a + s.delta, 0));
  const hi = Math.max(0, prev, cur, ...cums);
  const lo = Math.min(0, prev, cur, ...cums);
  const S = 5 / (hi - lo);
  const Z = -lo * S + (lo < 0 ? 1.0 : 0);
  const Y = (v: number) => Z + v * S;
  const span = (a: number, b: number) => ({ y0: Math.min(Y(a), Y(b)), h: Math.abs(Y(b) - Y(a)) });
  const G = 1.35;
  const n = segs.length;
  const main = mode === 'main';
  const st = segs.map((_, i) => (main ? dur * 0.12 + i * dur * (0.32 / n) : 6 + i * 6));
  const endAt = main ? dur * 0.5 : 6 + n * 6 + 4;
  const textAt = main ? Math.round(st[0] + 16) : Math.round(endAt);
  const share = Math.round((Math.abs(top.delta) / Math.max(1, Math.abs(cur - prev))) * 10);
  const col = (v: number) => (v >= 0 ? K.green : K.red);
  const valTxt = (v: number) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
  const pb = span(0, prev * grow(f, 0, 14));
  const cb = span(0, cur * grow(f, endAt, 18));
  return (
    <AbsoluteFill>
      <Scene3D cx={((n + 1) * G) / 2} cy={2.8} dist={17}>
        {lo < 0 && (
          <>
            <mesh position={[((n + 1) * G) / 2, Z, 0]}>
              <boxGeometry args={[(n + 1) * G + 2.2, 0.03, 1.6]} />
              <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
            </mesh>
            <Label text="0" height={0.3} position={[-1.2, Z + 0.05, 0]} color={K.sub} />
          </>
        )}
        <Bar x={0} y0={pb.y0} h={pb.h} w={0.95} d={0.95} color={K.gray} />
        {f >= 6 && <Label text={valTxt(prev)} height={0.3} position={[0, (prev >= 0 ? Y(prev) + 0.4 : Y(prev) - 0.4), 0.6]} color={K.sub} />}
        {floorLabel('前年', 0, K.sub)}
        {segs.map((s, i) => {
          const from = i === 0 ? prev : cums[i - 1];
          const to = cums[i];
          const x = (i + 1) * G;
          const isTop = s === top;
          const neg = s.delta < 0;
          const c = neg ? (isTop ? K.red : '#f0a3a3') : isTop ? K.green : '#9ad9ae';
          const t = f - st[i];
          const p = Math.min(1, Math.max(0, t / 12));
          const sp = span(from, to);
          return (
            <React.Fragment key={s.name}>
              {t >= 0 && <Bar x={x} y0={sp.y0 + (1 - p * p) * 4} h={sp.h} w={0.95} d={0.95} color={c} />}
              {p >= 1 && (
                <Label text={`${neg ? '−' : '+'}${fmt(Math.abs(s.delta))}`} height={isTop ? 0.4 : 0.3} position={[x, neg ? sp.y0 - 0.4 : sp.y0 + sp.h + 0.45, 0.6]} color={isTop ? c : K.sub} />
              )}
              {floorLabel(s.name, x, isTop ? c : K.sub)}
            </React.Fragment>
          );
        })}
        <Bar x={(n + 1) * G} y0={cb.y0} h={cb.h} w={0.95} d={0.95} color={col(cur)} />
        {f >= endAt + 8 && <Label text={valTxt(cur)} height={0.34} position={[(n + 1) * G, cur >= 0 ? Y(cur) + 0.42 : Y(cur) - 0.42, 0.6]} color={col(cur)} />}
        {floorLabel('今年', (n + 1) * G, K.ink)}
      </Scene3D>
      <Titles
        tag={cur >= prev ? 'なぜ増えた？' : 'なぜ減った？'}
        at={textAt}
        brief={!main}
        big={
          <>
            <span style={{ color: top.delta >= 0 ? K.green : K.red }}>{top.name}</span>が {top.delta >= 0 ? '+' : '−'}
            {fmt(Math.abs(top.delta))}億円
          </>
        }
        sub={main ? `増減の約${share}割` : undefined}
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
  forecast: ForecastPart,
  loss: LossPart,
  topic: TopicPart,
} as const;
