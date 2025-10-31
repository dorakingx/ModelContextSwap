import { useState, useCallback } from "react";
import { config } from "@/config/env";
import { QuoteRequest, QuoteResponse, SwapInstructionRequest, SwapInstructionResponse, ApiError } from "@/types";
import { useMcpServer } from "./useMcpServer";

interface UseMcpToolsReturn {
  getQuoteViaMcp: (params: QuoteRequest) => Promise<void>;
  buildIxViaMcp: (params: SwapInstructionRequest) => Promise<void>;
  quoteLoading: boolean;
  instructionLoading: boolean;
  error: ApiError | null;
  quote: QuoteResponse | null;
  instruction: SwapInstructionResponse | null;
}

/**
 * Hook to interact with MCP server tools directly via HTTP
 * Provides the same interface as useDexApi but calls MCP server endpoints
 */
export function useMcpTools(): UseMcpToolsReturn {
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [instructionLoading, setInstructionLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [instruction, setInstruction] = useState<SwapInstructionResponse | null>(null);
  const { status: mcpStatus } = useMcpServer();

  const getQuoteViaMcp = useCallback(async (params: QuoteRequest) => {
    // Check if MCP server is available
    if (mcpStatus !== "active") {
      setError({
        error: "MCP server is not available. Please ensure the server is running.",
        code: "MCP_SERVER_UNAVAILABLE",
      });
      return;
    }

    setQuoteLoading(true);
    setError(null);
    setInstruction(null);
    setQuote(null);

    try {
      const res = await fetch(`${config.mcpServerUrl}/get_dex_quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountIn: params.amountIn,
          reserveIn: params.reserveIn,
          reserveOut: params.reserveOut,
          feeBps: parseInt(params.feeBps || "30", 10),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const apiError: ApiError = json.error
          ? json
          : { error: json.error || `HTTP error! status: ${res.status}`, code: `HTTP_${res.status}` };
        setError(apiError);
        return;
      }

      // Map MCP server response to QuoteResponse format
      setQuote({
        amountOut: json.amountOut,
        amountIn: params.amountIn,
        reserveIn: params.reserveIn,
        reserveOut: params.reserveOut,
        feeBps: params.feeBps,
      });
    } catch (err) {
      let apiError: ApiError;

      if (err instanceof Error) {
        apiError = {
          error: err.message,
          code: err.name,
        };
      } else {
        apiError = {
          error: "An unexpected error occurred while fetching quote from MCP server",
          code: "UNKNOWN_ERROR",
        };
      }

      setError(apiError);
    } finally {
      setQuoteLoading(false);
    }
  }, [mcpStatus]);

  const buildIxViaMcp = useCallback(async (params: SwapInstructionRequest) => {
    // Check if MCP server is available
    if (mcpStatus !== "active") {
      setError({
        error: "MCP server is not available. Please ensure the server is running.",
        code: "MCP_SERVER_UNAVAILABLE",
      });
      return;
    }

    setInstructionLoading(true);
    setError(null);
    setInstruction(null);

    try {
      const res = await fetch(`${config.mcpServerUrl}/build_solana_swap_instruction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const json = await res.json();

      if (!res.ok) {
        const apiError: ApiError = json.error
          ? json
          : { error: json.error || `HTTP error! status: ${res.status}`, code: `HTTP_${res.status}` };
        setError(apiError);
        return;
      }

      setInstruction(json as SwapInstructionResponse);
    } catch (err) {
      let apiError: ApiError;

      if (err instanceof Error) {
        apiError = {
          error: err.message,
          code: err.name,
        };
      } else {
        apiError = {
          error: "An unexpected error occurred while building instruction via MCP server",
          code: "UNKNOWN_ERROR",
        };
      }

      setError(apiError);
    } finally {
      setInstructionLoading(false);
    }
  }, [mcpStatus]);

  return { getQuoteViaMcp, buildIxViaMcp, quoteLoading, instructionLoading, error, quote, instruction };
}

