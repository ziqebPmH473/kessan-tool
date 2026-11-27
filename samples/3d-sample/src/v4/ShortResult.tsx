import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Easing, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { CHARS, CameraRig, FONT, RenderAfter, fmt, prog } from '../lib';
import { Bar, K, Label, LightStage, Text2D } from '../v2/kit';

// 超ショート（縦）：今回の決算がどうだったかを、3つで見せる
// ① 結果（推移の中の今回）② 理由（何が増えた分を生んだか）③ この先（会社予想の修正）
const PALE = '#dbe3ee';
const LEN = { result: 270, why: 270, next: 200, sum: 150 };
export const SHORT2_LEN = LEN.result + LEN.why + LEN.next + LEN.sum;

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const grow = (f: number, a: number, d: number) => {
  const t = Math.min(1, Math.max(0, (f - a) / d));
  return 1 - (1 - t) ** 3;
};

// 縦動画で、少し上から見る固定のカメラ
const Cam: React.FC<{ cx: number; cy: number; d: number }> = ({ cx, cy, d }) => (
  <CameraRig pos={[cx + d * 0.18, cy + d * 0.22, d]} look={[cx, cy, 0]} fov={40} />
);

const Scene3D: React.FC<{ children: React.ReactNode; cx: number; cy: number; d: number }> = ({ children, cx, cy, d }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} shadows="soft" flat camera={{ fov: 40, position: [cx, cy, d] }}>
      <LightStage center={[cx, 0, 0]} shadowSize={8} />
      <Cam cx={cx} cy={cy} d={d} />
      {children}
      <RenderAfter />
    </ThreeCanvas>
  );
};

// ① 結果：営業利益の推移。今回の年だけ色を付ける
const YEARS = [
  { l: '22/3', v: 60 },
  { l: '23/3', v: 75 },
  { l: '24/3', v: 68 },
  { l: '25/3', v: 84 },
  { l: '26/3', v: 120 },
];
const Result: React.FC = () => {
  const f = useCurrentFrame();
  const S = 5 / 120;
  const G = 1.35;
  const st = [20, 50, 74, 94, 112];
  const du = [26, 20, 17, 15, 28];
  return (
    <AbsoluteFill>
      <Scene3D cx={2 * G} cy={2.6} d={17}>
        {YEARS.map((y, i) => {
          const h = y.v * S * grow(f, st[i], du[i]);
          const last = i === 4;
          return (
            <React.Fragment key={y.l}>
              <Bar x={i * G} h={h} w={0.95} d={0.95} color={last ? K.green : PALE} />
              {f >= st[i] + 4 && <Label text={fmt(y.v * grow(f, st[i], du[i]))} height={0.3} position={[i * G, h + 0.4, 0]} color={last ? K.green : K.sub} />}
              {f >= st[i] && <Label text={y.l} height={0.28} position={[i * G, 0.02, 0.95]} rotation={[-Math.PI / 2, 0, 0]} color={last ? K.ink : K.sub} />}
            </React.Fragment>
          );
        })}
      </Scene3D>
      <Text2D at={4} size={46} top="9%" left="50%" color={K.sub} weight={700}>① 今回の結果</Text2D>
      <Text2D at={150} size={64} top="15%" left="50%" weight={700}>営業利益</Text2D>
      <Text2D at={158} size={150} top="22.5%" left="50%" color={K.green}>+42.9%</Text2D>
      <Text2D at={176} size={44} top="30%" left="50%" color={K.sub} weight={700}>84億円 → 120億円・過去最高</Text2D>
      <Text2D at={200} size={46} top="88%" left="50%" weight={700} band>
        売上も 1,000億円（+11.1%）→ <span style={{ color: K.green }}>増収増益</span>
      </Text2D>
    </AbsoluteFill>
  );
};

