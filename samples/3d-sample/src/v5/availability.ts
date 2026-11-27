// 部品ごとの「使える条件」（描画に依らないので、実データの確認スクリプトからも使う）
import type { PartId, ShortData } from './types';

// 部品の名前（カタログ・AIへの説明用）
export const PART_NAMES: Record<PartId, string> = {
  trend: '業績の推移',
  segments: '事業ごとの売上',
  segprofit: '事業ごとの利益',
  pl: '売上→利益の構造',
  margin: '利益率',
  netgap: '営業利益から純利益まで',
  forecast: '会社予想',
  progress: '通期予想への進み具合',
  revision: '予想の修正',
  dividend: '配当',
  loss: '赤字転落・黒字転換',
  quarter: '直近の3か月',
  bs: '貸借対照表',
  cf: 'キャッシュフロー',
  stock: '株価の反応',
  ratings: '5つの評価',
  points: '注目ポイント',
  topic: '数字以外',
};

const turned = (a: number, b: number) => (a < 0) !== (b < 0);

// その会社の材料で、その部品が使えるか（AIには使える部品だけを渡す）
export const available = (d: ShortData, id: PartId): boolean => {
  switch (id) {
    case 'trend':
      return d.trend.length >= 2;
    case 'loss': {
      // 今回か前年が営業赤字（予想の年はくらべない）
      const a = d.trend.filter((y) => !y.fc);
      const k = d.kpis.find((x) => x.key === 'operating_income');
      return (a.length >= 2 && (a[a.length - 1].op < 0 || a[a.length - 2].op < 0)) || (!!k && (k.cur < 0 || k.prev < 0));
    }
    case 'segments':
      return d.segments.length >= 2;
    case 'segprofit':
      return d.segments.filter((s) => s.op != null && s.prevOp != null).length >= 2;
    case 'pl':
      return !!d.pl;
    case 'margin':
      return d.margins.length > 0;
    case 'netgap': {
      // 本業と最後の利益で、向きや黒字・赤字が食い違うときだけ
      const n = d.netgap;
      if (!n || n.steps.length < 2) return false;
      const op = n.steps[0].v;
      const net = n.steps[n.steps.length - 1].v;
      const go = op - n.prevOp;
      const gn = net - n.prevNet;
      return turned(op, net) || (go !== 0 && gn !== 0 && Math.sign(go) !== Math.sign(gn));
    }
    case 'forecast':
      return !!d.forecast && d.forecast.items.length > 0;
    case 'progress':
      return !!d.progress && d.progress.items.some((it) => it.forecast > 0 && it.actual >= 0);
    case 'revision':
      return !!d.revision && d.revision.items.length > 0;
    case 'dividend':
      return !!d.dividend && d.dividend.before !== d.dividend.after;
    case 'quarter':
      return !!d.quarter && d.quarter.items.length > 0;
    case 'bs':
      return !!d.bs;
    case 'cf':
      return !!d.cf;
    case 'stock':
      return !!d.stock && d.stock.prices.length >= 3;
    case 'ratings':
      return d.ratings.length > 0;
    case 'points':
      return d.points.good.length + d.points.watch.length > 0;
    case 'topic':
      return d.topics.length > 0;
  }
};
export const availableParts = (d: ShortData) => (Object.keys(PART_NAMES) as PartId[]).filter((id) => available(d, id));
