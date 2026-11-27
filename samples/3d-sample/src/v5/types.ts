// 超ショートの「材料」と「選び方」
// 材料（ShortData）は分析データから機械的に作る（fromAnalysis.ts）。選び方（ShortPlan）は分析の中でAIが出す。

export type PartId =
  | 'trend'
  | 'segments'
  | 'segprofit'
  | 'pl'
  | 'margin'
  | 'netgap'
  | 'forecast'
  | 'progress'
  | 'revision'
  | 'dividend'
  | 'loss'
  | 'quarter'
  | 'bs'
  | 'cf'
  | 'stock'
  | 'ratings'
  | 'points'
  | 'topic';

// 損益の項目（会社によって呼び名が違うので、見分けは key で）
export type ItemKey = 'revenue' | 'operating_income' | 'ordinary_income' | 'pretax_income' | 'net_income';
export type Grade = 'strong' | 'good' | 'neutral' | 'caution' | 'weak';

// 注目ポイントの1件（前後の数字があれば「16.6% → 18.7%」と出す）
export type PointItem = string | { t: string; metric?: string; before?: string; after?: string; change?: string };

export type ShortData = {
  company: string;
  code?: string; // 証券コード（分析動画の下に出す）
  headline?: string; // 今回の決算の見出し（分析データの summary.headline）
  verdict?: string; // 増収増益 など
  focus?: string[]; // 今回の注目（3つ）
  conclusion?: { strength?: string; feature?: string; concern?: string; next?: string } | null; // 総括（強み・特徴・確認点・次回確認）
  period: string;
  metric: string; // 例: 営業利益
  unit?: string; // 金額の単位（億円・億ドル）。省略は億円
  periodType?: 'Q1' | 'Q2' | 'Q3' | 'FY'; // 今回の決算がどの時点か
  trend: { l: string; rev: number; op: number; fc?: boolean }[]; // 売上と営業利益（通期）。古い順。fc＝会社予想の年（うすく出す）
  segLabel?: string; // 事業・地域・製品・顧客（「〇〇ごとの売上」の〇〇）
  segments: { name: string; rev: number; prevRev: number; op?: number | null; prevOp?: number | null }[]; // 事業ごとの売上・利益（今年・前年）
  pl: { sales: number; cost: number; sga: number } | null; // 売上→利益の構造（営業利益＝売上−原価−販管費）
  plSteps?: { key: string; label: string; v: number; kind: 'total' | 'minus' | 'plus' | 'subtotal' | 'result' }[]; // 損益の段（その他の収益・費用を含む。あればこちらで描く）
  margins: { name: string; prev: number; cur: number }[]; // 利益率（%）。粗利率・営業利益率
  netgap: { steps: { key: ItemKey; name: string; v: number }[]; prevOp: number; prevNet: number } | null; // 営業利益から純利益までの段（今年）
  forecast: { basis?: 'this' | 'next'; items: { key?: ItemKey; name: string; cur: number; next: number }[] } | null; // this＝前期の実績と今期の会社予想、next＝今期の実績と来期の予想
  progress: { pace: number; items: { key?: ItemKey; name: string; actual: number; forecast: number }[] } | null; // 通期の会社予想に対する進み具合。pace＝時期の目安（%）
  revision: { label: string; reason?: string; items: { key?: ItemKey; name: string; before: number; after: number }[] } | null; // 会社予想の修正（変わらない項目も入れる）
  dividend: { before: number; after: number; label: string } | null; // 1株配当の予想（修正前→修正後、円）
  topics: { icon: string; title: string; sub?: string }[]; // 数字以外（配当・自社株買い・M&A など）
  kpis: { key?: ItemKey; name: string; prev: number; cur: number }[]; // 決算ハイライト（売上・営業利益・経常利益・純利益）
  stock: { prices: number[]; at: number; days: string; pre?: number; post?: number; unit?: string; period?: string } | null; // 終値（古い順）、at＝発表後の最初の日の位置。pre/post があれば反応はその2つで
  bs: { assets: number; liabilities: number; equity: number; prevEquityRatio: number } | null; // 貸借対照表（今期末）。前期末の自己資本比率（%）
  bsBlocks?: { key: string; label: string; side: 'asset' | 'liability' | 'equity'; v: number; prev: number | null }[]; // 内訳（現金・売掛金・在庫・固定資産／買掛金・有利子負債・その他負債／純資産）
  cf: { begin: number; operating: number; investing: number; financing: number; other?: number; end: number } | null; // キャッシュフロー（期首の現金→期末の現金）。other＝換算差額など
  quarter: { label: string; items: { key?: ItemKey; name: string; prev: number; cur: number }[] } | null; // 直近の3か月だけ（四半期単独）を前年の同じ時期と
  ratings: { label: string; grade: Grade; reason?: string }[]; // 5つの評価（成長性・収益性・財務の安全性・稼ぐ力・資本効率）
  points: { good: PointItem[]; watch: PointItem[] }; // 注目ポイント
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
