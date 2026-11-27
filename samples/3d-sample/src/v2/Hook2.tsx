import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { CameraRig, RenderAfter, prog } from '../lib';
import { Bar, K, Label, LightStage, Text2D } from './kit';

// 冒頭：いちばんの数字を先に見せる（低い位置から見上げる）
export const HOOK2_LEN = 96;

export const Hook2: React.FC = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const g = spring({ frame: f - 6, fps, config: { damping: 14, stiffness: 90 } });
  const prevH = (84 / 120) * 5;
  const curH = 5 * g;
  const t = prog(f, 0, HOOK2_LEN, Easing.out(Easing.quad));
  const th = interpolate(t, [0, 1], [-0.75, -0.35]);
  const R = interpolate(t, [0, 1], [11.5, 10]);
  const c: [number, number, number] = [0.6, 0, 0];
  const pos: [number, number, number] = [c[0] + Math.sin(th) * R, interpolate(t, [0, 1], [0.9, 1.6]), c[2] + Math.cos(th) * R];
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="soft" flat camera={{ fov: 38, position: pos }}>
        <LightStage center={c} shadowSize={8} />
        <CameraRig pos={pos} look={[2.6, 2.6, 0]} fov={38} />
        <Bar x={-0.1} h={prevH} w={1.1} d={1.1} color={K.gray} />
        <Bar x={1.4} h={curH} w={1.1} d={1.1} color={K.green} />
        <Label text="前年" height={0.26} position={[-0.1, prevH + 0.35, 0]} color={K.sub} />
        {f > 20 && <Label text="今年" height={0.26} position={[1.4, curH + 0.35, 0]} color={K.green} />}
        <RenderAfter />
      </ThreeCanvas>
      <Text2D at={14} size={64} top="30%" left="55%" align="left" weight={700}>営業利益</Text2D>
      <Text2D at={22} size={210} top="47%" left="54%" align="left" color={K.green}>+42.9%</Text2D>
      <Text2D at={40} size={44} top="64%" left="55.5%" align="left" color={K.sub} weight={700}>84.0億円 → 120億円</Text2D>
    </AbsoluteFill>
  );
};
