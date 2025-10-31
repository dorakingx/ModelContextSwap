#!/bin/bash

# Dependency check script for _bn error debugging
# This script checks for common dependency issues that can cause _bn errors

echo "=" | head -c 80
echo ""
echo "🔍 Dependency Check for _bn Error Debugging"
echo "=" | head -c 80
echo ""

# Check Node.js version
echo "📋 Node.js Version:"
node --version
echo ""

# Check if Anchor is installed
echo "📦 Anchor CLI:"
if command -v anchor &> /dev/null; then
    anchor --version
else
    echo "   ⚠️  Anchor CLI not found. Install with: cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
fi
echo ""

# Check SDK dependencies
echo "📦 SDK Dependencies:"
if [ -f "sdk/package.json" ]; then
    cd sdk
    echo "   Checking package.json..."
    echo "   @coral-xyz/anchor: $(cat package.json | grep -o '"@coral-xyz/anchor": "[^"]*"' | cut -d'"' -f4 || echo 'N/A')"
    echo "   @solana/web3.js: $(cat package.json | grep -o '"@solana/web3.js": "[^"]*"' | cut -d'"' -f4 || echo 'N/A')"
    echo "   bs58: $(cat package.json | grep -o '"bs58": "[^"]*"' | cut -d'"' -f4 || echo 'N/A')"
    echo ""
    echo "   Installed versions:"
    npm list @coral-xyz/anchor @solana/web3.js bs58 2>/dev/null | grep -E "(@coral-xyz/anchor|@solana/web3.js|bs58)" | head -10 || echo "   Run: npm install --legacy-peer-deps"
    cd ..
else
    echo "   ⚠️  sdk/package.json not found"
fi
echo ""

# Check for multiple bn.js versions
echo "🔍 Checking for multiple bn.js versions:"
if [ -f "sdk/node_modules" ] || [ -f "node_modules" ]; then
    echo "   Checking bn.js installations..."
    find . -name "bn.js" -type f -path "*/node_modules/*" 2>/dev/null | head -5
    echo ""
    echo "   If multiple versions found, this can cause _bn errors."
    echo "   Solution: rm -rf node_modules sdk/node_modules && npm install --legacy-peer-deps"
else
    echo "   node_modules not found. Run: npm install --legacy-peer-deps"
fi
echo ""

# Check SDK build status
echo "🔨 SDK Build Status:"
if [ -f "sdk/dist/index.js" ]; then
    echo "   ✅ SDK is built"
    echo "   Build time: $(stat -f "%Sm" sdk/dist/index.js 2>/dev/null || stat -c "%y" sdk/dist/index.js 2>/dev/null | cut -d' ' -f1-2)"
else
    echo "   ⚠️  SDK is not built. Run: cd sdk && npm run build"
fi
echo ""

# Check for common issues
echo "⚠️  Common Issues to Check:"
echo "   1. Multiple bn.js versions installed"
echo "   2. Anchor version mismatch"
echo "   3. node_modules not cleaned after dependency updates"
echo "   4. SDK not rebuilt after code changes"
echo ""

echo "=" | head -c 80
echo ""
echo "✅ Dependency check complete!"
echo ""
echo "To fix common issues, run:"
echo "  rm -rf node_modules sdk/node_modules web/node_modules"
echo "  npm install --legacy-peer-deps"
echo "  cd sdk && npm install --legacy-peer-deps && npm run build"
echo ""

