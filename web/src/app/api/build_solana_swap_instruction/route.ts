import { NextRequest } from "next/server";
import { buildSwapIxWithAnchor } from "dex-ai-sdk";
import { PublicKey } from "@solana/web3.js";

export async function POST(req: NextRequest) {
  try {
    const {
      programId, pool, user, userSource, userDestination,
      vaultA, vaultB, tokenProgram, amountIn, minAmountOut
    } = await req.json();
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
      minAmountOut: BigInt(minAmountOut),
    };
    const anchor = await import("@coral-xyz/anchor");
    const ix = await buildSwapIxWithAnchor(anchor as any, params);
    return Response.json({
      programId: ix.programId.toString(),
      keys: ix.keys.map(k => ({
        pubkey: k.pubkey.toString(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: ix.data.toString('base64'),
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}
