import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { constantProductQuote, buildSwapIxWithAnchor, SwapValidationOptions } from "../sdk/src/index.js";
import * as anchor from "@coral-xyz/anchor";

async function main() {
  try {
    // Validate inputs before use
    const programId = new PublicKey("Dex111111111111111111111111111111111111111");
    const pool = Keypair.generate().publicKey;
    const user = Keypair.generate().publicKey;
    const userSource = Keypair.generate().publicKey;
    const userDestination = Keypair.generate().publicKey;
    const vaultA = Keypair.generate().publicKey;
    const vaultB = Keypair.generate().publicKey;
    const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

    // Validate quote calculation with safe values
    const amountIn = 1_000_000n;
    const reserveIn = 10_000_000_000n;
    const reserveOut = 20_000_000_000n;
    const feeBps = 30;

    if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n || feeBps < 0 || feeBps > 10000) {
      throw new Error("Invalid quote parameters");
    }

    const quote = constantProductQuote({ 
      amountIn, 
      reserveIn, 
      reserveOut, 
      feeBps 
    });

    if (!quote || quote.amountOut === undefined || quote.amountOut === null) {
      throw new Error("Quote calculation failed: amountOut is undefined");
    }

    console.log("Quote amountOut:", quote.amountOut.toString());

    // Create connection for optional token account validation
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );

    // Build swap instruction with Anchor
    const anchorExports = {
      BN: anchor.BN,
      Program: anchor.Program,
      AnchorProvider: anchor.AnchorProvider,
    };

    // Optional: validate token accounts before building instruction
    const validationOptions: SwapValidationOptions = {
      connection,
      validateTokenAccounts: false, // Set to true to enable validation (requires real accounts)
    };

    // Log all parameters before building instruction for debugging
    const swapParams = {
      programId: programId.toString(),
      pool: pool.toString(),
      user: user.toString(),
      userSource: userSource.toString(),
      userDestination: userDestination.toString(),
      vaultA: vaultA.toString(),
      vaultB: vaultB.toString(),
      tokenProgram: tokenProgram.toString(),
      amountIn: amountIn.toString(),
      minAmountOut: quote.amountOut.toString(),
    };
    
    console.log("Swap params:", JSON.stringify(swapParams, null, 2));
    
    // Validate all parameters before calling buildSwapIxWithAnchor
    if (!amountIn || amountIn <= 0n) {
      throw new Error(`Invalid amountIn: ${amountIn}`);
    }
    if (!quote.amountOut || quote.amountOut <= 0n) {
      throw new Error(`Invalid minAmountOut: ${quote.amountOut}`);
    }

    const ix = await buildSwapIxWithAnchor(
      anchorExports,
      {
        programId,
        pool,
        user,
        userSource,
        userDestination,
        vaultA,
        vaultB,
        tokenProgram,
        amountIn,
        minAmountOut: quote.amountOut,
      },
      validationOptions
    );

    console.log("Built swap ix keys:", ix.keys.length);
    console.log("Swap instruction created successfully");
  } catch (error: any) {
    console.error("Error in swap execution:");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
    
    // Display detailed error information if available
    if (error.message && error.message.includes("Error Details:")) {
      console.error("\nDetailed Error Information:");
      console.error(error.message);
    }
    
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
