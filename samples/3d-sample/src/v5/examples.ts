import type { ShortData, ShortPlan } from './types';

// 材料：伸びた会社（架空）
export const GROW: ShortData = {
  company: 'サンプル株式会社',
  period: '2026年3月期',
  metric: '営業利益',
  trend: [
    { l: '22/3', v: 60 },
    { l: '23/3', v: 75 },
    { l: '24/3', v: 68 },
    { l: '25/3', v: 84 },
    { l: '26/3', v: 120 },
  ],
  segments: [
    { name: 'A事業', delta: 28 },
    { name: 'B事業', delta: 6 },
    { name: 'C事業', delta: 2 },
  ],
  forecast: { cur: 120, next: 150 },
  topics: [{ icon: '💴', title: '増配', sub: '年30円 → 40円' }],
};

// 材料：赤字になった会社（架空）
export const LOSS: ShortData = {
  company: 'サンプル工業',
  period: '2026年3月期',
  metric: '営業利益',
  trend: [
    { l: '22/3', v: 45 },
    { l: '23/3', v: 38 },
    { l: '24/3', v: 20 },
    { l: '25/3', v: 12 },
    { l: '26/3', v: -35 },
  ],
  segments: [
    { name: '素材', delta: -30 },
    { name: '機械', delta: -15 },
    { name: 'その他', delta: -2 },
  ],
  forecast: { cur: -35, next: 10 },
  topics: [
    { icon: '✂️', title: '配当を減らす', sub: '年40円 → 20円' },
    { icon: '🏭', title: '工場を1つ閉じる', sub: '来期から' },
  ],
};

// 選び方（分析の中でAIが出す想定）
export const PLAN_GROW_TREND: ShortPlan = {
  verdict: '増収増益',
  verdict_tone: 'good',
  headline: '営業利益は過去最高',
  main: 'trend',
  brief: ['segments', 'forecast'],
  captions: {
    trend: '24年3月期の減益から、2年で一気に回復',
    segments: '伸びたのは主力のA事業',
  },
  summary: ['過去最高益（+42.9%）', '主力のA事業が伸びた', '来期も増益の予想'],
};

export const PLAN_GROW_SEG: ShortPlan = {
  verdict: '増収増益',
  verdict_tone: 'good',
  headline: '主力のA事業がけん引',
  main: 'segments',
  brief: ['trend', 'forecast'],
  captions: {
    segments: '新製品が売れて、A事業の利益が大きく増えた',
  },
  summary: ['営業利益 +42.9%', 'A事業の新製品が売れた', '来期も増益の予想'],
};

export const PLAN_LOSS: ShortPlan = {
  verdict: '赤字転落',
  verdict_tone: 'bad',
  headline: '4年続けて利益が減った',
  main: 'loss',
  brief: ['segments', 'topic'],
  captions: {
    loss: '原料の値上がりを、値上げで補えなかった',
    segments: '足を引っぱったのは素材の事業',
    topic: '配当も半分に',
  },
  summary: ['営業赤字に転落', '素材の事業が落ち込んだ', '減配・来期は黒字の予想'],
};
