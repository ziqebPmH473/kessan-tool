import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { AbsoluteFill, Easing, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { CHARS, CameraRig, FONT, Instances, RenderAfter, fmt, prog } from '../lib';
import { K, Label, LightStage, Text2D } from '../v2/kit';

// 超ショート（縦）：売上の水が原価・販管費へ流れ出て、残りが営業利益。くわしくは本編へ
const SALES = 1000, COST = 600, SGA = 280, OP = 120;
const H = 3.6 / SALES; // 同じ底面積なので、水の高さ＝金額
const TW = 2.3, TD = 1.6;
const COST_A = 70, COST_B = 170;
const SGA_A = 190, SGA_B = 260;
const OP_A = 280, OP_B = 330;
const END_A = 420;
export const SHORT_LEN = 540;

const Tank: React.FC<{ x: number; y: number; h: number; level: number; color: string }> = ({ x, y, h, level, color }) => {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(TW, h, TD)), [h]);
  return (
    <group position={[x, y, 0]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[TW, h, TD]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.35} roughness={0.1} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} position={[0, h / 2, 0]}>
        <lineBasicMaterial color="#94a3b8" />
      </lineSegments>
      {level > 0.005 && (
        <mesh position={[0, level / 2 + 0.01, 0]}>
          <boxGeometry args={[TW - 0.05, level, TD - 0.05]} />
          <meshStandardMaterial color={color} transparent opacity={0.88} roughness={0.2} />
        </mesh>
      )}
    </group>
  );
};

const stream = (f: number, i: number, n: number, from: number, to: number, a: [number, number], b: [number, number], seed: number) => {
  const travel = 20;
  const t0 = from + (i / n) * (to - from - travel * 0.4);
  const p = (f - t0) / travel;
  if (p < 0 || p > 1) return null;
  const j = Math.sin(i * 12.9898 + seed) * 0.08;
  const k = Math.cos(i * 78.233 + seed) * 0.35;
  return { p: [a[0] + (b[0] - a[0]) * Math.sqrt(p) + j, a[1] + (b[1] - a[1]) * p * p, k] as [number, number, number] };
};

