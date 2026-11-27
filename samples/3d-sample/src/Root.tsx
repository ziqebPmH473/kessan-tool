import React from 'react';
import { Composition } from 'remotion';
import { Sample, TOTAL } from './Sample';
import { Sample2, TOTAL2 } from './v2/Sample2';
import { SHORT_LEN, ShortWater } from './v3/ShortWater';
import { SHORT2_LEN, ShortResult } from './v4/ShortResult';

export const Root: React.FC = () => (
  <>
    <Composition id="Sample" component={Sample} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Sample2" component={Sample2} durationInFrames={TOTAL2} fps={30} width={1920} height={1080} />
    <Composition id="ShortWater" component={ShortWater} durationInFrames={SHORT_LEN} fps={30} width={1080} height={1920} />
    <Composition id="ShortResult" component={ShortResult} durationInFrames={SHORT2_LEN} fps={30} width={1080} height={1920} />
  </>
);
