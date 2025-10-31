"use client";
 
import { useState, useEffect, useCallback } from "react";
import "./globals.css";
import { useDexApi } from "@/hooks/useDexApi";
import { useMcpServer } from "@/hooks/useMcpServer";
import { SwapParams, SwapInstructionRequest } from "@/types";
import { formatLargeNumber } from "@/utils/validation";
import { TokenSelector } from "@/components/TokenSelector";
import { Token, POPULAR_TOKENS } from "@/utils/tokens";
import { getTokenIconStyle } from "@/utils/tokenIcons";
import { WalletButton } from "@/components/WalletButton";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction, TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js";

export default function Home() {
  const [amountIn, setAmountIn] = useState("");
  // Default reserve values (in smallest units)
  const [reserveIn, setReserveIn] = useState("1000000000000"); // 1000 SOL (9 decimals)
  const [reserveOut, setReserveOut] = useState("1000000000000"); // 1000 USDC (6 decimals)
  const [feeBps, setFeeBps] = useState("30");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [tokenFrom, setTokenFrom] = useState<Token | null>(POPULAR_TOKENS[0]); // SOL by default
  const [tokenTo, setTokenTo] = useState<Token | null>(POPULAR_TOKENS[1]); // USDC by default
  const [autoQuoteAmount, setAutoQuoteAmount] = useState<string | null>(null);
  const [isAutoCalculating, setIsAutoCalculating] = useState(false);

  const { 
    getQuote, 
    buildIx, 
    quoteLoading, 
    instructionLoading, 
    error, 
    quote, 
    instruction 
  } = useDexApi();
  
  const { status: mcpStatus, error: mcpError } = useMcpServer();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapTxSignature, setSwapTxSignature] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Format token amount from raw units (with decimals) to display units
  const formatTokenAmount = useCallback((rawAmount: string, decimals: number): string => {
    try {
      const rawBigInt = BigInt(rawAmount);
      const divisor = BigInt(10 ** decimals);
      const wholePart = rawBigInt / divisor;
      const fractionalPart = rawBigInt % divisor;
      
      // Format whole part with commas
      const wholePartFormatted = wholePart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      
      if (fractionalPart === 0n) {
        return wholePartFormatted;
      }
      
      // Format fractional part with leading zeros
      const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
      // Remove trailing zeros
      const trimmedFractional = fractionalStr.replace(/0+$/, '');
      
      return trimmedFractional ? `${wholePartFormatted}.${trimmedFractional}` : wholePartFormatted;
    } catch {
      return rawAmount;
    }
  }, []);

  // Convert user input amount to token's smallest unit (considering decimals)
  const convertToSmallestUnit = useCallback((amount: string, decimals: number): string => {
    try {
      const num = parseFloat(amount);
      if (isNaN(num)) return amount;
      const multiplier = BigInt(10 ** decimals);
      const amountBigInt = BigInt(Math.floor(num * (10 ** decimals)));
      return amountBigInt.toString();
    } catch {
      return amount;
    }
  }, []);

  // Auto-calculate quote function (doesn't reset quote on error)
  const autoCalculateQuote = useCallback(async (params: { amountIn: string; reserveIn: string; reserveOut: string; feeBps: string }) => {
    try {
      const res = await fetch(`/api/get_dex_quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const json = await res.json();

      if (res.ok && json.amountOut) {
        setAutoQuoteAmount(json.amountOut);
        return json.amountOut;
      } else {
        // Silently fail for auto-calculation
        return null;
      }
    } catch (err) {
      // Silently fail for auto-calculation
      return null;
    }
  }, []);

  // Auto-calculate quote when amount changes
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      // Check if all required fields are filled
      if (!amountIn.trim() || !reserveIn.trim() || !reserveOut.trim() || !feeBps.trim()) {
        setAutoQuoteAmount(null);
        setIsAutoCalculating(false);
        return;
      }

      // Validate inputs
      try {
        const amountInNum = parseFloat(amountIn);
        const reserveInNum = parseFloat(reserveIn);
        const reserveOutNum = parseFloat(reserveOut);
        
        if (isNaN(amountInNum) || isNaN(reserveInNum) || isNaN(reserveOutNum) || amountInNum <= 0) {
          setAutoQuoteAmount(null);
          setIsAutoCalculating(false);
          return;
        }

        // Convert amountIn to smallest unit if tokenFrom is selected
        let amountInConverted = amountIn;
        if (tokenFrom) {
          amountInConverted = convertToSmallestUnit(amountIn, tokenFrom.decimals);
        }

        setIsAutoCalculating(true);
        await autoCalculateQuote({ 
          amountIn: amountInConverted, 
          reserveIn, 
          reserveOut, 
          feeBps 
        });
      } catch (err) {
        setAutoQuoteAmount(null);
      } finally {
        setIsAutoCalculating(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [amountIn, reserveIn, reserveOut, feeBps, autoCalculateQuote, tokenFrom, convertToSmallestUnit]);

  // Update auto quote amount when quote changes (from manual quote fetch)
  useEffect(() => {
    if (quote && quote.amountOut) {
      setAutoQuoteAmount(quote.amountOut);
    }
  }, [quote]);

  const handleGetQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const newErrors: Record<string, string> = {};

    if (!amountIn.trim()) newErrors.amountIn = "Amount In is required";
    if (!reserveIn.trim()) newErrors.reserveIn = "Reserve In is required";
    if (!reserveOut.trim()) newErrors.reserveOut = "Reserve Out is required";
    if (!feeBps.trim()) newErrors.feeBps = "Fee (bps) is required";

    if (Object.keys(newErrors).length > 0) {
      setFormErrors(newErrors);
      return;
    }

    // Convert amountIn to smallest unit if tokenFrom is selected
    let amountInConverted = amountIn;
    if (tokenFrom) {
      amountInConverted = convertToSmallestUnit(amountIn, tokenFrom.decimals);
    }

    await getQuote({ amountIn: amountInConverted, reserveIn, reserveOut, feeBps });
  };

  const handleBuildInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!quote) {
      return;
    }

    if (!connected || !publicKey) {
      alert("Please connect your wallet to build a swap instruction.");
      return;
    }

    // Note: This requires additional parameters that should come from wallet context
    // For now, we'll show a message that these need to be provided
    const swapParams: SwapParams = { amountIn, reserveIn, reserveOut, feeBps };
    
    // This is a placeholder - actual implementation requires wallet integration
    // The instruction can be built using the connected wallet's public key
    alert(`Build Instruction requires additional account parameters. Connected wallet: ${publicKey.toString()}`);
  };

  const handleSwap = async () => {
    if (!quote || !connected || !publicKey || !tokenFrom || !tokenTo) {
      alert("Please connect your wallet and ensure all fields are filled.");
      return;
    }

    if (!amountIn.trim() || parseFloat(amountIn) <= 0) {
      alert("Please enter a valid amount to swap.");
      return;
    }

    setSwapLoading(true);
    setSwapTxSignature(null);

    try {
      // Validation helper function
      function assertPubkey(name: string, v: string | PublicKey | undefined | null): PublicKey {
        if (!v) throw new Error(`${name} is missing`);
        try {
          return v instanceof PublicKey ? v : new PublicKey(v);
        } catch (err: any) {
          throw new Error(`${name} is invalid: ${err.message || "Invalid public key"}`);
        }
      }

      // Validate token mints
      if (!tokenFrom.mint || !tokenTo.mint) {
        throw new Error("Token mint addresses are missing");
      }

      // Validate quote.amountOut is defined
      if (!quote || quote.amountOut === undefined || quote.amountOut === null) {
        throw new Error("Quote amountOut is missing. Please get a quote first.");
      }

      // Convert amountIn to smallest unit
      const amountInConverted = convertToSmallestUnit(amountIn, tokenFrom.decimals);
      const minAmountOut = quote.amountOut;

      // Validate and create PublicKeys for token mints using assertPubkey
      const tokenFromMint = assertPubkey("tokenFrom.mint", tokenFrom.mint);
      const tokenToMint = assertPubkey("tokenTo.mint", tokenTo.mint);

      // Note: These are placeholder values - in production, these should be fetched from
      // the actual DEX protocol or pool contracts using the token mints
      // Get program ID from environment variable or use a default placeholder
      const programIdString = process.env.NEXT_PUBLIC_DEX_PROGRAM_ID || "11111111111111111111111111111111";
      const programId = assertPubkey("programId", programIdString);
      
      // Validate programId has _bn property
      const programIdWithBn = programId as any;
      if (!("_bn" in programIdWithBn) || programIdWithBn._bn === undefined) {
        throw new Error("Program ID PublicKey is missing _bn property");
      }
      
      // Derive pool address from token mints
      // Each seed must be <= 32 bytes. Use multiple seeds instead of concatenating
      const poolSeeds = [
        Buffer.from("pool"),
        tokenFromMint.toBuffer().slice(0, 8),
        tokenToMint.toBuffer().slice(0, 8),
      ];
      const [pool] = PublicKey.findProgramAddressSync(poolSeeds, programId);
      if (!pool) {
        throw new Error("Failed to derive pool address");
      }
      
      // Validate pool has _bn property
      const poolWithBn = pool as any;
      if (!("_bn" in poolWithBn) || poolWithBn._bn === undefined) {
        throw new Error("Pool PublicKey is missing _bn property after derivation");
      }
      
      // Validate user publicKey is defined
      if (!publicKey) {
        throw new Error("User publicKey is missing");
      }
      const user = assertPubkey("user", publicKey);
      
      // Validate user has _bn property
      const userWithBn = user as any;
      if (!("_bn" in userWithBn) || userWithBn._bn === undefined) {
        throw new Error("User PublicKey is missing _bn property after creation");
      }
      
      // Derive user token accounts (simplified - in production, these should be actual token accounts)
      // Use first 8 bytes of mint address to keep seeds under 32 bytes
      const userSourceSeeds = [
        Buffer.from("token"),
        user.toBuffer().slice(0, 8), // Use only first 8 bytes of user address
        tokenFromMint.toBuffer().slice(0, 8),
      ];
      const [userSource] = PublicKey.findProgramAddressSync(userSourceSeeds, programId);
      if (!userSource) {
        throw new Error("Failed to derive userSource address");
      }
      
      // Validate userSource has _bn property
      const userSourceWithBn = userSource as any;
      if (!("_bn" in userSourceWithBn) || userSourceWithBn._bn === undefined) {
        throw new Error("UserSource PublicKey is missing _bn property after derivation");
      }
      
      const userDestinationSeeds = [
        Buffer.from("token"),
        user.toBuffer().slice(0, 8), // Use only first 8 bytes of user address
        tokenToMint.toBuffer().slice(0, 8),
      ];
      const [userDestination] = PublicKey.findProgramAddressSync(userDestinationSeeds, programId);
      if (!userDestination) {
        throw new Error("Failed to derive userDestination address");
      }
      
      // Validate userDestination has _bn property
      const userDestinationWithBn = userDestination as any;
      if (!("_bn" in userDestinationWithBn) || userDestinationWithBn._bn === undefined) {
        throw new Error("UserDestination PublicKey is missing _bn property after derivation");
      }
      
      // Derive vault addresses
      // Use first 8 bytes of pool address to keep seeds manageable
      const vaultASeeds = [
        Buffer.from("vault"),
        pool.toBuffer().slice(0, 8), // Use only first 8 bytes of pool address
        tokenFromMint.toBuffer().slice(0, 8),
      ];
      const [vaultA] = PublicKey.findProgramAddressSync(vaultASeeds, programId);
      if (!vaultA) {
        throw new Error("Failed to derive vaultA address");
      }
      
      // Validate vaultA has _bn property
      const vaultAWithBn = vaultA as any;
      if (!("_bn" in vaultAWithBn) || vaultAWithBn._bn === undefined) {
        throw new Error("VaultA PublicKey is missing _bn property after derivation");
      }
      
      const vaultBSeeds = [
        Buffer.from("vault"),
        pool.toBuffer().slice(0, 8), // Use only first 8 bytes of pool address
        tokenToMint.toBuffer().slice(0, 8),
      ];
      const [vaultB] = PublicKey.findProgramAddressSync(vaultBSeeds, programId);
      if (!vaultB) {
        throw new Error("Failed to derive vaultB address");
      }
      
      // Validate vaultB has _bn property
      const vaultBWithBn = vaultB as any;
      if (!("_bn" in vaultBWithBn) || vaultBWithBn._bn === undefined) {
        throw new Error("VaultB PublicKey is missing _bn property after derivation");
      }
      
      const tokenProgram = assertPubkey("tokenProgram", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      
      // Validate tokenProgram has _bn property
      const tokenProgramWithBn = tokenProgram as any;
      if (!("_bn" in tokenProgramWithBn) || tokenProgramWithBn._bn === undefined) {
        throw new Error("TokenProgram PublicKey is missing _bn property after creation");
      }

      // Build instruction
      const instructionParams: SwapInstructionRequest = {
        programId: programId.toString(),
        pool: pool.toString(),
        user: user.toString(),
        userSource: userSource.toString(),
        userDestination: userDestination.toString(),
        vaultA: vaultA.toString(),
        vaultB: vaultB.toString(),
        tokenProgram: tokenProgram.toString(),
        amountIn: amountInConverted,
        minAmountOut: minAmountOut,
      };

      // Debug: log all addresses for troubleshooting
      if (process.env.NODE_ENV === "development") {
        console.log("Swap instruction params:", {
          programId: instructionParams.programId,
          pool: instructionParams.pool,
          user: instructionParams.user,
          userSource: instructionParams.userSource,
          userDestination: instructionParams.userDestination,
          vaultA: instructionParams.vaultA,
          vaultB: instructionParams.vaultB,
          tokenProgram: instructionParams.tokenProgram,
          amountIn: instructionParams.amountIn,
          minAmountOut: instructionParams.minAmountOut,
        });
      }

      // Build instruction via API
      const ixRes = await fetch(`/api/build_solana_swap_instruction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(instructionParams),
      });

      if (!ixRes.ok) {
        const errorData = await ixRes.json();
        const errorMessage = errorData.error || "Failed to build instruction";
        const fieldInfo = errorData.details?.field ? ` (field: ${errorData.details.field})` : "";
        throw new Error(`${errorMessage}${fieldInfo}`);
      }

      const instructionData = await ixRes.json();

      // Build transaction
      const transaction = new Transaction();
      
      // Validate instructionData fields
      if (!instructionData || !instructionData.keys || !Array.isArray(instructionData.keys)) {
        throw new Error("Invalid instruction data: keys array is missing");
      }
      if (!instructionData.programId) {
        throw new Error("Invalid instruction data: programId is missing");
      }
      if (!instructionData.data) {
        throw new Error("Invalid instruction data: data is missing");
      }

      // Reconstruct TransactionInstruction from API response using assertPubkey
      const accountMetas: AccountMeta[] = instructionData.keys.map((k: any, index: number) => {
        if (!k || k.pubkey === undefined || k.pubkey === null) {
          throw new Error(`Invalid account at index ${index}: pubkey is missing`);
        }
        const pubkey = assertPubkey(`instructionData.keys[${index}].pubkey`, k.pubkey);
        
        // Validate _bn property exists after creation
        const pubkeyWithBn = pubkey as any;
        if (!("_bn" in pubkeyWithBn) || pubkeyWithBn._bn === undefined) {
          throw new Error(
            `PublicKey at index ${index} is missing _bn property after creation. PublicKey: ${pubkey.toString()}`
          );
        }
        
        return {
          pubkey,
          isSigner: k.isSigner ?? false,
          isWritable: k.isWritable ?? false,
        };
      });

      const programIdPubkey = assertPubkey("instructionData.programId", instructionData.programId);
      
      // Validate programId _bn property exists after creation
      const programIdPubkeyWithBn = programIdPubkey as any;
      if (!("_bn" in programIdPubkeyWithBn) || programIdPubkeyWithBn._bn === undefined) {
        throw new Error(
          `Program ID PublicKey is missing _bn property after creation. PublicKey: ${programIdPubkey.toString()}`
        );
      }

      const swapIx = new TransactionInstruction({
        programId: programIdPubkey,
        keys: accountMetas,
        data: Buffer.from(instructionData.data, "base64"),
      });

      transaction.add(swapIx);

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send transaction
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });

      setSwapTxSignature(signature);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      // Show success message
      console.log(`Swap successful! Transaction signature: ${signature}`);
    } catch (err: any) {
      // Enhanced error logging
      console.error("=== SWAP ERROR DETAILS ===");
      console.error("Error Type:", typeof err);
      console.error("Error Name:", err?.name);
      console.error("Error Message:", err?.message);
      console.error("Error Stack:", err?.stack);
      
      // Log error details if available
      if (err.message && err.message.includes("Error Details:")) {
        console.error("Full Error Details:");
        console.error(err.message);
      }
      
      // Log context at time of error
      console.error("Context at error:", {
        hasQuote: !!quote,
        quoteAmountOut: quote?.amountOut?.toString(),
        hasTokenFrom: !!tokenFrom,
        tokenFromMint: tokenFrom?.mint,
        hasTokenTo: !!tokenTo,
        tokenToMint: tokenTo?.mint,
        amountIn,
        connected,
        publicKey: publicKey?.toString(),
      });
      
      setSwapTxSignature(null);
      
      // Show user-friendly error message
      let errorMessage = "Swap failed: ";
      if (err.message) {
        errorMessage += err.message;
      } else if (typeof err === "string") {
        errorMessage += err;
      } else {
        errorMessage += "Unknown error occurred. Please check the console for details.";
      }
      
      // Set error message to display in UI (copyable)
      setSwapError(errorMessage);
    } finally {
      setSwapLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "var(--bg-light)",
      position: "relative"
    }}>
      {/* Hero Section with Motif */}
      <div className="hero">
        <div className="hero-motif" />
        <div className="container hero-content">
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            width: "100%",
            marginBottom: "2rem",
            flexWrap: "wrap",
            gap: "1rem"
          }}>
            <h1 style={{ margin: 0 }}>Model Context Swap</h1>
            <WalletButton />
          </div>
          {connected && publicKey && (
            <div style={{
              padding: "0.75rem 1.5rem",
              background: "rgba(16, 185, 129, 0.1)",
              borderRadius: "12px",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.9rem",
              color: "var(--success)",
              fontWeight: 600
            }}>
              <span>✓</span>
              <span>Wallet Connected: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}</span>
            </div>
          )}
          <p>AI agent-friendly DEX on Solana with Model Context Protocol integration</p>
          <div className="cta-row">
            <button className="btn btn-primary" onClick={() => document.getElementById('swap-section')?.scrollIntoView({ behavior: 'smooth' })}>
              Start Swapping
            </button>
            <button className="btn btn-secondary" onClick={() => window.open('https://github.com/dorakingx/ModelContextSwap', '_blank')}>
              View Docs
            </button>
          </div>
        </div>
      </div>

      {/* DEX Functionality Section - Overlapping Hero */}
      <div className="container" style={{ marginTop: "-80px", position: "relative", zIndex: 1 }}>
        <div className="card-elevated" id="swap-section" style={{ maxWidth: "600px", margin: "0 auto 3rem" }}>
          <h2 style={{ 
            fontSize: "1.75rem", 
            fontWeight: 700, 
            color: "var(--text-primary)",
            marginBottom: "0.75rem",
            textAlign: "center"
          }}>
            Swap Tokens
          </h2>
          <p style={{ 
            fontSize: "1rem", 
            color: "var(--text-secondary)",
            marginBottom: "2rem",
            textAlign: "center"
          }}>
            Get deterministic quotes and build swap instructions
          </p>

          {/* Get Quote Form */}
          <form onSubmit={handleGetQuote}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="token-input-container">
                <div style={{ 
                  fontSize: "0.85rem", 
                  fontWeight: 600, 
                  color: "var(--text-secondary)",
                  marginBottom: "0.5rem"
                }}>
                  You Pay
                </div>
                <div className="token-input-row">
                  <input
                    className="token-input-value"
                    placeholder="0.0"
                    value={amountIn}
                    onChange={e => {
                      setAmountIn(e.target.value);
                      if (formErrors.amountIn) {
                        setFormErrors(prev => {
                          const newErrors = { ...prev };
                          delete newErrors.amountIn;
                          return newErrors;
                        });
                      }
                    }}
                    aria-label="Amount In"
                    aria-invalid={!!formErrors.amountIn}
                    aria-describedby={formErrors.amountIn ? "amountIn-error" : undefined}
                  />
                  <TokenSelector
                    selectedToken={tokenFrom}
                    onSelect={setTokenFrom}
                    label="Select token to pay"
                  />
                </div>
                {formErrors.amountIn && (
                  <div id="amountIn-error" style={{ color: "var(--error)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    {formErrors.amountIn}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "center", margin: "0.5rem 0" }}>
                <div 
                  className="swap-arrow" 
                  onClick={() => {
                    const temp = tokenFrom;
                    setTokenFrom(tokenTo);
                    setTokenTo(temp);
                  }} 
                  role="button" 
                  aria-label="Swap direction" 
                  tabIndex={0}
                >
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div className="token-input-container">
                <div style={{ 
                  fontSize: "0.85rem", 
                  fontWeight: 600, 
                  color: "var(--text-secondary)",
                  marginBottom: "0.5rem"
                }}>
                  You Receive
                </div>
                <div className="token-input-row">
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      className="token-input-value"
                      placeholder={isAutoCalculating ? "Calculating..." : "0.0"}
                      value={autoQuoteAmount && tokenTo ? formatTokenAmount(autoQuoteAmount, tokenTo.decimals) : ""}
                      readOnly
                      style={{ 
                        color: autoQuoteAmount ? "#1D1D1D" : "var(--text-light)",
                        cursor: "default"
                      }}
                      aria-label="Amount Out"
                    />
                    {isAutoCalculating && (
                      <div style={{
                        position: "absolute",
                        right: "0.5rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "0.75rem",
                        color: "var(--text-light)"
                      }}>
                        <span className="loading-spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
                      </div>
                    )}
                  </div>
                  <TokenSelector
                    selectedToken={tokenTo}
                    onSelect={setTokenTo}
                    label="Select token to receive"
                  />
                </div>
                {autoQuoteAmount && tokenTo && (
                  <div style={{ 
                    fontSize: "0.75rem", 
                    color: "#1D1D1D", 
                    marginTop: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem"
                  }}>
                    <span>≈</span>
                    <span>{formatTokenAmount(autoQuoteAmount, tokenTo.decimals)} {tokenTo.symbol}</span>
                  </div>
                )}
              </div>

              <div style={{ 
                padding: "1.5rem", 
                background: "var(--bg-secondary)", 
                borderRadius: "16px",
                border: "1px solid var(--border-default)"
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label className="input-label" style={{ fontSize: "0.85rem" }}>Reserve In</label>
                    <input
                      className="input-field"
                      placeholder="1000000000000"
                      value={reserveIn}
                      onChange={e => {
                        setReserveIn(e.target.value);
                        if (formErrors.reserveIn) {
                          setFormErrors(prev => {
                            const newErrors = { ...prev };
                            delete newErrors.reserveIn;
                            return newErrors;
                          });
                        }
                      }}
                      aria-invalid={!!formErrors.reserveIn}
                      aria-describedby={formErrors.reserveIn ? "reserveIn-error" : undefined}
                    />
                    {formErrors.reserveIn && (
                      <div id="reserveIn-error" style={{ color: "var(--error)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                        {formErrors.reserveIn}
                      </div>
                    )}
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label className="input-label" style={{ fontSize: "0.85rem" }}>Reserve Out</label>
                    <input
                      className="input-field"
                      placeholder="1000000000000"
                      value={reserveOut}
                      onChange={e => {
                        setReserveOut(e.target.value);
                        if (formErrors.reserveOut) {
                          setFormErrors(prev => {
                            const newErrors = { ...prev };
                            delete newErrors.reserveOut;
                            return newErrors;
                          });
                        }
                      }}
                      aria-invalid={!!formErrors.reserveOut}
                      aria-describedby={formErrors.reserveOut ? "reserveOut-error" : undefined}
                    />
                    {formErrors.reserveOut && (
                      <div id="reserveOut-error" style={{ color: "var(--error)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                        {formErrors.reserveOut}
                      </div>
                    )}
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label className="input-label" style={{ fontSize: "0.85rem" }}>Fee (bps)</label>
                    <input
                      className="input-field"
                      placeholder="30"
                      value={feeBps}
                      onChange={e => {
                        setFeeBps(e.target.value);
                        if (formErrors.feeBps) {
                          setFormErrors(prev => {
                            const newErrors = { ...prev };
                            delete newErrors.feeBps;
                            return newErrors;
                          });
                        }
                      }}
                      aria-invalid={!!formErrors.feeBps}
                      aria-describedby={formErrors.feeBps ? "feeBps-error" : undefined}
                    />
                    {formErrors.feeBps && (
                      <div id="feeBps-error" style={{ color: "var(--error)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                        {formErrors.feeBps}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-large" disabled={quoteLoading} style={{ width: "100%" }}>
                {quoteLoading ? <span className="loading-spinner" /> : "↗️ Get Quote"}
              </button>
            </div>
          </form>

          {/* Quote Result */}
          {error && (
            <div className="error-card">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.5rem" }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                    {error.code || "Error"}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                    {error.error}
                  </div>
                  {error.details?.field && (
                    <div style={{ color: "var(--text-light)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      Field: {error.details.field}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {quote && (
            <div className="result-card">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.5rem" }}>✓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                    Swap Quote
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "0.75rem" }}>
                    Based on constant product formula (with {quote.feeBps || feeBps}bps fee)
                  </div>
                  <div style={{ 
                    display: "flex", 
                    flexDirection: "column",
                    gap: "0.5rem",
                    padding: "1rem",
                    background: "var(--bg-light)",
                    borderRadius: "12px",
                    border: "1px solid var(--border-default)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {tokenFrom && (
                          <div style={getTokenIconStyle(tokenFrom.symbol, 20)}>
                            {tokenFrom.symbol.charAt(0)}
                          </div>
                        )}
                        <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                          {tokenFrom?.symbol} → {tokenTo?.symbol}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Output Amount:</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {tokenTo && (
                          <div style={getTokenIconStyle(tokenTo.symbol, 24)}>
                            {tokenTo.symbol.charAt(0)}
                          </div>
                        )}
                        <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "var(--success)" }}>
                          {tokenTo ? formatTokenAmount(quote.amountOut, tokenTo.decimals) : formatLargeNumber(quote.amountOut)} {tokenTo?.symbol}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Swap Button */}
              {connected && publicKey && (
                <div style={{ marginTop: "1.5rem" }}>
                  <button
                    type="button"
                    onClick={handleSwap}
                    disabled={swapLoading || !quote}
                    className="btn btn-primary btn-large"
                    style={{ width: "100%" }}
                  >
                    {swapLoading ? (
                      <>
                        <span className="loading-spinner" />
                        <span>Swapping...</span>
                      </>
                    ) : (
                      `🔄 Swap ${tokenFrom?.symbol} → ${tokenTo?.symbol}`
                    )}
                  </button>
                  {swapTxSignature && (
                    <div style={{
                      marginTop: "1rem",
                      padding: "1rem",
                      background: "rgba(16, 185, 129, 0.1)",
                      borderRadius: "12px",
                      fontSize: "0.9rem",
                      color: "var(--success)",
                      textAlign: "center"
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>✓ Transaction Sent</div>
                      <a
                        href={`https://solscan.io/tx/${swapTxSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--success)", textDecoration: "underline" }}
                      >
                        View on Solscan: {swapTxSignature.slice(0, 8)}...{swapTxSignature.slice(-8)}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="divider" />

          {/* Build Instruction Form */}
          {quote && (
            <form onSubmit={handleBuildInstruction}>
              <h3 style={{ 
                fontSize: "1.15rem", 
                fontWeight: 700, 
                color: "var(--text-primary)",
                marginBottom: "1rem",
                textAlign: "center"
              }}>
                Build Solana Instruction
              </h3>
              <p style={{ 
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                marginBottom: "1.5rem",
                textAlign: "center"
              }}>
                Generate a transaction instruction for executing the swap
              </p>
              <button type="submit" className="btn btn-secondary btn-large" disabled={instructionLoading || !quote} style={{ width: "100%" }}>
                {instructionLoading ? <span className="loading-spinner" /> : "🔨 Build Instruction"}
              </button>
      </form>
          )}

          {/* Instruction Result */}
      {instruction && (
            <div className="result-card" style={{ marginTop: "1.5rem" }}>
              <h4 style={{ 
                fontSize: "1rem", 
                fontWeight: 700, 
                color: "var(--text-primary)",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}>
                <span>✓</span>
                Instruction Built Successfully
              </h4>
              <div style={{ 
                background: "var(--bg-secondary)", 
                padding: "1.5rem", 
                borderRadius: "12px", 
                overflowX: "auto",
                border: "1px solid var(--border-default)"
              }}>
                <pre style={{ 
                  fontSize: "0.85rem", 
                  color: "var(--text-secondary)",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  fontFamily: "var(--font-geist-mono)"
                }}>
                  {JSON.stringify(instruction, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* MCP Server Section */}
        <div className="card" style={{ marginTop: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
              MCP Server
            </h2>
            <div className={`status-badge ${mcpStatus === "active" ? "status-active" : "status-inactive"}`}>
              <span className="icon-dot"></span>
              {mcpStatus === "checking" && "Checking..."}
              {mcpStatus === "active" && "Active"}
              {mcpStatus === "inactive" && "Inactive"}
            </div>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", marginBottom: "2rem" }}>
            Model Context Protocol server for AI agent integration
          </p>

          {mcpError && (
            <div className="error-card" style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.25rem" }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                    Connection Error
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                    {mcpError}
                  </div>
                </div>
              </div>
        </div>
      )}

          {/* API Endpoints */}
          <div className="feature-grid">
            <div className="feature-item">
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.75rem",
                marginBottom: "0.75rem"
              }}>
                <div style={{ 
                  width: "40px", 
                  height: "40px", 
                  borderRadius: "12px",
                  background: "rgba(230, 57, 70, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <span style={{ fontSize: "1.25rem" }}>📊</span>
                </div>
                <div style={{ 
                  fontFamily: "monospace", 
                  fontSize: "0.85rem", 
                  fontWeight: 600,
                  color: "var(--primary-red)"
                }}>
                  POST /get_dex_quote
                </div>
              </div>
              <div style={{ 
                fontSize: "0.9rem", 
                color: "var(--text-secondary)",
                lineHeight: "1.6"
              }}>
                Get deterministic quotes for token swaps with 30bps fee calculation
              </div>
            </div>

            <div className="feature-item">
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.75rem",
                marginBottom: "0.75rem"
              }}>
                <div style={{ 
                  width: "40px", 
                  height: "40px", 
                  borderRadius: "12px",
                  background: "rgba(230, 57, 70, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <span style={{ fontSize: "1.25rem" }}>🔨</span>
                </div>
                <div style={{ 
                  fontFamily: "monospace", 
                  fontSize: "0.85rem", 
                  fontWeight: 600,
                  color: "var(--primary-red)"
                }}>
                  POST /build_solana_swap_instruction
                </div>
              </div>
              <div style={{ 
                fontSize: "0.9rem", 
                color: "var(--text-secondary)",
                lineHeight: "1.6"
              }}>
                Build Solana transaction instructions for executing swaps on-chain
              </div>
            </div>
          </div>

          {/* Connection Info */}
          <div style={{ 
            marginTop: "2rem", 
            padding: "1.5rem", 
            background: "var(--bg-secondary)", 
            borderRadius: "16px",
            border: "1px solid var(--border-default)"
          }}>
            <div style={{ 
              fontSize: "0.9rem", 
              color: "var(--text-secondary)",
              lineHeight: "2",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "0 1rem"
            }}>
              <strong style={{ color: "var(--text-primary)" }}>Connection:</strong>
              <span>localhost:8080</span>
              <strong style={{ color: "var(--text-primary)" }}>Framework:</strong>
              <span>Fastify with MCP Plugin</span>
              <strong style={{ color: "var(--text-primary)" }}>SDK:</strong>
              <span>dex-ai-sdk</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: "center", 
          marginTop: "4rem", 
          paddingTop: "2rem",
          paddingBottom: "2rem",
          borderTop: "1px solid var(--border-default)"
        }}>
          <p style={{ 
            color: "var(--text-secondary)", 
            fontSize: "1rem",
            fontWeight: 500,
            marginBottom: "0.5rem"
          }}>
            Powered by MCP Server & dex-ai-sdk on Next.js
          </p>
          <p style={{ 
            color: "var(--text-light)", 
            fontSize: "0.9rem"
          }}>
            Designed for AI agents with deterministic quotes and minimal slippage
          </p>
        </div>
      </div>
      
      {/* Corner Motif Decoration */}
      <div className="motif-corner" />
    </div>
  );
}