export const ShortWater: React.FC = () => {
  const [hd] = useState(() => delayRender('fonts'));
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const more = '売上利益はいくら残る？原価販管費営業前年比くわしい解説は本編で決算の数字を見るサンプル株式会社';
    Promise.all([document.fonts.load(`900 100px ${FONT}`, CHARS + more), document.fonts.load(`700 100px ${FONT}`, CHARS + more)]).then(() => {
      setOk(true);
      continueRender(hd);
    });
  }, [hd]);
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (!ok) return null;

  const cost = COST * prog(f, COST_A + 8, COST_B, Easing.inOut(Easing.quad));
  const sga = SGA * prog(f, SGA_A + 8, SGA_B, Easing.inOut(Easing.quad));
  const op = OP * prog(f, OP_A + 10, OP_B, Easing.in(Easing.quad));
  const remain = SALES - cost - sga - op;
  const fill = prog(f, 6, 40, Easing.out(Easing.cubic)); // 最初に売上の水が満ちる

  // カメラはほぼ固定。最後に利益へ少しだけ寄る
  const pu = 0; // 投資の動画なのでカメラは動かさない
  const pos: [number, number, number] = [0, interpolate(pu, [0, 1], [6.4, 4.6]), interpolate(pu, [0, 1], [20, 18.5])];
  const look: [number, number, number] = [0, interpolate(pu, [0, 1], [5.0, 3.2]), 0];
  const fade = interpolate(f, [END_A, END_A + 10], [1, 0.12], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <AbsoluteFill style={{ opacity: fade }}>
        <ThreeCanvas width={width} height={height} shadows="soft" flat camera={{ fov: 40, position: pos }}>
          <LightStage center={[0, 0, 0]} shadowSize={8} />
          <CameraRig pos={pos} look={look} />
          {f < OP_B + 14 && <Tank x={0} y={4.6} h={3.9} level={remain * H * fill} color={K.blue} />}
          {f < OP_B + 14 && <Label text={`売上高 ${fmt(SALES)}億円`} height={0.36} position={[0, 9.05, 0]} color={K.blue} />}
          <Tank x={-2.6} y={0} h={2.5} level={cost * H} color={K.red} />
          {f >= COST_A && <Label text="売上原価" height={0.3} position={[-2.6, 3.2, 0]} color={K.red} />}
          {f >= COST_A && <Label text={`−${fmt(cost)}億円`} height={0.3} position={[-2.6, 2.75, 0]} color={K.red} />}
          <Tank x={2.6} y={0} h={2.5} level={sga * H} color="#ea580c" />
          {f >= SGA_A && <Label text="販管費" height={0.3} position={[2.6, 3.2, 0]} color="#ea580c" />}
          {f >= SGA_A && <Label text={`−${fmt(sga)}億円`} height={0.3} position={[2.6, 2.75, 0]} color="#ea580c" />}
          <Tank x={0} y={0} h={1.2} level={op * H} color={K.green} />
          {f >= OP_A && <Label text="営業利益" height={0.3} position={[0, 1.95, 0]} color={K.green} />}
          {f >= OP_A && <Label text={`${fmt(op)}億円`} height={0.3} position={[0, 1.5, 0]} color={K.green} />}
          <Instances count={150} geometry="sphere" size={0.075} color={K.red} get={(i) => stream(f, i, 150, COST_A, COST_B + 8, [-1.1, 4.7], [-2.6, 0.2 + cost * H], 1)} />
          <Instances count={100} geometry="sphere" size={0.075} color="#ea580c" get={(i) => stream(f, i, 100, SGA_A, SGA_B + 8, [1.1, 4.7], [2.6, 0.2 + sga * H], 2)} />
          <Instances count={70} geometry="sphere" size={0.075} color={K.green} get={(i) => {
            const r = stream(f, i, 70, OP_A, OP_B + 6, [0, 4.6], [0, 0.1 + op * H], 3);
            if (r) r.p[0] *= 0.2;
            return r;
          }} />
          <RenderAfter />
        </ThreeCanvas>
      </AbsoluteFill>

      {/* 上の文字 */}
      <Text2D at={0} size={40} top="6%" left="50%" color={K.sub} weight={700} rise={false}>サンプル株式会社｜2026年3月期</Text2D>
      <Text2D at={4} out={OP_B} size={76} top="12%" left="50%">売上 1,000億円</Text2D>
      <Text2D at={14} out={OP_B} size={76} top="17.5%" left="50%">利益はいくら残る？</Text2D>
      {/* 下の字幕 */}
      <Text2D at={COST_A + 6} out={SGA_A - 8} size={50} top="88%" left="50%" weight={700} band>6割は「売上原価」へ</Text2D>
      <Text2D at={SGA_A + 6} out={OP_A - 8} size={50} top="88%" left="50%" weight={700} band>販管費に 280億円</Text2D>
      <Text2D at={OP_B + 20} out={END_A} size={64} top="11%" left="50%" weight={700}>残った営業利益</Text2D>
      <Text2D at={OP_B + 28} out={END_A} size={190} top="19%" left="50%" color={K.green}>120億円</Text2D>
      <Text2D at={OP_B + 44} out={END_A} size={48} top="27%" left="50%" color={K.sub} weight={700}>売上の 12.0%（前年比 +42.9%）</Text2D>
      {/* 締め：本編へ */}
      <Text2D at={END_A + 8} size={64} top="44%" left="50%">くわしい解説は本編で</Text2D>
      <Text2D at={END_A + 20} size={46} top="52%" left="50%" color={K.blue} weight={700}>▶ 決算の数字を、見てわかる</Text2D>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 28, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 26, color: 'rgba(17,24,39,0.45)' }}>
        サンプル（架空の会社・数値）
      </div>
    </AbsoluteFill>
  );
};
