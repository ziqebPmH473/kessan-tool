import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT, fmt } from '../lib';
import { Bar, K, Label, Text2D } from '../v2/kit';
import { PALE, PartProps, Scene3D, Titles, clamp, floorLabel, grow, oku, yoyText } from './parts';

// いまの分析動画から省いていた場面を、3Dの部品にしたもの（どれも主役版・さらっと版を持つ）

const ZeroPlate: React.FC<{ cx: number; w: number; z: number }> = ({ cx, w, z }) => (
  <mesh position={[cx, z, 0]}>
    <boxGeometry args={[w, 0.03, 1.6]} />
    <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
  </mesh>
);
const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${fmt(Math.abs(v))}`;

// ---------- 決算ハイライト（3D）：4つの数字を、前年（灰）と今年の棒の組で。数字ごとに高さの尺度は別 ----------
export const Kpi3D: React.FC<PartProps> = ({ d, dur }) => {
  const f = useCurrentFrame();
  const G = 1.75;
  const n = d.kpis.length;
  const anyNeg = d.kpis.some((k) => k.prev < 0 || k.cur < 0);
  const H = anyNeg ? 2.8 : 4.2;
  // 0の線の高さ：いちばん深いマイナスの棒が床に届かないように
  const negR = Math.max(0, ...d.kpis.map((k) => Math.max(k.prev < 0 ? -k.prev : 0, k.cur < 0 ? -k.cur : 0) / Math.max(Math.abs(k.prev), Math.abs(k.cur))));
  const Z = anyNeg ? negR * H + 0.7 : 0;
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={anyNeg ? (Z + H) / 2 + 0.3 : 2.4} dist={anyNeg ? 18.5 + Z * 0.8 : 18.5}>
        {anyNeg && <ZeroPlate cx={((n - 1) * G) / 2} w={(n - 1) * G + 2} z={Z} />}
        {d.kpis.map((k, i) => {
          const at = 2 + i * Math.min(8, dur * 0.06);
          const g = grow(f, at, Math.min(22, dur * 0.3));
          const mx = Math.max(Math.abs(k.prev), Math.abs(k.cur));
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
              {showPill && <Label text={yy.t} height={0.3} position={[x, Z + H + 1.25, 0]} color="#ffffff" pill={yy.c} weight={900} />}
              {floorLabel(k.name, x, K.ink, 1.0)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Text2D at={0} size={46} top="9%" left="50%" color={K.sub} weight={700}>決算ハイライト</Text2D>
      <Text2D at={4} size={34} top="14%" left="50%" color={K.sub} weight={700} rise={false}>
        <span style={{ color: '#94a3b8' }}>■</span> 前年　<span style={{ color: K.blue }}>■</span> 今年（億円）
      </Text2D>
    </AbsoluteFill>
  );
};

// ---------- 貸借対照表：左に資産、右に負債＋純資産を積む。自己資本比率を強調 ----------
export const BSPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.bs) return null;
  const { assets, liabilities, equity, prevEquityRatio } = d.bs;
  const main = mode === 'main';
  const S = 4.4 / assets;
  const k = main ? dur / 220 : 0.35;
  const ga = grow(f, 4, 26 * k + 8);
  const gl = grow(f, 30 * k + 6, 22 * k + 8);
  const ge = grow(f, 56 * k + 8, 22 * k + 8);
  const ratio = (equity / assets) * 100;
  const up = ratio >= prevEquityRatio;
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
      <Titles
        tag="財務の安全性"
        at={Math.round(80 * k + 12)}
        brief={!main}
        big={
          <>
            自己資本比率 <span style={{ color: up ? K.green : K.red }}>{ratio.toFixed(1)}%</span>
          </>
        }
        sub={`前期末は ${prevEquityRatio.toFixed(1)}%`}
        caption={caption}
      />
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
  ];
  const cums: number[] = [];
  steps.reduce((a, s) => {
    cums.push(a + s.v);
    return a + s.v;
  }, begin);
  const hi = Math.max(begin, end, ...cums);
  const S = 5 / hi;
  const G = 1.25;
  const main = mode === 'main';
  const st = steps.map((_, i) => (main ? dur * 0.12 + i * dur * 0.12 : 8 + i * 6));
  const endAt = main ? dur * 0.52 : 30;
  const free = operating + investing;
  return (
    <AbsoluteFill>
      <Scene3D cx={2 * G} cy={2.7} dist={16.5}>
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
        <Bar x={4 * G} h={end * S * grow(f, endAt, 16)} w={0.95} d={0.95} color={K.blue} />
        {f >= endAt + 8 && <Label text={fmt(end)} height={0.34} position={[4 * G, end * S + 0.42, 0]} color={K.blue} />}
        {floorLabel('期末', 4 * G, K.ink)}
      </Scene3D>
      <Titles
        tag="お金の出入り（キャッシュフロー）"
        at={Math.round(endAt + 8)}
        brief={!main}
        big={
          <>
            自由に使えるお金 <span style={{ color: free >= 0 ? K.green : K.red }}>{signed(free)}億円</span>
          </>
        }
        sub={`稼いだお金 ${signed(operating)} ／ 投資 ${signed(investing)}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 四半期単独：3か月ごとの利益を前年の同じ時期と並べる。直近の四半期を強調 ----------
