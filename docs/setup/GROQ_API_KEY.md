# 設定手順：Groq の APIキー（文字起こし用）

用途：音声の文字起こし（`functions/api/transcribe.js`、検証ページ `cut-test.html`）。
所要時間：5分ほど。料金：無料（無料枠の範囲）。

## A. Groq で APIキーを作る

1. https://console.groq.com/ を開く。
2. 右上の「Sign in」（または「Log in」）を押し、「Continue with Google」で Google アカウントでログインする。
   初めての場合は、そのままアカウントが作られる。
3. https://console.groq.com/keys を開く。
4. 「Create API Key」を押す。
5. 名前の欄に `kessan-tool` と入力して「Submit」を押す。
6. 表示されたキー（`gsk_` で始まる文字列）の右のコピーボタンを押す。
   **キーはこの画面でしか表示されない。** 閉じる前に次の B に進むか、メモ帳に一時的に貼っておく。

## B. Cloudflare Pages に登録する

1. https://dash.cloudflare.com/ を開いてログインする。
2. 左のメニューで「Workers & Pages」を押す。
   （見当たらない場合は、左メニューの「Compute (Workers)」を開くと中にある）
3. 一覧から `kessan-tool-n9bqr59wv383…` で始まるプロジェクトを押す。
   `kt-c06fd74ea079` は使っていない旧プロジェクトなので触らない。
4. 上のタブの「Settings」を押す。
5. 「Variables and Secrets」の欄にある「+ Add」を押す。
   すでに `GEMINI_API_KEY` が並んでいれば、正しい画面。
6. 次のとおり入力する。
   - Type：`Secret`（選べる場合）
   - Variable name：`GROQ_API_KEY`
   - Value：A-6 でコピーしたキーを貼り付け
   - 環境（Production / Preview の選択がある場合）：`Production`
7. 「Save」を押す。
8. A-6 でメモ帳に貼った場合は、そのメモ帳を保存せずに閉じる。

## C. 完了の連絡

チャットで「GROQ設定した」と伝える。
再デプロイ（設定を反映させるための再公開）と、本番で文字起こしが動くかの確認はこちらで行う。

## 参考：無料枠（2026-09-20 時点、whisper-large-v3-turbo）

- 1日 2,000回、1分 20回
- 音声の長さ：1時間あたり 7,200秒（2時間分）、1日あたり 28,800秒（8時間分）
- 15分の音声なら、1時間に8本まで。通常の使い方では上限に届かない。
- 使用状況：https://console.groq.com/settings/limits
