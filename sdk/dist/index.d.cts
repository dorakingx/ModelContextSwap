import { PublicKey, TransactionInstruction } from '@solana/web3.js';

type AnchorExports = {
    BN: any;
    Program: new (idl: any, programId: PublicKey, provider: any) => any;
    AnchorProvider: {
        local: () => any;
    };
    Idl?: any;
};
type QuoteParams = {
    amountIn: bigint;
    reserveIn: bigint;
    reserveOut: bigint;
    feeBps: number;
};
type QuoteResult = {
    amountOut: bigint;
};
declare function constantProductQuote({ amountIn, reserveIn, reserveOut, feeBps }: QuoteParams): QuoteResult;
type SwapBuildParams = {
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
declare function buildSwapIxWithAnchor(anchor: AnchorExports, params: SwapBuildParams): Promise<TransactionInstruction>;
declare function buildSwapIx(_: SwapBuildParams): Promise<TransactionInstruction>;

export { type QuoteParams, type QuoteResult, type SwapBuildParams, buildSwapIx, buildSwapIxWithAnchor, constantProductQuote };
