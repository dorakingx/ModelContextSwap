import { NextRequest } from "next/server";
import { constantProductQuote } from "dex-ai-sdk";
import { validateQuoteRequest, ValidationError } from "@/utils/validation";
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
    console.error("[get_dex_quote]", errorResponse);
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
    const validatedParams = validateQuoteRequest(body);

    // Calculate quote
    const { amountOut } = constantProductQuote(validatedParams);

    return Response.json({
      amountOut: amountOut.toString(),
      amountIn: validatedParams.amountIn.toString(),
      reserveIn: validatedParams.reserveIn.toString(),
      reserveOut: validatedParams.reserveOut.toString(),
      feeBps: validatedParams.feeBps.toString(),
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return createErrorResponse(err, 400);
    }
    return createErrorResponse(err, 500);
  }
}
