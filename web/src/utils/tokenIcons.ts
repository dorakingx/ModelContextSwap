// Token icon colors and gradients
export const TOKEN_ICONS: Record<string, { gradient: string; color: string }> = {
  SOL: {
    gradient: "linear-gradient(135deg, #14F195 0%, #00D4FF 100%)",
    color: "#14F195"
  },
  USDC: {
    gradient: "linear-gradient(135deg, #2775CA 0%, #2775CA 100%)",
    color: "#2775CA"
  },
  USDT: {
    gradient: "linear-gradient(135deg, #26A17B 0%, #26A17B 100%)",
    color: "#26A17B"
  },
  BONK: {
    gradient: "linear-gradient(135deg, #FFA500 0%, #FF8C00 100%)",
    color: "#FFA500"
  },
  RAY: {
    gradient: "linear-gradient(135deg, #00D4FF 0%, #0099CC 100%)",
    color: "#00D4FF"
  },
  JUP: {
    gradient: "linear-gradient(135deg, #9945FF 0%, #6622AA 100%)",
    color: "#9945FF"
  },
  PYTH: {
    gradient: "linear-gradient(135deg, #E63946 0%, #C1121F 100%)",
    color: "#E63946"
  },
  ORCA: {
    gradient: "linear-gradient(135deg, #00D4FF 0%, #0099CC 100%)",
    color: "#00D4FF"
  },
};

// Token icon component props
export interface TokenIconProps {
  symbol: string;
  size?: number;
}

export function getTokenIconStyle(symbol: string, size: number = 24) {
  const iconConfig = TOKEN_ICONS[symbol] || TOKEN_ICONS.SOL;
  
  return {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    background: iconConfig.gradient,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontSize: `${size * 0.5}px`,
    fontWeight: 700,
    flexShrink: 0,
  } as React.CSSProperties;
}

// Token SVG icons (simplified versions)
export function getTokenSVG(symbol: string): string | null {
  // For now, return null to use the gradient background with first letter
  // In the future, you can add actual SVG icons here
  return null;
}

