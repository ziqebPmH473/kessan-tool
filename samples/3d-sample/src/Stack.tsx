import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { C, CameraRig, Instances, Pop, RenderAfter, Stage, TextPlane, prog, shake } from './lib';

// 業績の推移：年ごとの利益を積み木で積む（1個＝5億円）。年が進むほど速く積む
const YEARS = [
  { y: '22年3月期', v: 60 },
  { y: '23年3月期', v: 75 },
  { y: '24年3月期', v: 68 },
  { y: '25年3月期', v: 84 },
  { y: '26年3月期', v: 120 },
];
const UNIT = 5;
const S = 0.42; // 積み木の高さ
const W = 1.3; // 積み木の幅（板のように重ねる）
const GAP = 2.6; // 柱の間隔
const DUR = [88, 64, 56, 42, 46]; // 年ごとの積む時間（だんだん速く）
const PAUSE = 16;
const DROP = 9; // 1個が落ちるコマ数

// 年ごとの開始コマ
const START: number[] = [];
{
  let t = 8;
  for (const d of DUR) {
    START.push(t);
    t += d + PAUSE;
  }
}
// 減益の年：前年と同じ15個まで積んでから、上の1個が落ちる（14個 ≒ 68億円）
const DOWN = 2;
const DOWN_SHOW = 15;
const FALLN = 1;
const DOWN_FALL = START[2] + DUR[2] + 4;

const cubesOf = (i: number) => (i === DOWN ? DOWN_SHOW : Math.round(YEARS[i].v / UNIT));
const doneAt = (i: number) => START[i] + DUR[i];
const LAST_LAND = doneAt(4);
export const STACK_LEN = LAST_LAND + 100;

export const Stack: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // いま積んでいる年
  let cur = 0;
  for (let i = 0; i < YEARS.length; i++) if (f >= START[i]) cur = i;

  // 着地の揺れ（最後の年は1個ごとに小さく、最後に大きく）
  const hits: number[] = [];
  for (let k = 0; k < cubesOf(4); k++) hits.push(START[4] + (k / cubesOf(4)) * DUR[4] + DROP);
  const [sx1, sy1] = shake(f, hits, 0.04, 6);
  const [sx2, sy2] = shake(f, [LAST_LAND + DROP, DOWN_FALL + 22], 0.3, 18);
  const sx = sx1 + sx2;
  const sy = sy1 + sy2;

  // カメラ：いまの柱を追い、最後に引いて全体を見せる
  const end = prog(f, LAST_LAND + 30, LAST_LAND + 85, Easing.inOut(Easing.cubic));
  const follow = YEARS.reduce((a, _, i) => (i === 0 ? 0 : a + prog(f, START[i] - 12, START[i] + 10)), 0);
  const fi = Math.floor(follow);
  const fr = follow - fi;
  const hOf = (i: number) => cubesOf(Math.min(4, i)) * S;
  const colTop = hOf(fi) * (1 - fr) + hOf(fi + 1) * fr;
  const fx = interpolate(follow, [0, 4], [0, 4 * GAP]);
  const camPos: [number, number, number] = [
    interpolate(end, [0, 1], [fx - 3.4, 2 * GAP - 1.5]) + sx,
    interpolate(end, [0, 1], [colTop * 0.5 + 2.6, 7.2]) + sy,
    interpolate(end, [0, 1], [13 + follow * 0.9, 22]),
  ];
  const look: [number, number, number] = [
    interpolate(end, [0, 1], [fx + 0.4, 2 * GAP - 1.5]),
    interpolate(end, [0, 1], [colTop * 0.5 + 0.6, 4.6]),
    0,
  ];

  // 積み木の位置
  const all: { col: number; k: number }[] = [];
  YEARS.forEach((_, i) => {
    for (let k = 0; k < cubesOf(i); k++) all.push({ col: i, k });
  });
  const cubeAt = (col: number, k: number) => {
    const t0 = START[col] + (k / cubesOf(col)) * DUR[col];
    const t = f - t0;
    if (t < 0) return null;
    const p = Math.min(1, t / DROP);
    const yTarget = S / 2 + k * S;
    let x = col * GAP;
    let y = yTarget + (1 - p * p) * 7;
    let r: [number, number, number] = [0, 0, 0];
    // 減益：上の1個がすべり落ちる
    if (col === DOWN && k >= DOWN_SHOW - FALLN) {
      const ft = (f - DOWN_FALL - (k - (DOWN_SHOW - FALLN)) * 5) / 30;
      if (ft > 0) {
        const q = Math.min(1, ft);
        x += q * 1.2;
        y = Math.max(S / 2 + (k - (DOWN_SHOW - FALLN)) * 0.01, yTarget - q * q * yTarget);
        r = [0, 0, -q * 1.6];
      }
    }
    return { p: [x, y, 0] as [number, number, number], r };
  };
  const pick = (pred: (c: { col: number; k: number }) => boolean) => all.filter(pred);
  const past = pick((c) => c.col < 4 && c.col !== DOWN);
  const down = pick((c) => c.col === DOWN);
  const last = pick((c) => c.col === 4);

  const shown = (i: number) => f >= doneAt(i) + 2;
  const label = (i: number) => {
    const v = YEARS[i].v;
    return `${v}億円`;
  };

  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} camera={{ fov: 40, position: [0, 4, 14] }}>
        <Stage floorY={0} />
        <CameraRig pos={camPos} look={look} />
        <Instances count={past.length} geometry="box" size={S} dims={[W, S * 0.92, W]} color="#dfe8ff" get={(i) => cubeAt(past[i].col, past[i].k)} />
        <Instances count={down.length} geometry="box" size={S} dims={[W, S * 0.92, W]} color="#ff9fc9" emissive={C.red} get={(i) => cubeAt(down[i].col, down[i].k)} />
        <Instances count={last.length} geometry="box" size={S} dims={[W, S * 0.92, W]} color={C.gold} emissive={C.orange} metal={0.3} get={(i) => cubeAt(last[i].col, last[i].k)} />
        {YEARS.map((yr, i) => (
          <React.Fragment key={yr.y}>
            {f >= START[i] && <TextPlane text={yr.y} height={0.36} position={[i * GAP, 0.02, 1.25]} rotation={[-Math.PI / 2, 0, 0]} weight={700} />}
            {shown(i) && (
              <TextPlane
                text={label(i)}
                height={0.42}
                position={[i * GAP, Math.round(yr.v / UNIT) * S + 0.55, 0]}
                color={i === 4 ? C.yellow : i === DOWN ? '#ff8cc6' : C.white}
                ext={i === 4 ? '#a35400' : i === DOWN ? '#7a1048' : '#8a96ad'}
              />
            )}
          </React.Fragment>
        ))}
        <RenderAfter />
      </ThreeCanvas>

      <AbsoluteFill style={{ transform: `translate(${sx * 30}px, ${sy * 30}px)` }}>
        {/* 年の数字が進んでいく */}
        <Pop at={START[0]} size={44} top="7%" left="13%">営業利益の推移</Pop>
        <Pop at={START[cur]} size={96} top="14%" left="78%" key={cur} out={cur === 4 ? LAST_LAND + 30 : undefined}>
          {YEARS[cur].y}
        </Pop>
        <Pop at={DOWN_FALL + 18} size={84} top="28%" left="78%" color="#ff8cc6" ext="#7a1048" out={START[3] + 10}>減益 −9%</Pop>
        <Pop at={LAST_LAND + DROP} size={130} top="16%" left="30%" color={C.yellow} ext="#c56a00" slam>過去最高益</Pop>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
