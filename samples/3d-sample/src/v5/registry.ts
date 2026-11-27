import { PLPart, SegmentsPart, StockPart, TopicPart } from './parts';
import { BSPart, CFPart, PointsPart, QuarterPart } from './parts2';
import { ForecastPart, RevisionPart, TrendPart } from './parts3';
import { DividendPart, MarginPart, NetGapPart, ProgressPart, RatingsPart, SegProfitPart } from './parts4';

// 部品の一覧（AIが選べるもの）
export const PARTS = {
  trend: TrendPart,
  segments: SegmentsPart,
  segprofit: SegProfitPart,
  pl: PLPart,
  margin: MarginPart,
  netgap: NetGapPart,
  forecast: ForecastPart,
  progress: ProgressPart,
  revision: RevisionPart,
  dividend: DividendPart,
  loss: TrendPart, // 赤字転落・黒字転換も業績の推移の部品で描く（文言が変わる）
  quarter: QuarterPart,
  bs: BSPart,
  cf: CFPart,
  stock: StockPart,
  ratings: RatingsPart,
  points: PointsPart,
  topic: TopicPart,
} as const;

export { PART_NAMES, available, availableParts } from './availability';
