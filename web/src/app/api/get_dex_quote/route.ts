import { NextRequest } from "next/server";
import { constantProductQuote } from "dex-ai-sdk";

export async function POST(req: NextRequest) {
  try {
    const { amountIn, reserveIn, reserveOut, feeBps } = await req.json();
    const params = {
      amountIn: BigInt(amountIn),
      reserveIn: BigInt(reserveIn),
      reserveOut: BigInt(reserveOut),
      feeBps: Number(feeBps),
    };
    const { amountOut } = constantProductQuote(params);
    return Response.json({ amountOut: amountOut.toString() });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}
