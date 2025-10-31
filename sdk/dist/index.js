// src/index.ts
import { PublicKey } from "@solana/web3.js";

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
  const provider = AnchorProvider.local();
  const program = new Program(dex_ai_default, params.programId, provider);
  if (!params.amountIn || !params.minAmountOut) {
    throw new Error("amountIn and minAmountOut must be provided");
  }
  const amountInStr = typeof params.amountIn === "bigint" ? params.amountIn.toString() : String(params.amountIn);
  const minAmountOutStr = typeof params.minAmountOut === "bigint" ? params.minAmountOut.toString() : String(params.minAmountOut);
  if (!amountInStr || amountInStr.trim() === "" || isNaN(Number(amountInStr))) {
    throw new Error(`Invalid amountIn string: "${amountInStr}"`);
  }
  if (!minAmountOutStr || minAmountOutStr.trim() === "" || isNaN(Number(minAmountOutStr))) {
    throw new Error(`Invalid minAmountOut string: "${minAmountOutStr}"`);
  }
  let amountInBN;
  let minAmountOutBN;
  try {
    amountInBN = new BN(amountInStr);
    if (!amountInBN || typeof amountInBN.toString !== "function") {
      throw new Error(`Failed to create valid BN instance for amountIn: ${amountInStr}`);
    }
  } catch (err) {
    throw new Error(`Failed to create BN for amountIn "${amountInStr}": ${err.message}`);
  }
  try {
    minAmountOutBN = new BN(minAmountOutStr);
    if (!minAmountOutBN || typeof minAmountOutBN.toString !== "function") {
      throw new Error(`Failed to create valid BN instance for minAmountOut: ${minAmountOutStr}`);
    }
  } catch (err) {
    throw new Error(`Failed to create BN for minAmountOut "${minAmountOutStr}": ${err.message}`);
  }
  try {
    if (amountInBN && typeof amountInBN === "object") {
      const amountInStr2 = amountInBN.toString();
      const amountInNum = amountInBN.toNumber ? amountInBN.toNumber() : Number(amountInStr2);
      if (isNaN(amountInNum)) {
        throw new Error(`Invalid amountInBN: cannot convert to number`);
      }
    }
    if (minAmountOutBN && typeof minAmountOutBN === "object") {
      const minAmountOutStr2 = minAmountOutBN.toString();
      const minAmountOutNum = minAmountOutBN.toNumber ? minAmountOutBN.toNumber() : Number(minAmountOutStr2);
      if (isNaN(minAmountOutNum)) {
        throw new Error(`Invalid minAmountOutBN: cannot convert to number`);
      }
    }
    const methods = program.methods;
    if (!methods || !methods.swap) {
      throw new Error("program.methods.swap is not available");
    }
    const swapMethod = methods.swap(amountInBN, minAmountOutBN);
    if (!swapMethod) {
      throw new Error("methods.swap() returned undefined");
    }
    const accountValidations = [
      { name: "user", value: params.user },
      { name: "userSource", value: params.userSource },
      { name: "userDestination", value: params.userDestination },
      { name: "pool", value: params.pool },
      { name: "vaultA", value: params.vaultA },
      { name: "vaultB", value: params.vaultB },
      { name: "tokenProgram", value: params.tokenProgram }
    ];
    for (const { name, value } of accountValidations) {
      if (!value) {
        throw new Error(`Account parameter '${name}' is undefined or null`);
      }
      if (!(value instanceof PublicKey)) {
        throw new Error(`Account parameter '${name}' is not a valid PublicKey instance (got: ${typeof value})`);
      }
      if (!("_bn" in value)) {
        throw new Error(`Account parameter '${name}' PublicKey is missing _bn property`);
      }
    }
    const accountsBuilder = swapMethod.accounts({
      user: params.user,
      userSource: params.userSource,
      userDestination: params.userDestination,
      pool: params.pool,
      vaultA: params.vaultA,
      vaultB: params.vaultB,
      tokenProgram: params.tokenProgram
      // systemProgram is not needed for swap
    });
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
export {
  buildSwapIx,
  buildSwapIxWithAnchor,
  constantProductQuote
};
