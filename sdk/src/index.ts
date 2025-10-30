import { PublicKey, Connection, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { BN, Program, AnchorProvider, Idl, utils, web3 } from "@coral-xyz/anchor";
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

export async function buildSwapIx(params: SwapBuildParams): Promise<TransactionInstruction> {
  const provider = AnchorProvider.local();
  const program = new Program(idl as Idl, params.programId, provider);
  
  // The account metas must match the Rust order
  return await program.methods
    .swap(new BN(params.amountIn.toString()), new BN(params.minAmountOut.toString()))
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
