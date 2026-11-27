import React from 'react';
import * as THREE from 'three';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { CameraRig, FONT, RenderAfter, fmt as fmtInt } from '../lib';
import { Bar, K, Label, LightStage, Text2D } from '../v2/kit';
import type { ShortData } from './types';

// 部品：どれも「主役版（main）」と「さらっと版（brief）」を持つ。長さ dur に合わせて動く
// ctx：'short'＝超ショート（縦20秒）、'video'＝分析動画（横）。株価の期間などが変わる
export type PartProps = { d: ShortData; mode: 'main' | 'brief'; dur: number; caption?: string; ctx?: 'short' | 'video' };

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
// 金額：10未満は小数1けた（0.77億円が「1」にならないように）
export const fmt = (n: number) => (Math.abs(n) < 10 && Math.round(n) !== n ? (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '') : fmtInt(n));
// 金額の単位（億円・億ドル）。Short が材料を受け取ったときに決める
export let UNIT = '億円';
export const setUnit = (u?: string) => {
  UNIT = u || '億円';
};
export const oku = (v: number) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v))}${UNIT}`;
export { isRev, shortName } from './names';
import { isRev } from './names';
export const floorLabel = (text: string, x: number, color: string, z = 0.95) => (
  <Label text={text} height={0.28} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} color={color} />
);

// 横（分析動画 1920×1080）か縦（超ショート 1080×1920）か。横は左に文字の列、右に3Dを置く
export const SPLIT = 0.36; // 横のとき、文字の列の幅（画面の割合）
export const useLand = () => {
  const { width, height } = useVideoConfig();
  return width > height;
};

// 横のときのカメラ：画面いっぱいに描き、写る範囲を右へずらす（左の文字の列を空ける。境目が出ない）
const LandRig: React.FC<{ pos: [number, number, number]; look: [number, number, number]; shift: number; w: number; h: number }> = ({ pos, look, shift, w, h }) => {
  const { camera } = useThree();
  React.useLayoutEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.position.set(...pos);
    c.fov = 40;
    c.setViewOffset(w, h, -shift, 0, w, h);
    c.updateProjectionMatrix();
    c.lookAt(...look);
  });
  return null;
};

export const Scene3D: React.FC<{ children: React.ReactNode; cx: number; cy: number; dist: number; pos?: [number, number, number] }> = ({ children, cx, cy, dist, pos }) => {
  const { width, height } = useVideoConfig();
  const land = width > height;
  // 縦に合わせた距離なので、横（同じ高さで横に広い）では寄せる
  const dd = land ? dist * 0.66 : dist;
  const p = pos ? (land ? ([cx + (pos[0] - cx) * 0.66, cy + (pos[1] - cy) * 0.66, pos[2] * 0.66] as [number, number, number]) : pos) : ([cx + dd * 0.18, cy + dd * 0.22, dd] as [number, number, number]);
  return (
    <ThreeCanvas width={width} height={height} shadows="soft" flat camera={{ fov: 40, position: p }}>
      <LightStage center={[cx, 0, 0]} shadowSize={9} />
      {land ? <LandRig pos={p} look={[cx, cy, 0]} shift={Math.round(width * (SPLIT / 2))} w={width} h={height} /> : <CameraRig pos={p} look={[cx, cy, 0]} fov={40} />}
      {children}
      <RenderAfter />
    </ThreeCanvas>
  );
};

// 横のときの文字（左の列。折り返す）
const LandText: React.FC<{ at: number; size: number; color?: string; weight?: number; children: React.ReactNode; band?: boolean }> = ({ at, size, color = K.ink, weight = 900, children, band }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const o = interpolate(f, [at, at + 8], [0, 1], clamp);
  const y = interpolate(f, [at, at + 12], [20, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ opacity: o, transform: `translateY(${y}px)`, fontFamily: FONT, fontWeight: weight, fontSize: size, color, lineHeight: 1.3, ...(band ? { background: 'rgba(255,255,255,0.9)', padding: '14px 22px', borderRadius: 14, boxShadow: '0 6px 24px rgba(15,23,42,0.08)' } : {}) }}>
      {children}
    </div>
  );
};

// 画面上の文字の置き場所：部品の名前・大きい一言・小さい補足・字幕
// 縦：上から順に中央ぞろえ。横：左の列に見出し（青い線）→ 大きい一言 → 補足、字幕は左下
export const Titles: React.FC<{ tag: string; big?: React.ReactNode; sub?: string; caption?: string; at: number; brief: boolean; children?: React.ReactNode }> = ({ tag, big, sub, caption, at, brief, children }) => {
  const land = useLand();
  const { width } = useVideoConfig();
  if (land) {
    const colW = Math.round(width * SPLIT) - 110;
    return (
      <>
        <div style={{ position: 'absolute', top: 48, left: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 8, height: 46, background: K.blue, borderRadius: 2 }} />
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, color: K.ink, whiteSpace: 'nowrap' }}>{tag}</div>
        </div>
        <div style={{ position: 'absolute', top: 190, left: 64, width: colW, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {big && <LandText at={at} size={54}>{big}</LandText>}
          {sub && <LandText at={at + 8} size={34} color={K.sub} weight={700}>{sub}</LandText>}
          {children}
        </div>
        {caption && (
          <div style={{ position: 'absolute', bottom: 110, left: 64, width: colW }}>
            <LandText at={at + 14} size={36} weight={700} band>{caption}</LandText>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <Text2D at={0} size={brief ? 40 : 46} top="9%" left="50%" color={K.sub} weight={700}>{tag}</Text2D>
      {big && <Text2D at={at} size={brief ? 62 : 72} top="15.5%" left="50%">{big}</Text2D>}
      {sub && sub.length <= 24 && <Text2D at={at + 8} size={brief ? 40 : 44} top="21.5%" left="50%" color={K.sub} weight={700}>{sub}</Text2D>}
      {/* 長い補足（修正の理由など）は折り返す */}
      {sub && sub.length > 24 && (
        <div style={{ position: 'absolute', top: '20%', left: 90, right: 90, textAlign: 'center' }}>
          <LandText at={at + 8} size={34} color={K.sub} weight={700}>{sub}</LandText>
        </div>
      )}
      {children}
      {caption && <Text2D at={at + 14} size={brief ? 40 : 44} top="88%" left="50%" weight={700} band>{caption}</Text2D>}
    </>
  );
};

// 凡例（■前年 ■今年 など）。縦は下、横は3Dの下
export const Legend: React.FC<{ children: React.ReactNode; top?: string }> = ({ children, top }) => {
  const land = useLand();
  return (
    <Text2D at={4} size={land ? 26 : 30} top={land ? '86%' : top ?? '83.5%'} left={land ? '64px' : '50%'} align={land ? 'left' : 'center'} color={K.sub} weight={700} rise={false}>
      {children}
    </Text2D>
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
  const land = useLand();
  const segs = d.segments;
  const total = segs.reduce((a, s) => a + s.rev, 0);
  const yoy = (s: { rev: number; prevRev: number }) => (s.rev - s.prevRev) / s.prevRev;
  // 注目：前年からの増減がいちばん大きい事業
  // 「その他」「調整額」は注目にしない
  const named = segs.filter((s) => !/その他|調整|消去|全社/.test(s.name));
  const pool = named.length ? named : segs;
  const top = pool.reduce((a, s) => (Math.abs(s.rev - s.prevRev) > Math.abs(a.rev - a.prevRev) ? s : a), pool[0]);
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
        {sweep >= Math.PI * 2 - 0.01 && <Label text={`売上 ${fmt(total)}${UNIT}`} height={0.3} position={[0, 0.5, 0]} rotation={[-0.75, 0, 0]} color={K.ink} />}
      </Scene3D>
      <Titles
        tag={`${d.segLabel ?? '事業'}ごとの売上`}
        at={Math.round(popAt + 6)}
        brief={!main}
        big={
          <>
            <span style={{ color: up ? K.green : K.red }}>{top.name}</span>が {pct(top.prevRev, top.rev)}
          </>
        }
        sub={`売上の約${Math.round((top.rev / total) * 10)}割を占める${d.segLabel ?? '事業'}`}
        caption={caption}
      />
      {/* 事業名と割合は一覧で（縦は下、横は左の列の下） */}
      <div style={land ? { position: 'absolute', top: 520, left: 64, width: Math.round(1920 * 0.36) - 110, fontFamily: FONT } : { position: 'absolute', top: '64%', left: 150, right: 150, fontFamily: FONT }}>
        {slices.slice(0, land ? 7 : 6).map(({ s, i }) => {
          const at = (main ? dur * 0.35 : 22) + i * 4;
          const o = interpolate(f, [at, at + 8], [0, 1], clamp);
          const isTop = s === top;
          const col = isTop ? (up ? K.green : K.red) : colors[Math.min(i, colors.length - 1)];
          const g = yoy(s);
          return (
            <div key={s.name} style={{ opacity: o, display: 'flex', alignItems: 'center', gap: land ? 14 : 20, padding: land ? '6px 0' : '10px 0', borderBottom: '2px solid #e2e8f0', fontWeight: 700, fontSize: land ? (isTop ? 30 : 26) : isTop ? 42 : 36, color: isTop ? K.ink : K.sub }}>
              <div style={{ width: land ? 20 : 26, height: land ? 20 : 26, borderRadius: 6, background: col, flexShrink: 0 }} />
              <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
              <div style={{ width: land ? 80 : 120, textAlign: 'right' }}>{Math.round((s.rev / total) * 100)}%</div>
              <div style={{ width: land ? 120 : 170, textAlign: 'right', color: isTop ? col : K.sub }}>{`${g >= 0 ? '+' : ''}${(g * 100).toFixed(1)}%`}</div>
            </div>
          );
        })}
        <div style={{ opacity: interpolate(f, [(main ? dur * 0.35 : 22), (main ? dur * 0.35 : 22) + 8], [0, 1], clamp), textAlign: 'right', fontSize: 24, color: K.sub, fontWeight: 700, marginTop: 6 }}>割合・前年比（売上）</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 売上→利益の構造：売上の棒から、原価・販管費・その他の費用が抜け、その他の収益が足され、営業利益が残る ----------
// plSteps（分析データの段。その他の収益・費用を含む）があればそれで、無ければ 売上・原価・販管費 から組む
const PL_NAME: Record<string, string> = { 売上原価: '原価', 売上総利益: '粗利', その他の費用: '他費用', その他の収益: '他収益' };
type PLStep = { key: string; label: string; v: number; kind: 'total' | 'minus' | 'plus' | 'subtotal' | 'result' };
export const plStepsOf = (d: ShortData): PLStep[] => {
  if (d.plSteps && d.plSteps.length >= 2) return d.plSteps;
  if (!d.pl) return [];
  const { sales, cost, sga } = d.pl;
  return [
    { key: 'revenue', label: '売上', v: sales, kind: 'total' },
    { key: 'cost_of_sales', label: '原価', v: cost, kind: 'minus' },
    { key: 'gross_profit', label: '粗利', v: sales - cost, kind: 'subtotal' },
    { key: 'sga', label: '販管費', v: sga, kind: 'minus' },
    { key: 'operating_income', label: '営業利益', v: sales - cost - sga, kind: 'result' },
  ];
};
export const PLPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const steps = plStepsOf(d);
  if (steps.length < 2) return null;
  const main = mode === 'main';
  // 段ごとに、その前後の高さ（running）を出す
  let run = 0;
  const cols = steps.map((st) => {
    const from = run;
    if (st.kind === 'total' || st.kind === 'subtotal' || st.kind === 'result') run = st.v;
    else if (st.kind === 'minus') run = run - Math.abs(st.v);
    else run = run + Math.abs(st.v);
    return { ...st, from, to: run };
  });
  const all = cols.flatMap((c) => [c.from, c.to, c.kind === 'total' || c.kind === 'subtotal' || c.kind === 'result' ? c.v : 0]);
  const lo = Math.min(0, ...all);
  const hi = Math.max(...all);
  const S = 5 / (hi - lo || 1);
  const Z = lo < 0 ? -lo * S + 0.8 : 0;
  const Y = (v: number) => Z + v * S;
  const n = cols.length;
  const G = 1.3;
  const per = main ? Math.max(14, (dur * 0.62) / n) : Math.max(5, (dur * 0.5) / n);
  const last = cols[n - 1];
  const sales = cols[0].v;
  const op = last.kind === 'result' ? last.v : last.to;
  const opCol = op >= 0 ? K.green : K.red;
  const doneAt = 2 + n * per;
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={2.6 + Z * 0.6} dist={Math.max(16, 7 + n * 2.1) + Z}>
        {lo < 0 && (
          <mesh position={[((n - 1) * G) / 2, Z, 0]}>
            <boxGeometry args={[(n - 1) * G + 2, 0.03, 1.6]} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
          </mesh>
        )}
        {cols.map((c, i) => {
          const at = 2 + i * per;
          const x = i * G;
          const name = PL_NAME[c.label] ?? c.label;
          if (f < at) return <React.Fragment key={c.key + i}>{floorLabel(name, x, '#cbd5e1', 0.95)}</React.Fragment>;
          const isBar = c.kind === 'total' || c.kind === 'subtotal' || c.kind === 'result';
          const col = c.kind === 'total' ? K.blue : c.kind === 'subtotal' ? K.teal : c.kind === 'result' ? opCol : c.kind === 'minus' ? K.red : K.green;
          if (isBar) {
            const g = grow(f, at, Math.min(16, per));
            const v = c.v * g;
            return (
              <React.Fragment key={c.key + i}>
                <Bar x={x} y0={Math.min(Y(0), Y(v))} h={Math.abs(v) * S} w={1.0} d={1.0} color={col} />
                {g > 0.3 && <Label text={`${c.v < 0 ? '−' : ''}${fmt(Math.abs(c.v))}`} height={c.kind === 'result' ? 0.36 : 0.3} position={[x, c.v >= 0 ? Y(v) + 0.42 : Y(v) - 0.42, 0.55]} color={col} />}
                {floorLabel(name, x, c.kind === 'result' ? col : K.ink, 0.95)}
              </React.Fragment>
            );
          }
          // 費用は上から外れて落ちる・収益は下から入る（前の段の高さから）
          const t = interpolate(f, [at, at + Math.min(18, per)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
          const y0 = Math.min(Y(c.from), Y(c.to));
          const lift = c.kind === 'minus' ? (1 - t) * 0 + Math.sin(t * Math.PI) * 0.5 : -Math.sin(t * Math.PI) * 0.5;
          const xx = (i - 1) * G + G * t;
          return (
            <React.Fragment key={c.key + i}>
              <Bar x={xx} y0={y0 + lift} h={Math.abs(c.to - c.from) * S} w={0.98} d={0.98} color={col} />
              {t >= 1 && <Label text={`${c.kind === 'minus' ? '−' : '+'}${fmt(Math.abs(c.v))}`} height={0.28} position={[x, Math.max(Y(c.from), Y(c.to)) + 0.4, 0]} color={col} />}
              {floorLabel(name, x, col, 0.95)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag="売上から利益へ"
        at={Math.round(doneAt)}
        brief={!main}
        big={
          op >= 0 ? (
            <>
              {last.label}率 <span style={{ color: K.green }}>{((op / sales) * 100).toFixed(1)}%</span>
            </>
          ) : (
            <span style={{ color: K.red }}>費用が売上を上回った</span>
          )
        }
        sub={`${cols[0].label} ${oku(sales)} → ${last.label} ${oku(op)}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 数字以外（配当・自社株買い・M&A など） ----------
