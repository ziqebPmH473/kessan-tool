import React from 'react';
import { Composition } from 'remotion';
import { Sample, TOTAL } from './Sample';
import { Sample2, TOTAL2 } from './v2/Sample2';
import { SHORT_LEN, ShortWater } from './v3/ShortWater';
import { SHORT2_LEN, ShortResult } from './v4/ShortResult';
import { SHORT_TOTAL, Short } from './v5/Short';
import { CATALOG_LEN, Catalog } from './v5/Catalog';
import { Video, videoFrames } from './v5/Video';
import { autoPlan } from './v5/autoPlan';
import type { ShortData } from './v5/types';
import { GROW, LOSS, MID, PLAN_GROW_SEG, PLAN_GROW_TREND, PLAN_LOSS, PLAN_MID, PLAN_TURN, TURN } from './v5/examples';

// 組み立て方をAIでなく材料から決める超ショート
const AutoShort: React.FC<{ data: ShortData; note?: string }> = ({ data, note }) => <Short data={data} plan={autoPlan(data)} note={note} />;

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
    {/* 横の分析動画（3Dの部品で組む）と、AIを使わない超ショート。props の data を差しかえれば実データでも出せる */}
    <Composition id="Video-Mid" component={Video} defaultProps={{ data: MID as ShortData }} calculateMetadata={({ props }) => ({ durationInFrames: videoFrames(props.data) })} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition id="Video-Turn" component={Video} defaultProps={{ data: TURN as ShortData }} calculateMetadata={({ props }) => ({ durationInFrames: videoFrames(props.data) })} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition id="Auto-Mid" component={AutoShort} defaultProps={{ data: MID as ShortData }} durationInFrames={SHORT_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Auto-Turn" component={AutoShort} defaultProps={{ data: TURN as ShortData }} durationInFrames={SHORT_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Catalog-Mid" component={Catalog} defaultProps={{ data: MID }} durationInFrames={CATALOG_LEN} fps={30} width={1080} height={1920} />
    <Composition id="Catalog-Turn" component={Catalog} defaultProps={{ data: TURN }} durationInFrames={CATALOG_LEN} fps={30} width={1080} height={1920} />
  </>
);
