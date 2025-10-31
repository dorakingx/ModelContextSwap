"use client";

import { useState, useCallback, useEffect } from "react";
import "./globals.css";

function useDexApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<any>(null);

  const getQuote = useCallback(async (amountIn: string, reserveIn: string, reserveOut: string, feeBps: string) => {
    setLoading(true);
    setError(null);
    setInstruction(null);
    setQuote(null);
    try {
      const res = await fetch(`/api/get_dex_quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountIn, reserveIn, reserveOut, feeBps }),
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const json = await res.json();
      setQuote(json.amountOut);
    } catch (err) {
      setError("Error fetching quote: " + String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const buildIx = useCallback(async (params: any) => {
    setLoading(true);
    setError(null);
    setInstruction(null);
    try {
      const res = await fetch(`/api/build_solana_swap_instruction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const json = await res.json();
      setInstruction(json);
    } catch (err) {
      setError("Error building instruction: " + String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { getQuote, buildIx, loading, error, quote, instruction };
}

function useMcpServer() {
  const [status, setStatus] = useState<"checking" | "active" | "inactive">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch("http://localhost:8080/get_dex_quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountIn: "1000000",
            reserveIn: "1000000000",
            reserveOut: "1000000000",
            feeBps: 30,
          }),
        });
        setStatus(res.ok ? "active" : "inactive");
      } catch (err) {
        setStatus("inactive");
        setError("MCP Server is not running on localhost:8080");
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    
    return () => clearInterval(interval);
  }, []);

  return { status, error };
}

