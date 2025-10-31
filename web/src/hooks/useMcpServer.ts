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
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      // Use /health endpoint for lighter health check
      const res = await fetch(`${config.mcpServerUrl}/health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        mode: "cors", // Explicitly set CORS mode
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
        // Only show error in development mode, or if it's a critical error
        if (config.isDev) {
          if (err.name === "AbortError") {
            setError("Connection timeout - MCP server may be slow or unreachable");
          } else if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError") || err.message.includes("CORS")) {
            setError(`Cannot connect to MCP server. The server may not be running or CORS is blocking the request.`);
          } else {
            setError(err.message || "MCP server connection failed");
          }
        } else {
          // In production, don't show error - just mark as inactive
          setError(null);
        }
      } else {
        if (config.isDev) {
          setError("Unknown error connecting to MCP server");
        } else {
          setError(null);
        }
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

