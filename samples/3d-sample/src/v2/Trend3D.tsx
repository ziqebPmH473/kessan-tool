import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { CameraRig, RenderAfter, fmt, prog } from '../lib';
import { Bar, Heading, K, Label, LightStage, Text2D } from './kit';

// 業績の推移：いまの棒グラフをそのまま立体に。1年ずつ、だんだん速く伸びる
const Y = [
  { l: '2023年3月期', rev: 800, op: 75, m: 9.4 },
  { l: '2024年3月期', rev: 850, op: 68, m: 8.0 },
  { l: '2025年3月期', rev: 900, op: 84, m: 9.3 },
  { l: '2026年3月期', rev: 1000, op: 120, m: 12.0 },
  { l: '2027年3月期(予)', rev: 1100, op: 150, m: 13.6, fc: true },
];
const GAP = 3;
const SCALE = 5 / 1100;
const START = [8, 62, 104, 138, 166];
const GROW = [44, 36, 30, 26, 34];
const OVER_A = 205, OVER_B = 270;
const LINE_A = 280, LINE_B = 340;
const PUSH_A = 352;
export const TREND_LEN = 450;

const ease = (f: number, a: number, d: number) => {
  // 少し行き過ぎて戻る伸び方
  const t = Math.min(1, Math.max(0, (f - a) / d));
  const e = 1 - (1 - t) ** 3;
  return e + Math.sin(Math.min(1, t) * Math.PI) * 0.04;
};
const lineY = (m: number) => 5.7 + (m - 7) * 0.42;

const MarginLine: React.FC<{ p: number }> = ({ p }) => {
  const pts = useMemo(() => Y.map((y, i) => new THREE.Vector3(i * GAP, lineY(y.m), 0)), []);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2), [pts]);
  const geo = useMemo(() => {
    if (p <= 0.01) return null;
    const n = Math.max(2, Math.round(p * 80));
    const sub = curve.getPoints(80).slice(0, n + 1);
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sub), n * 2, 0.06, 10, false);
  }, [p, curve]);
  useLayoutEffect(() => () => geo?.dispose(), [geo]);
  return (
    <>
      {geo && (
        <mesh geometry={geo} castShadow>
          <meshStandardMaterial color={K.orange} roughness={0.4} />
        </mesh>
      )}
      {Y.map((y, i) =>
        p > 0.01 && p * (Y.length - 1) >= i - 0.02 ? (
          <React.Fragment key={i}>
            <mesh position={[i * GAP, lineY(y.m), 0]} castShadow>
              <sphereGeometry args={[0.16, 24, 24]} />
              <meshStandardMaterial color="#fff" emissive={K.orange} emissiveIntensity={0.15} />
            </mesh>
            <Label text={`${y.m.toFixed(1)}%`} height={0.3} position={[i * GAP, lineY(y.m) + 0.5, 0]} color={K.orange} />
          </React.Fragment>
        ) : null,
      )}
    </>
  );
};

export const Trend3D: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // カメラ：低い位置で伸びる棒を追い → 引いて全体 → 最後の2年へ寄る
  const follow = START.reduce((a, s, i) => (i === 0 ? 0 : a + prog(f, s - 10, s + 12)), 0);
  const tx = follow * GAP;
  const ov = prog(f, OVER_A, OVER_B);
  const pu = prog(f, PUSH_A, TREND_LEN - 10, Easing.inOut(Easing.quad));
  const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
  let pos = lerp3([tx - 4.2, 3.4, 10], [6, 6.8, 16.5], ov);
  let look = lerp3([tx + 0.6, 2.2, 0], [6, 3.4, 0], ov);
  pos = lerp3(pos, [8.0, 7.4, 11.5], pu);
  look = lerp3(look, [10.2, 5.4, 0], pu);

  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="soft" flat camera={{ fov: 40, position: pos }}>
        <LightStage center={[6, 0, 0]} shadowSize={14} />
        <CameraRig pos={pos} look={look} />
        {Y.map((y, i) => {
          const gr = ease(f, START[i], GROW[i]);
          const go = ease(f, START[i] + 6, GROW[i]);
          const x = i * GAP;
          const rh = y.rev * SCALE * gr;
          const oh = y.op * SCALE * go;
          const op = y.fc ? 0.38 : 1;
          return (
            <React.Fragment key={y.l}>
              <Bar x={x - 0.55} h={rh} color={K.blue} opacity={op} />
              <Bar x={x + 0.55} h={oh} color={K.green} opacity={op} />
              {f >= START[i] && (
                <>
                  <Label text={fmt(y.rev * Math.min(1, gr))} height={0.3} position={[x - 0.55, rh + 0.4, 0]} color={K.blue} />
                  <Label text={fmt(y.op * Math.min(1, go))} height={0.3} position={[x + 0.55, oh + 0.4, 0]} color={K.green} />
                  <Label text={y.l} height={0.3} position={[x, 0.02, 1.25]} rotation={[-Math.PI / 2, 0, 0]} color={y.fc ? K.sub : K.ink} />
                </>
              )}
            </React.Fragment>
          );
        })}
        <MarginLine p={prog(f, LINE_A, LINE_B, Easing.inOut(Easing.quad))} />
        <RenderAfter />
      </ThreeCanvas>
      <Heading text="業績の推移" />
      <div style={{ position: 'absolute', top: 60, right: 64, display: 'flex', gap: 28, fontFamily: '"Noto Sans JP"', fontWeight: 700, fontSize: 26, color: K.sub }}>
        <span><span style={{ color: K.blue }}>■</span> 売上高</span>
        <span><span style={{ color: K.green }}>■</span> 営業利益</span>
        <span><span style={{ color: K.orange }}>━</span> 営業利益率</span>
      </div>
      <Text2D at={LINE_A + 10} out={PUSH_A - 6} size={44} top="89%" left="50%" weight={700} band>利益率も、上向きに</Text2D>
      <Text2D at={PUSH_A + 20} size={50} top="89%" left="50%" weight={900} band>
        営業利益率 12.0% → <span style={{ color: K.orange }}>13.6%</span>（会社予想）
      </Text2D>
    </AbsoluteFill>
  );
};

void interpolate;
