import { ForecastPart, LossPart, PLPart, SegmentsPart, StockPart, TopicPart, TrendPart } from './parts';
import { BSPart, CFPart, PointsPart, QuarterPart, RevisionPart } from './parts2';

// 部品の一覧（AIが選べるもの）
export const PARTS = {
  trend: TrendPart,
  segments: SegmentsPart,
  pl: PLPart,
  forecast: ForecastPart,
  loss: LossPart,
  topic: TopicPart,
  stock: StockPart,
  bs: BSPart,
  cf: CFPart,
  quarter: QuarterPart,
  revision: RevisionPart,
  points: PointsPart,
} as const;
