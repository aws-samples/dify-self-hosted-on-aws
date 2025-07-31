# デプロイ手順

## CDKを使用したAWSリソースのデプロイ

以下のコマンドを実行してAWSにリソースをデプロイします：

```bash
source set-env.sh && npx cdk deploy --all
```

### 手順説明

1. `source set-env.sh` - 必要な環境変数を読み込みます
2. `npx cdk deploy --all` - すべてのCDKスタックをAWSにデプロイします

### 前提条件

- AWSの認証情報が設定されていること
- `set-env.sh`ファイルが適切に設定されていること
- CDKの依存関係がインストールされていること (`npm install`)

## GitHub Actions による自動デプロイ

このプロジェクトでは GitHub Actions を使用した自動デプロイを設定しています。

### 必要なGitHub設定

#### 1. GitHub Environments

以下の環境を作成してください：
- `dev` - 開発環境用
- `prod` - 本番環境用

#### 2. Environment Secrets（各環境に設定）

各環境に以下のシークレットを設定してください：
- `AWS_ACCESS_KEY_ID` - AWS アクセスキーID
- `AWS_SECRET_ACCESS_KEY` - AWS シークレットアクセスキー  
- `AWS_ACCOUNT_ID` - AWS アカウントID（例: 058260000000）

#### 3. Repository Variables（リポジトリレベルで設定）

以下の変数をリポジトリの Variables に設定してください：
- `ALLOWED_IPV4_CIDRS` - 許可するIPアドレス範囲（CIDR形式、カンマ区切り）
  - 例: `192.168.1.0/24,10.0.0.0/8`
- `ALLOWED_COUNTRY_CODES` - 許可する国コード（ISO 3166-1 alpha-2、カンマ区切り）
  - 例: `JP,US,GB`

### 設定手順

1. GitHub リポジトリのページにアクセス
2. [Settings] → [Environments] を開く
3. 「New environment」をクリックし「dev」と「prod」を作成
4. 各環境の設定ページで「Add secret」をクリックし、上記のシークレットを登録
5. [Settings] → [Secrets and variables] → [Actions] を開く
6. 「Variables」タブで「New repository variable」をクリックし、上記の変数を登録