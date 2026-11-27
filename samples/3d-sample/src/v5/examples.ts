import type { ShortData, ShortPlan } from './types';

// 材料：伸びた会社（架空）
export const GROW: ShortData = {
  company: 'サンプル株式会社',
  period: '2026年3月期',
  metric: '営業利益',
  unit: '億円',
  periodType: 'FY',
  trend: [
    { l: '22/3', rev: 800, op: 60 },
    { l: '23/3', rev: 850, op: 75 },
    { l: '24/3', rev: 870, op: 68 },
    { l: '25/3', rev: 900, op: 84 },
    { l: '26/3', rev: 1000, op: 120 },
  ],
  segments: [
    { name: 'A事業', rev: 600, prevRev: 520, op: 92, prevOp: 58 },
    { name: 'B事業', rev: 300, prevRev: 285, op: 24, prevOp: 23 },
    { name: 'C事業', rev: 100, prevRev: 95, op: 4, prevOp: 3 },
  ],
  pl: { sales: 1000, cost: 600, sga: 280 },
  forecast: { basis: 'next', items: [{ name: '売上高', cur: 1000, next: 1100 }, { name: '営業利益', cur: 120, next: 150 }, { name: '純利益', cur: 80, next: 100 }] },
  topics: [{ icon: '💴', title: '増配', sub: '年30円 → 40円' }],
  kpis: [
    { name: '売上高', prev: 900, cur: 1000 },
    { name: '営業利益', prev: 84, cur: 120 },
    { name: '経常利益', prev: 82, cur: 118 },
    { name: '純利益', prev: 55, cur: 80 },
  ],
  bs: { assets: 1500, liabilities: 700, equity: 800, prevEquityRatio: 51.4 },
  cf: { begin: 200, operating: 150, investing: -60, financing: -40, end: 250 },
  quarter: { label: '4Q単独（1〜3月）', items: [{ key: 'revenue', name: '売上', prev: 240, cur: 272 }, { key: 'operating_income', name: '営業利益', prev: 24, cur: 38 }, { key: 'net_income', name: '純利益', prev: 15, cur: 26 }] },
  margins: [{ name: '粗利率', prev: 38.9, cur: 40.0 }, { name: '営業利益率', prev: 9.3, cur: 12.0 }],
  netgap: { steps: [{ key: 'operating_income', name: '営業利益', v: 120 }, { key: 'ordinary_income', name: '経常利益', v: 118 }, { key: 'pretax_income', name: '税引前利益', v: 116 }, { key: 'net_income', name: '純利益', v: 80 }], prevOp: 84, prevNet: 55 },
  progress: null,
  dividend: { before: 36, after: 40, label: '今期' },
  ratings: [
    { label: '成長性', grade: 'strong' },
    { label: '収益性', grade: 'good' },
    { label: '財務の安全性', grade: 'strong' },
    { label: 'お金を生む力', grade: 'good' },
    { label: '資本効率', grade: 'neutral' },
  ],
  revision: { label: '2Qで修正', items: [{ name: '売上高', before: 1100, after: 1100 }, { name: '営業利益', before: 130, after: 150 }, { name: '経常利益', before: 128, after: 148 }, { name: '純利益', before: 90, after: 100 }] },
  points: { good: ['主力のA事業の新製品が好調', '利益率が12.0%に上がった'], watch: ['販管費（人件費）が増えている', 'B事業の利益率は8%台'] },
  stock: { prices: [1003, 1002, 993, 992, 1001, 1005, 1000, 1001, 1002, 996, 991, 999, 1071, 1071, 1071, 1078, 1079, 1077, 1086, 1101], at: 12, days: '1週間' },
};

