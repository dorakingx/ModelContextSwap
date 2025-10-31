import { PublicKey, Connection, TransactionInstruction, SystemProgram } from "@solana/web3.js";
// Anchor is intentionally not imported at build time for Vercel/Turbopack compatibility
// The caller should provide the Anchor exports when invoking functions that need it
type AnchorExports = {
  BN: any;
  Program: new (idl: any, programId: PublicKey, provider: any) => any;
  AnchorProvider: { local: () => any };
  Idl?: any;
};
import idl from "./dex_ai.json";

// Validation helper functions
function assertPubkey(name: string, v: string | PublicKey | undefined | null): PublicKey {
  if (!v) throw new Error(`${name} is missing`);
  try {
    return v instanceof PublicKey ? v : new PublicKey(v);
  } catch (err: any) {
    throw new Error(`${name} is invalid: ${err.message || "Invalid public key"}`);
  }
}

function assertBN(name: string, BN: any, value: string | number | bigint | undefined | null): any {
  if (!BN || typeof BN !== "function") {
    throw new Error(`BN class is invalid for ${name}`);
  }
  if (value === undefined || value === null) {
    throw new Error(`${name} is missing`);
  }
  try {
    const valueStr = typeof value === "bigint" ? value.toString() : String(value);
    if (!valueStr || valueStr.trim() === "" || isNaN(Number(valueStr))) {
      throw new Error(`Invalid ${name} value: "${valueStr}"`);
    }
    const bn = new BN(valueStr);
    if (!bn || typeof bn.toString !== "function") {
      throw new Error(`Failed to create valid BN instance for ${name}`);
    }
    return bn;
  } catch (err: any) {
    if (err.message && err.message.includes("is missing") || err.message.includes("is invalid")) {
      throw err;
    }
    throw new Error(`Failed to create BN for ${name}: ${err.message || "Unknown error"}`);
  }
}

export type QuoteParams = {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number;
};

export type QuoteResult = {
  amountOut: bigint;
};

export function constantProductQuote({ amountIn, reserveIn, reserveOut, feeBps }: QuoteParams): QuoteResult {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) {
    return { amountOut: 0n };
  }
  const feeDen = 10_000n;
  const amountInAfterFee = amountIn * (feeDen - BigInt(feeBps)) / feeDen;
  const numerator = amountInAfterFee * reserveOut;
  const denominator = reserveIn + amountInAfterFee;
  return { amountOut: numerator / denominator };
}

export type SwapBuildParams = {
  programId: PublicKey;
  pool: PublicKey;
  user: PublicKey;
  userSource: PublicKey;
  userDestination: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  tokenProgram: PublicKey;
  amountIn: bigint;
  minAmountOut: bigint;
};

export async function buildSwapIxWithAnchor(anchor: AnchorExports, params: SwapBuildParams): Promise<TransactionInstruction> {
  const { BN, Program, AnchorProvider } = anchor;
  
  // Validate BN class
  if (!BN || typeof BN !== "function") {
    throw new Error(`BN class is invalid: ${typeof BN}, constructor: ${BN?.name || "unknown"}`);
  }

  // Validate all PublicKey parameters using assertPubkey
  const programId = assertPubkey("programId", params.programId);
  const pool = assertPubkey("pool", params.pool);
  const user = assertPubkey("user", params.user);
  const userSource = assertPubkey("userSource", params.userSource);
  const userDestination = assertPubkey("userDestination", params.userDestination);
  const vaultA = assertPubkey("vaultA", params.vaultA);
  const vaultB = assertPubkey("vaultB", params.vaultB);
  const tokenProgram = assertPubkey("tokenProgram", params.tokenProgram);

  const provider = AnchorProvider.local();
  const program = new Program(idl as any, programId, provider);
  
  // Validate and create BN instances using assertBN
  const amountInBN = assertBN("amountIn", BN, params.amountIn);
  const minAmountOutBN = assertBN("minAmountOut", BN, params.minAmountOut);
  
  // Build the instruction with explicit error handling at each step
  try {
    const methods = program.methods;
    if (!methods || !methods.swap) {
      throw new Error("program.methods.swap is not available");
    }

    const swapMethod = methods.swap(amountInBN, minAmountOutBN);
    if (!swapMethod) {
      throw new Error("methods.swap() returned undefined");
    }

    // All accounts are already validated by assertPubkey above
    // Verify they have _bn property (required by Anchor)
    const accounts = {
      user,
      userSource,
      userDestination,
      pool,
      vaultA,
      vaultB,
      tokenProgram,
    };

    for (const [name, value] of Object.entries(accounts)) {
      if (!("_bn" in value)) {
        throw new Error(`Account parameter '${name}' PublicKey is missing _bn property`);
      }
    }

    const accountsBuilder = swapMethod.accounts(accounts);

    if (!accountsBuilder) {
      throw new Error("swapMethod.accounts() returned undefined");
    }

    const instruction = await accountsBuilder.instruction();
    
    if (!instruction) {
      throw new Error("accountsBuilder.instruction() returned undefined");
    }

    return instruction;
  } catch (err: any) {
    // Enhanced error message with full context
    const errorDetails = {
      message: err.message,
      stack: err.stack,
      amountInBN: {
        type: typeof amountInBN,
        constructor: amountInBN?.constructor?.name,
        toString: amountInBN?.toString?.(),
        has_toNumber: typeof amountInBN?.toNumber === "function",
        has_bn: amountInBN?._bn !== undefined,
        keys: amountInBN ? Object.keys(amountInBN).slice(0, 10) : [],
      },
      minAmountOutBN: {
        type: typeof minAmountOutBN,
        constructor: minAmountOutBN?.constructor?.name,
        toString: minAmountOutBN?.toString?.(),
        has_toNumber: typeof minAmountOutBN?.toNumber === "function",
        has_bn: minAmountOutBN?._bn !== undefined,
        keys: minAmountOutBN ? Object.keys(minAmountOutBN).slice(0, 10) : [],
      },
      BNClass: {
        name: BN?.name,
        type: typeof BN,
      },
    };

    throw new Error(
      `Failed to build swap instruction: ${err.message}\n` +
      `Error details: ${JSON.stringify(errorDetails, null, 2)}`
    );
  }
}

// Backwards-compatible wrapper that throws a helpful error if used in environments
// where dynamic import of Anchor is not possible during build
export async function buildSwapIx(_: SwapBuildParams): Promise<TransactionInstruction> {
  throw new Error("buildSwapIx requires Anchor. Use buildSwapIxWithAnchor(await import('@coral-xyz/anchor'), params) in a server-only context.");
}
