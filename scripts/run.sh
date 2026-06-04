#!/bin/bash
set -euo pipefail

# Resolve repo root relative to this script
WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$WORKDIR"

# Kill any existing node process running our server
pkill -f "node backend/server.js" 2>/dev/null || true
sleep 1

echo "=========================================="
echo "  Starting Workflow Shell"
echo "=========================================="
echo "Working directory: $WORKDIR"
echo ""

# Start the backend server in background (log to file), set WORKSPACE_DIR to repo root
export WORKSPACE_DIR="$WORKDIR"
nohup node backend/server.js > /tmp/workflow-shell.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..10}; do
  if curl -s http://localhost:8080/api/cwd > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "Server failed to start."
    cat /tmp/workflow-shell.log 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Start tunnel via cloudflared
echo ""
echo "Starting tunnel via Cloudflare..."
cloudflared tunnel --url http://localhost:8080 > /tmp/tunnel.log 2>&1 &
TUNNEL_PID=$!
sleep 5

TUNNEL_URL=$(grep -o 'https\?://[^[:space:]]*\.trycloudflare\.com' /tmp/tunnel.log 2>/dev/null | head -1 || true)
if [ -z "$TUNNEL_URL" ]; then
  echo ""
  echo "ERROR: Tunnel URL not found. cloudflared log:"
  cat /tmp/tunnel.log 2>/dev/null
  exit 1
fi

echo ""
echo "=========================================="
echo "Tunnel URL: $TUNNEL_URL"
echo "=========================================="
echo ""
echo "Server logs (live):"
tail -f /tmp/workflow-shell.log 2>/dev/null &
TAIL_PID=$!

cleanup() {
  kill ${TAIL_PID:-} ${TUNNEL_PID:-} 2>/dev/null || true
  echo ''
  echo '=== FULL SERVER LOG ==='
  cat /tmp/workflow-shell.log 2>/dev/null || true
}
trap cleanup EXIT

wait "$TUNNEL_PID" 2>/dev/null || true