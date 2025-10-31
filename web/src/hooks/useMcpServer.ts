import { useState, useEffect } from "react";
import { config } from "@/config/env";

interface UseMcpServerReturn {
  status: "checking" | "active" | "inactive";
  error: string | null;
}

export function useMcpServer(): UseMcpServerReturn {
  const [status, setStatus] = useState<"checking" | "active" | "inactive">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const res = await fetch(`${config.mcpServerUrl}/get_dex_quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountIn: "1000000",
            reserveIn: "1000000000",
            reserveOut: "1000000000",
            feeBps: 30,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        setStatus(res.ok ? "active" : "inactive");
        setError(null);
      } catch (err) {
        setStatus("inactive");
        if (err instanceof Error && err.name === "AbortError") {
          setError("MCP Server connection timeout");
        } else {
          setError(`MCP Server is not running on ${config.mcpServerUrl}`);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, []);

  return { status, error };
}

