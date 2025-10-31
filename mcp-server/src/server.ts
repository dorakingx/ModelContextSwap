import Fastify from 'fastify';
import mcpPlugin from '@mcp-it/fastify';
import cors from '@fastify/cors';
import { constantProductQuote, buildSwapIx } from 'dex-ai-sdk/src/index.js';
import { PublicKey } from '@solana/web3.js';

const fastify = Fastify({
  logger: process.env.NODE_ENV === 'development' ? {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  } : true,
});

// CORS configuration
await fastify.register(cors, {
  origin: (origin, cb) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
});

await fastify.register(mcpPlugin, {
  name: 'dex-ai MCP Server',
  description: 'dex-aiプロジェクトのMCPサーバー',
});

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  
  reply.status(statusCode).send({
    error: message,
    code: error.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
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
  try {
    const { amountIn, reserveIn, reserveOut, feeBps } = request.body as any;
    
    // Validate inputs
    if (!amountIn || !reserveIn || !reserveOut || feeBps === undefined) {
      return reply.status(400).send({
        error: 'Missing required fields',
        code: 'VALIDATION_ERROR',
      });
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
      return reply.status(400).send({
        error: 'Invalid number format',
        code: 'VALIDATION_ERROR',
      });
    }

    // Validate feeBps
    if (feeBps < 0 || feeBps > 10000) {
      return reply.status(400).send({
        error: 'Fee (bps) must be between 0 and 10000',
        code: 'VALIDATION_ERROR',
      });
    }

    const params = {
      amountIn: amountInBigInt,
      reserveIn: reserveInBigInt,
      reserveOut: reserveOutBigInt,
      feeBps: Number(feeBps),
    };
    
    const { amountOut } = constantProductQuote(params);
    reply.send({ amountOut: amountOut.toString() });
  } catch (err: any) {
    fastify.log.error(err);
    reply.status(500).send({
      error: err.message || 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
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
  try {
    const {
      programId, pool, user, userSource, userDestination,
      vaultA, vaultB, tokenProgram, amountIn, minAmountOut
    } = request.body as any;

    // Validate all fields are present
    const requiredFields = {
      programId, pool, user, userSource, userDestination,
      vaultA, vaultB, tokenProgram, amountIn, minAmountOut
    };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return reply.status(400).send({
          error: `Missing required field: ${key}`,
          code: 'VALIDATION_ERROR',
        });
      }
    }

    // Validate PublicKeys
    const publicKeys = [programId, pool, user, userSource, userDestination, vaultA, vaultB, tokenProgram];
    for (const pk of publicKeys) {
      try {
        new PublicKey(pk);
      } catch (err) {
        return reply.status(400).send({
          error: `Invalid Solana public key: ${pk}`,
          code: 'VALIDATION_ERROR',
        });
      }
    }

    // Validate BigInt conversion
    let amountInBigInt: bigint;
    let minAmountOutBigInt: bigint;
    
    try {
      amountInBigInt = BigInt(amountIn);
      minAmountOutBigInt = BigInt(minAmountOut);
    } catch (err) {
      return reply.status(400).send({
        error: 'Invalid number format for amountIn or minAmountOut',
        code: 'VALIDATION_ERROR',
      });
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
      minAmountOut: minAmountOutBigInt
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
  } catch (err: any) {
    fastify.log.error(err);
    reply.status(500).send({
      error: err.message || 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    fastify.log.info(`MCPサーバーがポート${port}で起動しました`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
