import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { C, CameraRig, Dim, Instances, Pop, RenderAfter, Stage, TextPlane, prog, shake } from './lib';

// 業績予想の修正：期初の予想 130億円 → 上方修正で 150億円（積み木 1個＝5億円）
const S = 0.42;
const W = 1.6;
const BASE = 26;
const ADD = 4;
const B_A = 8, B_B = 44;
const ADD_AT = [70, 86, 98, 108]; // 追加の積み木（だんだん間隔が短く）
const DROP = 9;
export const REV_LEN = 230;

export const Revision: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const [sx, sy] = shake(
    f,
    ADD_AT.map((t) => t + DROP),
    0.12,
    10,
  );
  const [bx, by] = shake(f, [ADD_AT[3] + DROP], 0.32, 18);
  const top = (BASE + ADD) * S;
  const k = prog(f, 0, 120, Easing.out(Easing.quad));
  const camPos: [number, number, number] = [
    interpolate(k, [0, 1], [2.5, 4.5]) + sx + bx,
    interpolate(k, [0, 1], [5, 8.5]) + sy + by,
    interpolate(k, [0, 1], [22, 20]),
  ];
  const look: [number, number, number] = [3.2, interpolate(k, [0, 1], [4.6, 6.0]), 0];
  const cube = (i: number) => {
    if (i < BASE) {
      const t0 = B_A + (i / BASE) * (B_B - B_A);
      const p = Math.min(1, Math.max(0, (f - t0) / 6));
      if (f < t0) return null;
      return { p: [0, S / 2 + i * S + (1 - p) * 3, 0] as [number, number, number], s: 1 };
    }
    const j = i - BASE;
    const t = f - ADD_AT[j];
    if (t < 0) return null;
    const p = Math.min(1, t / DROP);
    return { p: [0, S / 2 + i * S + (1 - p * p) * 9, 0] as [number, number, number], r: [0, (1 - p) * 2, 0] as [number, number, number] };
  };
  const done = f >= ADD_AT[3] + DROP;
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} camera={{ fov: 40, position: [0, 5, 16] }}>
        <Stage floorY={0} />
        <CameraRig pos={camPos} look={look} />
        <Instances count={BASE} geometry="box" size={S} dims={[W, S * 0.92, W]} color="#dfe8ff" get={(i) => cube(i)} />
        <Instances count={ADD} geometry="box" size={S} dims={[W, S * 0.92, W]} color={C.gold} emissive={C.orange} metal={0.3} get={(i) => cube(BASE + i)} />
        {/* 期初予想の高さの線 */}
        {f >= B_B && (
          <mesh position={[-0.8, BASE * S, 0]}>
            <boxGeometry args={[4, 0.04, 0.04]} />
            <meshBasicMaterial color="#9fb0d0" />
          </mesh>
        )}
        {f >= B_B && <TextPlane text="期初の予想 130億円" height={0.34} position={[-1.0, BASE * S - 0.4, 0]} anchor="right" weight={700} />}
        {done && <TextPlane text="150億円" height={0.5} position={[1.0, top + 0.05, 0]} anchor="left" color={C.yellow} ext="#a35400" />}
        <RenderAfter />
      </ThreeCanvas>
      <AbsoluteFill style={{ transform: `translate(${(sx + bx) * 30}px, ${(sy + by) * 30}px)` }}>
        <Pop at={4} size={44} top="7%" left="13%" out={150}>今期の会社予想</Pop>
        <Pop at={ADD_AT[3] + DROP} size={170} top="30%" left="68%" color={C.yellow} ext="#c56a00" slam out={160}>上方修正</Pop>
        <Pop at={ADD_AT[3] + DROP + 14} size={56} top="48%" left="68%" out={160}>130億円 → 150億円（+15%）</Pop>
        <Dim at={156} to={0.75} />
        <Pop at={166} size={72} top="40%">数字の動きが、目で見てわかる</Pop>
        <Pop at={180} size={34} top="56%" color="#c9d3e6" ext="#3b4766">※ 見せ方のサンプルです。数値はすべて架空です</Pop>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
