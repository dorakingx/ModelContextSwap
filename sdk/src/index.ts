import { PublicKey, Connection, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
// Anchor is intentionally not imported at build time for Vercel/Turbopack compatibility
// The caller should provide the Anchor exports when invoking functions that need it
type AnchorExports = {
  BN: any;
  Program: new (idl: any, programId: PublicKey, provider: any) => any;
  AnchorProvider: { local: () => any };
  Idl?: any;
};
import idl from "./dex_ai.json";

// Validation helper functions
function assertPubkey(name: string, v: string | PublicKey | undefined | null): PublicKey {
  if (!v) throw new Error(`${name} is missing`);
  try {
    return v instanceof PublicKey ? v : new PublicKey(v);
  } catch (err: any) {
    throw new Error(`${name} is invalid: ${err.message || "Invalid public key"}`);
  }
}

/**
 * Safe conversion to BN with comprehensive undefined/null checks
 * This function validates all possible undefined values before BN creation
 */
export function safeConvertToBN(
  name: string,
  BN: any,
  value: string | number | bigint | undefined | null,
  options?: { allowZero?: boolean; maxValue?: string }
): any {
  // Validate BN class
  if (!BN || typeof BN !== "function") {
    throw new Error(`BN class is invalid for ${name}: ${typeof BN}`);
  }

  // Check for undefined/null
  if (value === undefined) {
    throw new Error(`${name} is undefined`);
  }
  if (value === null) {
    throw new Error(`${name} is null`);
  }

  // Convert to string safely
  let valueStr: string;
  try {
    if (typeof value === "bigint") {
      valueStr = value.toString();
    } else if (typeof value === "number") {
      if (!Number.isFinite(value) || Number.isNaN(value)) {
        throw new Error(`${name} is not a valid number: ${value}`);
      }
      valueStr = value.toString();
    } else {
      valueStr = String(value);
    }
  } catch (err: any) {
    throw new Error(`Failed to convert ${name} to string: ${err.message || "Unknown error"}`);
  }

  // Validate string is not empty
  if (!valueStr || valueStr.trim() === "") {
    throw new Error(`${name} is an empty string`);
  }

  // Validate string is a valid number
  const trimmedStr = valueStr.trim();
  if (!/^-?\d+$/.test(trimmedStr)) {
    throw new Error(`${name} contains invalid characters: "${trimmedStr}"`);
  }

  // Check for zero value if not allowed
  if (!options?.allowZero && trimmedStr === "0") {
    throw new Error(`${name} cannot be zero`);
  }

  // Check max value if specified
  if (options?.maxValue) {
    try {
      const maxBN = new BN(options.maxValue);
      const valueBN = new BN(trimmedStr);
      if (valueBN.gt(maxBN)) {
        throw new Error(`${name} exceeds maximum value: ${options.maxValue}`);
      }
    } catch {
      // If max value comparison fails, continue without check
    }
  }

  // Create BN instance
  try {
    const bn = new BN(trimmedStr);
    
    // Validate BN instance was created correctly
    if (!bn || typeof bn.toString !== "function") {
      throw new Error(`BN instance is invalid: missing toString method`);
    }

    // Check if BN has required internal structure (for Anchor compatibility)
    if (bn._bn === undefined && typeof bn.toNumber !== "function") {
      throw new Error(`BN instance is missing required methods`);
    }

    return bn;
  } catch (err: any) {
    if (err.message && (err.message.includes("is undefined") || err.message.includes("is null") || err.message.includes("is invalid"))) {
      throw err;
    }
    throw new Error(`Failed to create BN for ${name} from "${trimmedStr}": ${err.message || "Unknown error"}`);
  }
}

/**
 * Legacy assertBN function - wraps safeConvertToBN for backward compatibility
 */
function assertBN(name: string, BN: any, value: string | number | bigint | undefined | null): any {
  return safeConvertToBN(name, BN, value);
}

export type QuoteParams = {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number;
};

export type QuoteResult = {
  amountOut: bigint;
};

export function constantProductQuote({ amountIn, reserveIn, reserveOut, feeBps }: QuoteParams): QuoteResult {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) {
    return { amountOut: 0n };
  }
  const feeDen = 10_000n;
  const amountInAfterFee = amountIn * (feeDen - BigInt(feeBps)) / feeDen;
  const numerator = amountInAfterFee * reserveOut;
  const denominator = reserveIn + amountInAfterFee;
  return { amountOut: numerator / denominator };
}

export type SwapBuildParams = {
  programId: PublicKey;
  pool: PublicKey;
  user: PublicKey;
  userSource: PublicKey;
  userDestination: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  tokenProgram: PublicKey;
  amountIn: bigint;
  minAmountOut: bigint;
};

