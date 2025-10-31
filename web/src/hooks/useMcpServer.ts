import { useState, useEffect } from "react";
import { config } from "@/config/env";

interface UseMcpServerReturn {
  status: "checking" | "active" | "inactive";
  error: string | null;
  retry: () => void;
}

export function useMcpServer(): UseMcpServerReturn {
  const [status, setStatus] = useState<"checking" | "active" | "inactive">("checking");
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkStatus = async () => {
    try {
      setStatus("checking");
      setError(null);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      // Use /health endpoint for lighter health check
      const res = await fetch(`${config.mcpServerUrl}/health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Server returned ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      
      if (data.status === "ok") {
        setStatus("active");
        setError(null);
        setRetryCount(0);
      } else {
        throw new Error("Server health check failed");
      }
    } catch (err) {
      setStatus("inactive");
      
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setError("Connection timeout - MCP server may be slow or unreachable");
        } else if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
          setError(`Cannot connect to MCP server at ${config.mcpServerUrl}. Make sure the server is running.`);
        } else {
          setError(err.message || "MCP server connection failed");
        }
      } else {
        setError("Unknown error connecting to MCP server");
      }
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, [retryCount]);

  const retry = () => {
    setRetryCount((prev) => prev + 1);
  };

  return { status, error, retry };
}

