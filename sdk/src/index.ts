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
  try {
    return await program.methods
      .swap(amountInBN, minAmountOutBN)
      .accounts({
        user: params.user,
        userSource: params.userSource,
        userDestination: params.userDestination,
        pool: params.pool,
        vaultA: params.vaultA,
        vaultB: params.vaultB,
        tokenProgram: params.tokenProgram,
        // systemProgram is not needed for swap
      })
      .instruction();
  } catch (err: any) {
    // Enhanced error message for debugging
    throw new Error(
      `Failed to build swap instruction: ${err.message}. ` +
      `BN instances: amountIn=${amountInBN?.toString() || "undefined"}, ` +
      `minAmountOut=${minAmountOutBN?.toString() || "undefined"}`
    );
  }
}

// Backwards-compatible wrapper that throws a helpful error if used in environments
// where dynamic import of Anchor is not possible during build
export async function buildSwapIx(_: SwapBuildParams): Promise<TransactionInstruction> {
  throw new Error("buildSwapIx requires Anchor. Use buildSwapIxWithAnchor(await import('@coral-xyz/anchor'), params) in a server-only context.");
}
