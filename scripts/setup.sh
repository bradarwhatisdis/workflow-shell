#!/bin/bash
set -euo pipefail

WORKDIR="/home/raihan/workflow-shell"

echo "=========================================="
echo "  Workflow Shell Setup"
echo "=========================================="

# ─── Check if Node.js is already installed ─────────────────────
if command -v node &>/dev/null; then
  NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  echo "Node.js v$(node -v) already installed (major: $NODE_VER)"
  if [ "$NODE_VER" -lt 18 ]; then
    echo "Node.js 18+ required. Installing NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  echo "Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# ─── Install backend dependencies ──────────────────────────────
cd "$WORKDIR"

if [ ! -d "backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  cd backend && npm install && cd ..
else
  echo "Backend dependencies already installed."
fi

echo ""
echo "--- Setup is complete! ---"
echo "Run: ./scripts/run.sh"