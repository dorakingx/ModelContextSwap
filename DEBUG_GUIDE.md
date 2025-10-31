# デバッグガイド: `_bn` エラーの詳細診断

## 🔍 エラー詳細の確認方法

### 1. デバッグ版の実行

```bash
# SDKをビルド
cd sdk && npm run build && cd ..

# デバッグ版を実行
node examples/agent.ts
```

実行すると、以下の詳細情報が出力されます：
- エラーメッセージ
- スタックトレース（_bn/BN関連の行をハイライト）
- エラーの型とコンストラクタ
- 環境情報（Node.jsバージョン、プラットフォーム）
- 依存関係のバージョン情報

### 2. スタックトレースの読み方

スタックトレースで `⚠️` マークが付いている行は、`_bn` や `BN` に関連するエラーが発生している可能性が高い箇所です。

例：
```
⚠️  at swapMethod.accounts (node_modules/@coral-xyz/anchor/dist/cjs/program/namespace/methods.js:123:45)
   at buildSwapIxWithAnchor (sdk/src/index.ts:398:23)
```

この場合、`@coral-xyz/anchor` の内部で `_bn` エラーが発生している可能性があります。

## 🛠️ トラブルシューティング手順

### ステップ1: 依存関係の確認

```bash
# package.jsonを確認
cat sdk/package.json | grep -E "(bn|anchor|solana)"

# 期待されるバージョン:
# - @coral-xyz/anchor: ^0.30.1
# - @solana/web3.js: ^1.95.3
# - bs58: ^6.0.0
```

### ステップ2: node_modulesのクリーンアップ

```bash
# すべてのnode_modulesを削除
rm -rf node_modules sdk/node_modules web/node_modules
rm -rf sdk/dist

# package-lock.jsonも削除（必要に応じて）
rm -f package-lock.json sdk/package-lock.json web/package-lock.json

# 再インストール
npm install --legacy-peer-deps
cd sdk && npm install --legacy-peer-deps && npm run build && cd ..
cd web && npm install --legacy-peer-deps && cd ..
```

### ステップ3: bn.jsのバージョン確認

```bash
# bn.jsのバージョンを確認
npm list bn.js
npm list --prefix sdk bn.js

# 複数のバージョンがインストールされている場合は問題の原因になる可能性があります
# 推奨: ^5.0.0（Anchorが内部で使用）
```

### ステップ4: Anchor IDLの確認

```bash
# Anchorのバージョン確認
anchor --version

# IDLファイルの確認
cat sdk/src/dex_ai.json | head -20

# IDLを再生成する場合（Anchorプロジェクトの場合）
cd programs/dex-ai
anchor build
```

## 📊 エラーパターンと対処法

### パターン1: `Cannot read properties of undefined (reading '_bn')`

**原因**: PublicKeyの`_bn`プロパティが`undefined`

**対処法**:
1. PublicKey作成後の`_bn`検証を確認（既に実装済み）
2. APIレスポンスからのPublicKey再構築時の検証を確認（既に実装済み）
3. エラーメッセージでどのPublicKeyで問題が発生したか確認

### パターン2: BN初期化エラー

**原因**: BNコンストラクタに`undefined`が渡されている

**対処法**:
1. `safeConvertToBN`関数を使用（既に実装済み）
2. パラメータの値が正しく設定されているか確認
3. エラーメッセージでどのパラメータで問題が発生したか確認

### パターン3: Anchor内部エラー

**原因**: Anchorが内部的に`_bn`にアクセスしようとして失敗

**対処法**:
1. Anchorに渡す前にすべてのPublicKeyの`_bn`を検証（既に実装済み）
2. Anchorのバージョンを確認し、必要に応じて更新
3. IDLファイルが最新か確認

## 🔬 詳細なデバッグ方法

### ブラウザコンソールでの確認

1. ブラウザの開発者ツールを開く（F12）
2. Consoleタブを開く
3. エラーが発生した際の詳細なログを確認

エラーメッセージには以下の情報が含まれます：
- どのパラメータで問題が発生したか
- BNインスタンスの状態
- PublicKeyの`_bn`プロパティの状態
- スタックトレース

### Vercelログでの確認

1. Vercelダッシュボードにログイン
2. プロジェクトを選択
3. Functionsタブ → ログを確認

以下のログを探してください：
- `[API]` で始まるログ
- `[SDK]` で始まるログ
- エラースタックトレース

## 📝 エラー報告時の情報

エラーが発生した場合は、以下の情報を含めて報告してください：

1. **完全なエラーメッセージ**（スタックトレース含む）
2. **実行環境**:
   - Node.jsバージョン
   - OS（Windows/Mac/Linux）
   - 実行場所（ローカル/Vercel）
3. **依存関係のバージョン**:
   ```bash
   npm list @coral-xyz/anchor @solana/web3.js bs58
   ```
4. **再現手順**:
   - どの操作でエラーが発生したか
   - エラーが発生する前の状態

## ✅ 確認済みの対策

以下の対策は既に実装済みです：

- ✅ BN初期化時のundefined/nullチェック
- ✅ PublicKey作成後の`_bn`プロパティ検証
- ✅ トークンアカウントの存在確認（オプション）
- ✅ 詳細なエラーメッセージとスタックトレース
- ✅ デバッグ用のログ出力

## 🚀 次のステップ

1. デバッグ版を実行してエラーの詳細を確認
2. スタックトレースの`⚠️`マークが付いている行を特定
3. エラーメッセージに含まれる詳細情報を確認
4. 必要に応じて依存関係をクリーンアップして再インストール

