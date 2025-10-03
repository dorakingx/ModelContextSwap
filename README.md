# dex-ai: Agent-Friendly DEX on Solana

This repository contains:

- A Solana on-chain DEX program (Anchor-style layout) designed for AI agents
- A TypeScript SDK exposing simple, deterministic quote/swap APIs
- An example agent script that demonstrates quoting and swapping

## Prerequisites

- Solana CLI: `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`
- Node.js 18+ and Yarn: `corepack enable` (then `yarn -v`)
- Rust toolchain: `rustup default stable` and `rustup target add wasm32-unknown-unknown`
- Anchor CLI (optional but recommended): `cargo install --git https://github.com/coral-xyz/anchor avm --locked` then `avm use latest`

If Anchor CLI is not available, you can still work with the Rust program and SDK. Deployment/testing will be easiest with Anchor.

## Layout

```
/ 
  programs/dex-ai/         # Solana program crate (Anchor-compatible layout)
  sdk/                     # TypeScript SDK with agent-friendly APIs
  examples/agent.ts        # Example agent using the SDK
```

## Quickstart

- Build SDK:
```bash
yarn --cwd sdk install && yarn --cwd sdk build
```

- Example agent (dry-run):
```bash
yarn --cwd sdk install
node examples/agent.ts
```

- Build program (with Anchor):
```bash
anchor build
```

## Agent-friendly surfaces

- Deterministic quotes that avoid hidden slippage by default
- Clear input/output token amounts and minimum-out protections
- Optional simulation path to validate swaps before sending

## License
MIT
