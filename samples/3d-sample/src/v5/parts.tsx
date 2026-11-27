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
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const grow = (f: number, a: number, d: number) => {
  const t = Math.min(1, Math.max(0, (f - a) / Math.max(1, d)));
  return 1 - (1 - t) ** 3;
};
export const pct = (a: number, b: number) => {
  const r = ((b - a) / Math.abs(a)) * 100;
  return `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`;
};
export const oku = (v: number) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v))}億円`;
export const floorLabel = (text: string, x: number, color: string, z = 0.95) => (
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
export const Titles: React.FC<{ tag: string; big?: React.ReactNode; sub?: string; caption?: string; at: number; brief: boolean }> = ({ tag, big, sub, caption, at, brief }) => (
  <>
    <Text2D at={0} size={brief ? 40 : 46} top="9%" left="50%" color={K.sub} weight={700}>{tag}</Text2D>
    {big && <Text2D at={at} size={brief ? 62 : 72} top="15.5%" left="50%">{big}</Text2D>}
    {sub && <Text2D at={at + 8} size={brief ? 40 : 44} top="21.5%" left="50%" color={K.sub} weight={700}>{sub}</Text2D>}
    {caption && <Text2D at={at + 14} size={brief ? 40 : 44} top="88%" left="50%" weight={700} band>{caption}</Text2D>}
  </>
);

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

// ---------- 決算ハイライト（平面のカード版。3D版は parts2.tsx の Kpi3D） ----------
export const yoyText = (prev: number, cur: number) => {
  if (prev > 0 && cur < 0) return { t: '赤字転落', c: K.red };
  if (prev < 0 && cur > 0) return { t: '黒字転換', c: K.green };
  if (prev < 0 && cur < 0) return { t: cur < prev ? '赤字拡大' : '赤字縮小', c: cur < prev ? K.red : K.green };
  const r = ((cur - prev) / Math.abs(prev)) * 100;
  return { t: `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`, c: r >= 0 ? K.green : K.red };
};
export const KpiCards: React.FC<PartProps> = ({ d, dur }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Text2D at={0} size={46} top="9%" left="50%" color={K.sub} weight={700}>決算ハイライト</Text2D>
      <div style={{ position: 'absolute', top: '16%', left: 64, right: 64, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {d.kpis.map((k, i) => {
          const at = 2 + i * 4;
          const o = interpolate(f, [at, at + 6], [0, 1], clamp);
          const y = interpolate(f, [at, at + 12], [40, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
          const g = grow(f, at + 2, Math.min(24, dur * 0.4));
          const yy = yoyText(k.prev, k.cur);
          const mx = Math.max(Math.abs(k.prev), Math.abs(k.cur));
          const hb = (v: number) => (Math.abs(v) / mx) * 330 * g;
          return (
            <div key={k.name} style={{ opacity: o, transform: `translateY(${y}px)`, background: '#fff', borderRadius: 28, padding: '36px 34px', boxShadow: '0 10px 32px rgba(15,23,42,0.08)' }}>
              <div style={{ fontWeight: 700, fontSize: 40, color: K.sub }}>{k.name}</div>
              <div style={{ fontWeight: 900, fontSize: 76, color: k.cur < 0 ? K.red : K.ink, marginTop: 4, whiteSpace: 'nowrap' }}>
                {k.cur < 0 ? '−' : ''}{fmt(Math.abs(k.cur) * g)}<span style={{ fontSize: 36 }}>億円</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 340, marginTop: 18 }}>
                <div style={{ width: 70, height: hb(k.prev), background: k.prev < 0 ? '#f0a3a3' : '#cbd5e1', borderRadius: 8 }} />
                <div style={{ width: 70, height: hb(k.cur), background: k.cur < 0 ? K.red : K.blue, borderRadius: 8 }} />
                <div style={{ marginLeft: 'auto', alignSelf: 'flex-start', fontWeight: 900, fontSize: 40, color: '#fff', background: yy.c, borderRadius: 999, padding: '6px 20px', opacity: interpolate(f, [at + 14, at + 20], [0, 1], clamp) }}>{yy.t}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 30, color: K.sub, marginTop: 10 }}>前年 {k.prev < 0 ? '−' : ''}{fmt(Math.abs(k.prev))}億円</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- 株価：決算の前後の値動き。発表の日に印、そこからの動きを強調 ----------
export const StockPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.stock) return null;
  const main = mode === 'main';
  const { prices, at, days } = d.stock;
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const W = 5.6;
  const X = (i: number) => (i / (prices.length - 1)) * W;
  const Yp = (v: number) => 0.8 + ((v - lo) / (hi - lo)) * 4.2;
  const drawEnd = main ? dur * 0.55 : 30;
  const p = interpolate(f, [2, drawEnd], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const n = Math.max(2, Math.floor(p * (prices.length - 1)) + 1);
  const pts = prices.slice(0, n).map((v, i) => new THREE.Vector3(X(i), Yp(v), 0));
  const geo = React.useMemo(() => (pts.length >= 2 ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), pts.length * 6, 0.07, 10, false) : null), [n]);
  React.useLayoutEffect(() => () => geo?.dispose(), [geo]);
  const before = prices[at - 1];
  const after = prices[prices.length - 1];
  const ch = ((after - before) / before) * 100;
  const up = ch >= 0;
  const col = up ? K.green : K.red;
  const reached = n - 1 >= at;
  const lineCol = n - 1 > at ? col : K.blue;
  return (
    <AbsoluteFill>
      <Scene3D cx={W / 2} cy={2.4} dist={main ? 19 : 18.5}>
        {geo && (
          <mesh geometry={geo} castShadow>
            <meshStandardMaterial color={lineCol} roughness={0.4} />
          </mesh>
        )}
        {/* 決算発表の日 */}
        {reached && (
          <>
            <mesh position={[X(at - 0.5), 2.6, -0.05]}>
              <boxGeometry args={[0.04, 4.6, 0.04]} />
              <meshBasicMaterial color="#94a3b8" />
            </mesh>
            <Label text="決算発表" height={0.3} position={[X(at - 0.5), 0.55, 0.6]} color={K.sub} />
            <mesh position={[X(at - 1), Yp(before), 0]}>
              <sphereGeometry args={[0.16, 20, 20]} />
              <meshStandardMaterial color="#fff" />
            </mesh>
          </>
        )}
        {p >= 1 && (
          <mesh position={[X(prices.length - 1), Yp(after), 0]}>
            <sphereGeometry args={[0.18, 20, 20]} />
            <meshStandardMaterial color={col} />
          </mesh>
        )}
        {floorLabel('発表前', X(Math.floor(at / 2)), K.sub, 1.0)}
        {floorLabel('発表後', X(at + (prices.length - at) / 2), K.ink, 1.0)}
      </Scene3D>
      <Titles
        tag="株価の反応"
        at={Math.round(drawEnd + 2)}
        brief={!main}
        big={<span style={{ color: col }}>{`${up ? '+' : ''}${ch.toFixed(1)}%`}</span>}
        sub={`決算発表の前日から${days}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// 部品の一覧は registry.ts

