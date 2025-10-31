import { PublicKey, Connection, TransactionInstruction } from '@solana/web3.js';

type AnchorExports = {
    BN: any;
    Program: new (idl: any, programId: PublicKey, provider: any) => any;
    AnchorProvider: {
        local: () => any;
    };
    Idl?: any;
    translateAddress?: (address: any) => PublicKey;
};
/**
 * Safe conversion to BN with comprehensive undefined/null checks
 * This function validates all possible undefined values before BN creation
 */
declare function safeConvertToBN(name: string, BN: any, value: string | number | bigint | undefined | null, options?: {
    allowZero?: boolean;
    maxValue?: string;
}): any;
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
type SwapValidationOptions = {
    connection?: Connection;
    validateTokenAccounts?: boolean;
};
/**
 * Ensure token account exists and is valid
 * Validates that the token account exists on-chain before swap execution
 */
declare function ensureTokenAccount(connection: Connection, tokenAccount: PublicKey, accountName: string, expectedMint?: PublicKey): Promise<void>;
declare function buildSwapIxWithAnchor(anchor: AnchorExports, params: SwapBuildParams, options?: SwapValidationOptions): Promise<TransactionInstruction>;
declare function buildSwapIx(_: SwapBuildParams): Promise<TransactionInstruction>;

export { type QuoteParams, type QuoteResult, type SwapBuildParams, type SwapValidationOptions, buildSwapIx, buildSwapIxWithAnchor, constantProductQuote, ensureTokenAccount, safeConvertToBN };
