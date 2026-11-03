# 設定手順：Claude（Anthropic）の APIキー

用途：AI の呼び出しで、モデルに「Claude Haiku 5.5 / Sonnet 5.5 / Opus 5.5」を選んだときに使う（`index.html` の `aiFetch`、予備で `functions/api/analyze.js`）。
所要時間：5分ほど。Gemini のキーはそのまま残す（Gemini のモデルを選べば今までどおり Gemini を使う）。

## A. Anthropic で APIキーを作る

1. https://console.anthropic.com/ を開き、「Log in」でログインする（初めてなら「Sign up」でアカウントを作る）。
2. https://console.anthropic.com/settings/keys を開く。
3. 「Create Key」を押す。
4. 名前の欄に `kessan-tool` と入力し、Workspace は `Default` のままで「Add」（または「Create Key」）を押す。
5. 表示されたキー（`sk-ant-` で始まる文字列）の右の「Copy」を押す。
   **キーはこの画面でしか表示されない。** 閉じる前に次の B に進むか、メモ帳に一時的に貼っておく。

## B. Cloudflare Pages に登録する

1. https://dash.cloudflare.com/ を開いてログインする。
2. 左のメニューで「Workers & Pages」を押す。
   （見当たらない場合は、左メニューの「コンピューティング (Workers)」を開くと中にある）
3. 一覧から `kessan-tool-n9bqr59wv383…` で始まるプロジェクトを押す。
   `kt-c06fd74ea079` は使っていない旧プロジェクトなので触らない。
4. 上のタブの「設定」（Settings）を押す。
5. 「変数とシークレット」（Variables and Secrets）の欄にある「+ 追加」（+ Add）を押す。
   すでに `GEMINI_API_KEY`・`GROQ_API_KEY` が並んでいれば、正しい画面。
6. 次のとおり入力する。
   - 種類（Type）：`シークレット`（Secret）
   - 変数名（Variable name）：`ANTHROPIC_API_KEY`
   - 値（Value）：A-5 でコピーしたキーを貼り付け
   - 環境（Production / Preview の選択がある場合）：`Production`
7. 「保存」（Save）を押す。
8. A-5 でメモ帳に貼った場合は、そのメモ帳を保存せずに閉じる。

## C. ローカルで試す場合（任意）

`C:\work\kessan-tool\.dev.vars` に次の1行を足す（`.dev.vars` は Git に入らない）。

```
ANTHROPIC_API_KEY=ここにキー
```

## D. 完了の連絡

チャットで「Claudeのキー設定した」と伝える。
再デプロイ（設定を反映させるための再公開）と、本番でモデルに Claude を選んで動くかの確認はこちらで行う。

## 参考

- 使った量・残りの枠：https://console.anthropic.com/settings/usage
- 料金の目安（100万トークンあたり、2026-11-03 時点）：Haiku 5.5 入力 $0.10／出力 $0.50、Sonnet 5.5 入力 $2／出力 $10、Opus 5.5 入力 $4／出力 $20。
  無料枠の範囲を超えると課金になるので、まずは Haiku 5.5 から試すのがおすすめ。
