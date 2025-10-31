"use client";

import { useState } from "react";
import "./globals.css";
import { useDexApi } from "@/hooks/useDexApi";
import { useMcpServer } from "@/hooks/useMcpServer";
import { SwapParams, SwapInstructionRequest } from "@/types";
import { formatLargeNumber } from "@/utils/validation";
import { TokenSelector } from "@/components/TokenSelector";
import { Token, POPULAR_TOKENS } from "@/utils/tokens";

export default function Home() {
  const [amountIn, setAmountIn] = useState("");
  const [reserveIn, setReserveIn] = useState("");
  const [reserveOut, setReserveOut] = useState("");
  const [feeBps, setFeeBps] = useState("30");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [tokenFrom, setTokenFrom] = useState<Token | null>(POPULAR_TOKENS[0]); // SOL by default
  const [tokenTo, setTokenTo] = useState<Token | null>(POPULAR_TOKENS[1]); // USDC by default

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

    await getQuote({ amountIn, reserveIn, reserveOut, feeBps });
  };

  const handleBuildInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!quote) {
      return;
    }

    // Note: This requires additional parameters that should come from wallet context
    // For now, we'll show a message that these need to be provided
    const swapParams: SwapParams = { amountIn, reserveIn, reserveOut, feeBps };
    
    // This is a placeholder - actual implementation requires wallet integration
    alert("Build Instruction requires wallet integration. Please provide Solana PublicKeys for all required accounts.");
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
          <h1>Model Context Swap</h1>
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
                  <input
                    className="token-input-value"
                    placeholder="0.0"
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
                    aria-label="Reserve Out"
                    aria-invalid={!!formErrors.reserveOut}
                    aria-describedby={formErrors.reserveOut ? "reserveOut-error" : undefined}
                  />
                  <TokenSelector
                    selectedToken={tokenTo}
                    onSelect={setTokenTo}
                    label="Select token to receive"
                  />
                </div>
                {formErrors.reserveOut && (
                  <div id="reserveOut-error" style={{ color: "var(--error)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    {formErrors.reserveOut}
                  </div>
                )}
              </div>

              <div style={{ 
                padding: "1.5rem", 
                background: "var(--bg-secondary)", 
                borderRadius: "16px",
                border: "1px solid var(--border-default)"
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label className="input-label" style={{ fontSize: "0.85rem" }}>Reserve In</label>
                    <input
                      className="input-field"
                      placeholder="1000000000"
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
                      <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                        {tokenFrom?.symbol} → {tokenTo?.symbol}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Output Amount:</span>
                      <span style={{ fontWeight: 700, fontSize: "1.25rem", color: "var(--success)" }}>
                        {formatLargeNumber(quote.amountOut)} {tokenTo?.symbol}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
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
