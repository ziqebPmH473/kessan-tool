# 保存の消失（3回目）：localStorage の上限で、空の画面がサーバーを上書き（2026-10-14）

## 何が起きたか

2026-10-14 23:39（JST）、決算分析の PJ「3922 PR TIMES」（`p:earnings:20261014-232627-27y7`）を編集中にリロードしたら中身が消えた。
D1 の履歴（`projects_hist`）では、v11（23:38、504KB）のあと v12・v13・v14（23:39、680 バイト）がほぼ空。v13 だけ p-code に 3922 がある（消えたあとに打ち直した分）。

## 原因（有力）

- 決算分析の PJ は、分析動画の設定（`ev-viz-settings`）にサムネ画像（横 218KB・縦 176KB の data URL）が入るので 1 件 400〜520KB。
- `assets/store.js` は、開いた PJ の写しを `kt-doc:<id>` として localStorage に残し（つながらないときの起動用）、消すのは PJ を削除したときだけ。10 月に決算分析を 6 件以上作って、写しの合計が localStorage の上限（約 5MB）に届いた。
- 上限に当たると `localStorage.setItem` が例外になるが、`lsSet` は握りつぶしていた。起動時に「サーバーから読んだ中身を localStorage（`kessanTool:v1`）に書く → `restoreState` がそれを画面に戻す」の前半が失敗し、古い（空の）中身が画面に戻った。行は読めているので保存の門（`loaded`）は通り、空の画面でサーバーを上書きした。

同じ形の事故は 9/25・9/26 にもあった（`docs/impl/2026-09-25_保存の消失対策.md`）。どちらも「画面に入っていない中身で保存した」で、今回は localStorage が原因。

## 直したこと（v20261014 夜）

| 場所 | 中身 |
|---|---|
| `assets/store.js` `lsSet` | 書けたかを返し、失敗は `console.warn` と `S.lsFail` に残す |
| `applyDocsToLocal` → `KTStore.takeState()` | 画面に戻す中身をメモリ（`S.bootState`）にも持つ。`index.html` の `restoreState` は先にこれを使い、無いときだけ localStorage を読む。localStorage に書けなくても正しい中身が画面に入る |
| 起動時（server モード） | 開いていない PJ の `kt-doc:` を消す。消された PJ の `kt-pend:` も消す |
| `saveState` | 起動・PJ を開いてから 15 秒以内に、20KB 超の中身を 2KB 未満で上書きしそうなときは保存せず、右下を「PJを読み込めませんでした」（赤）にする |
| `adoptPending` | 未送信の分がほぼ空で、サーバーの中身が大きいときは未送信を捨てる（事故の名残りを送らない） |

## 復旧

v11 を戻す SQL（すみぽんが PowerShell で実行。Claude は本番 D1 に書けない）。手順はチャットに書いたもの。