// ② 理由：前年の利益から、事業ごとの増えた分を積んで今年へ
const STEPS = [
  { l: 'A事業', v: 28, main: true },
  { l: 'B事業', v: 6 },
  { l: 'C事業', v: 2 },
];
const Why: React.FC = () => {
  const f = useCurrentFrame();
  const S = 5 / 120;
  const G = 1.35;
  const base = 84;
  const st = [60, 110, 140];
  const endAt = 175;
  let cum = base;
  return (
    <AbsoluteFill>
      <Scene3D cx={2 * G} cy={2.8} d={17}>
        <Bar x={0} h={base * S * grow(f, 6, 24)} w={0.95} d={0.95} color={K.gray} />
        {f >= 10 && <Label text="84" height={0.3} position={[0, base * S + 0.4, 0]} color={K.sub} />}
        <Label text="前年" height={0.28} position={[0, 0.02, 0.95]} rotation={[-Math.PI / 2, 0, 0]} color={K.sub} />
        {STEPS.map((s, i) => {
          const y0 = cum * S;
          cum += s.v;
          const t = f - st[i];
          if (t < 0) return <Label key={s.l} text={s.l} height={0.26} position={[(i + 1) * G, 0.02, 0.95]} rotation={[-Math.PI / 2, 0, 0]} color={K.sub} opacity={0.6} />;
          const p = Math.min(1, t / 12);
          const drop = (1 - p * p) * 4;
          const col = s.main ? K.green : '#86d19f';
          return (
            <React.Fragment key={s.l}>
              <Bar x={(i + 1) * G} y0={y0 + drop} h={s.v * S} w={0.95} d={0.95} color={col} />
              {p >= 1 && <Label text={`+${s.v}`} height={s.main ? 0.4 : 0.3} position={[(i + 1) * G, y0 + s.v * S + 0.45, 0]} color={s.main ? K.green : K.sub} />}
              <Label text={s.l} height={0.28} position={[(i + 1) * G, 0.02, 0.95]} rotation={[-Math.PI / 2, 0, 0]} color={s.main ? K.green : K.sub} />
            </React.Fragment>
          );
        })}
        <Bar x={4 * G} h={120 * S * grow(f, endAt, 24)} w={0.95} d={0.95} color={K.green} />
        {f >= endAt + 10 && <Label text="120" height={0.34} position={[4 * G, 120 * S + 0.42, 0]} color={K.green} />}
        <Label text="今年" height={0.28} position={[4 * G, 0.02, 0.95]} rotation={[-Math.PI / 2, 0, 0]} color={f >= endAt ? K.ink : K.sub} />
      </Scene3D>
      <Text2D at={4} size={46} top="9%" left="50%" color={K.sub} weight={700}>② なぜ増えた？</Text2D>
      <Text2D at={st[0] + 14} size={72} top="16%" left="50%">
        <span style={{ color: K.green }}>A事業</span>が +28億円
      </Text2D>
      <Text2D at={st[0] + 26} size={44} top="22.5%" left="50%" color={K.sub} weight={700}>増えた分の約8割</Text2D>
      <Text2D at={st[0] + 30} size={44} top="88%" left="50%" weight={700} band>新製品が売れて、主力のA事業が伸びた</Text2D>
    </AbsoluteFill>
  );
};

