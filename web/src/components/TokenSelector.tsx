"use client";

import { useState, useRef, useEffect } from "react";
import { Token, POPULAR_TOKENS } from "@/utils/tokens";
import { getTokenIconStyle } from "@/utils/tokenIcons";

interface TokenSelectorProps {
  selectedToken: Token | null;
  onSelect: (token: Token) => void;
  label?: string;
  disabled?: boolean;
}

export function TokenSelector({ selectedToken, onSelect, label, disabled }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="token-info"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1rem",
          background: selectedToken ? "var(--card-bg)" : "var(--bg-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "all 0.15s ease",
          minWidth: "120px",
          justifyContent: "space-between",
        }}
        aria-label={label || "Select token"}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {selectedToken ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={getTokenIconStyle(selectedToken.symbol, 24)}>
                {selectedToken.symbol.charAt(0)}
              </div>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {selectedToken.symbol}
              </span>
            </div>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none" }}>
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        ) : (
          <>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Select</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 0.5rem)",
            left: 0,
            right: 0,
            background: "var(--card-bg)",
            border: "1px solid var(--border-default)",
            borderRadius: "16px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
            zIndex: 1000,
            maxHeight: "400px",
            overflowY: "auto",
            padding: "0.5rem",
          }}
          role="listbox"
        >
          {POPULAR_TOKENS.map((token) => (
            <button
              key={token.mint}
              type="button"
              onClick={() => {
                onSelect(token);
                setIsOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem 1rem",
                background: selectedToken?.mint === token.mint ? "var(--red-hover)" : "transparent",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (selectedToken?.mint !== token.mint) {
                  e.currentTarget.style.background = "var(--bg-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedToken?.mint !== token.mint) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
              role="option"
              aria-selected={selectedToken?.mint === token.mint}
            >
              <div style={getTokenIconStyle(token.symbol, 32)}>
                {token.symbol.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                  {token.symbol}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {token.name}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