// 材料：赤字になった会社（架空）
// 材料：2Q（中間）の決算・予想は据え置き・増配・事業の1つが赤字（架空）。保存データでいちばん多い形
export const MID: ShortData = {
  company: 'サンプル電機',
  code: '0000',
  period: '2027年3月期 第2四半期',
  headline: '電子部品の受注が伸び、半年で営業利益の予想の半分に到達',
  verdict: '増収増益',
  focus: ['電子部品の受注', '新規事業の赤字', '配当の引き上げ'],
  conclusion: { strength: '電子部品の受注が好調', feature: '半年で予想の半分まで進んだ', concern: '新規事業の赤字が広がった', next: '下期の受注の勢い' },
  metric: '営業利益',
  unit: '億円',
  periodType: 'Q2',
  trend: [
    { l: '24/3', rev: 1720, op: 128 },
    { l: '25/3', rev: 1850, op: 150 },
    { l: '26/3', rev: 2000, op: 172 },
    { l: '27/3', rev: 2150, op: 200, fc: true },
  ],
  segLabel: '事業',
  segments: [
    { name: '電子部品', rev: 620, prevRev: 540, op: 88, prevOp: 64 },
    { name: '産業機器', rev: 330, prevRev: 335, op: 21, prevOp: 24 },
    { name: '新規事業', rev: 60, prevRev: 42, op: -9, prevOp: -6 },
  ],
  pl: { sales: 1010, cost: 690, sga: 220 },
  plSteps: [
    { key: 'revenue', label: '売上', v: 1010, kind: 'total' },
    { key: 'cost_of_sales', label: '売上原価', v: 690, kind: 'minus' },
    { key: 'gross_profit', label: '売上総利益', v: 320, kind: 'subtotal' },
    { key: 'sga', label: '販管費', v: 220, kind: 'minus' },
    { key: 'other_income', label: 'その他の収益', v: 12, kind: 'plus' },
    { key: 'other_expenses', label: 'その他の費用', v: 12, kind: 'minus' },
    { key: 'operating_income', label: '営業利益', v: 100, kind: 'result' },
  ],
  margins: [{ name: '粗利率', prev: 30.8, cur: 31.7 }, { name: '営業利益率', prev: 8.9, cur: 9.9 }],
  netgap: { steps: [{ key: 'operating_income', name: '営業利益', v: 100 }, { key: 'ordinary_income', name: '経常利益', v: 104 }, { key: 'pretax_income', name: '税引前利益', v: 103 }, { key: 'net_income', name: '純利益', v: 71 }], prevOp: 82, prevNet: 57 },
  forecast: { basis: 'this', items: [{ key: 'revenue', name: '売上', cur: 2000, next: 2150 }, { key: 'operating_income', name: '営業利益', cur: 172, next: 200 }, { key: 'net_income', name: '純利益', cur: 118, next: 140 }] },
  progress: { pace: 50, items: [{ key: 'revenue', name: '売上', actual: 1010, forecast: 2150 }, { key: 'operating_income', name: '営業利益', actual: 100, forecast: 200 }, { key: 'net_income', name: '純利益', actual: 71, forecast: 140 }] },
  revision: { label: '2Qの発表時', reason: '上期は計画どおりに進んだため、通期の予想は変えない', items: [{ key: 'revenue', name: '売上', before: 2150, after: 2150 }, { key: 'operating_income', name: '営業利益', before: 200, after: 200 }, { key: 'net_income', name: '純利益', before: 140, after: 140 }] },
  dividend: { before: 50, after: 56, label: '年間' },
  topics: [{ icon: '🔁', title: '自社株買い', sub: '上限30億円' }],
  kpis: [
    { key: 'revenue', name: '売上', prev: 917, cur: 1010 },
    { key: 'operating_income', name: '営業利益', prev: 82, cur: 100 },
    { key: 'ordinary_income', name: '経常利益', prev: 85, cur: 104 },
    { key: 'net_income', name: '純利益', prev: 57, cur: 71 },
  ],
  bs: { assets: 2400, liabilities: 1010, equity: 1390, prevEquityRatio: 56.2 },
  bsBlocks: [
    { key: 'cash', label: '現金', side: 'asset', v: 325, prev: 310 },
    { key: 'receivables', label: '売掛金', side: 'asset', v: 420, prev: 380 },
    { key: 'inventory', label: '在庫', side: 'asset', v: 360, prev: 300 },
    { key: 'other_current_assets', label: 'その他流動資産', v: 95, side: 'asset', prev: 90 },
    { key: 'fixed_assets', label: '固定資産', side: 'asset', v: 1200, prev: 1170 },
    { key: 'payables', label: '買掛金', side: 'liability', v: 260, prev: 240 },
    { key: 'debt', label: '有利子負債', side: 'liability', v: 380, prev: 400 },
    { key: 'other_liabilities', label: 'その他負債', side: 'liability', v: 370, prev: 365 },
    { key: 'equity', label: '純資産', side: 'equity', v: 1390, prev: 1235 },
  ],
  cf: { begin: 310, operating: 120, investing: -70, financing: -35, other: 0, end: 325 },
  quarter: { label: '2Q単独（7〜9月）', items: [{ key: 'revenue', name: '売上', prev: 470, cur: 522 }, { key: 'operating_income', name: '営業利益', prev: 44, cur: 55 }, { key: 'net_income', name: '純利益', prev: 30, cur: 39 }] },
  ratings: [
    { label: '成長性', grade: 'good' },
    { label: '収益性', grade: 'good' },
    { label: '財務の安全性', grade: 'strong' },
    { label: 'お金を生む力', grade: 'neutral' },
    { label: '資本効率', grade: 'caution' },
  ],
  points: {
    good: [
      { t: '営業利益率が改善', metric: '営業利益率', before: '8.9%', after: '9.9%', change: '+1.0pt' },
      { t: '電子部品の受注が好調', metric: '電子部品の売上', before: '540億円', after: '620億円', change: '+14.8%' },
      '配当の予想を引き上げ',
    ],
    watch: [{ t: '新規事業の赤字が広がった', metric: '新規事業の利益', before: '−6億円', after: '−9億円' }, { t: '在庫が増えた', metric: '在庫', before: '300億円', after: '360億円', change: '+20.0%' }],
  },
  stock: { prices: [2010, 2030, 2015, 2040, 2052, 2048, 2060, 2075, 2070, 2066, 2081, 2090, 2210], at: 12, days: '発表の翌日', pre: 2090, post: 2210 },
};

