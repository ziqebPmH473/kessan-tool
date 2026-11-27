import { PLPart, SegmentsPart, StockPart, TopicPart } from './parts';
import { BSPart, CFPart, PointsPart, QuarterPart } from './parts2';
import { ForecastPart, RevisionPart, TrendPart } from './parts3';

// 部品の一覧（AIが選べるもの）
export const PARTS = {
  trend: TrendPart,
  segments: SegmentsPart,
  pl: PLPart,
  forecast: ForecastPart,
  loss: TrendPart, // 赤字転落も業績の推移の部品で描く（文言が変わる）
  topic: TopicPart,
  stock: StockPart,
  bs: BSPart,
  cf: CFPart,
  quarter: QuarterPart,
  revision: RevisionPart,
  points: PointsPart,
} as const;
