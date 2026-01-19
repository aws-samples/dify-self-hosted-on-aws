# README_NHS — Dify Self-Hosted on AWS（CDK）安全な更新デプロイ手順

このドキュメントは、**既にAWS上にデプロイ済みの Dify on AWS（AWS CDK / CloudFormation）**に対して、
別フォルダ（別クローン）からでも **同じスタックへ安全に更新デプロイ**するための手順をまとめたものです。

> 重要
> - CDKは「スタック名（CloudFormation）」と「環境（アカウント/リージョン）」が一致して初めて “更新” になります。
> - 1つでもズレると **別環境へ新規作成**になったり、意図せぬ **置換（データ消失/ダウンタイム）**に繋がります。

---

## 0. 事前知識（このリポジトリの構造）

- CDKアプリ本体は `cdk.json` から `bin/cdk.ts` を実行します
- メインスタックは `bin/cdk.ts` 内で `new DifyOnAwsStack(app, 'DifyOnAwsStack', ...)` として定義されています
  - CloudFormationのスタック名も基本的に `DifyOnAwsStack` になります
- 条件により `us-east-1` に追加スタックが作られます（CloudFront向け証明書/WAF）
  - `new UsEast1Stack(app, 'DifyOnAwsUsEast1Stack...', { env: { region: 'us-east-1' } })`

---

## 1. 事前準備（必須）

### 1.1 ツール
- Node.js（推奨: 最新LTS。2026-01時点では 24.x が Active LTS）
  - 本リポジトリは `.nvmrc` に LTS を記載しています
  - Node 18 はEOLのため非推奨です
- AWS CLI
- Docker（CDKのアセットビルドに使用）

> Node.js 18 の警告について
> - `AWS SDK for JavaScript v3` は Node 18 を **2026年1月**にサポート終了予定と案内されています（実行時に警告が出ます）。
> - AWS CDK も Node 18 のサポートを終了しています（2025-11-30）。

### 1.3 CDK CLI の“最新版”について
CDKのコマンドは `npx cdk ...` で実行しますが、実際に使われるバージョンは次のどれかです。

- リポジトリの `devDependencies`（`aws-cdk`）
- グローバルインストール済みの `cdk`（環境による）
- `npx` が都度取得するCLI（環境による）

事故防止の観点では、**リポジトリに `aws-cdk` のバージョンを固定して、常に同じCLIを使う**のが安定です。

確認コマンド例：
- `npx cdk --version`

### 1.2 AWS認証（事故防止のため最重要）
更新対象のアカウント/リージョンへ接続していることを必ず確認してください。

- 現在の認証先を確認
  - `aws sts get-caller-identity`
- デフォルトリージョン確認
  - `aws configure get region`

> 推奨
> - 可能なら `AWS_PROFILE` を明示して実行（人為ミスが減ります）
> - 可能なら `aws cloudformation ... --region ap-northeast-1` のように **リージョン明示**も検討

---

## 2. “更新対象の既存スタック”を特定する

### 2.1 既存スタック名を確認
まず、更新したい既存スタックが **どの名前**で作られているかを確定します。

例：
- `DifyOnAwsStack`

確認例：
- `aws cloudformation describe-stacks --stack-name DifyOnAwsStack`

### 2.2 既存の出力を控える
最低限、以下の出力は控えておくと安心です。

- `DifyUrl`
- `ConsoleConnectToTaskCommand`

---

## 3. `cdk bootstrap` はやらかし？（結論：ほぼ大丈夫）

あなたのログでは以下のように **2リージョン**がブートストラップされています：

- `aws://<account>/us-east-1`
- `aws://<account>/ap-northeast-1`

### 3.1 なぜ `us-east-1` が出るのか
このリポジトリの `bin/cdk.ts` は、次の条件で `UsEast1Stack` を作成します：

- `useCloudFront` が有効（デフォルト true 扱い）
- かつ `domainName` または `allowedIPv4Cidrs` / `allowedIPv6Cidrs` が設定されている

`allowedIPv4Cidrs` を設定すると、CloudFront 用の WAF（スコープが `CLOUDFRONT`）等の都合で **us-east-1 を使う構成**になり得ます。

### 3.2 ブートストラップ自体は「デプロイ」ではない
`cdk bootstrap` は各リージョンに `CDKToolkit` スタック（S3バケットやロール等）を作るだけで、
**DifyOnAwsStack を更新する操作ではありません**。

- つまり「Difyが壊れた/勝手に更新された」という類の事故には通常直結しません

