// 超ショートの組み立て方（主役・さらっと・まとめ）を、AIを使わずに材料から決める
// 字幕（captions）は出さない。まとめ3行は分析データの総括（強み・次回確認）から
import { available } from './availability';
import type { PartId, ShortData, ShortPlan } from './types';

const turned = (a: number, b: number) => (a < 0) !== (b < 0);
const revWord = (d: ShortData) => {
  const r = d.revision;
  if (!r) return 0;
  return r.items.some((it) => it.after !== it.before) ? 1 : 0;
};

// 冒頭の一言：見出しの最初の区切りまで（長いと1行に入らないので18字まで）
const shortHeadline = (h?: string) => {
  if (!h) return '';
  const first = h.split(/[、，,。]/)[0];
  return first.length <= 18 ? first : '';
};

export const autoPlan = (d: ShortData): ShortPlan => {
  const ok = (id: PartId) => available(d, id);
  const op = d.kpis.find((k) => k.key === 'operating_income') ?? d.kpis[1];
  const st = d.stock;
  const react = st && st.pre && st.post ? ((st.post - st.pre) / st.pre) * 100 : 0;
  const pr = d.progress?.items.find((it) => it.key === 'operating_income') ?? d.progress?.items[1];
  const prGap = pr && d.progress ? (pr.actual / pr.forecast) * 100 - d.progress.pace : 0;

  // 主役：起きたことの大きさの順に
  const order: [PartId, boolean][] = [
    ['loss', ok('loss') && !!op && turned(op.prev, op.cur)],
    ['netgap', ok('netgap')],
    ['revision', ok('revision') && revWord(d) > 0],
    ['stock', ok('stock') && Math.abs(react) >= 10],
    ['progress', ok('progress') && Math.abs(prGap) >= 15],
    ['segprofit', ok('segprofit')],
    ['trend', ok('trend')],
    ['margin', ok('margin')],
    ['pl', ok('pl')],
  ];
  const main = (order.find(([, c]) => c)?.[0] ?? 'points') as PartId;

  // さらっと：株価（毎回）＋ もう1つ
  const brief: PartId[] = [];
  if (main !== 'stock' && ok('stock')) brief.push('stock');
  const second: PartId[] = ['dividend', 'revision', 'progress', 'segprofit', 'margin', 'quarter'];
  const s2 = second.find((id) => id !== main && ok(id) && (id !== 'revision' || revWord(d) > 0));
  if (s2) brief.push(s2);

  const v = d.verdict || '決算';
  const tone: ShortPlan['verdict_tone'] = /赤字|減益|減収減益|下方/.test(v) && !/黒字/.test(v) ? 'bad' : /増益|黒字|上方/.test(v) ? 'good' : 'neutral';
  const c = d.conclusion;
  const summary: [string, string, string] = [v, c?.strength ?? c?.feature ?? '', c?.next ?? c?.concern ?? ''];
  return { verdict: v, verdict_tone: tone, headline: shortHeadline(d.headline), main, brief, captions: {}, summary };
};