// 材料：本業は黒字に戻ったが、最後は赤字（米国の会社・億ドル。架空）
export const TURN: ShortData = {
  company: 'サンプル・インク',
  code: 'SMPL',
  headline: '本業は黒字に戻ったが、利息の支払いで最終赤字',
  verdict: '営業黒字転換',
  focus: ['北米の売上', '借入れの利息', '7〜9月の勢い'],
  conclusion: { strength: '北米の売上が大きく伸びた', feature: '本業は黒字に戻った', concern: '利息の支払いが重い', next: '借入れを減らせるか' },
  period: '2026年12月期 第3四半期',
  metric: '営業利益',
  unit: '億ドル',
  periodType: 'Q3',
  trend: [
    { l: '24/12', rev: 31, op: -6 },
    { l: '25/12', rev: 46, op: -2.4 },
  ],
  segLabel: '地域',
  segments: [
    { name: '北米', rev: 30.5, prevRev: 21.0, op: 3.1, prevOp: -0.4 },
    { name: '欧州', rev: 9.2, prevRev: 7.6, op: -0.6, prevOp: -0.9 },
  ],
  pl: { sales: 39.7, cost: 25.1, sga: 12.9 },
  margins: [{ name: '粗利率', prev: 32.4, cur: 36.8 }, { name: '営業利益率', prev: -4.6, cur: 4.3 }],
  netgap: { steps: [{ key: 'operating_income', name: '営業利益', v: 1.7 }, { key: 'pretax_income', name: '税引前利益', v: -1.9 }, { key: 'net_income', name: '純利益', v: -2.3 }], prevOp: -1.3, prevNet: -2.0 },
  forecast: null,
  progress: null,
  revision: null,
  dividend: null,
  topics: [{ icon: '💸', title: '借入れの利息が重い', sub: '支払利息 3.4億ドル' }],
  kpis: [
    { key: 'revenue', name: '売上', prev: 28.6, cur: 39.7 },
    { key: 'operating_income', name: '営業利益', prev: -1.3, cur: 1.7 },
    { key: 'net_income', name: '純利益', prev: -2.0, cur: -2.3 },
  ],
  bs: null,
  cf: null,
  quarter: { label: '3Q単独（7〜9月）', items: [{ key: 'revenue', name: '売上', prev: 10.4, cur: 14.6 }, { key: 'operating_income', name: '営業利益', prev: -0.3, cur: 0.9 }, { key: 'net_income', name: '純利益', prev: -0.6, cur: -0.4 }] },
  ratings: [
    { label: '成長性', grade: 'strong' },
    { label: '収益性', grade: 'caution' },
    { label: '財務の安全性', grade: 'weak' },
    { label: 'お金を生む力', grade: 'neutral' },
    { label: '資本効率', grade: 'caution' },
  ],
  points: { good: ['北米の売上が39%増'], watch: ['利息の支払いで最終赤字'] },
  stock: { prices: [61.2, 62.0, 60.8, 63.5, 64.1, 63.0, 62.4, 65.2, 66.0, 64.8, 65.5, 66.3, 58.9], at: 12, days: '発表の翌日', pre: 66.3, post: 58.9, unit: 'ドル' },
};

