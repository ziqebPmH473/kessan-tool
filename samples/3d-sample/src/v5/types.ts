// 超ショートの「材料」と「選び方」
// 材料（ShortData）は分析データから機械的に作る。選び方（ShortPlan）は分析の中でAIが出す。

export type PartId = 'trend' | 'segments' | 'forecast' | 'loss' | 'topic';

export type ShortData = {
  company: string;
  period: string;
  metric: string; // 例: 営業利益
  trend: { l: string; v: number }[]; // 古い順。最後が今回
  segments: { name: string; delta: number }[]; // 前年からの増減（億円）
  forecast: { cur: number; next: number } | null; // 今期の実績と来期の会社予想
  topics: { icon: string; title: string; sub?: string }[]; // 数字以外（配当・自社株買い・M&A など）
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
