import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { C, CHARS, FONT } from './lib';
import { Hook } from './Hook';
import { Water } from './Water';
import { STACK_LEN, Stack } from './Stack';
import { REV_LEN, Revision } from './Revision';

export const HOOK_LEN = 150;
export const WATER_LEN = 390;
export const TOTAL = HOOK_LEN + WATER_LEN + STACK_LEN + REV_LEN;

// 場面のつなぎ（白く光って切り替わる）
const Flash: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [at - 4, at, at + 8], [0, 0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: '#fff', opacity: o, pointerEvents: 'none' }} />;
};

export const Sample: React.FC = () => {
  const [handle] = useState(() => delayRender('fonts'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([
      document.fonts.load(`900 100px ${FONT}`, CHARS),
      document.fonts.load(`700 100px ${FONT}`, CHARS),
    ]).then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [handle]);
  if (!ready) return null;
  const s1 = HOOK_LEN;
  const s2 = s1 + WATER_LEN;
  const s3 = s2 + STACK_LEN;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Sequence durationInFrames={HOOK_LEN}>
        <Hook />
      </Sequence>
      <Sequence from={s1} durationInFrames={WATER_LEN}>
        <Water />
      </Sequence>
      <Sequence from={s2} durationInFrames={STACK_LEN}>
        <Stack />
      </Sequence>
      <Sequence from={s3} durationInFrames={REV_LEN}>
        <Revision />
      </Sequence>
      <Flash at={s1} />
      <Flash at={s2} />
      <Flash at={s3} />
      <div style={{ position: 'absolute', right: 28, bottom: 20, fontFamily: FONT, fontWeight: 700, fontSize: 22, color: 'rgba(255,255,255,0.6)' }}>
        サンプル株式会社（架空）｜数値は架空です
      </div>
    </AbsoluteFill>
  );
};