export const TopicPart: React.FC<PartProps> = ({ d, mode, caption }) => {
  const f = useCurrentFrame();
  const land = useLand();
  const items = mode === 'main' ? d.topics : d.topics.slice(0, 1);
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Titles tag="数字のほかに" at={20} brief={mode !== 'main'} caption={caption} />
      {items.map((t, i) => {
        const at = 6 + i * 12;
        const o = interpolate(f, [at, at + 8], [0, 1], clamp);
        const y = interpolate(f, [at, at + 14], [60, 0], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
        return (
          <div key={t.title} style={{ position: 'absolute', top: land ? `${22 + i * 24}%` : `${34 + i * 15}%`, left: land ? 160 : 100, right: land ? 160 : 100, opacity: o, transform: `translateY(${y}px)`, background: '#fff', borderRadius: 28, padding: '40px 44px', boxShadow: '0 16px 48px rgba(15,23,42,0.10)', display: 'flex', gap: 34, alignItems: 'center' }}>
            <div style={{ fontSize: 96, lineHeight: 1 }}>{t.icon}</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 60, color: K.ink }}>{t.title}</div>
              {t.sub && <div style={{ fontWeight: 700, fontSize: 40, color: K.sub, marginTop: 8 }}>{t.sub}</div>}
            </div>
          </div>
        );
      })}
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
                {k.cur < 0 ? '−' : ''}{fmt(Math.abs(k.cur) * g)}<span style={{ fontSize: 36 }}>{UNIT}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 340, marginTop: 18 }}>
                <div style={{ width: 70, height: hb(k.prev), background: k.prev < 0 ? '#f0a3a3' : '#cbd5e1', borderRadius: 8 }} />
                <div style={{ width: 70, height: hb(k.cur), background: k.cur < 0 ? K.red : K.blue, borderRadius: 8 }} />
                <div style={{ marginLeft: 'auto', alignSelf: 'flex-start', fontWeight: 900, fontSize: 40, color: '#fff', background: yy.c, borderRadius: 999, padding: '6px 20px', opacity: interpolate(f, [at + 14, at + 20], [0, 1], clamp) }}>{yy.t}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 30, color: K.sub, marginTop: 10 }}>前年 {k.prev < 0 ? '−' : ''}{fmt(Math.abs(k.prev))}{UNIT}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- 株価：決算の前後の値動き。発表の日に印、そこからの動きを強調 ----------