export const LOSS: ShortData = {
  company: 'サンプル工業',
  period: '2026年3月期',
  metric: '営業利益',
  unit: '億円',
  periodType: 'FY',
  trend: [
    { l: '22/3', rev: 700, op: 45 },
    { l: '23/3', rev: 690, op: 38 },
    { l: '24/3', rev: 650, op: 20 },
    { l: '25/3', rev: 600, op: 12 },
    { l: '26/3', rev: 550, op: -35 },
  ],
  segments: [
    { name: '素材', rev: 300, prevRev: 380, op: -42, prevOp: 6 },
    { name: '機械', rev: 200, prevRev: 215, op: 9, prevOp: 8 },
    { name: 'その他', rev: 50, prevRev: 52, op: -2, prevOp: -2 },
  ],
  pl: { sales: 550, cost: 470, sga: 115 },
  forecast: { basis: 'next', items: [{ name: '売上高', cur: 550, next: 580 }, { name: '営業利益', cur: -35, next: 10 }, { name: '純利益', cur: -52, next: 5 }] },
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
  bs: { assets: 900, liabilities: 560, equity: 340, prevEquityRatio: 42.0 },
  cf: { begin: 120, operating: -20, investing: -45, financing: 30, end: 85 },
  quarter: { label: '4Q単独（1〜3月）', items: [{ key: 'revenue', name: '売上', prev: 150, cur: 130 }, { key: 'operating_income', name: '営業利益', prev: 2, cur: -19 }, { key: 'net_income', name: '純利益', prev: 1, cur: -30 }] },
  margins: [{ name: '粗利率', prev: 18.3, cur: 14.5 }, { name: '営業利益率', prev: 2.0, cur: -6.4 }],
  netgap: { steps: [{ key: 'operating_income', name: '営業利益', v: -35 }, { key: 'ordinary_income', name: '経常利益', v: -30 }, { key: 'pretax_income', name: '税引前利益', v: -48 }, { key: 'net_income', name: '純利益', v: -52 }], prevOp: 12, prevNet: 8 },
  progress: null,
  dividend: { before: 40, after: 20, label: '今期' },
  ratings: [
    { label: '成長性', grade: 'weak' },
    { label: '収益性', grade: 'weak' },
    { label: '財務の安全性', grade: 'neutral' },
    { label: 'お金を生む力', grade: 'caution' },
    { label: '資本効率', grade: 'weak' },
  ],
  revision: { label: '3Qで修正', items: [{ name: '売上高', before: 600, after: 560 }, { name: '営業利益', before: 5, after: -35 }, { name: '経常利益', before: 8, after: -30 }, { name: '純利益', before: 2, after: -55 }] },
  points: { good: ['機械の事業は減収幅が小さい'], watch: ['原料高を値上げで補えていない', '現金が減っている'] },
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
  brief: ['stock', 'forecast'],
  captions: {
    segments: '新製品が売れて、主力のA事業が伸びた',
  },
  summary: ['営業利益 +42.9%', 'A事業の新製品が売れた', '来期も増益の予想'],
};

export const PLAN_MID: ShortPlan = {
  verdict: '増収増益',
  verdict_tone: 'good',
  headline: '半年で予想の半分に到達',
  main: 'progress',
  brief: ['segprofit', 'dividend'],
  captions: {
    progress: '電子部品が好調で、目安どおりに進んでいる',
    segprofit: '新規事業はまだ赤字',
    dividend: '配当の予想を引き上げ',
  },
  summary: ['営業利益 +22.0%', '電子部品の受注が好調', '予想は据え置き・増配'],
};

export const PLAN_TURN: ShortPlan = {
  verdict: '営業黒字転換',
  verdict_tone: 'neutral',
  headline: '本業は黒字、最後は赤字',
  main: 'netgap',
  brief: ['quarter', 'stock'],
  captions: {
    netgap: '借入れの利息が重く、最後は赤字のまま',
    quarter: '7〜9月も本業は黒字',
    stock: '最終赤字が嫌われて下落',
  },
  summary: ['営業黒字に転換', '利息の支払いで最終赤字', '株価は発表後に下落'],
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
