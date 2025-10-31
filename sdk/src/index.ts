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

  // Get provider - use provided provider or fallback to AnchorProvider.local()
  // Note: AnchorProvider.local() may fail in serverless environments, so we expect
  // the caller to provide a custom provider via AnchorProvider.local() override
  const provider = AnchorProvider.local();
  
  if (!provider) {
    throw new Error("AnchorProvider.local() returned undefined or null");
  }
  
  // Validate provider has required properties
  if (!provider.connection) {
    throw new Error("Provider is missing connection property");
  }
  
  // Validate provider wallet and publicKey to prevent _bn errors
  // Anchor's Program constructor accesses provider.wallet.publicKey internally
  if (!provider.wallet) {
    throw new Error("Provider is missing wallet property");
  }
  
  if (!provider.wallet.publicKey) {
    throw new Error("Provider wallet is missing publicKey property");
  }
  
  // Ensure provider wallet publicKey has _bn property
  const providerWalletPubkeyWithBn = provider.wallet.publicKey as any;
  if (!("_bn" in providerWalletPubkeyWithBn) || providerWalletPubkeyWithBn._bn === undefined) {
    // Try to recreate the publicKey if _bn is missing
    try {
      const recreatedPubkey = new PublicKey(provider.wallet.publicKey.toString());
      const recreatedPubkeyWithBn = recreatedPubkey as any;
      if (!("_bn" in recreatedPubkeyWithBn) || recreatedPubkeyWithBn._bn === undefined) {
        throw new Error("Provider wallet publicKey _bn property is missing and cannot be recreated");
      }
      // Replace the wallet's publicKey with the recreated one
      provider.wallet.publicKey = recreatedPubkey;
      console.warn('[SDK] Recreated provider wallet publicKey to fix missing _bn property');
    } catch (err: any) {
      throw new Error(`Provider wallet publicKey is invalid: ${err.message}`);
    }
  }
  
  // Validate programId has _bn property before passing to Anchor
  const programIdWithBn = programId as any;
  if (!("_bn" in programIdWithBn) || programIdWithBn._bn === undefined) {
    throw new Error(
      `Program ID PublicKey is missing _bn property. PublicKey: ${programId.toString()}`
    );
  }
  
  // Validate IDL structure before creating Program
  if (!idl || typeof idl !== 'object') {
    throw new Error("IDL is invalid or undefined");
  }
  
  // Deep validation and sanitization of IDL to prevent _bn errors
  // Anchor's Program constructor processes the entire IDL and may encounter undefined addresses
  // Create a minimal, clean IDL structure to avoid any undefined address issues
  // We manually construct a clean IDL to ensure no undefined/null values exist
  
  // Recursively clean and copy IDL structure, removing all undefined/null values
  function deepCleanIdl(obj: any): any {
    if (obj === null || obj === undefined) {
      return undefined; // Remove null/undefined
    }
    
    if (Array.isArray(obj)) {
      return obj
        .map(deepCleanIdl)
        .filter((item) => item !== undefined && item !== null);
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      Object.keys(obj).forEach((key) => {
        const value = obj[key];
        
        // Skip undefined/null values completely
        if (value === undefined || value === null) {
          return;
        }
        
        // Recursively clean nested objects
        const cleanedValue = deepCleanIdl(value);
        if (cleanedValue !== undefined && cleanedValue !== null) {
          cleaned[key] = cleanedValue;
        }
      });
      return cleaned;
    }
    
    return obj;
  }
  
  // Deep clean the original IDL first
  const cleanedIdl = deepCleanIdl(idl);
  
  // Create sanitized IDL with explicit structure
  let sanitizedIdl: any = {
    version: cleanedIdl?.version || idl.version || "0.1.0",
    name: cleanedIdl?.name || idl.name || "dex_ai",
    instructions: cleanedIdl?.instructions || idl.instructions || [],
    accounts: cleanedIdl?.accounts || idl.accounts || [],
    metadata: {
      address: programId.toString(),
    },
  };
  
  // Ensure metadata.address is always set to programId (critical for Anchor)
  sanitizedIdl.metadata.address = programId.toString();
  
  // Remove any additional metadata fields that might contain undefined addresses
  // Only keep safe, non-undefined fields
  if (cleanedIdl?.metadata && typeof cleanedIdl.metadata === 'object') {
    Object.keys(cleanedIdl.metadata).forEach((key) => {
      if (key === 'address') {
        // Already set above, skip
        return;
      }
      const value = cleanedIdl.metadata[key];
      // Only copy non-undefined, non-null, non-empty values
      if (value !== undefined && value !== null && value !== '') {
        sanitizedIdl.metadata[key] = value;
      }
    });
  }
  
  // Final deep clean of the sanitized IDL
  sanitizedIdl = deepCleanIdl(sanitizedIdl);
  
  // Ensure metadata.address is still set after final cleaning
  if (!sanitizedIdl.metadata) {
    sanitizedIdl.metadata = {};
  }
  sanitizedIdl.metadata.address = programId.toString();
  
  // Log IDL metadata for debugging
  if (typeof console !== 'undefined' && console.log) {
    try {
      console.log('[SDK] IDL metadata (after sanitization):', JSON.stringify(sanitizedIdl.metadata, null, 2));
    } catch {
      // Ignore logging errors
    }
  }
  
  // Create Program instance with enhanced error handling
  let program;
  try {
    // programId is already validated by assertPubkey above, so it's guaranteed to be a PublicKey instance
    // However, we double-check the _bn property one more time before passing to Anchor
    const validatedProgramIdWithBn = programId as any;
    if (!("_bn" in validatedProgramIdWithBn) || validatedProgramIdWithBn._bn === undefined) {
      throw new Error(
        `Program ID PublicKey is missing _bn property before Program creation. PublicKey: ${programId.toString()}`
      );
    }
    
    // Final IDL validation: ensure no undefined/null values remain
    // Anchor's translateAddress function is called for various addresses in the IDL
    // We need to ensure all address-like fields are valid strings or removed
    const idlString = JSON.stringify(sanitizedIdl);
    if (idlString.includes('undefined') || idlString === 'null') {
      console.warn('[SDK] IDL contains undefined/null values, attempting final clean');
      // Remove any remaining undefined/null values by stringifying and parsing with replacer
      sanitizedIdl = JSON.parse(JSON.stringify(sanitizedIdl, (key, value) => {
        // Remove all undefined/null values
        if (value === null || value === undefined) {
          return undefined; // Remove from JSON
        }
        return value;
      }));
      
      // Ensure metadata.address is still set after final clean
      if (!sanitizedIdl.metadata) {
        sanitizedIdl.metadata = {};
      }
      sanitizedIdl.metadata.address = programId.toString();
    }
    
    // Validate that metadata.address is a valid PublicKey string
    try {
      const testMetadataAddress = new PublicKey(sanitizedIdl.metadata.address);
      const testMetadataAddressWithBn = testMetadataAddress as any;
      if (!("_bn" in testMetadataAddressWithBn) || testMetadataAddressWithBn._bn === undefined) {
        throw new Error("metadata.address PublicKey is missing _bn property");
      }
    } catch (err: any) {
      throw new Error(`IDL metadata.address is invalid: ${err.message}`);
    }
    
    // Log final IDL structure for debugging (limited to prevent large logs)
    if (typeof console !== 'undefined' && console.log) {
      try {
        const idlSummary = {
          version: sanitizedIdl.version,
          name: sanitizedIdl.name,
          instructions: sanitizedIdl.instructions?.length || 0,
          accounts: sanitizedIdl.accounts?.length || 0,
          metadata: sanitizedIdl.metadata,
        };
        console.log('[SDK] Final IDL summary:', JSON.stringify(idlSummary, null, 2));
      } catch {
        // Ignore logging errors
      }
    }
    
    // Final validation: ensure IDL structure is completely clean
    // Stringify and parse one more time to remove any hidden undefined/null values
    const finalIdlString = JSON.stringify(sanitizedIdl);
    if (finalIdlString.includes('undefined') || finalIdlString === 'null') {
      throw new Error('IDL still contains undefined/null values after cleaning');
    }
    
    // Ensure metadata.address exists and is valid
    if (!sanitizedIdl.metadata || !sanitizedIdl.metadata.address) {
      throw new Error('IDL metadata.address is missing after sanitization');
    }
    
    // Validate metadata.address can be converted to PublicKey
    try {
      const testMetaAddress = new PublicKey(sanitizedIdl.metadata.address);
      const testMetaAddressWithBn = testMetaAddress as any;
      if (!("_bn" in testMetaAddressWithBn) || testMetaAddressWithBn._bn === undefined) {
        throw new Error("metadata.address PublicKey is missing _bn property");
      }
    } catch (err: any) {
      throw new Error(`IDL metadata.address validation failed: ${err.message}`);
    }
    
    // Use sanitized IDL instead of original to prevent _bn errors
    // Note: Anchor's Program constructor will call translateAddress internally
    // which may access _bn property of various addresses in the IDL
    program = new Program(sanitizedIdl, programId, provider);
  } catch (err: any) {
    // Enhanced error message for Program creation failures
    const idlMetadata = sanitizedIdl?.metadata || (idl as any).metadata;
    const errorMsg = [
      `Failed to create Anchor Program instance: ${err.message || 'Unknown error'}`,
      ``,
      `Program ID: ${programId.toString()}`,
      `Program ID type: ${typeof programId}`,
      `Program ID instanceof PublicKey: ${programId instanceof PublicKey}`,
      `Program ID _bn exists: ${("_bn" in programIdWithBn) ? 'yes' : 'no'}`,
      `Program ID _bn value: ${programIdWithBn._bn !== undefined ? 'defined' : 'undefined'}`,
      ``,
      `Provider: ${provider ? 'defined' : 'undefined'}`,
      `Provider connection: ${provider?.connection ? 'defined' : 'undefined'}`,
      `Provider wallet: ${provider?.wallet ? 'defined' : 'undefined'}`,
      `Provider wallet publicKey: ${provider?.wallet?.publicKey ? provider.wallet.publicKey.toString() : 'undefined'}`,
      ``,
      `IDL metadata: ${idlMetadata ? JSON.stringify(idlMetadata, null, 2) : 'N/A'}`,
      `IDL metadata.address: ${idlMetadata?.address || 'N/A'}`,
      `IDL metadata.address type: ${typeof idlMetadata?.address}`,
      ``,
      `Error Type: ${err.constructor?.name || typeof err}`,
      `Error Name: ${err.name || 'Unknown'}`,
      ``,
      `Stack Trace:`,
      err.stack || 'No stack trace available',
    ].join('\n');
    
    throw new Error(errorMsg);
  }
  
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
    // Validate program structure
    if (!program || !program.methods) {
      throw new Error("Program is invalid or methods are not available");
    }
    
    const methods = program.methods;
    if (!methods || typeof methods !== 'object') {
      throw new Error("program.methods is invalid");
    }
    
    if (!methods.swap || typeof methods.swap !== 'function') {
      throw new Error("program.methods.swap is not available or not a function");
    }

    // Validate BN instances before calling swap method
    if (!amountInBN || !minAmountOutBN) {
      throw new Error(`BN instances are invalid: amountInBN=${!!amountInBN}, minAmountOutBN=${!!minAmountOutBN}`);
    }

    const swapMethod = methods.swap(amountInBN, minAmountOutBN);
    if (!swapMethod) {
      throw new Error("methods.swap() returned undefined or null");
    }
    
    // Validate swapMethod has accounts method
    if (!swapMethod.accounts || typeof swapMethod.accounts !== 'function') {
      throw new Error("swapMethod.accounts is not a function");
    }

    // All accounts are already validated by assertPubkey above
    // Create accounts object with explicit structure matching IDL order
    // This ensures Anchor receives accounts in the correct order and format
    const accounts: Record<string, PublicKey> = {};
    
    // Define accounts in IDL order to match Anchor's expectations
    const accountDefinitions = [
      { key: 'user', value: user },
      { key: 'userSource', value: userSource },
      { key: 'userDestination', value: userDestination },
      { key: 'pool', value: pool },
      { key: 'vaultA', value: vaultA },
      { key: 'vaultB', value: vaultB },
      { key: 'tokenProgram', value: tokenProgram },
    ];

    // Comprehensive validation and assignment
    for (const { key, value } of accountDefinitions) {
      // Check if account is undefined or null
      if (value === undefined) {
        throw new Error(`Account parameter '${key}' is undefined`);
      }
      if (value === null) {
        throw new Error(`Account parameter '${key}' is null`);
      }
      
      // Check if it's a PublicKey instance
      if (!(value instanceof PublicKey)) {
        throw new Error(
          `Account parameter '${key}' is not a PublicKey instance. Got: ${typeof value}, value: ${value}`
        );
      }
      
      // Verify PublicKey has _bn property (required by Anchor for validation)
      // Type assertion needed because _bn is not in PublicKey type definition but exists at runtime
      const valueWithBn = value as any;
      if (!("_bn" in valueWithBn)) {
        throw new Error(
          `Account parameter '${key}' PublicKey is missing _bn property. PublicKey: ${value.toString()}`
        );
      }
      
      // Additional safety check: ensure _bn is not undefined
      if (valueWithBn._bn === undefined) {
        throw new Error(
          `Account parameter '${key}' PublicKey has _bn property but it's undefined. PublicKey: ${value.toString()}`
        );
      }
      
      // Add to accounts object
      accounts[key] = value;
    }

    // Create a new accounts object with only validated PublicKeys to ensure no undefined values
    // Build the object step by step with additional validation
    const validatedAccounts: Record<string, PublicKey> = {};
    
    // Validate and add each account individually
    const accountNames = ['user', 'userSource', 'userDestination', 'pool', 'vaultA', 'vaultB', 'tokenProgram'];
    for (const name of accountNames) {
      const accountValue = accounts[name as keyof typeof accounts];
      
      // Final validation check
      if (!accountValue) {
        throw new Error(`Account '${name}' is falsy when building validatedAccounts object`);
      }
      
      if (!(accountValue instanceof PublicKey)) {
        throw new Error(
          `Account '${name}' is not a PublicKey instance. Got: ${typeof accountValue}, value: ${accountValue}`
        );
      }
      
      // Ensure _bn property exists and is not undefined
      // Type assertion needed because _bn is not in PublicKey type definition but exists at runtime
      const accountValueWithBn = accountValue as any;
      if (!('_bn' in accountValueWithBn) || accountValueWithBn._bn === undefined) {
        throw new Error(
          `Account '${name}' PublicKey _bn property is missing or undefined. PublicKey: ${accountValue.toString()}`
        );
      }
      
      // Add to validated accounts object
      validatedAccounts[name] = accountValue;
    }

    // Debug logging (development only)
    if (typeof console !== 'undefined' && console.log) {
      try {
        console.log('[SDK] Accounts validation complete:', {
          accountCount: Object.keys(validatedAccounts).length,
          accountNames: Object.keys(validatedAccounts),
          accountsValid: Object.values(validatedAccounts).every((pk) => {
            const pkWithBn = pk as any;
            return pk instanceof PublicKey && pkWithBn._bn !== undefined;
          }),
        });
      } catch {
        // Ignore logging errors
      }
    }

    // Call swapMethod.accounts with additional error handling
    let accountsBuilder;
    try {
      accountsBuilder = swapMethod.accounts(validatedAccounts);
    } catch (err: any) {
      // Enhanced error message for Anchor internal errors
      const accountDetails = Object.entries(validatedAccounts).map(([name, pk]) => {
        const pkWithBn = pk as any;
        return {
          name,
          publicKey: pk.toString(),
          has_bn: pkWithBn._bn !== undefined,
          _bn_type: typeof pkWithBn._bn,
          _bn_value: pkWithBn._bn ? pkWithBn._bn.toString() : 'undefined',
          isPublicKey: pk instanceof PublicKey,
        };
      });
      
      // Enhanced stack trace with _bn markers
      let enhancedStack = err.stack || 'No stack trace';
      if (err.stack) {
        enhancedStack = err.stack.split('\n').map((line: string) => {
          if (line.includes('_bn') || line.includes('BN') || line.includes('bn')) {
            return `⚠️  ${line}`;
          }
          return line;
        }).join('\n');
      }
      
      const errorMsg = [
        `Anchor swapMethod.accounts() failed: ${err.message || 'Unknown error'}`,
        ``,
        `Error Type: ${err.constructor?.name || typeof err}`,
        `Error Name: ${err.name || 'Unknown'}`,
        ``,
        `Account Details:`,
        JSON.stringify(accountDetails, null, 2),
        ``,
        `Stack Trace:`,
        enhancedStack,
      ].join('\n');
      
      throw new Error(errorMsg);
    }

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
    
    // Extract stack trace with enhanced information
    let enhancedStack = err.stack || "No stack trace available";
    if (err.stack) {
      // Add markers for _bn related errors
      enhancedStack = err.stack.split('\n').map((line: string) => {
        if (line.includes('_bn') || line.includes('BN') || line.includes('bn')) {
          return `⚠️  ${line}`;
        }
        return line;
      }).join('\n');
    }
    
    const errorDetails: any = {
      message: errorMessage,
      stack: enhancedStack,
      originalStack: err.stack,
      step: "instruction_building",
      errorType: err.constructor?.name || typeof err,
      errorName: err.name || "Unknown",
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
