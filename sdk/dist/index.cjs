"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  buildSwapIx: () => buildSwapIx,
  buildSwapIxWithAnchor: () => buildSwapIxWithAnchor,
  constantProductQuote: () => constantProductQuote,
  ensureTokenAccount: () => ensureTokenAccount,
  safeConvertToBN: () => safeConvertToBN
});
module.exports = __toCommonJS(index_exports);
var import_web3 = require("@solana/web3.js");
var import_spl_token = require("@solana/spl-token");

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
    return v instanceof import_web3.PublicKey ? v : new import_web3.PublicKey(v);
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
        const tokenAccountData = await (0, import_spl_token.getAccount)(connection, tokenAccount);
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
  if (!provider.wallet) {
    throw new Error("Provider is missing wallet property");
  }
  if (!provider.wallet.publicKey) {
    throw new Error("Provider wallet is missing publicKey property");
  }
  const providerWalletPubkeyWithBn = provider.wallet.publicKey;
  if (!("_bn" in providerWalletPubkeyWithBn) || providerWalletPubkeyWithBn._bn === void 0) {
    try {
      const recreatedPubkey = new import_web3.PublicKey(provider.wallet.publicKey.toString());
      const recreatedPubkeyWithBn = recreatedPubkey;
      if (!("_bn" in recreatedPubkeyWithBn) || recreatedPubkeyWithBn._bn === void 0) {
        throw new Error("Provider wallet publicKey _bn property is missing and cannot be recreated");
      }
      provider.wallet.publicKey = recreatedPubkey;
      console.warn("[SDK] Recreated provider wallet publicKey to fix missing _bn property");
    } catch (err) {
      throw new Error(`Provider wallet publicKey is invalid: ${err.message}`);
    }
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
  function safeGet(obj, key, defaultValue) {
    const value = obj?.[key];
    return value !== void 0 && value !== null ? value : defaultValue;
  }
  function safeCopyArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter((item) => item !== void 0 && item !== null).map((item) => {
      if (typeof item === "object" && item !== null) {
        const cleaned = {};
        Object.keys(item).forEach((key) => {
          const val = item[key];
          if (val !== void 0 && val !== null) {
            cleaned[key] = val;
          }
        });
        return cleaned;
      }
      return item;
    });
  }
  function deepCleanObject(obj) {
    if (obj === null || obj === void 0) {
      return void 0;
    }
    if (Array.isArray(obj)) {
      return obj.map(deepCleanObject).filter((item) => item !== void 0 && item !== null);
    }
    if (typeof obj === "object") {
      const cleaned = {};
      Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (val !== void 0 && val !== null) {
          const cleanedVal = deepCleanObject(val);
          if (cleanedVal !== void 0 && cleanedVal !== null) {
            cleaned[key] = cleanedVal;
          }
        }
      });
      return cleaned;
    }
    return obj;
  }
  let sanitizedIdl = deepCleanObject({
    version: safeGet(dex_ai_default, "version", "0.1.0"),
    name: safeGet(dex_ai_default, "name", "dex_ai"),
    instructions: safeCopyArray(dex_ai_default.instructions),
    accounts: safeCopyArray(dex_ai_default.accounts),
    metadata: {
      address: programId.toString()
    }
  });
  if (!sanitizedIdl.metadata) {
    sanitizedIdl.metadata = {};
  }
  sanitizedIdl.metadata.address = programId.toString();
  sanitizedIdl = deepCleanObject(sanitizedIdl);
  if (!sanitizedIdl.metadata) {
    sanitizedIdl.metadata = {};
  }
  sanitizedIdl.metadata.address = programId.toString();
  if (typeof console !== "undefined" && console.log) {
    try {
      console.log("[SDK] IDL metadata (after sanitization):", JSON.stringify(sanitizedIdl.metadata, null, 2));
    } catch {
    }
  }
  let program;
  try {
    const validatedProgramIdWithBn = programId;
    if (!("_bn" in validatedProgramIdWithBn) || validatedProgramIdWithBn._bn === void 0) {
      throw new Error(
        `Program ID PublicKey is missing _bn property before Program creation. PublicKey: ${programId.toString()}`
      );
    }
    sanitizedIdl = JSON.parse(JSON.stringify(sanitizedIdl, (key, value) => {
      if (value === null || value === void 0) {
        return void 0;
      }
      return value;
    }));
    if (!sanitizedIdl.metadata) {
      sanitizedIdl.metadata = {};
    }
    sanitizedIdl.metadata.address = programId.toString();
    const finalIdlString = JSON.stringify(sanitizedIdl);
    if (finalIdlString.includes("undefined") || finalIdlString === "null") {
      throw new Error("IDL still contains undefined/null values after cleaning");
    }
    if (!sanitizedIdl.metadata || !sanitizedIdl.metadata.address) {
      throw new Error("IDL metadata.address is missing after sanitization");
    }
    try {
      const testMetaAddress = new import_web3.PublicKey(sanitizedIdl.metadata.address);
      const testMetaAddressWithBn = testMetaAddress;
      if (!("_bn" in testMetaAddressWithBn) || testMetaAddressWithBn._bn === void 0) {
        throw new Error("metadata.address PublicKey is missing _bn property");
      }
      if (testMetaAddress.toString() !== programId.toString()) {
        console.warn(`[SDK] IDL metadata.address (${testMetaAddress.toString()}) doesn't match programId (${programId.toString()}), updating`);
        sanitizedIdl.metadata.address = programId.toString();
      }
    } catch (err) {
      throw new Error(`IDL metadata.address validation failed: ${err.message}`);
    }
    if (typeof console !== "undefined" && console.log) {
      try {
        const idlSummary = {
          version: sanitizedIdl.version,
          name: sanitizedIdl.name,
          instructions: sanitizedIdl.instructions?.length || 0,
          accounts: sanitizedIdl.accounts?.length || 0,
          metadata: sanitizedIdl.metadata,
          hasUndefined: finalIdlString.includes("undefined"),
          hasNull: finalIdlString.includes("null")
        };
        console.log("[SDK] Final IDL summary:", JSON.stringify(idlSummary, null, 2));
      } catch {
      }
    }
    const freshProgramId = new import_web3.PublicKey(programId.toString());
    const freshProgramIdWithBn = freshProgramId;
    if (!("_bn" in freshProgramIdWithBn) || freshProgramIdWithBn._bn === void 0) {
      throw new Error("Failed to create fresh Program ID PublicKey with _bn property");
    }
    const freshProviderWalletPubkey = new import_web3.PublicKey(provider.wallet.publicKey.toString());
    const freshProviderWalletPubkeyWithBn = freshProviderWalletPubkey;
    if (!("_bn" in freshProviderWalletPubkeyWithBn) || freshProviderWalletPubkeyWithBn._bn === void 0) {
      throw new Error("Failed to create fresh provider wallet publicKey with _bn property");
    }
    provider.wallet.publicKey = freshProviderWalletPubkey;
    if (!sanitizedIdl.metadata || !sanitizedIdl.metadata.address) {
      throw new Error("IDL metadata.address is missing before Program creation");
    }
    try {
      const testMetaAddress = new import_web3.PublicKey(sanitizedIdl.metadata.address);
      const testMetaAddressWithBn = testMetaAddress;
      if (!("_bn" in testMetaAddressWithBn) || testMetaAddressWithBn._bn === void 0) {
        throw new Error("metadata.address PublicKey is missing _bn property");
      }
      if (testMetaAddress.toString() !== freshProgramId.toString()) {
        sanitizedIdl.metadata.address = freshProgramId.toString();
      }
    } catch (err) {
      throw new Error(`IDL metadata.address is invalid before Program creation: ${err.message}`);
    }
    if (typeof console !== "undefined" && console.log) {
      try {
        const idlForLog = {
          version: sanitizedIdl.version,
          name: sanitizedIdl.name,
          instructionsCount: sanitizedIdl.instructions?.length || 0,
          accountsCount: sanitizedIdl.accounts?.length || 0,
          metadata: sanitizedIdl.metadata
        };
        console.log("[SDK] Creating Program with IDL:", JSON.stringify(idlForLog, null, 2));
        console.log("[SDK] Program ID:", freshProgramId.toString());
        console.log("[SDK] Provider wallet publicKey:", freshProviderWalletPubkey.toString());
      } catch {
      }
    }
    const finalIdl = JSON.parse(JSON.stringify(sanitizedIdl));
    if (finalIdl.metadata) {
      const { address, ...metadataWithoutAddress } = finalIdl.metadata;
      if (Object.keys(metadataWithoutAddress).length > 0) {
        finalIdl.metadata = metadataWithoutAddress;
      } else {
        delete finalIdl.metadata;
      }
    }
    const finalIdlStringCheck = JSON.stringify(finalIdl);
    if (finalIdlStringCheck.includes("undefined") || finalIdlStringCheck.includes("null")) {
      throw new Error("Final IDL still contains undefined/null values after JSON serialization");
    }
    if (typeof console !== "undefined" && console.log) {
      try {
        console.log("[SDK] Final IDL (metadata.address removed):", JSON.stringify({
          version: finalIdl.version,
          name: finalIdl.name,
          hasMetadata: !!finalIdl.metadata,
          metadataKeys: finalIdl.metadata ? Object.keys(finalIdl.metadata) : []
        }, null, 2));
      } catch {
      }
    }
    if (!finalIdl || typeof finalIdl !== "object") {
      throw new Error("finalIdl is invalid before Program creation");
    }
    if (!freshProgramId || !(freshProgramId instanceof import_web3.PublicKey)) {
      throw new Error("freshProgramId is not a PublicKey instance before Program creation");
    }
    const finalProgramIdWithBn = freshProgramId;
    if (!("_bn" in finalProgramIdWithBn) || finalProgramIdWithBn._bn === void 0) {
      throw new Error("freshProgramId is missing _bn property before Program creation");
    }
    if (!provider || typeof provider !== "object") {
      throw new Error("provider is invalid before Program creation");
    }
    if (!provider.connection || !provider.wallet || !provider.wallet.publicKey) {
      throw new Error("provider is missing required properties before Program creation");
    }
    const finalProviderWalletPubkeyWithBn = provider.wallet.publicKey;
    if (!("_bn" in finalProviderWalletPubkeyWithBn) || finalProviderWalletPubkeyWithBn._bn === void 0) {
      throw new Error("provider.wallet.publicKey is missing _bn property before Program creation");
    }
    if (typeof console !== "undefined" && console.log) {
      try {
        console.log("[SDK] About to create Program with:", {
          programId: freshProgramId.toString(),
          programIdType: typeof freshProgramId,
          programIdInstanceof: freshProgramId instanceof import_web3.PublicKey,
          programIdHasBn: "_bn" in finalProgramIdWithBn,
          providerExists: !!provider,
          providerConnectionExists: !!provider.connection,
          providerWalletExists: !!provider.wallet,
          providerWalletPubkey: provider.wallet.publicKey.toString(),
          providerWalletPubkeyHasBn: "_bn" in finalProviderWalletPubkeyWithBn,
          finalIdlVersion: finalIdl.version,
          finalIdlName: finalIdl.name,
          finalIdlHasMetadata: !!finalIdl.metadata
        });
      } catch {
      }
    }
    program = new Program(finalIdl, freshProgramId, provider);
  } catch (err) {
    const idlMetadata = sanitizedIdl?.metadata || dex_ai_default.metadata;
    const errorMsg = [
      `Failed to create Anchor Program instance: ${err.message || "Unknown error"}`,
      ``,
      `Program ID: ${programId.toString()}`,
      `Program ID type: ${typeof programId}`,
      `Program ID instanceof PublicKey: ${programId instanceof import_web3.PublicKey}`,
      `Program ID _bn exists: ${"_bn" in programIdWithBn ? "yes" : "no"}`,
      `Program ID _bn value: ${programIdWithBn._bn !== void 0 ? "defined" : "undefined"}`,
      ``,
      `Provider: ${provider ? "defined" : "undefined"}`,
      `Provider connection: ${provider?.connection ? "defined" : "undefined"}`,
      `Provider wallet: ${provider?.wallet ? "defined" : "undefined"}`,
      `Provider wallet publicKey: ${provider?.wallet?.publicKey ? provider.wallet.publicKey.toString() : "undefined"}`,
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
      if (!(value instanceof import_web3.PublicKey)) {
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
      if (!(accountValue instanceof import_web3.PublicKey)) {
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
            return pk instanceof import_web3.PublicKey && pkWithBn._bn !== void 0;
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
          isPublicKey: pk instanceof import_web3.PublicKey
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildSwapIx,
  buildSwapIxWithAnchor,
  constantProductQuote,
  ensureTokenAccount,
  safeConvertToBN
});