export type SwapValidationOptions = {
  connection?: Connection;
  validateTokenAccounts?: boolean;
};

/**
 * Ensure token account exists and is valid
 * Validates that the token account exists on-chain before swap execution
 */
export async function ensureTokenAccount(
  connection: Connection,
  tokenAccount: PublicKey,
  accountName: string,
  expectedMint?: PublicKey
): Promise<void> {
  try {
    const accountInfo = await connection.getAccountInfo(tokenAccount);
    
    if (!accountInfo) {
      throw new Error(`${accountName} token account does not exist: ${tokenAccount.toString()}`);
    }

    if (accountInfo.owner.toString() !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
      throw new Error(`${accountName} is not a valid token account: ${tokenAccount.toString()}`);
    }

    // If expected mint is provided, validate the token account's mint
    if (expectedMint) {
      try {
        const tokenAccountData = await getAccount(connection, tokenAccount);
        if (tokenAccountData.mint.toString() !== expectedMint.toString()) {
          throw new Error(
            `${accountName} mint mismatch: expected ${expectedMint.toString()}, got ${tokenAccountData.mint.toString()}`
          );
        }
      } catch (err: any) {
        if (err.message && err.message.includes("mint mismatch")) {
          throw err;
        }
        // If getAccount fails, account might still be valid but we can't verify mint
        console.warn(`Could not verify mint for ${accountName}: ${err.message}`);
      }
    }
  } catch (err: any) {
    if (err.message && (err.message.includes("does not exist") || err.message.includes("not a valid token account"))) {
      throw err;
    }
    throw new Error(`Failed to validate ${accountName} token account: ${err.message || "Unknown error"}`);
  }
}

