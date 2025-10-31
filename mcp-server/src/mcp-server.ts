import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { constantProductQuote, buildSwapIxWithAnchor } from 'dex-ai-sdk/src/index.js';
import { PublicKey, Connection } from '@solana/web3.js';

/**
 * MCP Server for DEX AI
 * Provides tools and resources for Solana DEX operations
 */
class DexAiMcpServer {
  private server: Server;
  private connection: Connection | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'dex-ai-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_dex_quote',
            description: 'トークンスワップの見積もり価格を取得します。手数料（30bps）を考慮した、決定論的な結果を返します。',
            inputSchema: {
              type: 'object',
              properties: {
                amountIn: {
                  type: 'string',
                  description: '入力トークン量',
                },
                reserveIn: {
                  type: 'string',
                  description: '入力トークンのリザーブ量',
                },
                reserveOut: {
                  type: 'string',
                  description: '出力トークンのリザーブ量',
                },
                feeBps: {
                  type: 'number',
                  description: '手数料（ベーシスポイント）',
                  default: 30,
                },
              },
              required: ['amountIn', 'reserveIn', 'reserveOut'],
            },
          },
          {
            name: 'build_solana_swap_instruction',
            description: 'Solana DEXのスワップトランザクション命令を構築します。これは命令を構築するだけで、送信はしません。',
            inputSchema: {
              type: 'object',
              properties: {
                programId: {
                  type: 'string',
                  description: 'DEXプログラムのPublicKey',
                },
                pool: {
                  type: 'string',
                  description: 'プールのPublicKey',
                },
                user: {
                  type: 'string',
                  description: 'ユーザーのPublicKey',
                },
                userSource: {
                  type: 'string',
                  description: 'ユーザーのソーストークンアカウントのPublicKey',
                },
                userDestination: {
                  type: 'string',
                  description: 'ユーザーのデスティネーショントークンアカウントのPublicKey',
                },
                vaultA: {
                  type: 'string',
                  description: 'プールのVault AのPublicKey',
                },
                vaultB: {
                  type: 'string',
                  description: 'プールのVault BのPublicKey',
                },
                tokenProgram: {
                  type: 'string',
                  description: 'トークンプログラムのPublicKey',
                },
                amountIn: {
                  type: 'string',
                  description: '入力トークン量',
                },
                minAmountOut: {
                  type: 'string',
                  description: '最小出力トークン量（スリッページ保護）',
                },
              },
              required: [
                'programId',
                'pool',
                'user',
                'userSource',
                'userDestination',
                'vaultA',
                'vaultB',
                'tokenProgram',
                'amountIn',
                'minAmountOut',
              ],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_dex_quote': {
            const { amountIn, reserveIn, reserveOut, feeBps = 30 } = args as {
              amountIn: string;
              reserveIn: string;
              reserveOut: string;
              feeBps?: number;
            };

            // Validate inputs
            if (!amountIn || !reserveIn || !reserveOut) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Missing required fields: amountIn, reserveIn, reserveOut',
                      code: 'VALIDATION_ERROR',
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Validate BigInt conversion
            let amountInBigInt: bigint;
            let reserveInBigInt: bigint;
            let reserveOutBigInt: bigint;

            try {
              amountInBigInt = BigInt(amountIn);
              reserveInBigInt = BigInt(reserveIn);
              reserveOutBigInt = BigInt(reserveOut);
            } catch (err) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Invalid number format',
                      code: 'VALIDATION_ERROR',
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Validate values are positive
            if (amountInBigInt <= 0n || reserveInBigInt <= 0n || reserveOutBigInt <= 0n) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Values must be positive',
                      code: 'VALIDATION_ERROR',
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Validate feeBps
            if (feeBps < 0 || feeBps > 10000) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Fee (bps) must be between 0 and 10000',
                      code: 'VALIDATION_ERROR',
                    }),
                  },
                ],
                isError: true,
              };
            }

            const params = {
              amountIn: amountInBigInt,
              reserveIn: reserveInBigInt,
              reserveOut: reserveOutBigInt,
              feeBps: Number(feeBps),
            };

            const { amountOut } = constantProductQuote(params);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    amountOut: amountOut.toString(),
                  }),
                },
              ],
            };
          }

          case 'build_solana_swap_instruction': {
            const {
              programId,
              pool,
              user,
              userSource,
              userDestination,
              vaultA,
              vaultB,
              tokenProgram,
              amountIn,
              minAmountOut,
            } = args as {
              programId: string;
              pool: string;
              user: string;
              userSource: string;
              userDestination: string;
              vaultA: string;
              vaultB: string;
              tokenProgram: string;
              amountIn: string;
              minAmountOut: string;
            };

            // Validate all fields are present
            const requiredFields = {
              programId,
              pool,
              user,
              userSource,
              userDestination,
              vaultA,
              vaultB,
              tokenProgram,
              amountIn,
              minAmountOut,
            };

            for (const [key, value] of Object.entries(requiredFields)) {
              if (!value) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        error: `Missing required field: ${key}`,
                        code: 'VALIDATION_ERROR',
                      }),
                    },
                  ],
                  isError: true,
                };
              }
            }

            // Validate PublicKeys
            const publicKeys = [
              programId,
              pool,
              user,
              userSource,
              userDestination,
              vaultA,
              vaultB,
              tokenProgram,
            ];
            for (const pk of publicKeys) {
              try {
                new PublicKey(pk);
              } catch (err) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        error: `Invalid Solana public key: ${pk}`,
                        code: 'VALIDATION_ERROR',
                      }),
                    },
                  ],
                  isError: true,
                };
              }
            }

            // Validate BigInt conversion
            let amountInBigInt: bigint;
            let minAmountOutBigInt: bigint;

            try {
              amountInBigInt = BigInt(amountIn);
              minAmountOutBigInt = BigInt(minAmountOut);
            } catch (err) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Invalid number format for amountIn or minAmountOut',
                      code: 'VALIDATION_ERROR',
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Validate values are positive
            if (amountInBigInt <= 0n || minAmountOutBigInt <= 0n) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Amounts must be positive',
                      code: 'VALIDATION_ERROR',
                    }),
                  },
                ],
                isError: true,
              };
            }

            // Dynamically import Anchor for server-side use
            const anchor = await import('@coral-xyz/anchor');

            // Create a connection for Anchor provider
            const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
            if (!this.connection) {
              this.connection = new Connection(rpcUrl, 'confirmed');
            }

            const params = {
              programId: new PublicKey(programId),
              pool: new PublicKey(pool),
              user: new PublicKey(user),
              userSource: new PublicKey(userSource),
              userDestination: new PublicKey(userDestination),
              vaultA: new PublicKey(vaultA),
              vaultB: new PublicKey(vaultB),
              tokenProgram: new PublicKey(tokenProgram),
              amountIn: amountInBigInt,
              minAmountOut: minAmountOutBigInt,
            };

            const anchorExports = {
              BN: anchor.BN,
              Program: anchor.Program,
              AnchorProvider: anchor.AnchorProvider,
            };

            const ix = await buildSwapIxWithAnchor(anchorExports, params, {
              connection: this.connection,
              validateTokenAccounts: false,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    programId: ix.programId.toString(),
                    keys: ix.keys.map((k) => ({
                      pubkey: k.pubkey.toString(),
                      isSigner: k.isSigner,
                      isWritable: k.isWritable,
                    })),
                    data: ix.data.toString('base64'),
                  }),
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: `Unknown tool: ${name}`,
                    code: 'UNKNOWN_TOOL',
                  }),
                },
              ],
              isError: true,
            };
        }
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: err.message || 'Internal server error',
                code: 'INTERNAL_ERROR',
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
              }),
            },
          ],
          isError: true,
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'dex://info',
            name: 'DEX Information',
            description: 'DEX AIサーバーの情報とステータス',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'dex://info') {
        return {
          contents: [
            {
              uri: 'dex://info',
              mimeType: 'application/json',
              text: JSON.stringify({
                name: 'dex-ai-mcp-server',
                version: '1.0.0',
                status: 'active',
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
              }),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('DEX AI MCP Server running on stdio');
  }
}

// Start the MCP server
// This will be executed when the file is run directly
const server = new DexAiMcpServer();
server.run().catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});

export { DexAiMcpServer };

