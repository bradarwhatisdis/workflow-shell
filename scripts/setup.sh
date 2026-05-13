#!/bin/bash
set -euo pipefail

# Resolve repo root relative to this script, not a hardcoded path
WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=========================================="
echo "  Workflow Shell Setup"
echo "=========================================="
echo "Working directory: $WORKDIR"
echo ""

# ─── Check if Node.js is already installed ─────────────────────
if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -dc '0-9')
  echo "Node.js $(node -v) already installed (major: $NODE_MAJOR)"
  if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "Node.js 18+ required. Installing NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  echo "Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo ""
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# ─── Install backend dependencies ──────────────────────────────
cd "$WORKDIR"

if [ ! -d "backend/node_modules" ]; then
  echo ""
  echo "Installing backend dependencies..."
  cd backend && npm install && cd ..
else
  echo ""
  echo "Backend dependencies already installed."
fi

echo ""
echo "--- Setup is complete! ---"
echo "Run: ./scripts/run.sh"