### 3.3 片付けは必要？（メリット/デメリット）
`us-east-1` を今後使わないなら `CDKToolkit` を削除する選択肢もあります。

- メリット
  - 不要リソースを減らせる（軽微なコスト/管理対象の削減）
- デメリット
  - 将来 CloudFront + カスタムドメイン/WAF を使う方針に変わった時、再度 bootstrap が必要
  - 既に他のCDKプロジェクトが us-east-1 の `CDKToolkit` を使っている場合、影響が出る可能性

---

## 4. 更新デプロイの安全手順（推奨フロー）

ここからが本題です。**更新は段階的に**やります。

### 4.1 “同じスタックに更新する”ための前提合わせ
`bin/cdk.ts` を確認し、次を合わせます：

- `awsRegion`：既存スタックのリージョンと一致（例：`ap-northeast-1`）
- `awsAccount`：できれば固定値（例：`588738587566`）で明示
  - `process.env.CDK_DEFAULT_ACCOUNT` 依存だと、誤認証で事故りやすいです
- `subDomain` / `domainName` / `useCloudFront` / `allowedIPv4Cidrs` など：既存と同じ意図

> 特に注意
> - 既存環境が古いDifyバージョンで動いている場合、`difyImageTag` を大きく上げるとDBマイグレーション等の影響が出ます。
> - まずは **インフラ変更とアプリ更新（タグ変更）を分ける**のが安全です。

### 4.2 依存関係を固定してビルド
- `npm ci`

任意（CI相当のチェック）：
- `npm run build`
- `npm run test`

### 4.3 スタック一覧を確認（想定外の新規作成を防ぐ）
- `npx cdk list`

ここで `DifyOnAwsStack` が出ることを確認します。

### 4.4 `cdk diff`（必須）
- `npx cdk diff --all`

特に以下が出たら要注意です：
- **Replacement（置換）**
- RDS/Aurora、ElastiCache、S3バケット、CloudFront Distribution などの大規模変更

### 4.5 変更セットで止める（より安全）
可能なら、まず変更セット作成だけ行い、実行前に内容をレビューします。

- `npx cdk deploy --all --no-execute`

### 4.6 更新を適用
レビューOKなら実行します。

- `npx cdk deploy --all`

---

## 5. デプロイ後の確認（最低限）

- CloudFormation
  - `DifyOnAwsStack` が `UPDATE_COMPLETE` で終わっている
- ECS
  - `ApiService` / `WebService` が安定稼働している（再起動ループしていない）
- アプリ
  - `DifyUrl` へアクセスできる
- ログ
  - CloudWatch Logs でエラーが増えていない

---

## 6. Difyのアップグレードを行う場合（安全な進め方）

このリポジトリは `ApiService` 側で `autoMigration: true` を指定しており、
コンテナ起動時に自動マイグレーションが走る想定です。

### 推奨アプローチ
- まずは **現状のタグに合わせて**“差分が小さい状態”で `cdk diff` が安定することを確認
- その後、Difyのタグを上げてアップグレード

### 例：アップグレードで気を付けること
- DBマイグレーションが失敗すると復旧に時間が掛かります
- 可能なら事前にDBスナップショット等のバックアップ方針を用意
- 破壊的変更がある場合は、`autoMigration` を一時的に止めて手動作業に切り替える選択肢も検討
  - （README本体にも記載されている「手動マイグレーション」手順を参照）

---

## 7. `simple-deploy.sh` について（参考）

`simple-deploy.sh` は CloudShell のようなローカル容量が厳しい環境向けで、
内部で CodeBuild を使って `cdk deploy --all` しています。

- ふだんの更新は、ローカルで `cdk diff` → `cdk deploy` の方が制御しやすくおすすめです
- `simple-deploy.sh` は `AdministratorAccess` を使う構成になっているため、運用ルール次第では避けたい場合があります

---

## Appendix: 参考情報（一次情報）

- AWS SDK for JavaScript v3 の Node.js サポート方針
  - https://aws.amazon.com/blogs/developer/aws-sdk-for-javascript-aligns-with-node-js-release-schedule/
- CDK CLI Notices（Noticesはエラーではない）
  - https://github.com/aws/aws-cdk/wiki/CLI-Notices
- Node 18 サポート終了（CDK側）
  - https://github.com/aws/aws-cdk/issues/34635
- CDK CLI telemetry（Noticesに出ていた件）
  - https://github.com/aws/aws-cdk/issues/34892

> 注記
> - `docs.aws.amazon.com` の一部ページは環境によって閲覧がブロックされることがあり、本手順は上記GitHub/AWSブログ等の公開情報も根拠にしています。