export const StockPart: React.FC<PartProps> = ({ d, mode, dur, caption, ctx }) => {
  const f = useCurrentFrame();
  if (!d.stock) return null;
  const main = mode === 'main';
  // 分析動画は取れた期間すべて、超ショートは発表前の40日＋発表後
  const cut0 = ctx === 'video' ? 0 : Math.max(0, d.stock.at - 40);
  const prices = d.stock.prices.slice(cut0);
  const at = d.stock.at - cut0;
  const days = d.stock.days;
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const W = 5.6;
  const X = (i: number) => (i / (prices.length - 1)) * W;
  const Yp = (v: number) => 0.8 + ((v - lo) / Math.max(1e-9, hi - lo)) * 4.2;
  const drawEnd = main ? dur * 0.55 : 30;
  const p = interpolate(f, [2, drawEnd], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const n = Math.max(2, Math.floor(p * (prices.length - 1)) + 1);
  const pts = prices.slice(0, n).map((v, i) => new THREE.Vector3(X(i), Yp(v), 0));
  const geo = React.useMemo(() => (pts.length >= 2 ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), pts.length * 6, 0.07, 10, false) : null), [n]);
  React.useLayoutEffect(() => () => geo?.dispose(), [geo]);
  // pre/post があれば「発表の日の終値 → 翌日の終値」で反応を見る
  const before = d.stock.pre ?? prices[at - 1];
  const after = d.stock.post ?? prices[prices.length - 1];
  const ch = ((after - before) / before) * 100;
  const up = ch >= 0;
  const col = up ? K.green : K.red;
  const reached = n - 1 >= at;
  const lineCol = n - 1 > at ? col : K.blue;
  return (
    <AbsoluteFill>
      <Scene3D cx={W / 2} cy={2.4} dist={main ? 21.5 : 21}>
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
        tag={ctx === 'video' && d.stock.period ? `株価の推移（${d.stock.period}）` : '株価の反応'}
        at={Math.round(drawEnd + 2)}
        brief={!main}
        big={<span style={{ color: col }}>{`${up ? '+' : ''}${ch.toFixed(1)}%`}</span>}
        sub={d.stock.pre != null && d.stock.post != null ? `発表の日の終値 → 翌日の終値（${fmt(d.stock.pre)} → ${fmt(d.stock.post)}${d.stock.unit ?? '円'}）` : `決算発表の前日から${days}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// 部品の一覧は registry.ts

