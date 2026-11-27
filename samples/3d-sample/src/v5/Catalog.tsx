import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { FONT } from '../lib';
import { K } from '../v2/kit';
import { Kpi3D } from './parts2';
import { PARTS } from './registry';
import { Short } from './Short';
import type { ShortData } from './types';

// 部品カタログ：全部の部品を、主役版（6秒）→ さらっと版（2.4秒）の順に並べて見る
const ORDER = ['kpi', 'trend', 'loss', 'segments', 'pl', 'forecast', 'revision', 'quarter', 'bs', 'cf', 'stock', 'points', 'topic'] as const;
const MAIN = 180;
const BRIEF = 72;
export const CATALOG_LEN = ORDER.length * (MAIN + BRIEF);
const NAMES: Record<string, string> = {
  kpi: '決算ハイライト', trend: '業績の推移', loss: '赤字転落', segments: '事業ごとの売上', pl: '売上→利益の構造', forecast: '来期の会社予想',
  revision: '予想の修正', quarter: '四半期単独', bs: '貸借対照表', cf: 'キャッシュフロー', stock: '株価の反応', points: '注目ポイント', topic: '数字以外',
};

export const Catalog: React.FC<{ data: ShortData }> = ({ data }) => (
  <Short data={data} plan={{ verdict: '', verdict_tone: 'neutral', headline: '', main: 'trend', brief: [], captions: {}, summary: ['', '', ''] }} only={
    <AbsoluteFill style={{ background: K.bg }}>
      {ORDER.map((id, i) => {
        const P = id === 'kpi' ? Kpi3D : PARTS[id];
        const at = i * (MAIN + BRIEF);
        return (
          <React.Fragment key={id}>
            <Sequence from={at} durationInFrames={MAIN}><P d={data} mode="main" dur={MAIN} /></Sequence>
            <Sequence from={at + MAIN} durationInFrames={BRIEF}><P d={data} mode="brief" dur={BRIEF} /></Sequence>
            <Sequence from={at} durationInFrames={MAIN + BRIEF}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 30, color: K.blue }}>
                部品 {i + 1}/{ORDER.length}：{NAMES[id]}
              </div>
            </Sequence>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  } />
);
