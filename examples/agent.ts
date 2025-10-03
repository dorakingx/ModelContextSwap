import { Keypair, PublicKey } from "@solana/web3.js";
import { constantProductQuote, buildSwapIx } from "../sdk/src/index.js";

async function main() {
  const programId = new PublicKey("Dex111111111111111111111111111111111111111");
  const pool = Keypair.generate().publicKey;
  const user = Keypair.generate().publicKey;
  const userSource = Keypair.generate().publicKey;
  const userDestination = Keypair.generate().publicKey;
  const vaultA = Keypair.generate().publicKey;
  const vaultB = Keypair.generate().publicKey;
  const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  const quote = constantProductQuote({ amountIn: 1_000_000n, reserveIn: 10_000_000_000n, reserveOut: 20_000_000_000n, feeBps: 30 });
  console.log("Quote amountOut:", quote.amountOut.toString());

  const ix = await buildSwapIx({
    programId,
    pool,
    user,
    userSource,
    userDestination,
    vaultA,
    vaultB,
    tokenProgram,
    amountIn: 1_000_000n,
    minAmountOut: quote.amountOut,
  });
  console.log("Built swap ix keys:", ix.keys.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
