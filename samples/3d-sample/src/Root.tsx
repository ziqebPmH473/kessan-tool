import React from 'react';
import { Composition } from 'remotion';
import { Sample, TOTAL } from './Sample';
import { Sample2, TOTAL2 } from './v2/Sample2';
import { SHORT_LEN, ShortWater } from './v3/ShortWater';
import { SHORT2_LEN, ShortResult } from './v4/ShortResult';
import { SHORT_TOTAL, Short } from './v5/Short';
import { CATALOG_LEN, Catalog } from './v5/Catalog';
import { GROW, LOSS, MID, PLAN_GROW_SEG, PLAN_GROW_TREND, PLAN_LOSS, PLAN_MID, PLAN_TURN, TURN } from './v5/examples';

export const Root: React.FC = () => (
  <>
    <Composition id="Sample" component={Sample} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Sample2" component={Sample2} durationInFrames={TOTAL2} fps={30} width={1920} height={1080} />
    <Composition id="ShortWater" component={ShortWater} durationInFrames={SHORT_LEN} fps={30} width={1080} height={1920} />
    <Composition id="ShortResult" component={ShortResult} durationInFrames={SHORT2_LEN} fps={30} width={1080} height={1920} />
    <Composition id="Parts-Grow-Trend" component={Short} defaultProps={{ data: GROW, plan: PLAN_GROW_TREND }} durationInFrames={SHORT_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Parts-Grow-Seg" component={Short} defaultProps={{ data: GROW, plan: PLAN_GROW_SEG }} durationInFrames={SHORT_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Catalog-Grow" component={Catalog} defaultProps={{ data: GROW }} durationInFrames={CATALOG_LEN} fps={30} width={1080} height={1920} />
    <Composition id="Catalog-Loss" component={Catalog} defaultProps={{ data: LOSS }} durationInFrames={CATALOG_LEN} fps={30} width={1080} height={1920} />
    <Composition id="Parts-Loss" component={Short} defaultProps={{ data: LOSS, plan: PLAN_LOSS }} durationInFrames={SHORT_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Parts-Mid" component={Short} defaultProps={{ data: MID, plan: PLAN_MID }} durationInFrames={SHORT_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Parts-Turn" component={Short} defaultProps={{ data: TURN, plan: PLAN_TURN }} durationInFrames={SHORT_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Catalog-Mid" component={Catalog} defaultProps={{ data: MID }} durationInFrames={CATALOG_LEN} fps={30} width={1080} height={1920} />
    <Composition id="Catalog-Turn" component={Catalog} defaultProps={{ data: TURN }} durationInFrames={CATALOG_LEN} fps={30} width={1080} height={1920} />
  </>
);