// ③ この先：来期の会社予想（予想は薄い色）
const Next: React.FC = () => {
  const f = useCurrentFrame();
  const S = 5 / 150;
  const G = 1.8;
  const fh = 150 * S * grow(f, 40, 30);
  return (
    <AbsoluteFill>
      <Scene3D cx={G / 2} cy={2.8} d={15}>
        <Bar x={0} h={120 * S * grow(f, 6, 22)} w={1.1} d={1.1} color={K.green} />
        {f >= 14 && <Label text="120" height={0.32} position={[0, 120 * S + 0.42, 0]} color={K.green} />}
        <Label text="今期の実績" height={0.26} position={[0, 0.02, 1.0]} rotation={[-Math.PI / 2, 0, 0]} color={K.ink} />
        <Bar x={G} h={fh} w={1.1} d={1.1} color={K.green} opacity={0.4} />
        {f >= 50 && <Label text={fmt(150 * grow(f, 40, 30))} height={0.32} position={[G, fh + 0.42, 0]} color={K.green} />}
        <Label text="来期の予想" height={0.26} position={[G, 0.02, 1.0]} rotation={[-Math.PI / 2, 0, 0]} color={K.sub} />
      </Scene3D>
      <Text2D at={4} size={46} top="9%" left="50%" color={K.sub} weight={700}>③ この先は？</Text2D>
      <Text2D at={80} size={72} top="16%" left="50%">
        来期も<span style={{ color: K.green }}>増益</span>の予想
      </Text2D>
      <Text2D at={92} size={44} top="22.5%" left="50%" color={K.sub} weight={700}>営業利益 120億円 → 150億円（+25%）</Text2D>
    </AbsoluteFill>
  );
};

// まとめ：3行＋本編へ
const Sum: React.FC = () => {
  const f = useCurrentFrame();
  const rows = [
    ['結果', '増収増益・過去最高益'],
    ['理由', '主力のA事業が伸びた'],
    ['この先', '来期も増益の予想'],
  ];
  return (
    <AbsoluteFill style={{ background: K.bg, fontFamily: FONT }}>
      <Text2D at={2} size={56} top="22%" left="50%" weight={900}>今回の決算まとめ</Text2D>
      {rows.map(([k, v], i) => {
        const at = 14 + i * 10;
        const o = interpolate(f, [at, at + 8], [0, 1], clamp);
        const x = interpolate(f, [at, at + 12], [40, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={k} style={{ position: 'absolute', top: `${33 + i * 9}%`, left: 110, right: 110, opacity: o, transform: `translateX(${x}px)`, display: 'flex', alignItems: 'center', gap: 28, background: '#fff', borderRadius: 20, padding: '26px 36px', boxShadow: '0 8px 30px rgba(15,23,42,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 34, color: '#fff', background: K.blue, borderRadius: 12, padding: '6px 18px', minWidth: 110, textAlign: 'center' }}>{k}</div>
            <div style={{ fontWeight: 700, fontSize: 46, color: K.ink }}>{v}</div>
          </div>
        );
      })}
      <Text2D at={60} size={56} top="68%" left="50%" weight={900}>くわしい解説は本編で</Text2D>
      <Text2D at={72} size={40} top="74%" left="50%" color={K.blue} weight={700}>▶ 数字の中身と、注目ポイント</Text2D>
    </AbsoluteFill>
  );
};

export const ShortResult: React.FC = () => {
  const [hd] = useState(() => delayRender('fonts'));
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const more = '①②③今回の結果なぜ増えた？この先は来期予想実績上方修正増収増益過去最高益事業伸びた新製品が売れて主力約割まとめ理由くわしい解説は本編で数字中身と注目ポイント前年今年';
    Promise.all([document.fonts.load(`900 100px ${FONT}`, CHARS + more), document.fonts.load(`700 100px ${FONT}`, CHARS + more)]).then(() => {
      setOk(true);
      continueRender(hd);
    });
  }, [hd]);
  if (!ok) return null;
  const a = LEN.result;
  const b = a + LEN.why;
  const c = b + LEN.next;
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <Sequence durationInFrames={LEN.result}><Result /></Sequence>
      <Sequence from={a} durationInFrames={LEN.why}><Why /></Sequence>
      <Sequence from={b} durationInFrames={LEN.next}><Next /></Sequence>
      <Sequence from={c} durationInFrames={LEN.sum}><Sum /></Sequence>
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 34, color: K.ink }}>
        サンプル株式会社｜2026年3月期 決算
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 28, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 26, color: 'rgba(17,24,39,0.45)' }}>
        サンプル（架空の会社・数値）
      </div>
    </AbsoluteFill>
  );
};
