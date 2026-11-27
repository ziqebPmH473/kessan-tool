// 項目の名前（描画に依らないので、変換 fromAnalysis.ts からも使う）
// 売上の仲間か（売上高・売上収益・営業収益・経常収益・保険収益）
export const isRev = (it: { key?: string; name: string }) => (it.key ? it.key === 'revenue' : /売上|収益/.test(it.name) && !/利益/.test(it.name));
// 決算短信の長い呼び名を、画面用に短く（親会社株主に帰属する中間純利益 → 純利益 など）
export const shortName = (s: string) => {
  if (!s) return s;
  let t = s.split('・')[0];
  t = t.replace(/^.*帰属する/, '').replace(/^親会社(株主)?(帰属)?/, '').replace(/^当社株主/, '').replace(/(中間|四半期|当期)/g, '');
  if (/純損失|当期損失/.test(t)) return '純損失';
  if (/^(純利益|利益)$/.test(t)) return '純利益';
  return t.replace('売上収益', '売上').replace('売上高', '売上');
};
