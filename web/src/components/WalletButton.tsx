"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const { publicKey, connected } = useWallet();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <WalletMultiButton />
      {connected && publicKey && (
        <div style={{
          padding: "0.5rem 1rem",
          background: "var(--bg-secondary)",
          borderRadius: "8px",
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          fontFamily: "monospace",
          border: "1px solid var(--border-default)",
        }}>
          {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
        </div>
      )}
    </div>
  );
}

