# Supabase セットアップ手順

このアプリは **Supabase 無料枠 (Free Tier)** で運用可能な設計です。  
有料機能（Storage / Edge Functions / 専用バックアップ）は一切使用しません。

## 無料枠の制限と本アプリの設計

| Supabase Free Tier | 上限 | 本アプリの想定 |
|---|---|---|
| データベース容量 | 500 MB | 1試験回 100名想定で 約 5–10 MB |
| 帯域 (egress) | 5 GB / 月 | 静的UI＋JSON通信のみ。十分余裕 |
| 認証 MAU | 50,000 | 管理者数名＋年間数百受験者で問題なし |
| API リクエスト | 無制限 | OK |
| プロジェクト数 | 2 | 本番1つで十分 |
| 自動休止 | 1週間無アクセスで休止 | 入試期間中は問題なし。再開はワンクリック |

**コストを発生させないために以下を遵守:**

- 顔写真は **Supabase Storage を使わず DB に Base64 で保持** (クライアント側で 320px JPEG にリサイズ済)
- Edge Functions は使わず PostgreSQL の RPC 関数で代用
- 認証は標準の email/password のみ (SMS OTP など有料機能は使わない)
- メール送信は Supabase 既定の SMTP (1時間4件まで)。配布メッセージは Slack/Gmail 等で別配信

## セットアップ手順

### 1. Supabase プロジェクト作成 (無料)

1. https://supabase.com にアクセスし GitHub アカウントでサインアップ
2. New Project を選択 → Region: `Northeast Asia (Tokyo)` 推奨
3. Database Password は強力なものを設定 (後で使用)
4. プロジェクト作成完了まで約2分待機

### 2. スキーマの作成

1. Supabase ダッシュボード → SQL Editor を開く
2. `db/schema.sql` の内容を全選択して実行
3. `db/rls.sql` の内容を全選択して実行

### 3. 最初の管理者を作成

1. Supabase ダッシュボード → Authentication → Users → "Add user"
2. Email / Password を入力 (Email confirm をオフ)
3. 作成されたユーザーの UUID をコピー
4. SQL Editor で以下を実行 (UUID と email を置換):

```sql
insert into public.admins (id, email, display_name)
values ('<貼り付けた UUID>', '<管理者のメール>', '管理者');
```

### 4. アプリに接続情報を設定

1. Supabase ダッシュボード → Settings → API
2. 表示される **Project URL** と **anon public** キーをコピー
3. `js/supabase-client.js` を開き、上部の `SUPABASE_URL` / `SUPABASE_ANON_KEY` に貼り付け
4. ファイルを保存して push

> **注意**: anon キーは公開されても安全な公開鍵です。RLS ポリシーでデータが保護されます。
> service_role キー は **絶対にクライアントコードに置かない** でください (DB 全権限)。

### 5. 動作確認

1. デプロイされた GitHub Pages を開く
2. 管理者ログイン画面が表示される → 上記で作成した Email / Password でログイン
3. 試験回作成 → デモデータ投入 → 各機能が動作することを確認

## 受験者の認証フロー

1. 管理者が受験者を登録 (受験番号と8桁パスワードが発行される)
2. 配布メッセージで `https://example.com/?cand=<id>&pwd=<password>` を受験者に送信
3. 受験者がアクセスすると、自動でパスワード照合 → 受験者専用セッション発行
4. RLS により受験者は **自分の行のみ** 閲覧/更新可能 (他受験者・管理データには一切アクセス不可)

## 課金が発生する可能性のあるシナリオと回避策

| シナリオ | 回避策 |
|---|---|
| 写真を Supabase Storage にアップロード | **使用しない**。DB の base64 で保持 |
| 大量受験者 (1万人超) で DB が 500MB 超過 | 試験回ごとにアーカイブ → 古い試験回は CSV 出力後に削除 |
| Edge Functions 利用 | **使用しない**。RPC 関数で代用 |
| カスタムドメインで SSL 証明書 | GitHub Pages の標準 HTTPS を使用 (無料) |
| 1週間以上アクセス無しで Project が休止 | ダッシュボードから手動再開 (即時・無料) |
| サポート | コミュニティフォーラムを利用 (無料) |

## 既存環境の Migration

`db/schema.sql` には基本情報フィールド追加 (2026-05-18) の `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` が含まれています。  
古いスキーマで運用中の場合、SQL Editor で以下のいずれかを実行してください。

- 楽な方法: `db/schema.sql` 全体を再実行（`if not exists` で既存データは保持されます）
- 個別追加:
  ```sql
  alter table public.sessions add column if not exists exam_date date;
  alter table public.sessions add column if not exists exam_location text;
  alter table public.sessions add column if not exists target_pass_count integer;
  alter table public.sessions add column if not exists notes text;
  ```

## ローカル開発時のフォールバック

`js/supabase-client.js` で `SUPABASE_URL` が未設定 (placeholder のまま) の場合、  
従来通り **localStorage モード** で動作するフォールバックを残します。  
これにより GitHub Pages 単独でもデモは可能なまま、Supabase は任意で接続可能です。