export default function Home() {
  const [amountIn, setAmountIn] = useState("");
  const [reserveIn, setReserveIn] = useState("");
  const [reserveOut, setReserveOut] = useState("");
  const [feeBps, setFeeBps] = useState("30");
  const [swapParams, setSwapParams] = useState<any>({});

  const { getQuote, buildIx, loading, error, quote, instruction } = useDexApi();
  const { status: mcpStatus, error: mcpError } = useMcpServer();

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "linear-gradient(135deg, var(--bg-light) 0%, var(--bg-white) 100%)",
      padding: "2rem 0"
    }}>
      <div className="container">
        {/* Header */}
        <div style={{ 
          textAlign: "center", 
          marginBottom: "3rem",
          padding: "2rem 0"
        }}>
          <h1 style={{ 
            fontSize: "3rem", 
            fontWeight: 800, 
            color: "var(--primary-red)",
            marginBottom: "0.5rem",
            letterSpacing: "-0.02em"
          }}>
            Model Context Swap
          </h1>
          <p style={{ 
            fontSize: "1.2rem", 
            color: "var(--text-secondary)",
            maxWidth: "600px",
            margin: "0 auto"
          }}>
            AI agent-friendly DEX on Solana with Model Context Protocol integration
          </p>
        </div>

        {/* DEX Functionality Section */}
        <div className="card">
          <h2 className="card-title">
            <span>🔄</span>
            DEX Swap Functions
          </h2>
          <p className="card-subtitle">
            Get quotes and build swap instructions for Solana DEX
          </p>

          {/* Get Quote Form */}
          <form onSubmit={e => {
            e.preventDefault();
            getQuote(amountIn, reserveIn, reserveOut, feeBps);
            setSwapParams({ amountIn, reserveIn, reserveOut, feeBps });
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
              <div className="input-group">
                <label className="input-label">Input Amount</label>
                <input
                  className="input-field"
                  placeholder="1000000"
                  value={amountIn}
                  onChange={e => setAmountIn(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Reserve In</label>
                <input
                  className="input-field"
                  placeholder="1000000000"
                  value={reserveIn}
                  onChange={e => setReserveIn(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Reserve Out</label>
                <input
                  className="input-field"
                  placeholder="1000000000"
                  value={reserveOut}
                  onChange={e => setReserveOut(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Fee (bps)</label>
                <input
                  className="input-field"
                  placeholder="30"
                  value={feeBps}
                  onChange={e => setFeeBps(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="loading-spinner" /> : null}
              Get Quote
            </button>
          </form>

          {/* Quote Result */}
          {error && (
            <div style={{ 
              marginTop: "1.5rem", 
              padding: "1rem", 
              background: "rgba(239, 68, 68, 0.1)", 
              border: "1px solid var(--error)", 
              borderRadius: "8px",
              color: "var(--error)"
            }}>
              ⚠️ {error}
            </div>
          )}
          {quote && (
            <div style={{ 
              marginTop: "1.5rem", 
              padding: "1rem", 
              background: "rgba(16, 185, 129, 0.1)", 
              border: "1px solid var(--success)", 
              borderRadius: "8px",
              color: "var(--success)"
            }}>
              <strong>Output Amount:</strong> {quote}
            </div>
          )}

          <div className="divider" />

          {/* Build Instruction Form */}
          <form onSubmit={e => {
            e.preventDefault();
            buildIx(swapParams);
          }}>
            <h3 style={{ 
              fontSize: "1.2rem", 
              fontWeight: 700, 
              color: "var(--text-primary)",
              marginBottom: "1rem"
            }}>
              Build Solana Swap Instruction
            </h3>
            <div style={{ 
              color: "var(--text-secondary)",
              fontSize: "0.9rem",
              marginBottom: "1rem",
              padding: "1rem",
              background: "var(--button-secondary)",
              borderRadius: "8px"
            }}>
              <p style={{ marginBottom: "0.5rem" }}>
                ℹ️ This will build the instruction using the parameters from the quote above.
              </p>
              <p style={{ fontSize: "0.85rem" }}>
                Note: Full implementation requires wallet integration via @solana/wallet-adapter-react
              </p>
            </div>
            <button type="submit" className="btn btn-secondary" disabled={loading || !quote}>
              {loading ? <span className="loading-spinner" /> : null}
              Build Instruction
            </button>
          </form>

          {/* Instruction Result */}
          {instruction && (
            <div style={{ 
              marginTop: "1.5rem", 
              background: "var(--button-secondary)", 
              padding: "1.5rem", 
              borderRadius: "12px", 
              overflowX: "auto"
            }}>
              <h4 style={{ 
                fontSize: "1rem", 
                fontWeight: 700, 
                color: "var(--text-primary)",
                marginBottom: "1rem"
              }}>
                Instruction Data:
              </h4>
              <pre style={{ 
                fontSize: "0.85rem", 
                color: "var(--text-secondary)",
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all"
              }}>
                {JSON.stringify(instruction, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* MCP Server Section */}
        <div className="card">
          <h2 className="card-title">
            <span>🔗</span>
            MCP Server Status
          </h2>
          <p className="card-subtitle">
            Model Context Protocol server for AI agent integration
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Status Badge */}
            <div>
              <div className={`status-badge ${mcpStatus === "active" ? "status-active" : "status-inactive"}`}>
                <span className="icon-dot"></span>
                {mcpStatus === "checking" && "Checking..."}
                {mcpStatus === "active" && "Server Active"}
                {mcpStatus === "inactive" && "Server Inactive"}
              </div>
            </div>

            {mcpError && (
              <div style={{ 
                padding: "1rem", 
                background: "rgba(239, 68, 68, 0.1)", 
                border: "1px solid var(--error)", 
                borderRadius: "8px",
                color: "var(--error)"
              }}>
                ⚠️ {mcpError}
              </div>
            )}

            {/* API Endpoints */}
            <div>
              <h4 style={{ 
                fontSize: "1.1rem", 
                fontWeight: 700, 
                color: "var(--text-primary)",
                marginBottom: "1rem"
              }}>
                Available Endpoints
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ 
                  padding: "1rem", 
                  background: "var(--button-secondary)", 
                  borderRadius: "8px",
                  border: "1px solid var(--input-border)"
                }}>
                  <div style={{ 
                    fontFamily: "monospace", 
                    fontSize: "0.9rem", 
                    fontWeight: 600,
                    color: "var(--primary-red)",
                    marginBottom: "0.25rem"
                  }}>
                    POST /get_dex_quote
                  </div>
                  <div style={{ 
                    fontSize: "0.85rem", 
                    color: "var(--text-secondary)"
                  }}>
                    Get a deterministic quote for token swaps with fee calculation (30bps)
                  </div>
                </div>
                <div style={{ 
                  padding: "1rem", 
                  background: "var(--button-secondary)", 
                  borderRadius: "8px",
                  border: "1px solid var(--input-border)"
                }}>
                  <div style={{ 
                    fontFamily: "monospace", 
                    fontSize: "0.9rem", 
                    fontWeight: 600,
                    color: "var(--primary-red)",
                    marginBottom: "0.25rem"
                  }}>
                    POST /build_solana_swap_instruction
                  </div>
                  <div style={{ 
                    fontSize: "0.85rem", 
                    color: "var(--text-secondary)"
                  }}>
                    Build a Solana transaction instruction for executing swaps
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Info */}
            <div style={{ 
              padding: "1rem", 
              background: "var(--bg-light)", 
              borderRadius: "8px",
              border: "1px solid var(--card-border)"
            }}>
              <div style={{ 
                fontSize: "0.9rem", 
                color: "var(--text-secondary)",
                lineHeight: "1.6"
              }}>
                <strong style={{ color: "var(--text-primary)" }}>Connection:</strong> localhost:8080
                <br />
                <strong style={{ color: "var(--text-primary)" }}>Framework:</strong> Fastify with MCP Plugin
                <br />
                <strong style={{ color: "var(--text-primary)" }}>SDK:</strong> dex-ai-sdk
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: "center", 
          marginTop: "3rem", 
          paddingTop: "2rem",
          borderTop: "1px solid var(--card-border)"
        }}>
          <p style={{ 
            color: "var(--text-light)", 
            fontSize: "0.9rem"
          }}>
            Powered by MCP Server & dex-ai-sdk on Next.js
          </p>
          <p style={{ 
            color: "var(--text-light)", 
            fontSize: "0.85rem",
            marginTop: "0.5rem"
          }}>
            Designed for AI agents with deterministic quotes and minimal slippage
          </p>
        </div>
      </div>
    </div>
  );
}
