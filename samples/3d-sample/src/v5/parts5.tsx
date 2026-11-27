import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT } from '../lib';
import { K } from '../v2/kit';
import { PartProps, Titles, clamp, useLand } from './parts';

// いまの分析動画にあって、3Dの部品に無かった場面（表紙・総括）。どちらも文字が主役なので平面で、動きだけ揃える

const pop = (f: number, at: number) => ({
  opacity: interpolate(f, [at, at + 8], [0, 1], clamp),
  transform: `translateY(${interpolate(f, [at, at + 14], [30, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px)`,
});
export const verdictColor = (v?: string) => (!v ? K.blue : /減|赤字/.test(v) && !/増益|黒字/.test(v) ? K.red : K.green);

// ---------- 表紙：社名・決算期・今回の見出し・「このあと」見る点 ----------
export const CoverPart: React.FC<PartProps> = ({ d }) => {
  const f = useCurrentFrame();
  const land = useLand();
  const focus = (d.focus ?? []).slice(0, 3);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, justifyContent: 'center', padding: land ? '0 140px' : '0 80px' }}>
      <div style={{ ...pop(f, 0), fontWeight: 700, fontSize: land ? 40 : 38, color: K.sub }}>
        {d.period} 決算{d.code ? `（${d.code}）` : ''}
      </div>
      <div style={{ ...pop(f, 4), fontWeight: 900, fontSize: land ? 120 : 104, color: K.ink, lineHeight: 1.15, marginTop: 10 }}>{d.company}</div>
      {d.verdict && (
        <div style={{ ...pop(f, 10), marginTop: 26, alignSelf: 'flex-start', display: 'inline-block', background: d.verdict ? verdictColor(d.verdict) : K.blue, color: '#fff', fontWeight: 900, fontSize: land ? 56 : 52, padding: '10px 40px', borderRadius: 999 }}>
          {d.verdict}
        </div>
      )}
      {d.headline && <div style={{ ...pop(f, 16), fontWeight: 700, fontSize: land ? 44 : 44, color: K.ink, marginTop: 30, lineHeight: 1.4 }}>{d.headline}</div>}
      {focus.length > 0 && (
        <div style={{ ...pop(f, 26), marginTop: 44, display: 'flex', flexDirection: land ? 'row' : 'column', gap: land ? 24 : 14 }}>
          <div style={{ fontWeight: 900, fontSize: 30, color: K.blue, alignSelf: land ? 'center' : 'flex-start' }}>このあと</div>
          {focus.map((t, i) => (
            <div key={i} style={{ ...pop(f, 30 + i * 6), background: '#fff', borderRadius: 16, padding: '14px 24px', fontWeight: 700, fontSize: land ? 30 : 34, color: K.ink, boxShadow: '0 8px 24px rgba(15,23,42,0.07)' }}>
              {t}
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- 総括：今回の決算の札と見出し、強み・特徴・確認点・次回確認の4枚 ----------
// 超ショートのまとめ3行も、ここから作る（AIを使わない）
export const conclusionLines = (d: PartProps['d']): [string, string, string] | null => {
  const c = d.conclusion;
  if (!c) return null;
  return [d.verdict ?? c.feature ?? '', c.strength ?? c.feature ?? '', c.next ?? c.concern ?? ''];
};
export const ConclusionPart: React.FC<PartProps> = ({ d, mode, dur, caption }) => {
  const f = useCurrentFrame();
  const land = useLand();
  const c = d.conclusion;
  if (!c) return null;
  const main = mode === 'main';
  const cards = [
    { k: '強み', t: c.strength, col: K.green },
    { k: '特徴', t: c.feature, col: K.blue },
    { k: '確認点', t: c.concern, col: K.orange },
    { k: '次回確認', t: c.next, col: K.sub },
  ].filter((x) => x.t);
  const shown = main ? cards : cards.filter((x) => x.k === '強み' || x.k === '確認点');
  const step = main ? Math.min(14, dur / (shown.length + 3)) : 6;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Titles
        tag="総括"
        at={4}
        brief={!main}
        big={d.verdict ? <span style={{ color: verdictColor(d.verdict) }}>{d.verdict}</span> : undefined}
        sub={land ? d.headline : undefined}
        caption={caption}
      />
      <div
        style={
          land
            ? { position: 'absolute', top: 170, left: 760, right: 90, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }
            : { position: 'absolute', top: '30%', left: 80, right: 80, display: 'flex', flexDirection: 'column', gap: 26 }
        }
      >
        {shown.map((x, i) => (
          <div key={x.k} style={{ ...pop(f, 10 + i * step), background: '#fff', borderRadius: 26, padding: land ? '34px 36px' : '30px 36px', borderTop: `12px solid ${x.col}`, boxShadow: '0 16px 40px rgba(15,23,42,0.10)', minHeight: land ? 250 : undefined }}>
            <div style={{ fontWeight: 900, fontSize: 30, color: x.col }}>{x.k}</div>
            <div style={{ fontWeight: 700, fontSize: land ? 44 : 48, color: K.ink, marginTop: 10, lineHeight: 1.35 }}>{x.t}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const PARTS5_TEXT = 'このあと決算総括強み特徴確認点次回確認今回の注目貸借対照表（持っているもの・お金の出どころ）箱の高さ＝金額。前期末の形から今期末へ前期末今期末総資産株価の推移その他収益費用粗利原価';
