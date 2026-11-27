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
    { name: 'A事業', rev: 600, prevRev: 520 },
    { name: 'B事業', rev: 300, prevRev: 285 },
    { name: 'C事業', rev: 100, prevRev: 95 },
  ],
  pl: { sales: 1000, cost: 600, sga: 280 },
  forecast: { cur: 120, next: 150 },
  topics: [{ icon: '💴', title: '増配', sub: '年30円 → 40円' }],
  kpis: [
    { name: '売上高', prev: 900, cur: 1000 },
    { name: '営業利益', prev: 84, cur: 120 },
    { name: '経常利益', prev: 82, cur: 118 },
    { name: '純利益', prev: 55, cur: 80 },
  ],
  stock: { prices: [1003, 1002, 993, 992, 1001, 1005, 1000, 1001, 1002, 996, 991, 999, 1071, 1071, 1071, 1078, 1079, 1077, 1086, 1101], at: 12, days: '1週間' },
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
    { name: '素材', rev: 300, prevRev: 380 },
    { name: '機械', rev: 200, prevRev: 215 },
    { name: 'その他', rev: 50, prevRev: 52 },
  ],
  pl: { sales: 550, cost: 470, sga: 115 },
  forecast: { cur: -35, next: 10 },
  topics: [
    { icon: '✂️', title: '配当を減らす', sub: '年40円 → 20円' },
    { icon: '🏭', title: '工場を1つ閉じる', sub: '来期から' },
  ],
  kpis: [
    { name: '売上高', prev: 600, cur: 550 },
    { name: '営業利益', prev: 12, cur: -35 },
    { name: '経常利益', prev: 15, cur: -30 },
    { name: '純利益', prev: 8, cur: -52 },
  ],
  stock: { prices: [1003, 1000, 999, 1007, 1012, 1004, 998, 1001, 1003, 1000, 1005, 1011, 890, 877, 872, 872, 865, 861, 861, 855], at: 12, days: '1週間' },
};

// 選び方（分析の中でAIが出す想定）
export const PLAN_GROW_TREND: ShortPlan = {
  verdict: '増収増益',
  verdict_tone: 'good',
  headline: '営業利益は過去最高',
  main: 'trend',
  brief: ['stock', 'forecast'],
  captions: {
    trend: '24年3月期の減益から、2年で一気に回復',
    stock: '過去最高益を好感して上昇',
  },
  summary: ['過去最高益（+42.9%）', '株価は発表後に上昇', '来期も増益の予想'],
};

export const PLAN_GROW_SEG: ShortPlan = {
  verdict: '増収増益',
  verdict_tone: 'good',
  headline: '主力のA事業がけん引',
  main: 'segments',
  brief: ['pl', 'stock'],
  captions: {
    segments: '新製品が売れて、主力のA事業が伸びた',
    pl: '売上が増えて、利益率も上がった',
  },
  summary: ['営業利益 +42.9%', 'A事業の新製品が売れた', '株価は発表後に上昇'],
};

export const PLAN_LOSS: ShortPlan = {
  verdict: '赤字転落',
  verdict_tone: 'bad',
  headline: '4年続けて利益が減った',
  main: 'loss',
  brief: ['stock', 'topic'],
  captions: {
    loss: '原料の値上がりを、値上げで補えなかった',
    stock: '赤字転落と減配で売られた',
    topic: '配当も半分に',
  },
  summary: ['営業赤字に転落', '原料高を値上げで補えず', '減配・株価は急落'],
};
