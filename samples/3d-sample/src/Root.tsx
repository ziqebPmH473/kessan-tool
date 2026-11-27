import React from 'react';
import { Composition } from 'remotion';
import { Sample, TOTAL } from './Sample';

export const Root: React.FC = () => (
  <Composition id="Sample" component={Sample} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
);
