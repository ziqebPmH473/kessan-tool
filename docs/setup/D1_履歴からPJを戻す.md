# D1 の履歴（projects_hist）から PJ を戻す手順

PJ の中身が空で上書きされたときに、履歴の版を現在の行に戻す。Claude は本番 D1 に書けないので、すみぽんが PowerShell で実行する（このPCは `wrangler login` 済み）。

`Authentication error [code: 10000]` が出たら、ログインの権限が切れている（`npx.cmd wrangler whoami` の Token Permissions に `d1` が無い）。すみぽんが PowerShell で `npx.cmd wrangler login` を実行し、開いたブラウザで「Allow」を押すと直る（2026-10-28）。

## 1. 戻したい版を確かめる（読むだけ。Claude がやる）

```powershell
npx.cmd wrangler d1 execute kessan-tool --remote --json --command "SELECT version, updated_at, saved_at, length(json) AS size, title FROM projects_hist WHERE id='<PJのid>' ORDER BY version"
```

`size` が大きく、`title` が入っている版が本物。小さい版（700 バイト前後）は空の画面で上書きされたもの。

## 2. 戻す（すみぽんが実行）

`<PJのid>` と `<版>` と `<題名>` を入れ替える。1行で貼る。途中で `Ok to proceed? (y/N)` と聞かれたら `y`。

```powershell
npx.cmd wrangler d1 execute kessan-tool --remote --command "INSERT OR REPLACE INTO projects_hist (id,version,kind,title,json,meta,updated_at,saved_at) SELECT id,version,kind,title,json,meta,updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM projects WHERE id='<PJのid>'; UPDATE projects SET json=(SELECT json FROM projects_hist WHERE id='<PJのid>' AND version=<版>), title='<題名>', meta=(SELECT meta FROM projects_hist WHERE id='<PJのid>' AND version=<版>), version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='<PJのid>'"
```

最初の文は、いまの行（空のもの）も履歴に残す保険。2つ目が戻す本体。版の番号は 1 つ進む。

## 3. 確かめる（Claude がやる）

```powershell
npx.cmd wrangler d1 execute kessan-tool --remote --json --command "SELECT version, title, length(json) AS size, updated_at FROM projects WHERE id='<PJのid>'"
```

## 4. 画面で開く

ツールを再読み込みして（右上の版が新しいことを確かめる）、PJ の一覧からその PJ を開く。
PDF・音声などのファイル（R2）は行とは別に残っているので、戻した行と一緒に出る。

## 2026-10-14 の例（3922 PR TIMES）

- id：`p:earnings:20261014-232627-27y7`、戻す版：11（23:38、504KB）、題名：`3922 PR TIMES`
- 経緯と対策：`docs/impl/2026-10-14_保存の消失_localStorage上限.md`
