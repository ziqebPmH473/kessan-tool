import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { CHARS, FONT } from '../lib';
import { K } from './kit';
import { HOOK2_LEN, Hook2 } from './Hook2';
import { TREND_LEN, Trend3D } from './Trend3D';
import { WF_LEN, Waterfall3D } from './Waterfall3D';

export const TOTAL2 = HOOK2_LEN + WF_LEN + TREND_LEN;
const MORE = '前年今年会社予想利益率も上向きに損益の構造売上総利益原価販管費業績の推移残った営業利益は営業利益率';

const Fade: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [at - 6, at, at + 8], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: K.bg, opacity: o }} />;
};

export const Sample2: React.FC = () => {
  const [h] = useState(() => delayRender('fonts'));
  const [ok, setOk] = useState(false);
  useEffect(() => {
    Promise.all([document.fonts.load(`900 100px ${FONT}`, CHARS + MORE), document.fonts.load(`700 100px ${FONT}`, CHARS + MORE)]).then(() => {
      setOk(true);
      continueRender(h);
    });
  }, [h]);
  if (!ok) return null;
  const a = HOOK2_LEN;
  const b = a + WF_LEN;
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <Sequence durationInFrames={HOOK2_LEN}><Hook2 /></Sequence>
      <Sequence from={a} durationInFrames={WF_LEN}><Waterfall3D /></Sequence>
      <Sequence from={b} durationInFrames={TREND_LEN}><Trend3D /></Sequence>
      <Fade at={a} />
      <Fade at={b} />
      <div style={{ position: 'absolute', right: 28, bottom: 18, fontFamily: FONT, fontWeight: 700, fontSize: 22, color: 'rgba(17,24,39,0.45)' }}>
        サンプル（架空の会社・数値）
      </div>
    </AbsoluteFill>
  );
};
