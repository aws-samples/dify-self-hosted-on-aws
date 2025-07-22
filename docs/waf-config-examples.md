# WAF設定例

## 環境変数を使用した設定

WAF設定は環境変数を使用して管理します。以下の環境変数を設定してください：

### 環境変数の設定

```bash
# IPv4アドレス制限
export ALLOWED_IPV4_CIDRS="203.0.113.0/24,198.51.100.0/24,192.168.1.100/32"

# IPv6アドレス制限（オプション）
export ALLOWED_IPV6_CIDRS="2001:db8::/64"

# 国別制限（オプション）
export ALLOWED_COUNTRY_CODES="JP,US"
```

## 1. 特定のIPアドレスからのアクセスのみ許可

```bash
# 環境変数を設定
export ALLOWED_IPV4_CIDRS="203.0.113.0/24,198.51.100.0/24,192.168.1.100/32"
```

```typescript
// bin/cdk.ts の設定（自動的に環境変数から読み取られます）
export const props: EnvironmentProps = {
  awsRegion: 'us-west-2',
  awsAccount: process.env.CDK_DEFAULT_ACCOUNT!,
  difyImageTag: '1.4.3',
  difyPluginDaemonImageTag: '0.1.2-local',
  // WAF設定は環境変数から自動的に読み取られます
};
```

## 2. 特定の国からのアクセスのみ許可

```bash
# 環境変数を設定
export ALLOWED_COUNTRY_CODES="JP,US"
```

## 3. IPアドレスと国の組み合わせ制限

```bash
# 環境変数を設定
export ALLOWED_IPV4_CIDRS="203.0.113.0/24"
export ALLOWED_COUNTRY_CODES="JP"
```

## 4. IPv6アドレスの制限

```bash
# 環境変数を設定
export ALLOWED_IPV6_CIDRS="2001:db8::/64"
```

## 5. 複数の制限を組み合わせ

```bash
# 環境変数を設定
export ALLOWED_IPV4_CIDRS="203.0.113.0/24,198.51.100.0/24"
export ALLOWED_IPV6_CIDRS="2001:db8::/64"
export ALLOWED_COUNTRY_CODES="JP,US"
```

## 6. 制限なし（すべてのアクセスを許可）

```bash
# 環境変数を設定しないか、以下のように設定
export ALLOWED_IPV4_CIDRS="0.0.0.0/0"
```

## 注意事項

1. **CloudFront統合**: WAFはCloudFrontと統合されて動作します
2. **リージョン**: WAFはus-east-1リージョンに作成されます（CloudFront要件）
3. **デフォルト動作**: 許可されていないIPアドレスや国からのアクセスはブロックされます
4. **設定変更**: 設定を変更した後は `npx cdk deploy --all` で再デプロイが必要です

## デプロイ手順

1. 環境変数を設定します：
   ```bash
   export ALLOWED_IPV4_CIDRS="203.0.113.0/24"
   export ALLOWED_COUNTRY_CODES="JP"
   ```

2. CDKをデプロイします：
   ```bash
   npx cdk deploy --all
   ```

3. デプロイ完了後、WAFが有効になっていることを確認

## トラブルシューティング

- WAFが有効になっている場合、許可されていないIPアドレスからアクセスすると403エラーが表示されます
- CloudWatchでWAFのメトリクスを確認できます
- WAFルールの優先順位は自動的に設定されます

## 環境変数の詳細

| 環境変数名 | 説明 | 例 | デフォルト |
|-----------|------|-----|-----------|
| `ALLOWED_IPV4_CIDRS` | 許可するIPv4アドレス範囲（CIDR形式） | `203.0.113.0/24,198.51.100.0/24` | `0.0.0.0/0` |
| `ALLOWED_IPV6_CIDRS` | 許可するIPv6アドレス範囲（CIDR形式） | `2001:db8::/64` | 制限なし |
| `ALLOWED_COUNTRY_CODES` | 許可する国コード（ISO 3166-1 alpha-2） | `JP,US` | 制限なし |

## セキュリティのベストプラクティス

1. **最小権限の原則**: 必要最小限のIPアドレス範囲のみを許可する
2. **定期的な見直し**: 許可リストを定期的に見直し、不要なエントリを削除する
3. **ログ監視**: CloudWatchでWAFのログを監視し、不正なアクセスを検出する
4. **段階的な制限**: 最初は緩い制限から始めて、徐々に厳しくする 