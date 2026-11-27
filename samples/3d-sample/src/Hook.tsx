import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { C, CameraRig, Dim, Instances, Pop, RenderAfter, Stage, prog, shake } from './lib';

// 冒頭：結果を先に見せる（営業利益 +42%）
const IMPACT = 24;

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const rise = spring({ frame: f - 8, fps, config: { damping: 9, stiffness: 140 } });
  const colH = 0.1 + rise * 6;
  const [sx, sy] = shake(f, [IMPACT, IMPACT + 9], 0.35);
  const push = prog(f, 0, 150, Easing.out(Easing.quad));
  const camZ = interpolate(push, [0, 1], [16, 12]);
  const camY = interpolate(push, [0, 1], [2.2, 3.4]);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} camera={{ fov: 40, position: [0, 3, 16] }}>
        <Stage floorY={0} />
        <CameraRig pos={[sx - 1.0, camY + sy, camZ]} look={[-3.6, 3, 0]} />
        {/* 前年の利益（低い柱） */}
        <mesh position={[-1.4, 2.1, 0]}>
          <boxGeometry args={[1.6, 4.2, 1.6]} />
          <meshStandardMaterial color="#5c6f99" roughness={0.5} />
        </mesh>
        {/* 今年の利益（伸びる柱） */}
        <mesh position={[1.4, colH / 2, 0]}>
          <boxGeometry args={[1.6, colH, 1.6]} />
          <meshStandardMaterial color={C.gold} emissive={C.orange} emissiveIntensity={0.25} metalness={0.3} roughness={0.3} />
        </mesh>
        {/* 着地で飛び散る破片 */}
        <Instances
          count={60}
          geometry="box"
          size={0.16}
          color={C.yellow}
          emissive={C.orange}
          get={(i) => {
            const t = (f - IMPACT) / fps;
            if (t < 0 || t > 1.6) return null;
            const a = (i / 60) * Math.PI * 2 + i * 0.37;
            const v = 3 + ((i * 7) % 5);
            const up = 4 + ((i * 3) % 6);
            const x = 1.4 + Math.cos(a) * v * t;
            const z = Math.sin(a) * v * t;
            const y = Math.max(0.08, 5.6 + up * t - 9.8 * t * t);
            return { p: [x, y, z], s: 1 - t / 1.8, r: [t * 6 + i, t * 4, i] };
          }}
        />
        <RenderAfter />
      </ThreeCanvas>
      <AbsoluteFill style={{ transform: `translate(${sx * 30}px, ${sy * 30}px)` }}>
        <Pop at={IMPACT - 6} size={110} top="18%" left="30%" out={92}>営業利益</Pop>
        <Pop at={IMPACT} size={260} top="40%" left="30%" color={C.yellow} ext="#c56a00" slam out={92}>+42%</Pop>
        <Pop at={50} size={46} top="62%" left="30%" out={92}>前年 84億円 → 今年 120億円</Pop>
        <Dim at={92} />
        <Pop at={96} size={120} top="44%">なぜ、ここまで伸びたのか？</Pop>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
