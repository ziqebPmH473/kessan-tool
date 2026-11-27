import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Bar, K, Label, Text2D } from '../v2/kit';
import { PALE, PartProps, Scene3D, Titles, UNIT, clamp, floorLabel, fmt, grow, isRev, oku, yoyText } from './parts';
import type { Grade } from './types';

// 保存済みの決算データ（99件）を読んで、足りなかった場面を部品にしたもの（2026-11-27）
// 進み具合・5つの評価・配当・事業ごとの利益・利益率・営業利益から純利益まで

const ZeroPlate: React.FC<{ cx: number; w: number; z: number }> = ({ cx, w, z }) => (
  <mesh position={[cx, z, 0]}>
    <boxGeometry args={[w, 0.03, 1.6]} />
    <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
  </mesh>
);
const num = (v: number) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
const mainProfit = <T extends { key?: string; name: string }>(xs: T[]) =>
  xs.find((it) => it.key === 'operating_income') ?? xs.find((it) => it.name === '営業利益') ?? xs.find((it) => !isRev(it)) ?? xs[xs.length - 1];
const cut = (s: string, n = 7) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- 進み具合：通期の会社予想（100%）に対して、ここまでで何%まで来たか。時期の目安の線と比べる ----------
// 四半期の決算（1Q〜3Q）のほとんどで使える（保存データの 85/99 件）
const PACE_WORD: Record<number, string> = { 25: '3か月', 50: '半年', 75: '9か月' };
export const progressState = (p: number, pace: number) =>
  p >= pace + 8 ? { t: '目安より速いペース', c: K.green } : p >= pace - 8 ? { t: 'ほぼ目安どおり', c: K.blue } : { t: '目安より遅れぎみ', c: K.orange };
export const ProgressPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.progress) return null;
  const all = d.progress.items.filter((it) => it.forecast > 0 && it.actual >= 0);
  if (!all.length) return null;
  const main = mode === 'main';
  const focus = mainProfit(all);
  const items = main ? all : [focus];
  const pace = d.progress.pace;
  const H = 4.4; // 100%＝通期の会社予想
  const G = main ? 1.8 : 2;
  const n = items.length;
  const fillAt = main ? 10 : 4;
  const fillLen = main ? Math.max(30, dur * 0.35) : 24;
  const paceAt = fillAt + fillLen + 4;
  const cx = ((n - 1) * G) / 2;
  const pf = (focus.actual / focus.forecast) * 100;
  const st = progressState(pf, pace);
  return (
    <AbsoluteFill>
      <Scene3D cx={cx} cy={H / 2 + 0.6} dist={main ? 15.5 : 13}>
        {items.map((it, i) => {
          const p = (it.actual / it.forecast) * 100;
          const g = grow(f, fillAt + i * 4, fillLen);
          const x = i * G;
          const fh = (Math.min(p, 130) / 100) * H * g;
          const col = f >= paceAt ? progressState(p, pace).c : K.blue;
          return (
            <React.Fragment key={it.name}>
              {/* 通期予想の高さのうすい箱（ガラス） */}
              <Bar x={x} h={H} w={1.0} d={1.0} color="#ffffff" opacity={0.28} />
              <Bar x={x} h={fh} w={0.86} d={0.86} color={col} />
              {f >= fillAt + 4 && <Label text={`${Math.round(p * g)}%`} height={it === focus ? 0.36 : 0.3} position={[x, Math.max(fh, 0.3) + 0.42, 0.6]} color={it === focus ? K.ink : K.sub} />}
              <Label text={`予想 ${fmt(it.forecast)}`} height={0.22} position={[x, H + 0.32, 0]} color={K.sub} />
              {floorLabel(it.name, x, it === focus ? K.ink : K.sub, 1.0)}
            </React.Fragment>
          );
        })}
        {/* 時期の目安（1Q＝25%、2Q＝50%、3Q＝75%） */}
        {f >= paceAt && (
          <>
            <mesh position={[cx, (pace / 100) * H, 0]}>
              <boxGeometry args={[(n - 1) * G + 1.7 * interpolate(f, [paceAt, paceAt + 10], [0, 1], clamp), 0.05, 1.15]} />
              <meshStandardMaterial color={K.orange} transparent opacity={0.9} />
            </mesh>
          </>
        )}
      </Scene3D>
      <Titles
        tag="通期の会社予想に対する進み具合"
        at={Math.round(paceAt + 6)}
        brief={!main}
        big={
          <>
            {focus.name}は <span style={{ color: st.c }}>{Math.round(pf)}%</span>
          </>
        }
        sub={`${PACE_WORD[pace] ?? 'この時期'}の目安は${pace}%：${st.t}`}
        caption={caption}
      />
      <Text2D at={4} size={30} top="83.5%" left="50%" color={K.sub} weight={700} rise={false}>
        箱の高さ＝通期の会社予想（{UNIT}）　<span style={{ color: K.orange }}>━</span> 目安
      </Text2D>
    </AbsoluteFill>
  );
};

