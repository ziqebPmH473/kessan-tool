import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Easing, Sequence, continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { CHARS, FONT } from '../lib';
import { K, Text2D } from '../v2/kit';
import { Kpi3D } from './parts2';
import { PARTS } from './registry';
import type { ShortData, ShortPlan } from './types';

// 20秒：冒頭（結論）→ 決算ハイライト（毎回）→ 主役 → さらっと（0〜2個）→ まとめ
export const FPS = 30;
export const SHORT_TOTAL = 20 * FPS;
const OPEN = 45; // 1.5秒
const KPI = 96; // 決算ハイライト（毎回入れる）3.2秒
const BRIEF = 72; // さらっと 2.4秒
const SUM = 66; // まとめ 2.2秒（主役は残り。さらっと2つなら約8.2秒）

export const timeline = (plan: ShortPlan) => {
  const briefs = plan.brief.slice(0, 2);
  const mainLen = SHORT_TOTAL - OPEN - KPI - SUM - briefs.length * BRIEF;
  const items: { id: string; part?: keyof typeof PARTS; mode?: 'main' | 'brief'; from: number; len: number }[] = [];
  let t = 0;
  items.push({ id: 'open', from: t, len: OPEN });
  t += OPEN;
  items.push({ id: 'kpi', from: t, len: KPI });
  t += KPI;
  items.push({ id: `main:${plan.main}`, part: plan.main, mode: 'main', from: t, len: mainLen });
  t += mainLen;
  for (const b of briefs) {
    items.push({ id: `brief:${b}`, part: b, mode: 'brief', from: t, len: BRIEF });
    t += BRIEF;
  }
  items.push({ id: 'sum', from: t, len: SUM });
  return items;
};

const tone = (p: ShortPlan) => (p.verdict_tone === 'good' ? K.green : p.verdict_tone === 'bad' ? K.red : K.blue);

const Open: React.FC<{ plan: ShortPlan }> = ({ plan }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, 8, 12], [0.7, 1.06, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <div style={{ position: 'absolute', top: '40%', left: '50%', transform: `translate(-50%,-50%) scale(${s})`, background: tone(plan), color: '#fff', fontWeight: 900, fontSize: 120, padding: '24px 64px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 16px 40px rgba(15,23,42,0.15)' }}>
        {plan.verdict}
      </div>
      <Text2D at={10} size={58} top="53%" left="50%" weight={700}>{plan.headline}</Text2D>
    </AbsoluteFill>
  );
};

const Sum: React.FC<{ plan: ShortPlan }> = ({ plan }) => {
  const f = useCurrentFrame();
  const keys = ['結果', '理由', 'この先'];
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Text2D at={0} size={56} top="22%" left="50%">今回の決算まとめ</Text2D>
      {plan.summary.map((v, i) => {
        const at = 6 + i * 8;
        const o = interpolate(f, [at, at + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const x = interpolate(f, [at, at + 12], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
        return (
          <div key={i} style={{ position: 'absolute', top: `${33 + i * 9}%`, left: 100, right: 100, opacity: o, transform: `translateX(${x}px)`, display: 'flex', alignItems: 'center', gap: 28, background: '#fff', borderRadius: 20, padding: '26px 34px', boxShadow: '0 8px 30px rgba(15,23,42,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 32, color: '#fff', background: K.blue, borderRadius: 12, padding: '6px 16px', minWidth: 104, textAlign: 'center' }}>{keys[i]}</div>
            <div style={{ fontWeight: 700, fontSize: 44, color: K.ink, whiteSpace: 'nowrap' }}>{v}</div>
          </div>
        );
      })}
      <Text2D at={40} size={54} top="68%" left="50%">くわしい解説は本編で</Text2D>
    </AbsoluteFill>
  );
};

export const Short: React.FC<{ data: ShortData; plan: ShortPlan; only?: React.ReactNode }> = ({ data, plan, only }) => {
  const [hd] = useState(() => delayRender('fonts'));
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const txt = CHARS + JSON.stringify(data) + JSON.stringify(plan) + 'の推移なぜ増えた？減ったこの先は来期予想実績今期赤字に転落数字のほかに今回の決算まとめ結果理由くわしい解説は本編で前年今年約割決算ハイライト■前年今年（億円）財務の安全性自己資本比率前期末借金に頼らない度合い持っているものお金の出どころ資産負債純資産入り（キャッシュフロー）自由に使える稼いだ投資営業期首期末か月ごとの利益四半期直近の同じ時期会社予想の修正上方下方修正前後注目ポイントGOODWATCH黒字の予想赤字の予想は（）業績の推移・売上営業利益億円濃い＝今期の実績うすい＝来期の予想増益減益黒字に戻る赤字になる据え置き利益だけ上方下方修正項目で向きがちがう2Q3Qで修正営業赤字に転落営業黒字に転換±赤字転落黒字転換拡大縮小株価の反応発表前後前日から';
    Promise.all([document.fonts.load(`900 100px ${FONT}`, txt), document.fonts.load(`700 100px ${FONT}`, txt)]).then(() => {
      setOk(true);
      continueRender(hd);
    });
  }, [hd, data, plan]);
  if (!ok) return null;
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      {only ??
        timeline(plan).map((it) => {
        const Part = it.part ? PARTS[it.part] : null;
        return (
          <Sequence key={it.id} from={it.from} durationInFrames={it.len}>
            {it.id === 'open' ? <Open plan={plan} /> : it.id === 'kpi' ? <Kpi3D d={data} mode="brief" dur={it.len} /> : it.id === 'sum' ? <Sum plan={plan} /> : Part ? <Part d={data} mode={it.mode!} dur={it.len} caption={plan.captions[it.part!]} /> : null}
          </Sequence>
        );
      })}
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 34, color: K.ink }}>
        {data.company}｜{data.period} 決算
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 28, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 26, color: 'rgba(17,24,39,0.45)' }}>
        サンプル（架空の会社・数値）
      </div>
    </AbsoluteFill>
  );
};
