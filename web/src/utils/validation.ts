import { ValidationError } from '@/types';

// Validation utilities
export function validateBigInt(value: string, fieldName: string): bigint {
  if (!value || value.trim() === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  // Check if it's a valid number string
  if (!/^\d+$/.test(value.trim())) {
    throw new ValidationError(`${fieldName} must be a valid positive integer`, fieldName);
  }

  try {
    const num = BigInt(value.trim());
    if (num <= 0n) {
      throw new ValidationError(`${fieldName} must be greater than 0`, fieldName);
    }
    return num;
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError(`${fieldName} is too large or invalid`, fieldName);
  }
}

export function validateFeeBps(value: string): number {
  if (!value || value.trim() === '') {
    throw new ValidationError('Fee (bps) is required', 'feeBps');
  }

  const num = Number(value.trim());
  if (isNaN(num)) {
    throw new ValidationError('Fee (bps) must be a valid number', 'feeBps');
  }

  if (num < 0 || num > 10000) {
    throw new ValidationError('Fee (bps) must be between 0 and 10000', 'feeBps');
  }

  if (!Number.isInteger(num)) {
    throw new ValidationError('Fee (bps) must be an integer', 'feeBps');
  }

  return num;
}

export function validateSolanaPublicKey(value: string, fieldName: string): string {
  if (!value || value.trim() === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }

  const trimmed = value.trim();

  // Basic Solana public key format validation (base58, 32-44 characters)
  if (trimmed.length < 32 || trimmed.length > 44) {
    throw new ValidationError(`${fieldName} must be a valid Solana public key (length: ${trimmed.length})`, fieldName);
  }

  // Check for base58 characters (simplified check)
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    throw new ValidationError(`${fieldName} contains invalid characters`, fieldName);
  }

  // Try to create PublicKey to validate it's actually a valid key
  try {
    const { PublicKey } = require("@solana/web3.js");
    new PublicKey(trimmed);
  } catch (err) {
    throw new ValidationError(`${fieldName} is not a valid Solana public key: ${trimmed.substring(0, 20)}...`, fieldName);
  }

  return trimmed;
}

export function validateQuoteRequest(body: any): {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number;
} {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body');
  }

  const { amountIn, reserveIn, reserveOut, feeBps } = body;

  return {
    amountIn: validateBigInt(amountIn, 'amountIn'),
    reserveIn: validateBigInt(reserveIn, 'reserveIn'),
    reserveOut: validateBigInt(reserveOut, 'reserveOut'),
    feeBps: validateFeeBps(feeBps),
  };
}

export function validateSwapInstructionRequest(body: any): {
  programId: string;
  pool: string;
  user: string;
  userSource: string;
  userDestination: string;
  vaultA: string;
  vaultB: string;
  tokenProgram: string;
  amountIn: bigint;
  minAmountOut: bigint;
} {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body');
  }

  const {
    programId,
    pool,
    user,
    userSource,
    userDestination,
    vaultA,
    vaultB,
    tokenProgram,
    amountIn,
    minAmountOut,
  } = body;

  return {
    programId: validateSolanaPublicKey(programId, 'programId'),
    pool: validateSolanaPublicKey(pool, 'pool'),
    user: validateSolanaPublicKey(user, 'user'),
    userSource: validateSolanaPublicKey(userSource, 'userSource'),
    userDestination: validateSolanaPublicKey(userDestination, 'userDestination'),
    vaultA: validateSolanaPublicKey(vaultA, 'vaultA'),
    vaultB: validateSolanaPublicKey(vaultB, 'vaultB'),
    tokenProgram: validateSolanaPublicKey(tokenProgram, 'tokenProgram'),
    amountIn: validateBigInt(amountIn, 'amountIn'),
    minAmountOut: validateBigInt(minAmountOut, 'minAmountOut'),
  };
}

// Format number for display
export function formatNumber(value: string | bigint, decimals: number = 6): string {
  const str = typeof value === 'bigint' ? value.toString() : value;
  const num = parseFloat(str);
  
  if (isNaN(num)) return str;
  
  // Format with commas and limit decimals
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

// Format large numbers
export function formatLargeNumber(value: string | bigint): string {
  const str = typeof value === 'bigint' ? value.toString() : value;
  const num = parseFloat(str);
  
  if (isNaN(num)) return str;
  
  if (num >= 1e12) {
    return (num / 1e12).toFixed(2) + 'T';
  }
  if (num >= 1e9) {
    return (num / 1e9).toFixed(2) + 'B';
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(2) + 'M';
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(2) + 'K';
  }
  
  return formatNumber(value);
}

