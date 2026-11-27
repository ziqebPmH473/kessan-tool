import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { CHARS, FONT } from '../lib';
import { K } from '../v2/kit';
import { available } from './availability';
import { PartProps, setUnit, useLand } from './parts';
import { Kpi3D } from './parts2';
import { CoverPart, ConclusionPart } from './parts5';
import { PARTS } from './registry';
import { PART_TEXT } from './Short';
import type { PartId, ShortData } from './types';

// 分析動画（縦 1080×1920 が基本。横 1920×1080 も）を3Dの部品で組む。場面の順と秒数は、いまの分析動画（kessan-visualizer の SCENE_DEFAULTS）に合わせる
// 1つの場面に部品が2つ以上あるとき（予想・事業ごと・総括）は、つづけて出す

export const VFPS = 30;
type Item = { scene: string; title: string; Part: React.FC<PartProps>; sec: number };

export const videoTimeline = (d: ShortData): Item[] => {
  const ok = (id: PartId) => available(d, id);
  const P = PARTS;
  const items: (Item | false)[] = [
    { scene: 'cover', title: '表紙', Part: CoverPart, sec: 4 },
    { scene: 'summary', title: '決算ハイライト', Part: Kpi3D, sec: 8 },
    ok('quarter') && { scene: 'quarter', title: '四半期単独', Part: P.quarter, sec: 8 },
    ok('stock') && { scene: 'stock_price', title: '株価の推移', Part: P.stock, sec: 8 },
    // 業績予想の比較：修正（据え置きを含む）→ 進み具合 → 配当。修正前後が無ければ会社予想
    ok('revision') ? { scene: 'forecast', title: '予想の修正', Part: P.revision, sec: 7 } : ok('forecast') && { scene: 'forecast', title: '会社予想', Part: P.forecast, sec: 7 },
    ok('progress') && { scene: 'forecast', title: '進み具合', Part: P.progress, sec: 6 },
    ok('dividend') && { scene: 'forecast', title: '配当', Part: P.dividend, sec: 5 },
    // 損益の構造 → 利益率 →（食い違うときだけ）営業利益から純利益まで
    ok('pl') && { scene: 'pl_waterfall', title: '損益の構造', Part: P.pl, sec: 8 },
    ok('margin') && { scene: 'pl_waterfall', title: '利益率', Part: P.margin, sec: 6 },
    ok('netgap') && { scene: 'pl_waterfall', title: '営業利益から純利益まで', Part: P.netgap, sec: 7 },
    ok('trend') && { scene: 'income_trend', title: '業績の推移', Part: P.trend, sec: 9 },
    ok('bs') && { scene: 'balance_sheet', title: '貸借対照表', Part: P.bs, sec: 11 },
    ok('cf') && { scene: 'cash_flow', title: 'キャッシュフロー', Part: P.cf, sec: 9 },
    ok('segments') && { scene: 'segments', title: 'セグメント（売上）', Part: P.segments, sec: 8 },
    ok('segprofit') && { scene: 'segments', title: 'セグメント（利益）', Part: P.segprofit, sec: 7 },
    ok('points') && { scene: 'highlights', title: '注目ポイント', Part: P.points, sec: 9 },
    ok('ratings') && { scene: 'conclusion', title: '5つの評価', Part: P.ratings, sec: 6 },
    !!d.conclusion && { scene: 'conclusion', title: '総括', Part: ConclusionPart, sec: 8 },
  ];
  return items.filter(Boolean) as Item[];
};
export const videoFrames = (d: ShortData) => Math.round(videoTimeline(d).reduce((a, it) => a + it.sec, 0) * VFPS);

const Fade: React.FC<{ len: number; children: React.ReactNode }> = ({ len, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 6, len - 8, len - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Video: React.FC<{ data: ShortData; note?: string }> = ({ data, note = 'サンプル（架空の会社・数値）' }) => {
  setUnit(data.unit);
  const land = useLand();
  const [hd] = useState(() => delayRender('fonts'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const txt = CHARS + JSON.stringify(data) + PART_TEXT;
    Promise.all([document.fonts.load(`900 100px ${FONT}`, txt), document.fonts.load(`700 100px ${FONT}`, txt)]).then(() => {
      setReady(true);
      continueRender(hd);
    });
  }, [hd, data]);
  if (!ready) return null;
  let t = 0;
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      {videoTimeline(data).map((it, i) => {
        const len = Math.round(it.sec * VFPS);
        const from = t;
        t += len;
        return (
          <Sequence key={i} from={from} durationInFrames={len} name={it.title}>
            <Fade len={len}>
              <it.Part d={data} mode="main" dur={len} ctx="video" />
            </Fade>
          </Sequence>
        );
      })}
      {land ? (
        <>
          <div style={{ position: 'absolute', left: 64, bottom: 34, fontFamily: FONT, fontWeight: 700, fontSize: 26, color: K.sub }}>
            {data.company}
            {data.code ? `（${data.code}）` : ''}　{data.period}
          </div>
          <div style={{ position: 'absolute', right: 48, bottom: 34, fontFamily: FONT, fontWeight: 700, fontSize: 22, color: 'rgba(17,24,39,0.4)' }}>{note}</div>
        </>
      ) : (
        <>
          {/* 縦：社名は上（表紙の場面では出さない）、注記は下 */}
          <Sequence from={Math.round(videoTimeline(data)[0].sec * VFPS)}>
            <div style={{ position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 32, color: K.ink }}>
              {data.company}｜{data.period} 決算
            </div>
          </Sequence>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 28, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 24, color: 'rgba(17,24,39,0.45)' }}>{note}</div>
        </>
      )}
    </AbsoluteFill>
  );
};
