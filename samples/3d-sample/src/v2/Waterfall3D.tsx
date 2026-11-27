import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { CameraRig, RenderAfter, fmt, prog } from '../lib';
import { Bar, Heading, K, Label, LightStage, Text2D } from './kit';

// 損益の構造：売上の棒から、費用の分が抜け出して横へ移る。最後に残るのが営業利益
const S = 5 / 1000;
const GAP = 2.4;
const SALES = 1000, COST = 600, GROSS = 400, SGA = 280, OP = 120;

const T = {
  sales: [6, 30],
  cost: [44, 92], // 抜け出して移る
  gross: [98, 122],
  sga: [134, 170],
  op: [178, 200],
  push: [206, 280],
};
export const WF_LEN = 330;

// 抜け出す：横へ滑りながら少し浮いて、着地で軽く沈む
const slide = (f: number, a: number, b: number, fromX: number, toX: number) => {
  const t = prog(f, a, b, Easing.inOut(Easing.cubic));
  const lift = Math.sin(t * Math.PI) * 0.7;
  const land = f > b ? Math.max(0, 1 - (f - b) / 8) * Math.sin((f - b) * 0.9) * -0.06 : 0;
  return { x: fromX + (toX - fromX) * t, dy: lift + land, t };
};

export const Waterfall3D: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const salesH = SALES * S * prog(f, T.sales[0], T.sales[1], Easing.out(Easing.cubic));
  const c = slide(f, T.cost[0], T.cost[1], 0, GAP);
  const grossH = GROSS * S * prog(f, T.gross[0], T.gross[1], Easing.out(Easing.cubic));
  const s = slide(f, T.sga[0], T.sga[1], 2 * GAP, 3 * GAP);
  const opG = prog(f, T.op[0], T.op[1], Easing.out(Easing.back(2.2)));
  const opH = OP * S * opG;

  // カメラ：動きのある所を追い、最後は営業利益へ低く寄る
  const step = prog(f, T.cost[0], T.cost[1]) + prog(f, T.gross[0] - 6, T.gross[1]) + prog(f, T.sga[0], T.sga[1]) + prog(f, T.op[0] - 6, T.op[1]);
  const tx = step * GAP;
  const pu = prog(f, T.push[0], T.push[1], Easing.inOut(Easing.cubic));
  const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
  const pos = lerp3([tx - 2.6, 4.6, 12], [4 * GAP + 0.2, 2.0, 6.4], pu);
  const look = lerp3([tx + 0.6, 2.3, 0], [4 * GAP + 2.8, 1.1, 0], pu);

  const tag = (on: boolean, txt: string, x: number, y: number, color: string) =>
    on ? <Label text={txt} height={0.32} position={[x, y + 0.42, 0]} color={color} /> : null;
  const name = (on: boolean, txt: string, x: number, color = K.ink) =>
    on ? <Label text={txt} height={0.3} position={[x, 0.02, 1.15]} rotation={[-Math.PI / 2, 0, 0]} color={color} /> : null;

  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="soft" flat camera={{ fov: 40, position: pos }}>
        <LightStage center={[2 * GAP, 0, 0]} shadowSize={12} />
        <CameraRig pos={pos} look={look} />
        {/* 売上高 */}
        <Bar x={0} h={salesH} color={K.blue} w={1.3} d={1.3} />
        {tag(f >= T.sales[0], fmt(SALES * (salesH / (SALES * S))), 0, salesH, K.blue)}
        {name(f >= T.sales[0], '売上高', 0, K.blue)}
        {/* 売上原価：売上の上の部分から抜け出す */}
        {f >= T.cost[0] && <Bar x={c.x} y0={GROSS * S + c.dy} h={COST * S} color={K.red} w={1.28} d={1.28} />}
        {tag(c.t > 0.9, `−${fmt(COST)}`, GAP, SALES * S, K.red)}
        {name(c.t > 0.9, '売上原価', GAP, K.red)}
        {/* 売上総利益 */}
        <Bar x={2 * GAP} h={grossH} color={K.teal} w={1.3} d={1.3} />
        {tag(f >= T.gross[0], fmt(GROSS * (grossH / (GROSS * S))), 2 * GAP, grossH, K.teal)}
        {name(f >= T.gross[0], '売上総利益', 2 * GAP, K.teal)}
        {/* 販管費 */}
        {f >= T.sga[0] && <Bar x={s.x} y0={OP * S + s.dy} h={SGA * S} color={K.red} w={1.28} d={1.28} />}
        {tag(s.t > 0.9, `−${fmt(SGA)}`, 3 * GAP, GROSS * S, K.red)}
        {name(s.t > 0.9, '販管費', 3 * GAP, K.red)}
        {/* 営業利益 */}
        <Bar x={4 * GAP} h={opH} color={K.green} w={1.3} d={1.3} />
        {tag(f >= T.op[0] + 4, fmt(OP), 4 * GAP, OP * S, K.green)}
        {name(f >= T.op[0], '営業利益', 4 * GAP, K.green)}
        <RenderAfter />
      </ThreeCanvas>
      <Heading text="損益の構造" />
      <Text2D at={T.cost[0] + 4} out={T.gross[0] - 8} size={44} top="89%" left="50%" weight={700} band>売上 1,000億円のうち、600億円は原価</Text2D>
      <Text2D at={T.sga[0] + 4} out={T.op[0] - 8} size={44} top="89%" left="50%" weight={700} band>さらに販管費が 280億円</Text2D>
      <Text2D at={T.push[0] + 30} size={60} top="30%" left="60%" align="left" weight={700}>残った営業利益は</Text2D>
      <Text2D at={T.push[0] + 40} size={170} top="46%" left="60%" align="left" color={K.green}>120億円</Text2D>
      <Text2D at={T.push[0] + 56} size={48} top="62%" left="60%" align="left" color={K.sub} weight={700}>売上の 12.0%（前年は 9.3%）</Text2D>
    </AbsoluteFill>
  );
};

void interpolate;
