// Environment configuration
export const config = {
  // MCP Server URL
  mcpServerUrl: process.env.NEXT_PUBLIC_MCP_SERVER_URL || "http://localhost:8080",
  
  // API timeout in milliseconds
  apiTimeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || "30000", 10),
  
  // Environment
  env: process.env.NODE_ENV || "development",
  
  // Is development mode
  isDev: process.env.NODE_ENV === "development",
  
  // Is production mode
  isProd: process.env.NODE_ENV === "production",
};

