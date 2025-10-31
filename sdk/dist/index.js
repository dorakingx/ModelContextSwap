// src/index.ts
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";

// src/dex_ai.json
var dex_ai_default = {
  version: "0.1.0",
  name: "dex_ai",
  instructions: [
    {
      name: "swap",
      accounts: [
        { name: "user", isMut: true, isSigner: true },
        { name: "userSource", isMut: true, isSigner: false },
        { name: "userDestination", isMut: true, isSigner: false },
        { name: "pool", isMut: true, isSigner: false },
        { name: "vaultA", isMut: true, isSigner: false },
        { name: "vaultB", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "amountIn", type: "u64" },
        { name: "minAmountOut", type: "u64" }
      ]
    }
  ],
  accounts: [
    {
      name: "Pool",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "mintA", type: "publicKey" },
          { name: "mintB", type: "publicKey" },
          { name: "vaultA", type: "publicKey" },
          { name: "vaultB", type: "publicKey" },
          { name: "feeBps", type: "u16" }
        ]
      }
    }
  ],
  metadata: {
    address: "Dex111111111111111111111111111111111111111"
  }
};

// src/index.ts
function assertPubkey(name, v) {
  if (!v) throw new Error(`${name} is missing`);
  try {
    return v instanceof PublicKey ? v : new PublicKey(v);
  } catch (err) {
    throw new Error(`${name} is invalid: ${err.message || "Invalid public key"}`);
  }
}
function safeConvertToBN(name, BN, value, options) {
  if (!BN || typeof BN !== "function") {
    throw new Error(`BN class is invalid for ${name}: ${typeof BN}`);
  }
  if (value === void 0) {
    throw new Error(`${name} is undefined`);
  }
  if (value === null) {
    throw new Error(`${name} is null`);
  }
  let valueStr;
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
  } catch (err) {
    throw new Error(`Failed to convert ${name} to string: ${err.message || "Unknown error"}`);
  }
  if (!valueStr || valueStr.trim() === "") {
    throw new Error(`${name} is an empty string`);
  }
  const trimmedStr = valueStr.trim();
  if (!/^-?\d+$/.test(trimmedStr)) {
    throw new Error(`${name} contains invalid characters: "${trimmedStr}"`);
  }
  if (!options?.allowZero && trimmedStr === "0") {
    throw new Error(`${name} cannot be zero`);
  }
  if (options?.maxValue) {
    try {
      const maxBN = new BN(options.maxValue);
      const valueBN = new BN(trimmedStr);
      if (valueBN.gt(maxBN)) {
        throw new Error(`${name} exceeds maximum value: ${options.maxValue}`);
      }
    } catch {
    }
  }
  try {
    const bn = new BN(trimmedStr);
    if (!bn || typeof bn.toString !== "function") {
      throw new Error(`BN instance is invalid: missing toString method`);
    }
    if (bn._bn === void 0 && typeof bn.toNumber !== "function") {
      throw new Error(`BN instance is missing required methods`);
    }
    return bn;
  } catch (err) {
    if (err.message && (err.message.includes("is undefined") || err.message.includes("is null") || err.message.includes("is invalid"))) {
      throw err;
    }
    throw new Error(`Failed to create BN for ${name} from "${trimmedStr}": ${err.message || "Unknown error"}`);
  }
}
function constantProductQuote({ amountIn, reserveIn, reserveOut, feeBps }) {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) {
    return { amountOut: 0n };
  }
  const feeDen = 10000n;
  const amountInAfterFee = amountIn * (feeDen - BigInt(feeBps)) / feeDen;
  const numerator = amountInAfterFee * reserveOut;
  const denominator = reserveIn + amountInAfterFee;
  return { amountOut: numerator / denominator };
}
async function ensureTokenAccount(connection, tokenAccount, accountName, expectedMint) {
  try {
    const accountInfo = await connection.getAccountInfo(tokenAccount);
    if (!accountInfo) {
      throw new Error(`${accountName} token account does not exist: ${tokenAccount.toString()}`);
    }
    if (accountInfo.owner.toString() !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
      throw new Error(`${accountName} is not a valid token account: ${tokenAccount.toString()}`);
    }
    if (expectedMint) {
      try {
        const tokenAccountData = await getAccount(connection, tokenAccount);
        if (tokenAccountData.mint.toString() !== expectedMint.toString()) {
          throw new Error(
            `${accountName} mint mismatch: expected ${expectedMint.toString()}, got ${tokenAccountData.mint.toString()}`
          );
        }
      } catch (err) {
        if (err.message && err.message.includes("mint mismatch")) {
          throw err;
        }
        console.warn(`Could not verify mint for ${accountName}: ${err.message}`);
      }
    }
  } catch (err) {
    if (err.message && (err.message.includes("does not exist") || err.message.includes("not a valid token account"))) {
      throw err;
    }
    throw new Error(`Failed to validate ${accountName} token account: ${err.message || "Unknown error"}`);
  }
}
async function buildSwapIxWithAnchor(anchor, params, options) {
  const { BN, Program, AnchorProvider } = anchor;
  if (!BN || typeof BN !== "function") {
    throw new Error(`BN class is invalid: ${typeof BN}, constructor: ${BN?.name || "unknown"}`);
  }
  const programId = assertPubkey("programId", params.programId);
  const pool = assertPubkey("pool", params.pool);
  const user = assertPubkey("user", params.user);
  const userSource = assertPubkey("userSource", params.userSource);
  const userDestination = assertPubkey("userDestination", params.userDestination);
  const vaultA = assertPubkey("vaultA", params.vaultA);
  const vaultB = assertPubkey("vaultB", params.vaultB);
  const tokenProgram = assertPubkey("tokenProgram", params.tokenProgram);
  const provider = AnchorProvider.local();
  if (!provider) {
    throw new Error("AnchorProvider.local() returned undefined or null");
  }
  if (!provider.connection) {
    throw new Error("Provider is missing connection property");
  }
  const programIdWithBn = programId;
  if (!("_bn" in programIdWithBn) || programIdWithBn._bn === void 0) {
    throw new Error(
      `Program ID PublicKey is missing _bn property. PublicKey: ${programId.toString()}`
    );
  }
  if (!dex_ai_default || typeof dex_ai_default !== "object") {
    throw new Error("IDL is invalid or undefined");
  }
  if (dex_ai_default.metadata && typeof dex_ai_default.metadata === "object") {
    const idlMetadata = dex_ai_default.metadata;
    if (idlMetadata.address !== void 0) {
      try {
        const metadataAddress = idlMetadata.address;
        if (typeof metadataAddress === "string") {
          const testPubkey = new PublicKey(metadataAddress);
          const testPubkeyWithBn = testPubkey;
          if (!("_bn" in testPubkeyWithBn) || testPubkeyWithBn._bn === void 0) {
            console.warn(`[SDK] IDL metadata.address is invalid, replacing with provided programId`);
            idlMetadata.address = programId.toString();
          } else {
            if (testPubkey.toString() !== programId.toString()) {
              console.warn(`[SDK] IDL metadata.address (${metadataAddress}) doesn't match programId (${programId.toString()}), updating metadata`);
              idlMetadata.address = programId.toString();
            }
          }
        } else {
          console.warn(`[SDK] IDL metadata.address is not a string, setting to programId`);
          idlMetadata.address = programId.toString();
        }
      } catch (err) {
        console.warn(`[SDK] IDL metadata.address validation failed: ${err.message}, replacing with programId`);
        idlMetadata.address = programId.toString();
      }
    } else {
      idlMetadata.address = programId.toString();
    }
    if (typeof console !== "undefined" && console.log) {
      try {
        console.log("[SDK] IDL metadata (after validation):", JSON.stringify(idlMetadata, null, 2));
      } catch {
      }
    }
  } else {
    dex_ai_default.metadata = {
      address: programId.toString()
    };
  }
  let program;
  try {
    const validatedProgramIdWithBn = programId;
    if (!("_bn" in validatedProgramIdWithBn) || validatedProgramIdWithBn._bn === void 0) {
      throw new Error(
        `Program ID PublicKey is missing _bn property before Program creation. PublicKey: ${programId.toString()}`
      );
    }
    program = new Program(dex_ai_default, programId, provider);
  } catch (err) {
    const idlMetadata = dex_ai_default.metadata;
    const errorMsg = [
      `Failed to create Anchor Program instance: ${err.message || "Unknown error"}`,
      ``,
      `Program ID: ${programId.toString()}`,
      `Program ID type: ${typeof programId}`,
      `Program ID instanceof PublicKey: ${programId instanceof PublicKey}`,
      `Program ID _bn exists: ${"_bn" in programIdWithBn ? "yes" : "no"}`,
      `Program ID _bn value: ${programIdWithBn._bn !== void 0 ? "defined" : "undefined"}`,
      ``,
      `IDL metadata: ${idlMetadata ? JSON.stringify(idlMetadata, null, 2) : "N/A"}`,
      `IDL metadata.address: ${idlMetadata?.address || "N/A"}`,
      `IDL metadata.address type: ${typeof idlMetadata?.address}`,
      ``,
      `Error Type: ${err.constructor?.name || typeof err}`,
      `Error Name: ${err.name || "Unknown"}`,
      ``,
      `Stack Trace:`,
      err.stack || "No stack trace available"
    ].join("\n");
    throw new Error(errorMsg);
  }
  const amountInBN = safeConvertToBN("amountIn", BN, params.amountIn, { allowZero: false });
  const minAmountOutBN = safeConvertToBN("minAmountOut", BN, params.minAmountOut, { allowZero: false });
  if (options?.connection && options?.validateTokenAccounts) {
    try {
      await ensureTokenAccount(options.connection, userSource, "userSource");
      await ensureTokenAccount(options.connection, userDestination, "userDestination");
      await ensureTokenAccount(options.connection, vaultA, "vaultA");
      await ensureTokenAccount(options.connection, vaultB, "vaultB");
    } catch (err) {
      throw new Error(`Token account validation failed: ${err.message}`);
    }
  }
  try {
    if (!program || !program.methods) {
      throw new Error("Program is invalid or methods are not available");
    }
    const methods = program.methods;
    if (!methods || typeof methods !== "object") {
      throw new Error("program.methods is invalid");
    }
    if (!methods.swap || typeof methods.swap !== "function") {
      throw new Error("program.methods.swap is not available or not a function");
    }
    if (!amountInBN || !minAmountOutBN) {
      throw new Error(`BN instances are invalid: amountInBN=${!!amountInBN}, minAmountOutBN=${!!minAmountOutBN}`);
    }
    const swapMethod = methods.swap(amountInBN, minAmountOutBN);
    if (!swapMethod) {
      throw new Error("methods.swap() returned undefined or null");
    }
    if (!swapMethod.accounts || typeof swapMethod.accounts !== "function") {
      throw new Error("swapMethod.accounts is not a function");
    }
    const accounts = {};
    const accountDefinitions = [
      { key: "user", value: user },
      { key: "userSource", value: userSource },
      { key: "userDestination", value: userDestination },
      { key: "pool", value: pool },
      { key: "vaultA", value: vaultA },
      { key: "vaultB", value: vaultB },
      { key: "tokenProgram", value: tokenProgram }
    ];
    for (const { key, value } of accountDefinitions) {
      if (value === void 0) {
        throw new Error(`Account parameter '${key}' is undefined`);
      }
      if (value === null) {
        throw new Error(`Account parameter '${key}' is null`);
      }
      if (!(value instanceof PublicKey)) {
        throw new Error(
          `Account parameter '${key}' is not a PublicKey instance. Got: ${typeof value}, value: ${value}`
        );
      }
      const valueWithBn = value;
      if (!("_bn" in valueWithBn)) {
        throw new Error(
          `Account parameter '${key}' PublicKey is missing _bn property. PublicKey: ${value.toString()}`
        );
      }
      if (valueWithBn._bn === void 0) {
        throw new Error(
          `Account parameter '${key}' PublicKey has _bn property but it's undefined. PublicKey: ${value.toString()}`
        );
      }
      accounts[key] = value;
    }
    const validatedAccounts = {};
    const accountNames = ["user", "userSource", "userDestination", "pool", "vaultA", "vaultB", "tokenProgram"];
    for (const name of accountNames) {
      const accountValue = accounts[name];
      if (!accountValue) {
        throw new Error(`Account '${name}' is falsy when building validatedAccounts object`);
      }
      if (!(accountValue instanceof PublicKey)) {
        throw new Error(
          `Account '${name}' is not a PublicKey instance. Got: ${typeof accountValue}, value: ${accountValue}`
        );
      }
      const accountValueWithBn = accountValue;
      if (!("_bn" in accountValueWithBn) || accountValueWithBn._bn === void 0) {
        throw new Error(
          `Account '${name}' PublicKey _bn property is missing or undefined. PublicKey: ${accountValue.toString()}`
        );
      }
      validatedAccounts[name] = accountValue;
    }
    if (typeof console !== "undefined" && console.log) {
      try {
        console.log("[SDK] Accounts validation complete:", {
          accountCount: Object.keys(validatedAccounts).length,
          accountNames: Object.keys(validatedAccounts),
          accountsValid: Object.values(validatedAccounts).every((pk) => {
            const pkWithBn = pk;
            return pk instanceof PublicKey && pkWithBn._bn !== void 0;
          })
        });
      } catch {
      }
    }
    let accountsBuilder;
    try {
      accountsBuilder = swapMethod.accounts(validatedAccounts);
    } catch (err) {
      const accountDetails = Object.entries(validatedAccounts).map(([name, pk]) => {
        const pkWithBn = pk;
        return {
          name,
          publicKey: pk.toString(),
          has_bn: pkWithBn._bn !== void 0,
          _bn_type: typeof pkWithBn._bn,
          _bn_value: pkWithBn._bn ? pkWithBn._bn.toString() : "undefined",
          isPublicKey: pk instanceof PublicKey
        };
      });
      let enhancedStack = err.stack || "No stack trace";
      if (err.stack) {
        enhancedStack = err.stack.split("\n").map((line) => {
          if (line.includes("_bn") || line.includes("BN") || line.includes("bn")) {
            return `\u26A0\uFE0F  ${line}`;
          }
          return line;
        }).join("\n");
      }
      const errorMsg = [
        `Anchor swapMethod.accounts() failed: ${err.message || "Unknown error"}`,
        ``,
        `Error Type: ${err.constructor?.name || typeof err}`,
        `Error Name: ${err.name || "Unknown"}`,
        ``,
        `Account Details:`,
        JSON.stringify(accountDetails, null, 2),
        ``,
        `Stack Trace:`,
        enhancedStack
      ].join("\n");
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
  } catch (err) {
    const errorMessage = err.message || "Unknown error";
    let enhancedStack = err.stack || "No stack trace available";
    if (err.stack) {
      enhancedStack = err.stack.split("\n").map((line) => {
        if (line.includes("_bn") || line.includes("BN") || line.includes("bn")) {
          return `\u26A0\uFE0F  ${line}`;
        }
        return line;
      }).join("\n");
    }
    const errorDetails = {
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
        minAmountOut: params.minAmountOut?.toString()
      }
    };
    if (amountInBN !== void 0) {
      try {
        errorDetails.amountInBN = {
          type: typeof amountInBN,
          constructor: amountInBN?.constructor?.name,
          toString: amountInBN?.toString?.(),
          toNumber: amountInBN?.toNumber?.(),
          has_toNumber: typeof amountInBN?.toNumber === "function",
          has_bn: amountInBN?._bn !== void 0,
          keys: amountInBN ? Object.keys(amountInBN).slice(0, 10) : []
        };
      } catch {
        errorDetails.amountInBN = { error: "Could not inspect amountInBN" };
      }
    }
    if (minAmountOutBN !== void 0) {
      try {
        errorDetails.minAmountOutBN = {
          type: typeof minAmountOutBN,
          constructor: minAmountOutBN?.constructor?.name,
          toString: minAmountOutBN?.toString?.(),
          toNumber: minAmountOutBN?.toNumber?.(),
          has_toNumber: typeof minAmountOutBN?.toNumber === "function",
          has_bn: minAmountOutBN?._bn !== void 0,
          keys: minAmountOutBN ? Object.keys(minAmountOutBN).slice(0, 10) : []
        };
      } catch {
        errorDetails.minAmountOutBN = { error: "Could not inspect minAmountOutBN" };
      }
    }
    errorDetails.BNClass = {
      name: BN?.name,
      type: typeof BN,
      isFunction: typeof BN === "function"
    };
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
      "- Network connectivity issues"
    ].join("\n");
    const enhancedError = new Error(enhancedMessage);
    enhancedError.stack = err.stack;
    throw enhancedError;
  }
}
async function buildSwapIx(_) {
  throw new Error("buildSwapIx requires Anchor. Use buildSwapIxWithAnchor(await import('@coral-xyz/anchor'), params) in a server-only context.");
}
export {
  buildSwapIx,
  buildSwapIxWithAnchor,
  constantProductQuote,
  ensureTokenAccount,
  safeConvertToBN
};
