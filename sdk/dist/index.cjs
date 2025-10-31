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
  constantProductQuote: () => constantProductQuote
});
module.exports = __toCommonJS(index_exports);
var import_web3 = require("@solana/web3.js");

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
function assertBN(name, BN, value) {
  if (!BN || typeof BN !== "function") {
    throw new Error(`BN class is invalid for ${name}`);
  }
  if (value === void 0 || value === null) {
    throw new Error(`${name} is missing`);
  }
  try {
    const valueStr = typeof value === "bigint" ? value.toString() : String(value);
    if (!valueStr || valueStr.trim() === "" || isNaN(Number(valueStr))) {
      throw new Error(`Invalid ${name} value: "${valueStr}"`);
    }
    const bn = new BN(valueStr);
    if (!bn || typeof bn.toString !== "function") {
      throw new Error(`Failed to create valid BN instance for ${name}`);
    }
    return bn;
  } catch (err) {
    if (err.message && err.message.includes("is missing") || err.message.includes("is invalid")) {
      throw err;
    }
    throw new Error(`Failed to create BN for ${name}: ${err.message || "Unknown error"}`);
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
async function buildSwapIxWithAnchor(anchor, params) {
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
  const program = new Program(dex_ai_default, programId, provider);
  const amountInBN = assertBN("amountIn", BN, params.amountIn);
  const minAmountOutBN = assertBN("minAmountOut", BN, params.minAmountOut);
  try {
    const methods = program.methods;
    if (!methods || !methods.swap) {
      throw new Error("program.methods.swap is not available");
    }
    const swapMethod = methods.swap(amountInBN, minAmountOutBN);
    if (!swapMethod) {
      throw new Error("methods.swap() returned undefined");
    }
    const accounts = {
      user,
      userSource,
      userDestination,
      pool,
      vaultA,
      vaultB,
      tokenProgram
    };
    for (const [name, value] of Object.entries(accounts)) {
      if (!("_bn" in value)) {
        throw new Error(`Account parameter '${name}' PublicKey is missing _bn property`);
      }
    }
    const accountsBuilder = swapMethod.accounts(accounts);
    if (!accountsBuilder) {
      throw new Error("swapMethod.accounts() returned undefined");
    }
    const instruction = await accountsBuilder.instruction();
    if (!instruction) {
      throw new Error("accountsBuilder.instruction() returned undefined");
    }
    return instruction;
  } catch (err) {
    const errorDetails = {
      message: err.message,
      stack: err.stack,
      amountInBN: {
        type: typeof amountInBN,
        constructor: amountInBN?.constructor?.name,
        toString: amountInBN?.toString?.(),
        has_toNumber: typeof amountInBN?.toNumber === "function",
        has_bn: amountInBN?._bn !== void 0,
        keys: amountInBN ? Object.keys(amountInBN).slice(0, 10) : []
      },
      minAmountOutBN: {
        type: typeof minAmountOutBN,
        constructor: minAmountOutBN?.constructor?.name,
        toString: minAmountOutBN?.toString?.(),
        has_toNumber: typeof minAmountOutBN?.toNumber === "function",
        has_bn: minAmountOutBN?._bn !== void 0,
        keys: minAmountOutBN ? Object.keys(minAmountOutBN).slice(0, 10) : []
      },
      BNClass: {
        name: BN?.name,
        type: typeof BN
      }
    };
    throw new Error(
      `Failed to build swap instruction: ${err.message}
Error details: ${JSON.stringify(errorDetails, null, 2)}`
    );
  }
}
async function buildSwapIx(_) {
  throw new Error("buildSwapIx requires Anchor. Use buildSwapIxWithAnchor(await import('@coral-xyz/anchor'), params) in a server-only context.");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildSwapIx,
  buildSwapIxWithAnchor,
  constantProductQuote
});
