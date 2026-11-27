// 超ショートの「材料」と「選び方」
// 材料（ShortData）は分析データから機械的に作る。選び方（ShortPlan）は分析の中でAIが出す。

export type PartId = 'trend' | 'segments' | 'pl' | 'forecast' | 'loss' | 'topic' | 'stock';

export type ShortData = {
  company: string;
  period: string;
  metric: string; // 例: 営業利益
  trend: { l: string; v: number }[]; // 古い順。最後が今回
  segments: { name: string; rev: number; prevRev: number }[]; // 事業ごとの売上（今年・前年）
  pl: { sales: number; cost: number; sga: number } | null; // 売上→利益の構造（営業利益＝売上−原価−販管費）
  forecast: { cur: number; next: number } | null; // 今期の実績と来期の会社予想
  topics: { icon: string; title: string; sub?: string }[]; // 数字以外（配当・自社株買い・M&A など）
  kpis: { name: string; prev: number; cur: number }[]; // 決算ハイライト（売上・営業利益・経常利益・純利益）
  stock: { prices: number[]; at: number; days: string } | null; // 終値（古い順）、at＝決算発表の翌営業日の位置、days＝比べる期間の言い方
};

export type ShortPlan = {
  verdict: string; // 冒頭の札（例: 増収増益）
  verdict_tone: 'good' | 'bad' | 'neutral';
  headline: string; // 冒頭の一言（20字以内）
  main: PartId; // 主役（1つ）
  brief: PartId[]; // さらっと（0〜2個。並べる順）
  captions: Partial<Record<PartId, string>>; // 各部品の一言（字幕）
  summary: [string, string, string]; // まとめ3行（結果・理由・この先）
};
