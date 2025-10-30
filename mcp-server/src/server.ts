import Fastify from 'fastify';
import mcpPlugin from '@mcp-it/fastify';
import { constantProductQuote, buildSwapIx } from 'dex-ai-sdk/src/index.js';
import { PublicKey } from '@solana/web3.js';

const fastify = Fastify();

await fastify.register(mcpPlugin, {
  name: 'dex-ai MCP Server',
  description: 'dex-aiプロジェクトのMCPサーバー',
});

fastify.post('/get_dex_quote', {
  schema: {
    operationId: 'get_dex_quote',
    summary: 'トークンスワップの見積もり価格を取得します',
    description: '手数料（30bps）を考慮した、決定論的な結果を返します。',
    body: {
      type: 'object',
      required: ['amountIn', 'reserveIn', 'reserveOut', 'feeBps'],
      properties: {
        amountIn: { type: 'string', description: '入力トークン量' },
        reserveIn: { type: 'string', description: '入力トークンのリザーブ量' },
        reserveOut: { type: 'string', description: '出力トークンのリザーブ量' },
        feeBps: { type: 'integer', description: '手数料（ベーシスポイント）' }
      },
    },
    response: {
      200: {
        description: '成功時のレスポンス',
        type: 'object',
        properties: {
          amountOut: { type: 'string', description: '出力トークン量' },
        },
      },
    },
  },
}, async (request, reply) => {
  const { amountIn, reserveIn, reserveOut, feeBps } = request.body;
  const params = {
    amountIn: BigInt(amountIn),
    reserveIn: BigInt(reserveIn),
    reserveOut: BigInt(reserveOut),
    feeBps: Number(feeBps),
  };
  const { amountOut } = constantProductQuote(params);
  reply.send({ amountOut: amountOut.toString() });
});

fastify.post('/build_solana_swap_instruction', {
  schema: {
    operationId: 'build_solana_swap_instruction',
    summary: 'Solana DEXのスワップトランザクション命令を構築します',
    description: 'これは命令を構築するだけで、送信はしません。',
    body: {
      type: 'object',
      required: [
        'programId', 'pool', 'user', 'userSource', 'userDestination',
        'vaultA', 'vaultB', 'tokenProgram', 'amountIn', 'minAmountOut'
      ],
      properties: {
        programId: { type: 'string' },
        pool: { type: 'string' },
        user: { type: 'string' },
        userSource: { type: 'string' },
        userDestination: { type: 'string' },
        vaultA: { type: 'string' },
        vaultB: { type: 'string' },
        tokenProgram: { type: 'string' },
        amountIn: { type: 'string' },
        minAmountOut: { type: 'string' }
      },
    },
    response: {
      200: {
        description: '命令のJSONシリアライズ',
        type: 'object',
        properties: {
          programId: { type: 'string' },
          keys: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pubkey: { type: 'string' },
                isSigner: { type: 'boolean' },
                isWritable: { type: 'boolean' },
              },
            },
          },
          data: { type: 'string', description: 'Base64エンコードされたデータ' },
        },
      },
    },
  },
}, async (request, reply) => {
  const {
    programId, pool, user, userSource, userDestination,
    vaultA, vaultB, tokenProgram, amountIn, minAmountOut
  } = request.body;
  const params = {
    programId: new PublicKey(programId),
    pool: new PublicKey(pool),
    user: new PublicKey(user),
    userSource: new PublicKey(userSource),
    userDestination: new PublicKey(userDestination),
    vaultA: new PublicKey(vaultA),
    vaultB: new PublicKey(vaultB),
    tokenProgram: new PublicKey(tokenProgram),
    amountIn: BigInt(amountIn),
    minAmountOut: BigInt(minAmountOut)
  };
  const ix = await buildSwapIx(params);
  reply.send({
    programId: ix.programId.toString(),
    keys: ix.keys.map(k => ({
      pubkey: k.pubkey.toString(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: ix.data.toString('base64'),
  });
});

const start = async () => {
  try {
    await fastify.listen({ port: 8080 });
    console.log('MCPサーバーがポート8080で起動しました');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