export const QuarterPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const qs = mode === 'main' ? d.quarters : d.quarters.slice(-1);
  if (!qs.length) return null;
  const n = qs.length;
  const anyNeg = qs.some((q) => q.prev < 0 || q.cur < 0);
  const mx = Math.max(...qs.flatMap((q) => [Math.abs(q.prev), Math.abs(q.cur)]));
  const H = anyNeg ? 3.0 : 4.6;
  const negMax = Math.max(0, ...qs.flatMap((q) => [-q.prev, -q.cur]));
  const Z = anyNeg ? (negMax / mx) * H + 0.7 : 0;
  const G = mode === 'main' ? 1.6 : 2.2;
  const main = mode === 'main';
  const st = qs.map((_, i) => (main ? 4 + i * dur * (0.4 / n) : 4));
  const last = qs[n - 1];
  const yy = yoyText(last.prev, last.cur);
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={2.4} dist={main ? 17 : 14}>
        {anyNeg && <ZeroPlate cx={((n - 1) * G) / 2} w={(n - 1) * G + 2} z={Z} />}
        {qs.map((q, i) => {
          const g = grow(f, st[i], 18);
          const isLast = i === n - 1;
          const b = (v: number, x: number, color: string) => {
            const h = (Math.abs(v) / mx) * H * g;
            return <Bar x={x} y0={v < 0 ? Z - h : Z} h={h} w={0.6} d={0.6} color={color} />;
          };
          const ch = (Math.abs(q.cur) / mx) * H * g;
          return (
            <React.Fragment key={q.l}>
              {b(q.prev, i * G - 0.36, PALE)}
              {b(q.cur, i * G + 0.36, isLast ? (q.cur >= q.prev ? K.green : K.red) : q.cur < 0 ? '#f0a3a3' : '#93c5fd')}
              {f >= st[i] + 6 && <Label text={signed(q.cur).replace('+', '')} height={0.28} position={[i * G + 0.36, q.cur < 0 ? Z - ch - 0.38 : Z + ch + 0.38, 0.4]} color={isLast ? K.ink : K.sub} />}
              {floorLabel(q.l, i * G, isLast ? K.ink : K.sub)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag="3か月ごとの利益（四半期）"
        at={Math.round(st[n - 1] + 20)}
        brief={!main}
        big={
          <>
            直近の3か月は <span style={{ color: yy.c }}>{yy.t}</span>
          </>
        }
        sub={`前年の同じ時期 ${oku(last.prev)} → ${oku(last.cur)}`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 予想の修正：修正前の予想はうすい棒、修正後の予想が伸びる（縮む・0を割る） ----------
export const RevisionPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.revision) return null;
  const { before, after, label } = d.revision;
  const main = mode === 'main';
  const neg = before < 0 || after < 0;
  const mx = Math.max(Math.abs(before), Math.abs(after));
  const H = neg ? 3.4 : 4.8;
  const S = H / mx;
  const Z = neg ? Math.max(0, -before, -after) * S + 0.7 : 0;
  const a = main ? dur * 0.3 : 14;
  const gb = grow(f, 2, main ? 24 : 12);
  const t = interpolate(f, [a, a + (main ? 28 : 14)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const up = after >= before;
  const col = up ? K.green : K.red;
  const G = 1.9;
  const hb = Math.abs(before) * S * gb;
  const ha = Math.abs(after) * S * t;
  const flip = before > 0 && after < 0 ? '黒字の予想 → 赤字の予想' : before < 0 && after > 0 ? '赤字の予想 → 黒字の予想' : null;
  return (
    <AbsoluteFill>
      <Scene3D cx={G / 2} cy={2.6} dist={14.5}>
        {neg && <ZeroPlate cx={G / 2} w={G + 2.4} z={Z} />}
        <Bar x={0} y0={before < 0 ? Z - hb : Z} h={hb} w={1.3} d={1.3} color={K.gray} opacity={0.55} />
        {gb > 0.9 && <Label text={signed(before).replace('+', '')} height={0.3} position={[0, before < 0 ? Z - hb - 0.4 : Z + hb + 0.4, 0.6]} color={K.sub} />}
        <Bar x={G} y0={after < 0 ? Z - ha : Z} h={ha} w={1.3} d={1.3} color={col} />
        {t >= 1 && <Label text={signed(after).replace('+', '')} height={0.36} position={[G, after < 0 ? Z - ha - 0.45 : Z + ha + 0.45, 0.6]} color={col} />}
        {floorLabel('修正前', 0, K.sub, 1.0)}
        {floorLabel('修正後', G, K.ink, 1.0)}
      </Scene3D>
      <Titles
        tag={`会社予想の修正（${label}）`}
        at={Math.round(a + (main ? 28 : 14))}
        brief={!main}
        big={<span style={{ color: col }}>{up ? '上方修正' : '下方修正'}</span>}
        sub={flip ?? `${oku(before)} → ${oku(after)}（${up ? '+' : ''}${(((after - before) / Math.abs(before)) * 100).toFixed(1)}%）`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 注目ポイント：GOOD と WATCH の札が、奥から順に立ち上がる ----------
export const PointsPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const main = mode === 'main';
  const items = [
    ...d.points.good.slice(0, main ? 2 : 1).map((t) => ({ t, good: true })),
    ...d.points.watch.slice(0, main ? 2 : 1).map((t) => ({ t, good: false })),
  ];
  const step = main ? Math.min(18, dur / (items.length + 2)) : 8;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, perspective: 1400 }}>
      <Text2D at={0} size={main ? 46 : 40} top="9%" left="50%" color={K.sub} weight={700}>注目ポイント</Text2D>
      {items.map((it, i) => {
        const at = 4 + i * step;
        const rx = interpolate(f, [at, at + 14], [-80, 0], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
        const o = interpolate(f, [at, at + 6], [0, 1], clamp);
        const col = it.good ? K.green : K.orange;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `${20 + i * 15}%`,
              left: 90,
              right: 90,
              opacity: o,
              transform: `rotateX(${rx}deg)`,
              transformOrigin: 'bottom center',
              background: '#fff',
              borderRadius: 26,
              padding: '34px 40px',
              borderLeft: `14px solid ${col}`,
              boxShadow: '0 18px 44px rgba(15,23,42,0.12)',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 32, color: col, letterSpacing: '0.08em' }}>{it.good ? 'GOOD' : 'WATCH'}</div>
            <div style={{ fontWeight: 700, fontSize: 50, color: K.ink, marginTop: 6 }}>{it.t}</div>
          </div>
        );
      })}
      {caption && <Text2D at={Math.round(4 + items.length * step)} size={40} top="88%" left="50%" weight={700} band>{caption}</Text2D>}
    </AbsoluteFill>
  );
};
