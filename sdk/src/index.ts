import { PublicKey, Connection, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { BN, Program, AnchorProvider, Idl } from "@coral-xyz/anchor";

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
  // Minimal placeholder instruction, to be replaced with Anchor IDL-aware builder later.
  const data = Buffer.alloc(16);
  data.writeBigUInt64LE(BigInt(params.amountIn), 0);
  data.writeBigUInt64LE(BigInt(params.minAmountOut), 8);
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: params.user, isSigner: true, isWritable: true },
      { pubkey: params.userSource, isSigner: false, isWritable: true },
      { pubkey: params.userDestination, isSigner: false, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.vaultA, isSigner: false, isWritable: true },
      { pubkey: params.vaultB, isSigner: false, isWritable: true },
      { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
