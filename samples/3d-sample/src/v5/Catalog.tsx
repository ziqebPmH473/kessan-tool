import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { FONT } from '../lib';
import { K } from '../v2/kit';
import { Kpi3D } from './parts2';
import { PARTS, PART_NAMES, available } from './registry';
import { Short } from './Short';
import type { PartId, ShortData } from './types';

// 部品カタログ：全部の部品を、主役版（6秒）→ さらっと版（2.4秒）の順に並べて見る
// その会社の材料で使えない部品は「この会社では使わない」と出す（長さは変えない）
const ORDER = ['kpi', 'trend', 'loss', 'segments', 'segprofit', 'pl', 'margin', 'netgap', 'forecast', 'progress', 'revision', 'dividend', 'quarter', 'bs', 'cf', 'stock', 'ratings', 'points', 'topic'] as const;
const MAIN = 180;
const BRIEF = 72;
export const CATALOG_LEN = ORDER.length * (MAIN + BRIEF);
export const catalogAt = (id: (typeof ORDER)[number]) => ORDER.indexOf(id) * (MAIN + BRIEF);

const NotUsed: React.FC<{ name: string }> = ({ name }) => (
  <AbsoluteFill style={{ fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ fontWeight: 900, fontSize: 56, color: K.sub }}>{name}</div>
    <div style={{ fontWeight: 700, fontSize: 40, color: K.sub, marginTop: 24 }}>この会社の材料では使わない部品</div>
  </AbsoluteFill>
);

export const Catalog: React.FC<{ data: ShortData; note?: string }> = ({ data, note }) => (
  <Short data={data} note={note} plan={{ verdict: '', verdict_tone: 'neutral', headline: '', main: 'trend', brief: [], captions: {}, summary: ['', '', ''] }} only={
    <AbsoluteFill style={{ background: K.bg }}>
      {ORDER.map((id, i) => {
        const ok = id === 'kpi' || available(data, id as PartId);
        const P = id === 'kpi' ? Kpi3D : PARTS[id];
        const name = id === 'kpi' ? '決算ハイライト' : PART_NAMES[id as PartId];
        const at = i * (MAIN + BRIEF);
        return (
          <React.Fragment key={id}>
            {ok ? (
              <>
                <Sequence from={at} durationInFrames={MAIN}><P d={data} mode="main" dur={MAIN} /></Sequence>
                <Sequence from={at + MAIN} durationInFrames={BRIEF}><P d={data} mode="brief" dur={BRIEF} /></Sequence>
              </>
            ) : (
              <Sequence from={at} durationInFrames={MAIN + BRIEF}><NotUsed name={name} /></Sequence>
            )}
            <Sequence from={at} durationInFrames={MAIN + BRIEF}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 30, color: K.blue }}>
                部品 {i + 1}/{ORDER.length}：{name}
              </div>
            </Sequence>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  } />
);
