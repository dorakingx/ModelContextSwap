# DEX AI MCP Server

Model Context Protocol (MCP) サーバーとして動作するDEX AIサーバーです。標準のMCPプロトコルを使用して、ツールとリソースを提供します。

## 機能

### ツール

1. **get_dex_quote** - トークンスワップの見積もり価格を取得
   - `amountIn`: 入力トークン量（文字列）
   - `reserveIn`: 入力トークンのリザーブ量（文字列）
   - `reserveOut`: 出力トークンのリザーブ量（文字列）
   - `feeBps`: 手数料（ベーシスポイント、デフォルト: 30）

2. **build_solana_swap_instruction** - Solana DEXのスワップトランザクション命令を構築
   - `programId`: DEXプログラムのPublicKey
   - `pool`: プールのPublicKey
   - `user`: ユーザーのPublicKey
   - `userSource`: ユーザーのソーストークンアカウントのPublicKey
   - `userDestination`: ユーザーのデスティネーショントークンアカウントのPublicKey
   - `vaultA`: プールのVault AのPublicKey
   - `vaultB`: プールのVault BのPublicKey
   - `tokenProgram`: トークンプログラムのPublicKey
   - `amountIn`: 入力トークン量（文字列）
   - `minAmountOut`: 最小出力トークン量（文字列）

### リソース

- **dex://info** - DEX AIサーバーの情報とステータス

## 使用方法

### MCPサーバーとして起動

標準入力/出力を使用してMCPプロトコルで通信します：

```bash
npm run start:mcp
```

または：

```bash
ts-node src/mcp-server.ts
```

### HTTPサーバーとして起動

FastifyベースのHTTPサーバーとして起動します：

```bash
npm start
```

または：

```bash
ts-node src/server.ts
```

## 環境変数

- `SOLANA_RPC_URL`: Solana RPCエンドポイント（デフォルト: `https://api.devnet.solana.com`）
- `PORT`: HTTPサーバーのポート（デフォルト: `8080`）
- `HOST`: HTTPサーバーのホスト（デフォルト: `0.0.0.0`）
- `NODE_ENV`: 環境（`development`または`production`）

## MCPクライアント設定例

MCPクライアント（例: Claude Desktop）で使用する場合の設定例：

```json
{
  "mcpServers": {
    "dex-ai": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/mcp-server.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com"
      }
    }
  }
}
```

## 開発

### ビルド

```bash
npm run build:mcp
```

### 依存関係のインストール

```bash
npm install
```

## ライセンス

MIT

