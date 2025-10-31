import { NextRequest } from "next/server";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { buildSwapIxWithAnchor } from "dex-ai-sdk";
import { validateSwapInstructionRequest } from "@/utils/validation";
import { ApiError, ValidationError } from "@/types";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";

// Unified error response helper
function createErrorResponse(error: unknown, statusCode: number = 400): Response {
  let message = "An error occurred";
  let code: string | undefined;
  let details: any = undefined;

  if (error instanceof ValidationError) {
    message = error.message;
    code = "VALIDATION_ERROR";
    details = { field: error.field };
  } else if (error instanceof Error) {
    message = error.message;
    code = error.name;
  } else if (typeof error === "string") {
    message = error;
  }

  const errorResponse: ApiError = {
    error: message,
    code,
    details,
  };

  // Log error in development
  if (process.env.NODE_ENV === "development") {
    console.error("[build_solana_swap_instruction]", errorResponse);
  }

  return Response.json(errorResponse, { status: statusCode });
}

export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return createErrorResponse("Invalid JSON in request body", 400);
    }

    // Validate inputs
    let validatedParams;
    try {
      validatedParams = validateSwapInstructionRequest(body);
    } catch (err) {
      // Log validation error details
      if (process.env.NODE_ENV === "development") {
        console.error("[build_solana_swap_instruction] Validation error:", err);
      }
      return createErrorResponse(err, 400);
    }

    // Build instruction with validated PublicKeys
    // Validate each PublicKey individually to provide better error messages
    let programId: PublicKey;
    let pool: PublicKey;
    let user: PublicKey;
    let userSource: PublicKey;
    let userDestination: PublicKey;
    let vaultA: PublicKey;
    let vaultB: PublicKey;
    let tokenProgram: PublicKey;

    try {
      programId = new PublicKey(validatedParams.programId);
      if (process.env.NODE_ENV === "development") {
        console.log("[build_solana_swap_instruction] programId:", validatedParams.programId, "->", programId.toString());
      }
    } catch (err: any) {
      const errorMsg = err.message || "Unknown error";
      if (process.env.NODE_ENV === "development") {
        console.error("[build_solana_swap_instruction] programId error:", validatedParams.programId, errorMsg);
      }
      throw new ValidationError(`Invalid programId '${validatedParams.programId}': ${errorMsg}`, "programId");
    }

    try {
      pool = new PublicKey(validatedParams.pool);
    } catch (err) {
      throw new ValidationError(`Invalid pool: ${validatedParams.pool}`, "pool");
    }

    try {
      user = new PublicKey(validatedParams.user);
    } catch (err) {
      throw new ValidationError(`Invalid user: ${validatedParams.user}`, "user");
    }

    try {
      userSource = new PublicKey(validatedParams.userSource);
    } catch (err) {
      throw new ValidationError(`Invalid userSource: ${validatedParams.userSource}`, "userSource");
    }

    try {
      userDestination = new PublicKey(validatedParams.userDestination);
    } catch (err) {
      throw new ValidationError(`Invalid userDestination: ${validatedParams.userDestination}`, "userDestination");
    }

    try {
      vaultA = new PublicKey(validatedParams.vaultA);
    } catch (err) {
      throw new ValidationError(`Invalid vaultA: ${validatedParams.vaultA}`, "vaultA");
    }

    try {
      vaultB = new PublicKey(validatedParams.vaultB);
    } catch (err) {
      throw new ValidationError(`Invalid vaultB: ${validatedParams.vaultB}`, "vaultB");
    }

    try {
      tokenProgram = new PublicKey(validatedParams.tokenProgram);
    } catch (err) {
      throw new ValidationError(`Invalid tokenProgram: ${validatedParams.tokenProgram}`, "tokenProgram");
    }

    // Validate amount values before creating params
    if (validatedParams.amountIn === undefined || validatedParams.minAmountOut === undefined) {
      throw new ValidationError("amountIn and minAmountOut must be provided", "amount");
    }

    const params = {
      programId,
      pool,
      user,
      userSource,
      userDestination,
      vaultA,
      vaultB,
      tokenProgram,
      amountIn: validatedParams.amountIn,
      minAmountOut: validatedParams.minAmountOut,
    };

    // Debug: log params to ensure they're valid
    if (process.env.NODE_ENV === "development") {
      console.log("[build_solana_swap_instruction] Params:", {
        amountIn: params.amountIn.toString(),
        minAmountOut: params.minAmountOut.toString(),
        amountInType: typeof params.amountIn,
        minAmountOutType: typeof params.minAmountOut,
      });
    }

    // Create a dummy wallet for instruction building (we only need the instruction, not actual signing)
    // In serverless environments, we can't use AnchorProvider.local() which requires ANCHOR_WALLET
    const dummyWallet = Keypair.generate();
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );
    
    // Create AnchorProvider with dummy wallet (instruction building doesn't require real wallet)
    const provider = new anchor.AnchorProvider(
      connection,
      {
        publicKey: dummyWallet.publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      },
      { commitment: "confirmed" }
    );

    // Use buildSwapIxWithAnchor which requires Anchor
    // Import BN directly from bn.js (used by Anchor internally)
    // Use anchor.BN if available, otherwise fall back to direct BN import
    const BNClass = anchor.BN || BN;
    
    if (!BNClass) {
      throw new Error("BN class is not available from Anchor or bn.js");
    }

    // Debug: log BN class info
    if (process.env.NODE_ENV === "development") {
      console.log("[build_solana_swap_instruction] BN class:", {
        hasAnchorBN: !!anchor.BN,
        hasDirectBN: !!BN,
        usingClass: BNClass.name || "unknown",
      });
    }

    // Test BN creation with actual values we'll use
    let testBN;
    try {
      testBN = new BNClass(params.amountIn.toString());
      if (process.env.NODE_ENV === "development") {
        console.log("[build_solana_swap_instruction] BN test successful:", {
          input: params.amountIn.toString(),
          output: testBN.toString(),
        });
      }
    } catch (err: any) {
      console.error("[build_solana_swap_instruction] BN test failed:", {
        error: err.message,
        stack: err.stack,
        amountIn: params.amountIn.toString(),
        amountInType: typeof params.amountIn,
      });
      throw new Error(`BN initialization failed with value '${params.amountIn.toString()}': ${err.message}`);
    }

    const anchorExports = {
      BN: BNClass,
      Program: anchor.Program,
      AnchorProvider: {
        // Override local() to return our custom provider
        local: () => provider,
        env: () => provider,
      },
    };
    
    const ix = await buildSwapIxWithAnchor(anchorExports, params);

    return Response.json({
      programId: ix.programId.toString(),
      keys: ix.keys.map((k) => ({
        pubkey: k.pubkey.toString(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: ix.data.toString("base64"),
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return createErrorResponse(err, 400);
    }
    // Handle Solana PublicKey validation errors
    if (err instanceof Error && err.message.includes("Invalid public key")) {
      return createErrorResponse(
        new ValidationError("Invalid Solana public key format", "publicKey"),
        400
      );
    }
    return createErrorResponse(err, 500);
  }
}
