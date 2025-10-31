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

  const provider = AnchorProvider.local();
  const program = new Program(idl as any, params.programId, provider);
  
  // Ensure amountIn and minAmountOut are valid bigints
  if (!params.amountIn || !params.minAmountOut) {
    throw new Error("amountIn and minAmountOut must be provided");
  }

  // Convert bigint to string before creating BN
  const amountInStr = typeof params.amountIn === "bigint" 
    ? params.amountIn.toString() 
    : String(params.amountIn);
  const minAmountOutStr = typeof params.minAmountOut === "bigint"
    ? params.minAmountOut.toString()
    : String(params.minAmountOut);

  // Validate strings are not empty and are valid numbers
  if (!amountInStr || amountInStr.trim() === "" || isNaN(Number(amountInStr))) {
    throw new Error(`Invalid amountIn string: "${amountInStr}"`);
  }
  if (!minAmountOutStr || minAmountOutStr.trim() === "" || isNaN(Number(minAmountOutStr))) {
    throw new Error(`Invalid minAmountOut string: "${minAmountOutStr}"`);
  }

  // Create BN instances with error handling
  let amountInBN;
  let minAmountOutBN;
  
  try {
    amountInBN = new BN(amountInStr);
    // Validate BN instance was created correctly
    if (!amountInBN || typeof amountInBN.toString !== "function") {
      throw new Error(`Failed to create valid BN instance for amountIn: ${amountInStr}`);
    }
  } catch (err: any) {
    throw new Error(`Failed to create BN for amountIn "${amountInStr}": ${err.message}`);
  }

  try {
    minAmountOutBN = new BN(minAmountOutStr);
    // Validate BN instance was created correctly
    if (!minAmountOutBN || typeof minAmountOutBN.toString !== "function") {
      throw new Error(`Failed to create valid BN instance for minAmountOut: ${minAmountOutStr}`);
    }
  } catch (err: any) {
    throw new Error(`Failed to create BN for minAmountOut "${minAmountOutStr}": ${err.message}`);
  }
  
  // The account metas must match the Rust order
  // Wrap BN instances to ensure they're in the format Anchor expects
  try {
    // Verify BN instances have required internal structure
    // Anchor's BN wrapper may require _bn property
    if (amountInBN && typeof amountInBN === "object") {
      // Check if BN has _bn property or is a valid BN instance
      const amountInStr = amountInBN.toString();
      const amountInNum = amountInBN.toNumber ? amountInBN.toNumber() : Number(amountInStr);
      if (isNaN(amountInNum)) {
        throw new Error(`Invalid amountInBN: cannot convert to number`);
      }
    }
    
    if (minAmountOutBN && typeof minAmountOutBN === "object") {
      const minAmountOutStr = minAmountOutBN.toString();
      const minAmountOutNum = minAmountOutBN.toNumber ? minAmountOutBN.toNumber() : Number(minAmountOutStr);
      if (isNaN(minAmountOutNum)) {
        throw new Error(`Invalid minAmountOutBN: cannot convert to number`);
      }
    }

    // Build the instruction with explicit error handling at each step
    const methods = program.methods;
    if (!methods || !methods.swap) {
      throw new Error("program.methods.swap is not available");
    }

    const swapMethod = methods.swap(amountInBN, minAmountOutBN);
    if (!swapMethod) {
      throw new Error("methods.swap() returned undefined");
    }

    // Validate all account parameters are valid PublicKey instances
    // Anchor checks for _bn property on accounts, so undefined/null will cause the error
    const accountValidations = [
      { name: "user", value: params.user },
      { name: "userSource", value: params.userSource },
      { name: "userDestination", value: params.userDestination },
      { name: "pool", value: params.pool },
      { name: "vaultA", value: params.vaultA },
      { name: "vaultB", value: params.vaultB },
      { name: "tokenProgram", value: params.tokenProgram },
    ];

    for (const { name, value } of accountValidations) {
      if (!value) {
        throw new Error(`Account parameter '${name}' is undefined or null`);
      }
      if (!(value instanceof PublicKey)) {
        throw new Error(`Account parameter '${name}' is not a valid PublicKey instance (got: ${typeof value})`);
      }
      // Verify PublicKey has _bn property (required by Anchor for validation)
      if (!("_bn" in value)) {
        throw new Error(`Account parameter '${name}' PublicKey is missing _bn property`);
      }
    }

    const accountsBuilder = swapMethod.accounts({
      user: params.user,
      userSource: params.userSource,
      userDestination: params.userDestination,
      pool: params.pool,
      vaultA: params.vaultA,
      vaultB: params.vaultB,
      tokenProgram: params.tokenProgram,
      // systemProgram is not needed for swap
    });

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
