// Types for DEX API
export interface QuoteRequest {
  amountIn: string;
  reserveIn: string;
  reserveOut: string;
  feeBps: string;
}

export interface QuoteResponse {
  amountOut: string;
  amountIn?: string;
  reserveIn?: string;
  reserveOut?: string;
  feeBps?: string;
}

export interface SwapInstructionRequest {
  programId: string;
  pool: string;
  user: string;
  userSource: string;
  userDestination: string;
  vaultA: string;
  vaultB: string;
  tokenProgram: string;
  amountIn: string;
  minAmountOut: string;
}

export interface SwapInstructionResponse {
  programId: string;
  keys: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: any;
}

export interface SwapParams {
  amountIn: string;
  reserveIn: string;
  reserveOut: string;
  feeBps: string;
}

// Validation error types
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ApiErrorResponse extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiErrorResponse';
  }
}

