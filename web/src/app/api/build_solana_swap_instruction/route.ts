import { NextRequest } from "next/server";
import { buildSwapIx } from "../../../../../sdk/src/index";
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
    const ix = await buildSwapIx(params);
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
