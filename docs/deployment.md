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