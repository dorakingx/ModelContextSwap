import { useState, useCallback } from "react";
import { QuoteRequest, QuoteResponse, SwapInstructionRequest, SwapInstructionResponse, SwapParams, ApiError } from "@/types";
import { validateBigInt, validateFeeBps } from "@/utils/validation";

interface UseDexApiReturn {
  getQuote: (params: QuoteRequest) => Promise<void>;
  buildIx: (params: SwapInstructionRequest) => Promise<void>;
  quoteLoading: boolean;
  instructionLoading: boolean;
  error: ApiError | null;
  quote: QuoteResponse | null;
  instruction: SwapInstructionResponse | null;
}

export function useDexApi(): UseDexApiReturn {
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [instructionLoading, setInstructionLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [instruction, setInstruction] = useState<SwapInstructionResponse | null>(null);

  const getQuote = useCallback(async (params: QuoteRequest) => {
    setQuoteLoading(true);
    setError(null);
    setInstruction(null);
    setQuote(null);

    try {
      // Validate inputs before sending
      validateBigInt(params.amountIn, "amountIn");
      validateBigInt(params.reserveIn, "reserveIn");
      validateBigInt(params.reserveOut, "reserveOut");
      validateFeeBps(params.feeBps);

      const res = await fetch(`/api/get_dex_quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const json = await res.json();

      if (!res.ok) {
        // Handle API error response
        const apiError: ApiError = json.error 
          ? json 
          : { error: json.error || `HTTP error! status: ${res.status}`, code: `HTTP_${res.status}` };
        setError(apiError);
        return;
      }

      setQuote(json as QuoteResponse);
    } catch (err) {
      let apiError: ApiError;
      
      if (err instanceof Error) {
        apiError = {
          error: err.message,
          code: err.name,
        };
      } else {
        apiError = {
          error: "An unexpected error occurred while fetching quote",
          code: "UNKNOWN_ERROR",
        };
      }
      
      setError(apiError);
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  const buildIx = useCallback(async (params: SwapInstructionRequest) => {
    setInstructionLoading(true);
    setError(null);
    setInstruction(null);

    try {
      const res = await fetch(`/api/build_solana_swap_instruction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const json = await res.json();

      if (!res.ok) {
        // Handle API error response
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
          error: "An unexpected error occurred while building instruction",
          code: "UNKNOWN_ERROR",
        };
      }
      
      setError(apiError);
    } finally {
      setInstructionLoading(false);
    }
  }, []);

  return { getQuote, buildIx, quoteLoading, instructionLoading, error, quote, instruction };
}

