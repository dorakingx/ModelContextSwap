import { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { buildSwapIx } from "dex-ai-sdk";
import { validateSwapInstructionRequest, ValidationError } from "@/utils/validation";
import { ApiError } from "@/types";

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
    const validatedParams = validateSwapInstructionRequest(body);

    // Build instruction with validated PublicKeys
    const params = {
      programId: new PublicKey(validatedParams.programId),
      pool: new PublicKey(validatedParams.pool),
      user: new PublicKey(validatedParams.user),
      userSource: new PublicKey(validatedParams.userSource),
      userDestination: new PublicKey(validatedParams.userDestination),
      vaultA: new PublicKey(validatedParams.vaultA),
      vaultB: new PublicKey(validatedParams.vaultB),
      tokenProgram: new PublicKey(validatedParams.tokenProgram),
      amountIn: validatedParams.amountIn,
      minAmountOut: validatedParams.minAmountOut,
    };

    const ix = await buildSwapIx(params);

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
