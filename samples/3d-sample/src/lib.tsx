import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

export const C = {
  bg: '#0b1530',
  white: '#ffffff',
  yellow: '#ffc107',
  orange: '#ff9800',
  red: '#e91e8c',
  green: '#4caf50',
  blue: '#2196f3',
  water: '#3fa9f5',
  gold: '#ffb300',
};

export const FONT = '"Noto Sans JP", sans-serif';

// 動画に出てくる文字（フォントを先に読み込むため）
export const CHARS =
  '0123456789,.+-−%（）()／|｜→ 億円年月期営業利益売上高原価販管費残ったのは率なぜここまで伸びたか？サンプル株式会社決算過去最高減益上方修正初予想会社の数字が動く見てわかる解説※値架空ですPL損益構造業績推移割合ポイント1枚に5';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 0→1 のなめらかな進み
export const prog = (f: number, a: number, b: number, ease = Easing.inOut(Easing.cubic)) =>
  interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });

// 着地の衝撃で揺れる（決まった値なので毎回同じ）
export const shake = (f: number, hits: number[], amp = 0.25, dur = 14) => {
  let x = 0;
  let y = 0;
  for (const h of hits) {
    const t = f - h;
    if (t < 0 || t > dur) continue;
    const k = amp * (1 - t / dur) ** 2;
    x += Math.sin(t * 2.7 + h) * k;
    y += Math.cos(t * 3.3 + h * 0.7) * k;
  }
  return [x, y] as const;
};

export const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

// カメラを毎コマ置き直す
export const CameraRig: React.FC<{ pos: [number, number, number]; look: [number, number, number]; fov?: number }> = ({
  pos,
  look,
  fov = 40,
}) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(...pos);
    (camera as THREE.PerspectiveCamera).fov = fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    camera.lookAt(...look);
  });
  return null;
};

// 子の更新が終わってから描き直す（必ず Canvas の最後の子に置く）
export const RenderAfter: React.FC = () => {
  const { advance } = useThree();
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    advance(performance.now());
  }, [frame, advance]);
  return null;
};

// 白い立体文字（キャンバスに厚みを重ねて描き、板に貼る）
export const TextPlane: React.FC<{
  text: string;
  height: number; // 1行の高さ（3D上の長さ）
  color?: string;
  ext?: string;
  position?: [number, number, number];
  anchor?: 'center' | 'left' | 'right';
  opacity?: number;
  weight?: number;
  rotation?: [number, number, number];
}> = ({ text, height, color = C.white, ext = '#8a96ad', position = [0, 0, 0], anchor = 'center', opacity = 1, weight = 900, rotation = [0, 0, 0] }) => {
  const { tex, aspect } = useMemo(() => {
    const px = 160;
    const depth = Math.round(px * 0.07);
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = `${weight} ${px}px ${FONT}`;
    const w = Math.ceil(ctx.measureText(text).width) + depth + px * 0.3;
    const h = Math.ceil(px * 1.4) + depth;
    c.width = w;
    c.height = h;
    ctx.font = `${weight} ${px}px ${FONT}`;
    ctx.textBaseline = 'middle';
    const x0 = px * 0.15;
    const y0 = h / 2 - depth / 2;
    for (let k = depth; k >= 1; k--) {
      ctx.fillStyle = ext;
      ctx.fillText(text, x0 + k * 0.5, y0 + k);
    }
    ctx.lineWidth = px * 0.05;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(text, x0, y0);
    ctx.fillStyle = color;
    ctx.fillText(text, x0, y0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { tex: t, aspect: w / h };
  }, [text, color, ext, weight]);
  useLayoutEffect(() => () => tex.dispose(), [tex]);
  const H = height * 1.4;
  const W = H * aspect;
  const dx = anchor === 'left' ? W / 2 : anchor === 'right' ? -W / 2 : 0;
  return (
    <mesh position={[position[0] + dx, position[1], position[2]]} rotation={rotation} renderOrder={10}>
      <planeGeometry args={[W, H]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};

// たくさんの小さな物（水の粒・積み木）を一度に描く
export type Inst = { p: [number, number, number]; s?: number; r?: [number, number, number] } | null;
export const Instances: React.FC<{
  count: number;
  get: (i: number) => Inst;
  geometry: 'sphere' | 'box';
  size: number;
  color: string;
  emissive?: string;
  metal?: number;
  dims?: [number, number, number];
}> = ({ count, get, geometry, size, color, emissive, metal = 0.1, dims }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      const r = get(i);
      if (!r) {
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0.0001);
      } else {
        dummy.position.set(...r.p);
        dummy.scale.setScalar(r.s ?? 1);
        dummy.rotation.set(...(r.r ?? [0, 0, 0]));
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  void frame;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      {geometry === 'sphere' ? <sphereGeometry args={[size, 10, 10]} /> : <boxGeometry args={dims ?? [size, size, size]} />}
      <meshStandardMaterial color={color} emissive={emissive ?? '#000'} emissiveIntensity={emissive ? 0.35 : 0} roughness={0.35} metalness={metal} />
    </instancedMesh>
  );
};

export const Stage: React.FC<{ floorY?: number }> = ({ floorY = 0 }) => (
  <>
    <color attach="background" args={[C.bg]} />
    <fog attach="fog" args={[C.bg, 25, 70]} />
    <ambientLight intensity={0.55} />
    <directionalLight position={[6, 14, 10]} intensity={1.6} />
    <directionalLight position={[-8, 6, -4]} intensity={0.5} color="#7fb2ff" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY - 0.01, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#101d3d" roughness={0.9} />
    </mesh>
    <gridHelper args={[200, 100, '#2a3d6b', '#1a2b52']} position={[0, floorY, 0]} />
  </>
);

// 文字を読ませたいときに背景を暗くする
export const Dim: React.FC<{ at: number; to?: number }> = ({ at, to = 0.6 }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [at, at + 10], [0, to], clamp);
  return <div style={{ position: 'absolute', inset: 0, background: '#050b1c', opacity: o }} />;
};

// 画面の上に重ねる立体風の文字（HTML）
export const Pop: React.FC<{
  children: React.ReactNode;
  at: number; // 出るコマ
  size: number;
  color?: string;
  ext?: string;
  top?: string;
  left?: string;
  out?: number; // 消えるコマ
  slam?: boolean; // 大きい所から叩きつける
}> = ({ children, at, size, color = C.white, ext = '#7d8aa3', top = '50%', left = '50%', out, slam }) => {
  const f = useCurrentFrame();
  const t = f - at;
  if (t < 0) return null;
  const sIn = slam
    ? interpolate(t, [0, 6, 10], [2.4, 0.92, 1], { ...clamp, easing: Easing.out(Easing.quad) })
    : interpolate(t, [0, 7, 11], [0.6, 1.08, 1], clamp);
  const oIn = interpolate(t, [0, 4], [0, 1], clamp);
  const oOut = out != null ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1;
  const d = Math.round(size * 0.07);
  const shadow =
    Array.from({ length: d }, (_, k) => `${(k + 1) * 0.5}px ${k + 1}px 0 ${ext}`).join(',') +
    `, 0 ${d + 6}px 24px rgba(0,0,0,0.55)`;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `translate(-50%,-50%) scale(${sIn})`,
        opacity: oIn * oOut,
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: size,
        color,
        textShadow: shadow,
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
        WebkitTextStroke: `${Math.max(1, size * 0.012)}px rgba(0,0,0,0.25)`,
      }}
    >
      {children}
    </div>
  );
};
