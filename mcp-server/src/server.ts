import Fastify from 'fastify';
import cors from '@fastify/cors';
import { constantProductQuote, buildSwapIxWithAnchor } from 'dex-ai-sdk/src/index.js';
import { PublicKey, Connection } from '@solana/web3.js';
import { randomUUID } from 'crypto';

// 型定義
interface GetDexQuoteBody {
  amountIn: string;
  reserveIn: string;
  reserveOut: string;
  feeBps: number;
}

interface BuildSwapInstructionBody {
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
}

// リクエスト拡張
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

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
  requestIdLogLabel: 'requestId',
  genReqId: () => randomUUID(),
});

// リクエストIDミドルウェア
fastify.addHook('onRequest', async (request, reply) => {
  request.requestId = request.id;
  request.log.info({ requestId: request.requestId }, 'Incoming request');
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

// MCP plugin removed - using standard MCP server implementation instead
// See src/mcp-server.ts for the MCP protocol implementation

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  const requestId = request.id || 'unknown';
  const logContext = {
    requestId,
    method: request.method,
    url: request.url,
    statusCode: error.statusCode || 500,
    errorCode: error.code || 'INTERNAL_ERROR',
  };

  fastify.log.error({ ...logContext, err: error }, 'Request error');
  
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  
  reply.status(statusCode).send({
    error: message,
    code: error.code || 'INTERNAL_ERROR',
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

fastify.post<{ Body: GetDexQuoteBody }>('/get_dex_quote', {
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
          requestId: { type: 'string', description: 'リクエストID' },
        },
      },
    },
  },
}, async (request, reply) => {
  const requestId = request.id;
  const logContext = { requestId, endpoint: '/get_dex_quote' };

  try {
    const { amountIn, reserveIn, reserveOut, feeBps } = request.body;
    
    request.log.info({ ...logContext, params: { amountIn, reserveIn, reserveOut, feeBps } }, 'Processing quote request');
    
    // Validate inputs
    if (!amountIn || !reserveIn || !reserveOut || feeBps === undefined) {
      request.log.warn({ ...logContext }, 'Missing required fields');
      return reply.status(400).send({
        error: 'Missing required fields',
        code: 'VALIDATION_ERROR',
        requestId,
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
      request.log.warn({ ...logContext, err }, 'Invalid number format');
      return reply.status(400).send({
        error: 'Invalid number format',
        code: 'VALIDATION_ERROR',
        requestId,
      });
    }

    // Validate values are positive
    if (amountInBigInt <= 0n || reserveInBigInt <= 0n || reserveOutBigInt <= 0n) {
      request.log.warn({ ...logContext }, 'Values must be positive');
      return reply.status(400).send({
        error: 'Values must be positive',
        code: 'VALIDATION_ERROR',
        requestId,
      });
    }

    // Validate feeBps
    if (feeBps < 0 || feeBps > 10000) {
      request.log.warn({ ...logContext, feeBps }, 'Invalid feeBps value');
      return reply.status(400).send({
        error: 'Fee (bps) must be between 0 and 10000',
        code: 'VALIDATION_ERROR',
        requestId,
      });
    }

    const params = {
      amountIn: amountInBigInt,
      reserveIn: reserveInBigInt,
      reserveOut: reserveOutBigInt,
      feeBps: Number(feeBps),
    };
    
    const { amountOut } = constantProductQuote(params);
    
    request.log.info({ ...logContext, result: { amountOut: amountOut.toString() } }, 'Quote calculated successfully');
    
    reply.send({ 
      amountOut: amountOut.toString(),
      requestId,
    });
  } catch (err: any) {
    request.log.error({ ...logContext, err }, 'Error processing quote');
    reply.status(500).send({
      error: err.message || 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId,
    });
  }
});

fastify.post<{ Body: BuildSwapInstructionBody }>('/build_solana_swap_instruction', {
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
          requestId: { type: 'string', description: 'リクエストID' },
        },
      },
    },
  },
}, async (request, reply) => {
  const requestId = request.id;
  const logContext = { requestId, endpoint: '/build_solana_swap_instruction' };

  try {
    const {
      programId, pool, user, userSource, userDestination,
      vaultA, vaultB, tokenProgram, amountIn, minAmountOut
    } = request.body;

    request.log.info({ ...logContext, params: { programId, pool, user } }, 'Processing swap instruction build request');

    // Validate all fields are present
    const requiredFields = {
      programId, pool, user, userSource, userDestination,
      vaultA, vaultB, tokenProgram, amountIn, minAmountOut
    };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        request.log.warn({ ...logContext, missingField: key }, 'Missing required field');
        return reply.status(400).send({
          error: `Missing required field: ${key}`,
          code: 'VALIDATION_ERROR',
          requestId,
        });
      }
    }

    // Validate PublicKeys
    const publicKeys = [programId, pool, user, userSource, userDestination, vaultA, vaultB, tokenProgram];
    for (const pk of publicKeys) {
      try {
        new PublicKey(pk);
      } catch (err) {
        request.log.warn({ ...logContext, invalidKey: pk }, 'Invalid Solana public key');
        return reply.status(400).send({
          error: `Invalid Solana public key: ${pk}`,
          code: 'VALIDATION_ERROR',
          requestId,
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
      request.log.warn({ ...logContext, err }, 'Invalid number format');
      return reply.status(400).send({
        error: 'Invalid number format for amountIn or minAmountOut',
        code: 'VALIDATION_ERROR',
        requestId,
      });
    }

    // Validate values are positive
    if (amountInBigInt <= 0n || minAmountOutBigInt <= 0n) {
      request.log.warn({ ...logContext }, 'Amounts must be positive');
      return reply.status(400).send({
        error: 'Amounts must be positive',
        code: 'VALIDATION_ERROR',
        requestId,
      });
    }

    // Dynamically import Anchor for server-side use
    const anchor = await import('@coral-xyz/anchor');
    
    // Create a connection for Anchor provider (optional, can use local provider)
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

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
    
    const anchorExports = {
      BN: anchor.BN,
      Program: anchor.Program,
      AnchorProvider: anchor.AnchorProvider,
    };

    request.log.info({ ...logContext }, 'Building swap instruction with Anchor');
    
    const ix = await buildSwapIxWithAnchor(anchorExports, params, {
      connection,
      validateTokenAccounts: false, // トークンアカウントの検証は無効化（必要に応じて有効化可能）
    });

    request.log.info({ ...logContext, instructionKeys: ix.keys.length }, 'Swap instruction built successfully');
    
    reply.send({
      programId: ix.programId.toString(),
      keys: ix.keys.map(k => ({
        pubkey: k.pubkey.toString(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: ix.data.toString('base64'),
      requestId,
    });
  } catch (err: any) {
    request.log.error({ ...logContext, err }, 'Error building swap instruction');
    reply.status(500).send({
      error: err.message || 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    requestId: request.id,
  };
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  fastify.log.info({ signal }, 'Received shutdown signal, closing server gracefully');
  
  try {
    await fastify.close();
    fastify.log.info('Server closed successfully');
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, 'Error during graceful shutdown');
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  fastify.log.error({ err }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  fastify.log.error({ reason, promise }, 'Unhandled rejection');
});

const start = async () => {
  try {
    // Validate environment variables
    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid PORT: ${process.env.PORT}. Must be between 1 and 65535`);
    }

    fastify.log.info({ port, host, nodeEnv: process.env.NODE_ENV }, 'Starting MCP server');
    
    await fastify.listen({ port, host });
    fastify.log.info(`MCPサーバーがポート${port}で起動しました`);
  } catch (err) {
    fastify.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
};

start();
