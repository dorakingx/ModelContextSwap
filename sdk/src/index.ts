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
  
  // Completely rebuild IDL from scratch to ensure no undefined/null values
  // Anchor's Program constructor calls translateAddress for various addresses in the IDL
  // If any address is undefined, translateAddress will fail with _bn error
  // By rebuilding the IDL manually, we ensure only valid values are included
  
  // Helper function to safely get value or default
  function safeGet(obj: any, key: string, defaultValue: any): any {
    const value = obj?.[key];
    return (value !== undefined && value !== null) ? value : defaultValue;
  }
  
  // Helper function to safely copy array, filtering out undefined/null
  function safeCopyArray(arr: any[] | undefined | null): any[] {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item !== undefined && item !== null)
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const cleaned: any = {};
          Object.keys(item).forEach((key) => {
            const val = item[key];
            if (val !== undefined && val !== null) {
              cleaned[key] = val;
            }
          });
          return cleaned;
        }
        return item;
      });
  }
  
  // Helper function to recursively clean objects, removing undefined/null
  function deepCleanObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return undefined;
    }
    if (Array.isArray(obj)) {
      return obj
        .map(deepCleanObject)
        .filter((item) => item !== undefined && item !== null);
    }
    if (typeof obj === 'object') {
      const cleaned: any = {};
      Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (val !== undefined && val !== null) {
          const cleanedVal = deepCleanObject(val);
          if (cleanedVal !== undefined && cleanedVal !== null) {
            cleaned[key] = cleanedVal;
          }
        }
      });
      return cleaned;
    }
    return obj;
  }
  
  // Build IDL from scratch with only valid values
  // Use deep cleaning to ensure no undefined/null values exist anywhere
  let sanitizedIdl: any = deepCleanObject({
    version: safeGet(idl, 'version', '0.1.0'),
    name: safeGet(idl, 'name', 'dex_ai'),
    instructions: safeCopyArray(idl.instructions),
    accounts: safeCopyArray(idl.accounts),
    metadata: {
      address: programId.toString(),
    },
  });
  
  // Ensure metadata.address is always set to programId (critical for Anchor)
  if (!sanitizedIdl.metadata) {
    sanitizedIdl.metadata = {};
  }
  sanitizedIdl.metadata.address = programId.toString();
  
  // Final deep clean to remove any nested undefined/null values
  sanitizedIdl = deepCleanObject(sanitizedIdl);
  
  // Ensure metadata.address is still set after deep cleaning
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
    
    // Multi-stage IDL cleaning to ensure no undefined/null values remain
    // Anchor's translateAddress function may be called for various addresses in the IDL
    // We need to ensure all address-like fields are valid strings or removed
    
    // Stage 1: Remove undefined/null values using JSON replacer
    sanitizedIdl = JSON.parse(JSON.stringify(sanitizedIdl, (key, value) => {
      // Remove all undefined/null values
      if (value === null || value === undefined) {
        return undefined; // Remove from JSON
      }
      return value;
    }));
    
    // Ensure metadata.address is still set after cleaning
    if (!sanitizedIdl.metadata) {
      sanitizedIdl.metadata = {};
    }
    sanitizedIdl.metadata.address = programId.toString();
    
    // Stage 2: Final validation - ensure IDL structure is completely clean
    const finalIdlString = JSON.stringify(sanitizedIdl);
    if (finalIdlString.includes('undefined') || finalIdlString === 'null') {
      throw new Error('IDL still contains undefined/null values after cleaning');
    }
    
    // Ensure metadata.address exists and is valid
    if (!sanitizedIdl.metadata || !sanitizedIdl.metadata.address) {
      throw new Error('IDL metadata.address is missing after sanitization');
    }
    
    // Stage 3: Validate metadata.address can be converted to PublicKey with _bn property
    try {
      const testMetaAddress = new PublicKey(sanitizedIdl.metadata.address);
      const testMetaAddressWithBn = testMetaAddress as any;
      if (!("_bn" in testMetaAddressWithBn) || testMetaAddressWithBn._bn === undefined) {
        throw new Error("metadata.address PublicKey is missing _bn property");
      }
      // Verify the address matches programId
      if (testMetaAddress.toString() !== programId.toString()) {
        console.warn(`[SDK] IDL metadata.address (${testMetaAddress.toString()}) doesn't match programId (${programId.toString()}), updating`);
        sanitizedIdl.metadata.address = programId.toString();
      }
    } catch (err: any) {
      throw new Error(`IDL metadata.address validation failed: ${err.message}`);
    }
    
    // Stage 4: Log final IDL structure for debugging (limited to prevent large logs)
    if (typeof console !== 'undefined' && console.log) {
      try {
        const idlSummary = {
          version: sanitizedIdl.version,
          name: sanitizedIdl.name,
          instructions: sanitizedIdl.instructions?.length || 0,
          accounts: sanitizedIdl.accounts?.length || 0,
          metadata: sanitizedIdl.metadata,
          hasUndefined: finalIdlString.includes('undefined'),
          hasNull: finalIdlString.includes('null'),
        };
        console.log('[SDK] Final IDL summary:', JSON.stringify(idlSummary, null, 2));
      } catch {
        // Ignore logging errors
      }
    }
    
    // Before creating Program, ensure programId is a fresh PublicKey instance
    // This prevents any potential serialization issues that might cause _bn to be lost
    const freshProgramId = new PublicKey(programId.toString());
    const freshProgramIdWithBn = freshProgramId as any;
    if (!("_bn" in freshProgramIdWithBn) || freshProgramIdWithBn._bn === undefined) {
      throw new Error("Failed to create fresh Program ID PublicKey with _bn property");
    }
    
    // Also ensure provider.wallet.publicKey is fresh
    const freshProviderWalletPubkey = new PublicKey(provider.wallet.publicKey.toString());
    const freshProviderWalletPubkeyWithBn = freshProviderWalletPubkey as any;
    if (!("_bn" in freshProviderWalletPubkeyWithBn) || freshProviderWalletPubkeyWithBn._bn === undefined) {
      throw new Error("Failed to create fresh provider wallet publicKey with _bn property");
    }
    provider.wallet.publicKey = freshProviderWalletPubkey;
    
    // Final IDL validation: ensure metadata.address is a valid PublicKey string
    // Anchor's translateAddress will be called for metadata.address, so it must be valid
    if (!sanitizedIdl.metadata || !sanitizedIdl.metadata.address) {
      throw new Error("IDL metadata.address is missing before Program creation");
    }
    
    // Validate metadata.address can be converted to PublicKey
    try {
      const testMetaAddress = new PublicKey(sanitizedIdl.metadata.address);
      const testMetaAddressWithBn = testMetaAddress as any;
      if (!("_bn" in testMetaAddressWithBn) || testMetaAddressWithBn._bn === undefined) {
        throw new Error("metadata.address PublicKey is missing _bn property");
      }
      // Ensure it matches programId
      if (testMetaAddress.toString() !== freshProgramId.toString()) {
        sanitizedIdl.metadata.address = freshProgramId.toString();
      }
    } catch (err: any) {
      throw new Error(`IDL metadata.address is invalid before Program creation: ${err.message}`);
    }
    
    // Log IDL structure for debugging
    if (typeof console !== 'undefined' && console.log) {
      try {
        const idlForLog = {
          version: sanitizedIdl.version,
          name: sanitizedIdl.name,
          instructionsCount: sanitizedIdl.instructions?.length || 0,
          accountsCount: sanitizedIdl.accounts?.length || 0,
          metadata: sanitizedIdl.metadata,
        };
        console.log('[SDK] Creating Program with IDL:', JSON.stringify(idlForLog, null, 2));
        console.log('[SDK] Program ID:', freshProgramId.toString());
        console.log('[SDK] Provider wallet publicKey:', freshProviderWalletPubkey.toString());
      } catch {
        // Ignore logging errors
      }
    }
    
    // Critical: Anchor's Program constructor may process metadata.address from IDL
    // Even though we pass programId as the second argument, Anchor might still
    // try to translate metadata.address internally. Some Anchor versions may
    // call translateAddress on metadata.address even when programId is provided.
    // To prevent this, we create a clean IDL copy without metadata.address
    // and rely solely on the programId parameter.
    
    // Final check: Ensure sanitizedIdl is a plain object (not a class instance)
    // that can be safely serialized and passed to Anchor
    const finalIdl = JSON.parse(JSON.stringify(sanitizedIdl));
    
    // Remove metadata.address from IDL to prevent Anchor from processing it
    // Anchor's Program constructor should use the programId parameter instead
    // This prevents translateAddress from being called on potentially undefined values
    if (finalIdl.metadata) {
      // Keep metadata but remove address field
      const { address, ...metadataWithoutAddress } = finalIdl.metadata;
      if (Object.keys(metadataWithoutAddress).length > 0) {
        finalIdl.metadata = metadataWithoutAddress;
      } else {
        // If metadata only had address, remove metadata entirely
        delete finalIdl.metadata;
      }
    }
    
    // Ensure finalIdl has no undefined/null values
    const finalIdlStringCheck = JSON.stringify(finalIdl);
    if (finalIdlStringCheck.includes('undefined') || finalIdlStringCheck.includes('null')) {
      throw new Error('Final IDL still contains undefined/null values after JSON serialization');
    }
    
    // Log final IDL structure for debugging
    if (typeof console !== 'undefined' && console.log) {
      try {
        console.log('[SDK] Final IDL (metadata.address removed):', JSON.stringify({
          version: finalIdl.version,
          name: finalIdl.name,
          hasMetadata: !!finalIdl.metadata,
          metadataKeys: finalIdl.metadata ? Object.keys(finalIdl.metadata) : [],
        }, null, 2));
      } catch {
        // Ignore logging errors
      }
    }
    
    // Use sanitized IDL WITHOUT metadata.address to prevent _bn errors
    // Anchor's Program constructor will use the programId parameter instead
    // The constructor signature is: new Program(idl, programId, provider)
    program = new Program(finalIdl, freshProgramId, provider);
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