// ---------- 5つの評価：成長性・収益性・財務の安全性・稼ぐ力・資本効率を、柱の高さと色で ----------
export const GRADE: Record<Grade, { lv: number; t: string; c: string }> = {
  strong: { lv: 5, t: 'とても良い', c: K.green },
  good: { lv: 4, t: '良い', c: '#4ade80' },
  neutral: { lv: 3, t: 'ふつう', c: '#94a3b8' },
  caution: { lv: 2, t: '注意', c: K.orange },
  weak: { lv: 1, t: '弱い', c: K.red },
};
export const RatingsPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const rs = d.ratings;
  if (!rs.length) return null;
  const main = mode === 'main';
  const n = rs.length;
  const G = 1.9;
  const H = 4.4;
  const step = main ? Math.min(10, dur * 0.05) : 3;
  const len = main ? 22 : 14;
  const doneAt = 4 + (n - 1) * step + len;
  const good = rs.filter((r) => r.grade === 'strong');
  const bad = rs.filter((r) => r.grade === 'weak' || r.grade === 'caution');
  const big =
    good.length >= 4 ? (
      <span style={{ color: K.green }}>ほぼ全部が「とても良い」</span>
    ) : good.length ? (
      <>
        強み：<span style={{ color: K.green }}>{good.slice(0, 2).map((r) => r.label).join('・')}</span>
      </>
    ) : bad.length ? (
      <>
        注意：<span style={{ color: K.orange }}>{bad.slice(0, 2).map((r) => r.label).join('・')}</span>
      </>
    ) : (
      <span style={{ color: K.sub }}>目立つ強み・弱みはない</span>
    );
  const sub = good.length && bad.length ? `注意：${bad.map((r) => r.label).join('・')}` : bad.length && good.length === 0 ? (bad[0].reason ?? '') : good[0]?.reason ?? '';
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={H / 2 + 0.6} dist={8 + n * 3}>
        {rs.map((r, i) => {
          const g = GRADE[r.grade];
          const at = 4 + i * step;
          const gg = grow(f, at, len);
          const h = (g.lv / 5) * H * gg;
          const x = i * G;
          return (
            <React.Fragment key={r.label}>
              <Bar x={x} h={H} w={0.95} d={0.95} color="#ffffff" opacity={0.2} />
              <Bar x={x} h={h} w={0.82} d={0.82} color={g.c} />
              {gg >= 0.98 && <Label text={g.t} height={0.24} position={[x, h + 0.36, 0.5]} color="#ffffff" pill={g.c} weight={900} />}
              <Label text={r.label} height={0.22} position={[x, 0.02, 1.0]} rotation={[-Math.PI / 2, 0, 0]} color={K.ink} />
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles tag="5つの評価" at={Math.round(doneAt)} brief={!main} big={big} sub={sub} caption={caption} />
    </AbsoluteFill>
  );
};

// ---------- 配当：1株あたりの配当の予想を、コインの山で。修正前 → 修正後 ----------
const Coin: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <mesh position={[x, y, 0]} castShadow receiveShadow>
    <cylinderGeometry args={[0.62, 0.62, 0.16, 48]} />
    <meshStandardMaterial color={color} roughness={0.35} metalness={0.35} />
  </mesh>
);
export const DividendPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.dividend) return null;
  const { before, after, label } = d.dividend;
  const main = mode === 'main';
  const mx = Math.max(before, after, 1);
  const MAXC = 16;
  const cnt = (v: number) => (v <= 0 ? 0 : Math.max(1, Math.round((v / mx) * MAXC)));
  const nb = cnt(before);
  const na = cnt(after);
  const TH = 0.18;
  const dropAt = main ? 6 : 2;
  const per = main ? Math.max(1.2, (dur * 0.45) / Math.max(1, na)) : 0.9;
  const up = after > before;
  const col = after === before ? K.sub : up ? K.green : K.red;
  const word = after <= 0 && before > 0 ? '無配の予想に' : before <= 0 && after > 0 ? '配当を出す予想に' : after === before ? '据え置き' : up ? '増配の予想' : '減配の予想';
  const doneAt = dropAt + na * per + 10;
  const B = '#e7d7a8';
  const A = '#f2b705';
  const coinY = (i: number, start: number) => {
    const t = f - start;
    if (t < 0) return null;
    const p = Math.min(1, t / 7);
    return i * TH + 0.08 + (1 - p * p) * 2.5;
  };
  return (
    <AbsoluteFill>
      <Scene3D cx={1.2} cy={1.9} dist={main ? 12.5 : 11.5}>
        {Array.from({ length: nb }).map((_, i) => (
          <Coin key={`b${i}`} x={0} y={i * TH + 0.08} color={B} />
        ))}
        <Label text={`${fmt(before)}円`} height={0.32} position={[0, nb * TH + 0.55, 0]} color={K.sub} />
        {floorLabel('修正前の予想', 0, K.sub, 1.1)}
        {Array.from({ length: na }).map((_, i) => {
          const y = coinY(i, dropAt + i * per);
          return y == null ? null : <Coin key={`a${i}`} x={2.4} y={y} color={i >= nb ? (up ? A : A) : A} />;
        })}
        {f >= doneAt - 6 && <Label text={`${fmt(after)}円`} height={0.4} position={[2.4, na * TH + 0.6, 0]} color={col} />}
        {floorLabel('今回の予想', 2.4, K.ink, 1.1)}
      </Scene3D>
      <Titles
        tag={`1株あたりの配当（${label}）`}
        at={Math.round(doneAt)}
        brief={!main}
        big={<span style={{ color: col }}>{word}</span>}
        sub={`${fmt(before)}円 → ${fmt(after)}円（${after - before >= 0 ? '+' : '−'}${fmt(Math.abs(after - before))}円）`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// ---------- 事業ごとの利益：前年（灰）と今年の棒の組。どの事業が稼いだか・足を引っぱったか。赤字の事業は0の線の下へ ----------
// 事業の売上の円グラフでは、事業の赤字（保存データの 30/99 件）や「売上は伸びたが利益は減った」が見えない
export const SegProfitPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const segs0 = d.segments.filter((s) => s.op != null && s.prevOp != null) as { name: string; op: number; prevOp: number }[];
  if (segs0.length < 2) return null;
  const main = mode === 'main';
  const named = segs0.filter((s) => !/その他|調整|消去|全社/.test(s.name));
  const pool = named.length ? named : segs0;
  const focus = pool.reduce((a, s) => (Math.abs(s.op - s.prevOp) > Math.abs(a.op - a.prevOp) ? s : a), pool[0]);
  // 大きい順に最大5つ（注目の事業は必ず入れる）。さらっとは注目の事業と、いちばん大きい事業だけ
  const big = [...segs0].sort((a, b) => Math.abs(b.op) - Math.abs(a.op));
  let segs = main ? big.slice(0, 4) : [big[0], focus].filter((s, i, xs) => xs.indexOf(s) === i);
  if (!segs.includes(focus)) segs = [...segs.slice(0, segs.length - 1), focus];
  segs = segs0.filter((s) => segs.includes(s)); // 元の並び（決算短信の順）に戻す
  const n = segs.length;
  const H = 4.4;
  const mx = Math.max(...segs.flatMap((s) => [Math.abs(s.op), Math.abs(s.prevOp)]));
  const negMax = Math.max(0, ...segs.flatMap((s) => [-s.op, -s.prevOp]));
  const Hs = negMax > 0 ? 3.2 : 4.0;
  const Z = negMax > 0 ? (negMax / mx) * Hs + 0.7 : 0;
  const G = main ? 1.9 : 2.3;
  const step = main ? Math.min(8, dur * 0.05) : 3;
  const len = main ? 22 : 14;
  const doneAt = 2 + (n - 1) * step + len;
  const fy = yoyText(focus.prevOp, focus.op);
  const losses = segs0.filter((s) => s.op < 0).length;
  const label = d.segLabel ?? '事業';
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={(Z + Hs) / 2 + 0.9} dist={(main ? 9 + n * 2.6 : 15) + Z * 0.7}>
        {Z > 0 && <ZeroPlate cx={((n - 1) * G) / 2} w={(n - 1) * G + 2} z={Z} />}
        {segs.map((s, i) => {
          const at = 2 + i * step;
          const g = grow(f, at, len);
          const isF = s === focus;
          const x = i * G;
          const hb = (v: number) => (Math.abs(v) / mx) * Hs * g;
          const bar = (v: number, xx: number, color: string) => <Bar x={xx} y0={v < 0 ? Z - hb(v) : Z} h={hb(v)} w={0.55} d={0.55} color={color} />;
          const cc = isF ? (s.op >= s.prevOp ? K.green : K.red) : s.op < 0 ? '#f0a3a3' : '#93c5fd';
          const ct = s.op < 0 ? Z - hb(s.op) - 0.36 : Z + hb(s.op) + 0.36;
          return (
            <React.Fragment key={s.name}>
              {bar(s.prevOp, x - 0.32, s.prevOp < 0 ? '#f6caca' : PALE)}
              {bar(s.op, x + 0.32, cc)}
              {f >= at + 4 && <Label text={num(s.op * g)} height={isF ? 0.3 : 0.25} position={[x + 0.32, ct, 0.4]} color={isF ? cc : K.sub} />}
              {isF && f >= doneAt && <Label text={fy.t} height={0.28} position={[x, Z + (Math.max(0, s.op, s.prevOp) / mx) * Hs * grow(f, 2 + i * step, len) + 0.85, 0]} color="#ffffff" pill={fy.c} weight={900} />}
              <Label text={cut(s.name, 6)} height={0.24} position={[x, 0.02, 1.0]} rotation={[-Math.PI / 2, 0, 0]} color={isF ? K.ink : K.sub} />
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag={`${label}ごとの利益`}
        at={Math.round(doneAt + 4)}
        brief={!main}
        big={
          <>
            <span style={{ color: fy.c }}>{cut(focus.name, 7)}</span>の利益が {fy.t}
          </>
        }
        sub={losses ? `赤字の${label}が ${losses}つ` : `${oku(focus.prevOp)} → ${oku(focus.op)}`}
        caption={caption}
      />
      <Text2D at={4} size={30} top="83.5%" left="50%" color={K.sub} weight={700} rise={false}>
        <span style={{ color: '#94a3b8' }}>■</span> 前年　<span style={{ color: K.blue }}>■</span> 今年（{UNIT}）
      </Text2D>
    </AbsoluteFill>
  );
};

// ---------- 利益率：粗利率・営業利益率を前年と今年で。売上に対して、いくら残るようになったか ----------
// 保存データの 54/99 件で営業利益率が3ポイント以上動いている（売上→利益の構造は1年分しか見せない）
export const MarginPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const ms0 = d.margins;
  if (!ms0.length) return null;
  const main = mode === 'main';
  const focus = ms0.find((m) => m.name.includes('営業')) ?? ms0[ms0.length - 1];
  const ms = main ? ms0 : [focus];
  const n = ms.length;
  const H = 4.4;
  const mx = Math.max(...ms.flatMap((m) => [Math.abs(m.prev), Math.abs(m.cur)]));
  const negMax = Math.max(0, ...ms.flatMap((m) => [-m.prev, -m.cur]));
  const Hs = negMax > 0 ? 3.2 : H;
  const Z = negMax > 0 ? (negMax / mx) * Hs + 0.7 : 0;
  const G = main ? 2.4 : 2.4;
  const at0 = 4;
  const len = main ? Math.max(24, dur * 0.25) : 16;
  const chAt = at0 + len + (main ? 12 : 4);
  const t = interpolate(f, [chAt, chAt + (main ? 24 : 12)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const diff = focus.cur - focus.prev;
  const col = diff >= 0 ? K.green : K.red;
  return (
    <AbsoluteFill>
      <Scene3D cx={((n - 1) * G) / 2} cy={(Z + Hs) / 2 + 0.3} dist={(main ? 14 : 13.5) + Z * 1.3}>
        {Z > 0 && <ZeroPlate cx={((n - 1) * G) / 2} w={(n - 1) * G + 2.4} z={Z} />}
        {ms.map((m, i) => {
          const g = grow(f, at0 + i * 4, len);
          const x = i * G;
          const hv = (v: number) => (Math.abs(v) / mx) * Hs;
          // 今年の棒は、まず前年の高さで出て、そこから今年の高さへ動く（差の分に色）
          const curV = m.prev + (m.cur - m.prev) * t;
          const ph = hv(m.prev) * g;
          const ch = hv(curV) * g;
          const isF = m === focus;
          const c = t > 0 ? (m.cur >= m.prev ? K.green : K.red) : K.blue;
          return (
            <React.Fragment key={m.name}>
              <Bar x={x - 0.5} y0={m.prev < 0 ? Z - ph : Z} h={ph} w={0.8} d={0.8} color={m.prev < 0 ? '#f6caca' : PALE} />
              <Bar x={x + 0.5} y0={curV < 0 ? Z - ch : Z} h={ch} w={0.8} d={0.8} color={c} />
              {g > 0.6 && <Label text={`${m.prev.toFixed(1)}%`} height={0.26} position={[x - 0.5, m.prev < 0 ? Z - ph - 0.34 : Z + ph + 0.34, 0.45]} color={K.sub} />}
              {g > 0.6 && <Label text={`${curV.toFixed(1)}%`} height={isF ? 0.34 : 0.28} position={[x + 0.5, curV < 0 ? Z - ch - 0.38 : Z + ch + 0.38, 0.45]} color={t > 0 ? c : K.ink} />}
              {floorLabel(m.name, x, isF ? K.ink : K.sub, 1.0)}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag="利益率（売上のうち、利益として残る割合）"
        at={Math.round(chAt + (main ? 24 : 12))}
        brief={!main}
        big={
          <>
            {focus.name} <span style={{ color: col }}>{`${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}ポイント`}</span>
          </>
        }
        sub={`前年 ${focus.prev.toFixed(1)}% → 今年 ${focus.cur.toFixed(1)}%`}
        caption={caption}
      />
      <Text2D at={4} size={30} top="83.5%" left="50%" color={K.sub} weight={700} rise={false}>
        <span style={{ color: '#94a3b8' }}>■</span> 前年　<span style={{ color: K.blue }}>■</span> 今年
      </Text2D>
    </AbsoluteFill>
  );
};

// ---------- 営業利益から純利益まで：本業の利益から、営業外・特別な損益・税金を経て、最後に残る利益へ ----------
// 「営業利益は増えたのに純利益は減った」「本業は黒字なのに最終赤字」（保存データの 9/99 件）を説明する部品
const GAP_NAME = (a: string, b: string) =>
  a === 'operating_income' && b === 'ordinary_income' ? '営業外' : a === 'ordinary_income' && b === 'pretax_income' ? '特別な損益' : a === 'operating_income' && b === 'pretax_income' ? '営業外・特別' : b === 'net_income' ? '税金など' : 'その他';
export const netgapWord = (n: NonNullable<PartProps['d']['netgap']>) => {
  const op = n.steps[0].v;
  const net = n.steps[n.steps.length - 1].v;
  if (op > 0 && net < 0) return { t: '本業は黒字、最後は赤字', c: K.red };
  if (op < 0 && net > 0) return { t: '本業は赤字、最後は黒字', c: K.orange };
  const yn = yoyText(n.prevNet, net);
  return { t: `${n.steps[n.steps.length - 1].name}は ${yn.t}`, c: yn.c };
};
export const NetGapPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  if (!d.netgap || d.netgap.steps.length < 2) return null;
  const main = mode === 'main';
  const steps = main ? d.netgap.steps : [d.netgap.steps[0], d.netgap.steps[d.netgap.steps.length - 1]];
  const vals = steps.map((s) => s.v);
  const H = 4.2;
  const mx = Math.max(...vals.map(Math.abs));
  const lo = Math.min(0, ...vals);
  const S = H / (Math.max(0, ...vals) - lo || 1);
  const Z = lo < 0 ? -lo * S + 0.6 : 0;
  const Y = (v: number) => Z + v * S;
  const G = main ? 1.05 : 1.6; // 段と段のあいだに「差」の棒を置く
  const cols = steps.length * 2 - 1;
  const per = main ? Math.min(26, (dur * 0.6) / cols) : 8;
  const doneAt = 4 + cols * per;
  const w = netgapWord(d.netgap);
  return (
    <AbsoluteFill>
      <Scene3D cx={((cols - 1) * G) / 2} cy={(Y(Math.max(0, ...vals)) + 0) / 2 + 0.5} dist={Math.max(main ? 15.5 : 13, 9 + cols * 1.9) + Z * 0.5}>
        {Z > 0 && <ZeroPlate cx={((cols - 1) * G) / 2} w={(cols - 1) * G + 1.6} z={Z} />}
        {steps.map((s, i) => {
          const at = 4 + i * 2 * per;
          const g = grow(f, at, 14);
          const x = i * 2 * G;
          const h = Math.abs(s.v) * S * g;
          const last = i === steps.length - 1;
          const c = s.v < 0 ? K.red : last ? K.blue : i === 0 ? K.blue : '#93c5fd';
          const nx = steps[i + 1];
          const gap = nx ? nx.v - s.v : 0;
          const gAt = at + per;
          const gp = nx ? Math.min(1, Math.max(0, (f - gAt) / 10)) : 0;
          const gy0 = Math.min(Y(s.v), Y(nx?.v ?? 0));
          return (
            <React.Fragment key={s.key}>
              <Bar x={x} y0={s.v < 0 ? Z - h : Z} h={h} w={0.8} d={0.8} color={c} />
              {g > 0.5 && <Label text={num(s.v)} height={last ? 0.34 : 0.28} position={[x, s.v < 0 ? Z - h - 0.38 : Z + h + 0.38, 0.45]} color={s.v < 0 ? K.red : K.ink} />}
              {floorLabel(cut(s.name, 6), x, last || i === 0 ? K.ink : K.sub, 1.0)}
              {nx && f >= gAt && Math.abs(gap) * S > 0.01 && fmt(Math.abs(gap)) !== '0' && (
                <>
                  <Bar x={x + G} y0={gy0 + (1 - gp * gp) * 1.6} h={Math.abs(gap) * S} w={0.7} d={0.7} color={gap >= 0 ? K.green : K.red} opacity={0.85} />
                  {gp >= 1 && <Label text={`${gap >= 0 ? '+' : '−'}${fmt(Math.abs(gap))}`} height={0.24} position={[x + G, Math.max(Y(s.v), Y(nx.v)) + 0.34, 0.45]} color={gap >= 0 ? K.green : K.red} />}
                  {gp >= 1 && <Label text={GAP_NAME(s.key, nx.key)} height={0.2} position={[x + G, 0.02, 1.55]} rotation={[-Math.PI / 2, 0, 0]} color={K.sub} />}
                </>
              )}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Titles
        tag="本業の利益から、最後に残る利益まで"
        at={Math.round(doneAt)}
        brief={!main}
        big={<span style={{ color: w.c }}>{w.t}</span>}
        sub={`${d.netgap.steps[0].name} ${yoyText(d.netgap.prevOp, d.netgap.steps[0].v).t}（前年とくらべて・${UNIT}）`}
        caption={caption}
      />
    </AbsoluteFill>
  );
};

// 画面に出る文字（フォントを先に読み込むため。Short.tsx で使う）
export const PARTS4_TEXT =
  '通期の会社予想に対する進み具合箱の高さ＝目安より速いペースほぼ目安どおり遅れぎみ3か月半年9か月この時期の目安は予想5つの評価とても良い良いふつう注意弱い強みほぼ全部が目立つ強み・弱みはない1株あたりの配当修正前の予想今回の予想無配の予想に配当を出す予想に据え置き増配の予想減配の予想円ごとの利益赤字のがつ利益率（売上のうち、利益として残る割合）ポイント前年今年本業の利益から、最後に残る利益まで本業は黒字、最後は赤字本業は赤字、最後は黒字営業外特別な損益営業外・特別税金などその他直近の3か月の同じ時期今回増収減収増益減益黒字転換赤字転落くらべて今期の会社予想（通期）前期の実績今期は来期は濃い＝うすい＝会社予想予想…';
