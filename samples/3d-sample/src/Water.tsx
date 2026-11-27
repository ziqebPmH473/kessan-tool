import React, { useMemo } from 'react';
import * as THREE from 'three';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { C, CameraRig, Instances, Pop, RenderAfter, Stage, TextPlane, fmt, prog, shake } from './lib';

// 損益の構造：売上の水が、原価・販管費へ流れ出て、残りが利益
const SALES = 1000;
const COST = 600;
const SGA = 280;
const OP = SALES - COST - SGA; // 120
const H_PER = 3 / SALES; // 水の高さ（同じ底面積なら量に比例）

const COST_A = 40, COST_B = 150;
const SGA_A = 170, SGA_B = 245;
const OP_A = 262, OP_B = 318;
const LAND = OP_B + 4;

const Tank: React.FC<{ x: number; y: number; w: number; h: number; level: number; color: string; emissive?: string }> = ({
  x, y, w, h, level, color, emissive,
}) => {
  const edges = useMemo(() => new THREE.BoxGeometry(w, h, 2), [w, h]);
  return (
  <group position={[x, y, 0]}>
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[w, h, 2]} />
      <meshStandardMaterial color="#9fc4ff" transparent opacity={0.1} depthWrite={false} />
    </mesh>
    <lineSegments position={[0, h / 2, 0]}>
      <edgesGeometry args={[edges]} />
      <lineBasicMaterial color="#cfe0ff" />
    </lineSegments>
    {level > 0.005 && (
      <mesh position={[0, level / 2, 0]}>
        <boxGeometry args={[w - 0.06, level, 1.94]} />
        <meshStandardMaterial color={color} emissive={emissive ?? color} emissiveIntensity={0.25} transparent opacity={0.85} roughness={0.15} />
      </mesh>
    )}
  </group>
  );
};

// 出口 a → 受け皿 b へ落ちる水の粒
const stream = (f: number, i: number, n: number, from: number, to: number, a: [number, number], b: [number, number], seed: number) => {
  const travel = 22;
  const t0 = from + (i / n) * (to - from - travel * 0.3);
  const p = (f - t0) / travel;
  if (p < 0 || p > 1) return null;
  const j = Math.sin(i * 12.9898 + seed) * 0.18;
  const k = Math.cos(i * 78.233 + seed) * 0.5;
  const x = a[0] + (b[0] - a[0]) * Math.sqrt(p) + j;
  const y = a[1] + (b[1] - a[1]) * p * p;
  return { p: [x, y, k] as [number, number, number], s: 1 };
};

export const Water: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const pc = prog(f, COST_A + 10, COST_B, Easing.inOut(Easing.quad));
  const ps = prog(f, SGA_A + 10, SGA_B, Easing.inOut(Easing.quad));
  const po = prog(f, OP_A + 12, OP_B, Easing.in(Easing.quad));
  const cost = COST * pc;
  const sga = SGA * ps;
  const op = OP * po;
  const remain = SALES - cost - sga - op;

  // カメラ：上の水槽 → 全体 → 下の利益へ寄る
  const k1 = prog(f, 30, 110);
  const k2 = prog(f, 248, 318);
  const camPos: [number, number, number] = [
    0,
    interpolate(k1, [0, 1], [8.2, 5.6]) + interpolate(k2, [0, 1], [0, -2.2]),
    interpolate(k1, [0, 1], [11, 20.5]) + interpolate(k2, [0, 1], [0, -10.5]),
  ];
  const look: [number, number, number] = [0, interpolate(k1, [0, 1], [6.4, 3.4]) + interpolate(k2, [0, 1], [0, -0.4]), 0];
  const [sx, sy] = shake(f, [LAND], 0.18);
  camPos[0] += sx;
  camPos[1] += sy;

  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} camera={{ fov: 40, position: [0, 6, 20] }}>
        <Stage floorY={0} />
        <CameraRig pos={camPos} look={look} />

        {/* 売上の水槽 */}
        <Tank x={0} y={5} w={4} h={3.3} level={remain * H_PER} color={C.water} />
        <TextPlane text="売上高" height={0.5} position={[0, 9.15, 0]} />
        <TextPlane text={`${fmt(SALES)}億円`} height={0.42} position={[0, 8.55, 0]} color="#cfe6ff" />

        {/* 原価の受け皿 */}
        <Tank x={-6} y={0} w={4} h={2.2} level={cost * H_PER} color={C.red} />
        <TextPlane text="売上原価" height={0.5} position={[-6, 3.1, 0]} opacity={interpolate(f, [COST_A, COST_A + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
        <TextPlane text={`−${fmt(cost)}億円`} height={0.46} position={[-6, 2.5, 0]} color="#ff8cc6" ext="#7a1048" opacity={f >= COST_A ? 1 : 0} />

        {/* 販管費の受け皿 */}
        <Tank x={6} y={0} w={4} h={2.2} level={sga * H_PER} color={C.blue} />
        <TextPlane text="販管費" height={0.5} position={[6, 3.1, 0]} opacity={f >= SGA_A ? 1 : 0} />
        <TextPlane text={`−${fmt(sga)}億円`} height={0.46} position={[6, 2.5, 0]} color="#9fd0ff" ext="#0d3f7a" opacity={f >= SGA_A ? 1 : 0} />

        {/* 利益のタンク */}
        <Tank x={0} y={0} w={4} h={1.1} level={op * H_PER} color={C.gold} emissive={C.orange} />
        <TextPlane text="営業利益" height={0.42} position={[0, 1.95, 0]} opacity={f >= OP_A ? 1 : 0} />
        <TextPlane text={`${fmt(op)}億円`} height={0.42} position={[0, 1.4, 0]} color={C.yellow} ext="#a35400" opacity={f >= OP_A ? 1 : 0} />

        {/* 流れ */}
        <Instances count={160} geometry="sphere" size={0.13} color={C.red} emissive={C.red}
          get={(i) => stream(f, i, 160, COST_A, COST_B + 10, [-2, 5.4], [-6, 0.4 + cost * H_PER], 1)} />
        <Instances count={110} geometry="sphere" size={0.13} color={C.blue} emissive={C.blue}
          get={(i) => stream(f, i, 110, SGA_A, SGA_B + 10, [2, 5.4], [6, 0.4 + sga * H_PER], 2)} />
        <Instances count={80} geometry="sphere" size={0.13} color={C.gold} emissive={C.orange}
          get={(i) => {
            const r = stream(f, i, 80, OP_A, OP_B + 6, [0, 5], [0, 0.1 + op * H_PER], 3);
            if (r) r.p[0] *= 0.35;
            return r;
          }} />
        <RenderAfter />
      </ThreeCanvas>

      <AbsoluteFill style={{ transform: `translate(${sx * 30}px, ${sy * 30}px)` }}>
        <Pop at={4} size={60} top="86%" out={30}>売上 1,000億円は、どこへ行く？</Pop>
        <Pop at={COST_A + 20} size={56} top="86%" out={SGA_A - 6}>まず 6割が「売上原価」に</Pop>
        <Pop at={SGA_A + 14} size={56} top="86%" out={OP_A - 6}>さらに「販管費」に 280億円</Pop>
        <Pop at={LAND} size={72} top="9%">残ったのは</Pop>
        <Pop at={LAND + 8} size={190} top="24%" color={C.yellow} ext="#c56a00" slam>120億円</Pop>
        <Pop at={LAND + 26} size={54} top="39%">売上のたった 12%</Pop>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