export async function buildSwapIxWithAnchor(
  anchor: AnchorExports,
  params: SwapBuildParams,
  options?: SwapValidationOptions
): Promise<TransactionInstruction> {
  const { BN, Program, AnchorProvider } = anchor;
  
  // Validate BN class
  if (!BN || typeof BN !== "function") {
    throw new Error(`BN class is invalid: ${typeof BN}, constructor: ${BN?.name || "unknown"}`);
  }

  // Validate all PublicKey parameters using assertPubkey
  const programId = assertPubkey("programId", params.programId);
  const pool = assertPubkey("pool", params.pool);
  const user = assertPubkey("user", params.user);
  const userSource = assertPubkey("userSource", params.userSource);
  const userDestination = assertPubkey("userDestination", params.userDestination);
  const vaultA = assertPubkey("vaultA", params.vaultA);
  const vaultB = assertPubkey("vaultB", params.vaultB);
  const tokenProgram = assertPubkey("tokenProgram", params.tokenProgram);

  const provider = AnchorProvider.local();
  const program = new Program(idl as any, programId, provider);
  
  // Validate and create BN instances using safeConvertToBN with enhanced validation
  const amountInBN = safeConvertToBN("amountIn", BN, params.amountIn, { allowZero: false });
  const minAmountOutBN = safeConvertToBN("minAmountOut", BN, params.minAmountOut, { allowZero: false });

  // Validate token accounts if connection is provided and validation is enabled
  if (options?.connection && options?.validateTokenAccounts) {
    try {
      await ensureTokenAccount(options.connection, userSource, "userSource");
      await ensureTokenAccount(options.connection, userDestination, "userDestination");
      await ensureTokenAccount(options.connection, vaultA, "vaultA");
      await ensureTokenAccount(options.connection, vaultB, "vaultB");
    } catch (err: any) {
      throw new Error(`Token account validation failed: ${err.message}`);
    }
  }
  
  // Build the instruction with explicit error handling at each step
  try {
    const methods = program.methods;
    if (!methods || !methods.swap) {
      throw new Error("program.methods.swap is not available");
    }

    const swapMethod = methods.swap(amountInBN, minAmountOutBN);
    if (!swapMethod) {
      throw new Error("methods.swap() returned undefined");
    }

    // All accounts are already validated by assertPubkey above
    // Double-check all accounts are defined and have _bn property before passing to Anchor
    const accounts = {
      user,
      userSource,
      userDestination,
      pool,
      vaultA,
      vaultB,
      tokenProgram,
    };

    // Comprehensive validation before passing to Anchor
    for (const [name, value] of Object.entries(accounts)) {
      // Check if account is undefined or null
      if (value === undefined) {
        throw new Error(`Account parameter '${name}' is undefined`);
      }
      if (value === null) {
        throw new Error(`Account parameter '${name}' is null`);
      }
      
      // Check if it's a PublicKey instance
      if (!(value instanceof PublicKey)) {
        throw new Error(
          `Account parameter '${name}' is not a PublicKey instance. Got: ${typeof value}, value: ${value}`
        );
      }
      
      // Verify PublicKey has _bn property (required by Anchor for validation)
      if (!("_bn" in value)) {
        throw new Error(
          `Account parameter '${name}' PublicKey is missing _bn property. PublicKey: ${value.toString()}`
        );
      }
      
      // Additional safety check: ensure _bn is not undefined
      if (value._bn === undefined) {
        throw new Error(
          `Account parameter '${name}' PublicKey has _bn property but it's undefined. PublicKey: ${value.toString()}`
        );
      }
    }

    // Create a new accounts object with only validated PublicKeys to ensure no undefined values
    const validatedAccounts = {
      user: accounts.user!,
      userSource: accounts.userSource!,
      userDestination: accounts.userDestination!,
      pool: accounts.pool!,
      vaultA: accounts.vaultA!,
      vaultB: accounts.vaultB!,
      tokenProgram: accounts.tokenProgram!,
    };

    const accountsBuilder = swapMethod.accounts(validatedAccounts);

    if (!accountsBuilder) {
      throw new Error("swapMethod.accounts() returned undefined");
    }

    const instruction = await accountsBuilder.instruction();
    
    if (!instruction) {
      throw new Error("accountsBuilder.instruction() returned undefined");
    }

    return instruction;
  } catch (err: any) {
    // Enhanced error message with full context and detailed diagnostics
    const errorMessage = err.message || "Unknown error";
    const errorDetails: any = {
      message: errorMessage,
      stack: err.stack,
      step: "instruction_building",
      params: {
        programId: params.programId?.toString(),
        pool: params.pool?.toString(),
        user: params.user?.toString(),
        userSource: params.userSource?.toString(),
        userDestination: params.userDestination?.toString(),
        vaultA: params.vaultA?.toString(),
        vaultB: params.vaultB?.toString(),
        amountIn: params.amountIn?.toString(),
        minAmountOut: params.minAmountOut?.toString(),
      },
    };

    // Add BN diagnostics if BN instances were created
    if (amountInBN !== undefined) {
      try {
        errorDetails.amountInBN = {
          type: typeof amountInBN,
          constructor: amountInBN?.constructor?.name,
          toString: amountInBN?.toString?.(),
          toNumber: amountInBN?.toNumber?.(),
          has_toNumber: typeof amountInBN?.toNumber === "function",
          has_bn: amountInBN?._bn !== undefined,
          keys: amountInBN ? Object.keys(amountInBN).slice(0, 10) : [],
        };
      } catch {
        errorDetails.amountInBN = { error: "Could not inspect amountInBN" };
      }
    }

    if (minAmountOutBN !== undefined) {
      try {
        errorDetails.minAmountOutBN = {
          type: typeof minAmountOutBN,
          constructor: minAmountOutBN?.constructor?.name,
          toString: minAmountOutBN?.toString?.(),
          toNumber: minAmountOutBN?.toNumber?.(),
          has_toNumber: typeof minAmountOutBN?.toNumber === "function",
          has_bn: minAmountOutBN?._bn !== undefined,
          keys: minAmountOutBN ? Object.keys(minAmountOutBN).slice(0, 10) : [],
        };
      } catch {
        errorDetails.minAmountOutBN = { error: "Could not inspect minAmountOutBN" };
      }
    }

    errorDetails.BNClass = {
      name: BN?.name,
      type: typeof BN,
      isFunction: typeof BN === "function",
    };

    // Create a more descriptive error message
    const enhancedMessage = [
      `Failed to build swap instruction: ${errorMessage}`,
      "",
      "Error Details:",
      JSON.stringify(errorDetails, null, 2),
      "",
      "Possible causes:",
      "- Invalid or undefined PublicKey parameters",
      "- Invalid BN values (undefined, null, or invalid format)",
      "- Token accounts do not exist on-chain",
      "- Anchor program methods not available",
      "- Network connectivity issues",
    ].join("\n");

    const enhancedError = new Error(enhancedMessage);
    enhancedError.stack = err.stack;
    throw enhancedError;
  }
}

// Backwards-compatible wrapper that throws a helpful error if used in environments
// where dynamic import of Anchor is not possible during build
export async function buildSwapIx(_: SwapBuildParams): Promise<TransactionInstruction> {
  throw new Error("buildSwapIx requires Anchor. Use buildSwapIxWithAnchor(await import('@coral-xyz/anchor'), params) in a server-only context.");
}
