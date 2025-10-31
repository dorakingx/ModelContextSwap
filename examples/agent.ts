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
    console.error("\n" + "=".repeat(80));
    console.error("❌ ERROR IN SWAP EXECUTION");
    console.error("=".repeat(80));
    
    // Basic error information
    console.error("\n📋 Error Message:");
    console.error(error.message || "No error message");
    
    // Stack trace with enhanced formatting
    console.error("\n📚 Stack Trace:");
    if (error.stack) {
      const stackLines = error.stack.split('\n');
      stackLines.forEach((line: string, index: number) => {
        if (index === 0) {
          console.error(`   ${line}`);
        } else {
          // Highlight lines containing _bn or BN
          if (line.includes('_bn') || line.includes('BN') || line.includes('bn')) {
            console.error(`⚠️  ${line}`);
          } else {
            console.error(`   ${line}`);
          }
        }
      });
    } else {
      console.error("   No stack trace available");
    }
    
    // Error type and constructor
    console.error("\n🔍 Error Type:");
    console.error(`   Type: ${typeof error}`);
    console.error(`   Constructor: ${error.constructor?.name || 'Unknown'}`);
    console.error(`   Name: ${error.name || 'Unknown'}`);
    
    // Display detailed error information if available
    if (error.message && error.message.includes("Error Details:")) {
      console.error("\n📊 Detailed Error Information:");
      console.error("-".repeat(80));
      console.error(error.message);
      console.error("-".repeat(80));
    }
    
    // Check for _bn related errors specifically
    if (error.message && (error.message.includes('_bn') || error.message.includes('BN'))) {
      console.error("\n⚠️  BN/_bn Related Error Detected!");
      console.error("   This error is related to BigNumber or PublicKey _bn property.");
      console.error("   Possible causes:");
      console.error("   1. BN instance was not properly initialized");
      console.error("   2. PublicKey _bn property is missing or undefined");
      console.error("   3. Value passed to BN constructor was undefined/null");
      console.error("   4. Multiple versions of bn.js installed");
    }
    
    // Environment information
    console.error("\n🌍 Environment Information:");
    console.error(`   Node.js version: ${process.version}`);
    console.error(`   Platform: ${process.platform}`);
    console.error(`   Architecture: ${process.arch}`);
    
    // Try to get dependency versions
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Check SDK package.json
      const sdkPackagePath = path.join(__dirname, '../sdk/package.json');
      if (fs.existsSync(sdkPackagePath)) {
        const sdkPackage = JSON.parse(fs.readFileSync(sdkPackagePath, 'utf8'));
        console.error("\n📦 SDK Dependencies:");
        console.error(`   @coral-xyz/anchor: ${sdkPackage.dependencies?.['@coral-xyz/anchor'] || 'N/A'}`);
        console.error(`   @solana/web3.js: ${sdkPackage.dependencies?.['@solana/web3.js'] || 'N/A'}`);
        console.error(`   bs58: ${sdkPackage.dependencies?.bs58 || 'N/A'}`);
      }
    } catch (e) {
      // Ignore errors reading package.json
    }
    
    console.error("\n" + "=".repeat(80));
    
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
