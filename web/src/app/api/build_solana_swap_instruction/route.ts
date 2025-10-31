import { NextRequest } from "next/server";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { buildSwapIxWithAnchor } from "dex-ai-sdk";
import { validateSwapInstructionRequest } from "@/utils/validation";
import { ApiError, ValidationError } from "@/types";
import * as anchor from "@coral-xyz/anchor";

// Validation helper function
function assertPubkey(name: string, v: string | PublicKey | undefined | null): PublicKey {
  if (!v) throw new ValidationError(`${name} is missing`, name);
  try {
    return v instanceof PublicKey ? v : new PublicKey(v);
  } catch (err: any) {
    throw new ValidationError(`${name} is invalid: ${err.message || "Invalid public key"}`, name);
  }
}

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

    // Validate amount values before creating params
    if (validatedParams.amountIn === undefined || validatedParams.minAmountOut === undefined) {
      throw new ValidationError("amountIn and minAmountOut must be provided", "amount");
    }

    // Build instruction with validated PublicKeys using assertPubkey
    const programId = assertPubkey("programId", validatedParams.programId);
    const pool = assertPubkey("pool", validatedParams.pool);
    const user = assertPubkey("user", validatedParams.user);
    const userSource = assertPubkey("userSource", validatedParams.userSource);
    const userDestination = assertPubkey("userDestination", validatedParams.userDestination);
    const vaultA = assertPubkey("vaultA", validatedParams.vaultA);
    const vaultB = assertPubkey("vaultB", validatedParams.vaultB);
    const tokenProgram = assertPubkey("tokenProgram", validatedParams.tokenProgram);

    if (process.env.NODE_ENV === "development") {
      console.log("[build_solana_swap_instruction] programId:", validatedParams.programId, "->", programId.toString());
    }

    // Verify all PublicKeys have _bn property (required by Anchor)
    // Comprehensive validation to prevent undefined errors
    const publicKeys = { programId, pool, user, userSource, userDestination, vaultA, vaultB, tokenProgram };
    for (const [name, value] of Object.entries(publicKeys)) {
      if (value === undefined) {
        throw new ValidationError(`PublicKey '${name}' is undefined after creation`, name);
      }
      if (value === null) {
        throw new ValidationError(`PublicKey '${name}' is null after creation`, name);
      }
      if (!(value instanceof PublicKey)) {
        throw new ValidationError(
          `'${name}' is not a PublicKey instance after creation (got: ${typeof value})`,
          name
        );
      }
      if (!("_bn" in value)) {
        throw new ValidationError(`PublicKey '${name}' is missing _bn property`, name);
      }
      if (value._bn === undefined) {
        throw new ValidationError(
          `PublicKey '${name}' has _bn property but it's undefined. PublicKey: ${value.toString()}`,
          name
        );
      }
    }

    // Create params object with validated PublicKeys (non-null assertion safe after validation)
    const params = {
      programId: publicKeys.programId!,
      pool: publicKeys.pool!,
      user: publicKeys.user!,
      userSource: publicKeys.userSource!,
      userDestination: publicKeys.userDestination!,
      vaultA: publicKeys.vaultA!,
      vaultB: publicKeys.vaultB!,
      tokenProgram: publicKeys.tokenProgram!,
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
    // IMPORTANT: Always use anchor.BN as Anchor's Program expects Anchor's BN wrapper
    // Using raw bn.js BN can cause compatibility issues
    if (!anchor.BN) {
      throw new Error("anchor.BN is not available. Anchor may not be properly imported.");
    }

    // Debug: log BN class info
    if (process.env.NODE_ENV === "development") {
      console.log("[build_solana_swap_instruction] BN class info:", {
        hasAnchorBN: !!anchor.BN,
        anchorBNName: anchor.BN.name || "unknown",
        anchorBNType: typeof anchor.BN,
        isFunction: typeof anchor.BN === "function",
        BNPrototype: anchor.BN.prototype ? Object.keys(anchor.BN.prototype).slice(0, 5) : "none",
      });
    }

    // Test BN creation with actual values we'll use
    // This ensures the BN class works before passing to SDK
    let testBN;
    try {
      // Try creating BN from string (recommended for large numbers)
      testBN = new anchor.BN(params.amountIn.toString(), 10); // Explicit base 10
      
      // Validate the BN instance has required properties
      if (!testBN || typeof testBN.toString !== "function") {
        throw new Error("BN instance is invalid - missing toString method");
      }
      
      // Check if BN has _bn property (internal bn.js instance)
      // This is required by Anchor's Program methods
      const testString = testBN.toString();
      const hasInternalBN = testBN._bn !== undefined;
      
      if (process.env.NODE_ENV === "development") {
        console.log("[build_solana_swap_instruction] BN test successful:", {
          input: params.amountIn.toString(),
          output: testString,
          bnType: typeof testBN,
          bnConstructor: testBN.constructor?.name || "unknown",
          hasInternalBN: hasInternalBN,
          bnProperties: Object.keys(testBN).slice(0, 15),
        });
      }
      
      // If _bn is missing, try to create it (this shouldn't happen with anchor.BN)
      if (!hasInternalBN && process.env.NODE_ENV === "development") {
        console.warn("[build_solana_swap_instruction] BN instance missing _bn property");
      }
    } catch (err: any) {
      console.error("[build_solana_swap_instruction] BN test failed:", {
        error: err.message,
        stack: err.stack,
        amountIn: params.amountIn.toString(),
        amountInType: typeof params.amountIn,
        BNClass: anchor.BN?.name || "unknown",
      });
      throw new Error(`BN initialization failed with value '${params.amountIn.toString()}': ${err.message}`);
    }

    const anchorExports = {
      BN: anchor.BN, // Always use anchor.BN, not raw bn.js
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
