import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { interpolate, useCurrentFrame } from 'remotion';
import { FONT } from '../lib';

// いまの分析動画の色（白地・青・緑・赤）
export const K = {
  bg: '#eef1f6',
  floor: '#f6f7fa',
  ink: '#111827',
  sub: '#6b7280',
  blue: '#2563eb',
  green: '#16a34a',
  red: '#dc2626',
  teal: '#0f766e',
  orange: '#f59e0b',
  gray: '#cbd5e1',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 白いスタジオ：やわらかい光と影、床は奥で背景に溶ける
export const LightStage: React.FC<{ shadowSize?: number; center?: [number, number, number] }> = ({ shadowSize = 14, center = [0, 0, 0] }) => (
  <>
    <color attach="background" args={[K.bg]} />
    <fog attach="fog" args={[K.bg, 18, 48]} />
    <hemisphereLight args={['#ffffff', '#e6ebf3', 1.25]} />
    <directionalLight
      position={[center[0] + 6, 14, center[2] + 9]}
      intensity={1.7}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-shadowSize}
      shadow-camera-right={shadowSize}
      shadow-camera-top={shadowSize}
      shadow-camera-bottom={-shadowSize}
      shadow-bias={-0.0004}
      shadow-radius={6}
    >
      <object3D attach="target" position={center} />
    </directionalLight>
    <directionalLight position={[-8, 5, 6]} intensity={0.35} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[300, 300]} />
      <meshStandardMaterial color={K.bg} roughness={1} />
    </mesh>
  </>
);

// 角の丸い棒（下の面が y0）
export const Bar: React.FC<{
  x: number;
  z?: number;
  y0?: number;
  h: number;
  w?: number;
  d?: number;
  color: string;
  opacity?: number;
}> = ({ x, z = 0, y0 = 0, h, w = 0.9, d = 0.9, color, opacity = 1 }) => {
  const hh = Math.max(0.02, Math.round(h * 100) / 100);
  const geo = useMemo(() => new RoundedBoxGeometry(w, hh, d, 3, Math.min(0.06, hh / 2.5)), [w, hh, d]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  if (h <= 0.005) return null;
  return (
    <mesh geometry={geo} position={[x, y0 + hh / 2, z]} castShadow={opacity > 0.9} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
};

// 3D の中に置く文字（飾らない。背景の札つきも可）
export const Label: React.FC<{
  text: string;
  height: number;
  position: [number, number, number];
  color?: string;
  pill?: string; // 背景の色
  weight?: number;
  opacity?: number;
  rotation?: [number, number, number];
}> = ({ text, height, position, color = K.ink, pill, weight = 700, opacity = 1, rotation = [0, 0, 0] }) => {
  const { tex, aspect } = useMemo(() => {
    const px = 140;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = `${weight} ${px}px ${FONT}`;
    const padX = pill ? px * 0.45 : px * 0.1;
    const w = Math.ceil(ctx.measureText(text).width + padX * 2);
    const h = Math.ceil(px * 1.45);
    c.width = w;
    c.height = h;
    if (pill) {
      ctx.fillStyle = pill;
      const r = h / 2;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, r);
      ctx.fill();
    }
    ctx.font = `${weight} ${px}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, padX, h / 2 + px * 0.04);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { tex: t, aspect: w / h };
  }, [text, color, pill, weight]);
  useLayoutEffect(() => () => tex.dispose(), [tex]);
  const H = height * 1.45;
  return (
    <mesh position={position} rotation={rotation} renderOrder={10}>
      <planeGeometry args={[H * aspect, H]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};

// 画面に重ねる文字（いまの動画と同じ、すっきりした文字）
export const Text2D: React.FC<{
  at: number;
  out?: number;
  size: number;
  color?: string;
  top: string;
  left: string;
  align?: 'left' | 'center';
  weight?: number;
  rise?: boolean;
  band?: boolean;
  children: React.ReactNode;
}> = ({ at, out, size, color = K.ink, top, left, align = 'center', weight = 900, rise = true, band, children }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const o = interpolate(f, [at, at + 8], [0, 1], clamp) * (out != null ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1);
  const y = rise ? interpolate(f, [at, at + 12], [24, 0], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 }) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `translate(${align === 'center' ? '-50%' : '0'}, calc(-50% + ${y}px))`,
        opacity: o,
        fontFamily: FONT,
        fontWeight: weight,
        fontSize: size,
        color,
        whiteSpace: 'nowrap',
        letterSpacing: '0.01em',
        ...(band ? { background: 'rgba(255,255,255,0.88)', padding: '10px 32px', borderRadius: 14, boxShadow: '0 6px 24px rgba(15,23,42,0.08)' } : {}),
      }}
    >
      {children}
    </div>
  );
};

// 見出し（いまの動画と同じ：左に青い線）
export const Heading: React.FC<{ text: string; out?: number }> = ({ text, out }) => {
  const f = useCurrentFrame();
  const o = out != null ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1;
  return (
    <div style={{ position: 'absolute', top: 48, left: 64, display: 'flex', alignItems: 'center', gap: 16, opacity: o }}>
      <div style={{ width: 8, height: 46, background: K.blue, borderRadius: 2 }} />
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 44, color: K.ink }}>{text}</div>
    </div>
  );
};
