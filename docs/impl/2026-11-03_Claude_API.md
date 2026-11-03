# AI の呼び出しに Claude（Anthropic）を足す（2026-11-03）

依頼：Gemini の API を呼んでいる箇所で Claude の API も選べるようにしたい（無料枠を試したい）。
Notion：決算ツールPJタスク「AIの呼び出し：Gemini に加えて Claude API（Anthropic）も選べるようにする」

## 作り

- **選び方**：モデルの選択肢に `claude-haiku-5-5`・`claude-sonnet-5-5`・`claude-opus-5-5` を足しただけ。モデル名が `claude-` で始まれば Claude、それ以外は Gemini。
  画面の `<select>` 6か所（出力データ作成・記事・動画の読み取り・決算分析の図解 など）、`VD_MODEL_OPTIONS`、`YT_MODEL_LIST`。
- **呼び出し**：`index.html` の `aiFetch()` に Anthropic の分岐を足した（`POST https://api.anthropic.com/v1/messages`、`anthropic-version: 2026-10-21`、画面から直接呼ぶための `anthropic-dangerous-direct-browser-access: true`）。
  資料・添付（PDF は document、画像は image）・検索（web_search）・URL読み（web_fetch）・JSON指定（system で指示）を Gemini と同じ意味に組み立てる。
  返す形は Gemini と同じ `{ok,text,usage,model,fellBack,failures}`。usage は Gemini の名前（promptTokenCount など）に寄せているので、画面のトークン表示はそのまま動く。
- **キー**：Cloudflare の環境変数 `ANTHROPIC_API_KEY`。`/api/gemini-key` が `claudeKey` として Gemini のキーと一緒に返す。どちらか片方だけでも動く。
  設定手順は `docs/setup/ANTHROPIC_API_KEY.md`。
- **予備**：画面にキーを渡せないURL（プレビュー）で通る `functions/api/analyze.js` にも同じ分岐を足した。
- **降格の鎖**：横動画の `ytModels()` は、Claude を選んだら Claude の中だけで下へ（Opus → Sonnet → Haiku）、Gemini・自動は Gemini の中だけ。Gemini の上限で勝手に Claude（課金）へは行かない。
- Claude が安全側で断ったとき（`stop_reason: refusal`）は、そのモデルを諦めて次へ。
- temperature は Claude には渡さない（API版 2026-10-21 では受け付けない）。

## 未確認

- 本番でキーを入れてからの実動作（Haiku 5.5 で出力データ作成・記事・読み取り）。
- 無料枠の有無・量は Anthropic 側の表示（https://console.anthropic.com/settings/usage）で確認する。
