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

  // Create BN instances
  const amountInBN = new BN(amountInStr);
  const minAmountOutBN = new BN(minAmountOutStr);
  
  // The account metas must match the Rust order
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
}

// Backwards-compatible wrapper that throws a helpful error if used in environments
// where dynamic import of Anchor is not possible during build
export async function buildSwapIx(_: SwapBuildParams): Promise<TransactionInstruction> {
  throw new Error("buildSwapIx requires Anchor. Use buildSwapIxWithAnchor(await import('@coral-xyz/anchor'), params) in a server-only context.");
}
