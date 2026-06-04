#!/bin/bash
set -euo pipefail

WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WORKDIR"

case "${1:-}" in
  --kill|-k)
    echo "Killing all servers..."
    pkill -f "node backend/server.js" 2>/dev/null || true
    pkill -f "cloudflared" 2>/dev/null || true
    pkill -f "Xvfb" 2>/dev/null || true
    pkill -f "x11vnc" 2>/dev/null || true
    echo "Done."
    exit 0
    ;;
esac

echo "=========================================="
echo "  Workflow Shell - Local Dev"
echo "=========================================="

# Kill any existing server before starting
pkill -f "node backend/server.js" 2>/dev/null || true
pkill -f "cloudflared" 2>/dev/null || true
sleep 1

# Start backend (log to file), set WORKSPACE_DIR to repo root
export WORKSPACE_DIR="$WORKDIR"
nohup node backend/server.js > /tmp/workflow-shell.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server
echo "Waiting for server..."
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

echo ""
echo "  Local:       http://localhost:8080"
echo ""

# Start Cloudflare tunnel in background (non-fatal if unavailable)
echo "Starting tunnel via Cloudflare..."
TUNNEL_URL=""
TUNNEL_PID=""
if command -v cloudflared &>/dev/null; then
  cloudflared tunnel --url http://localhost:8080 > /tmp/tunnel.log 2>&1 &
  TUNNEL_PID=$!
  sleep 6
  TUNNEL_URL=$(grep -o 'https\?://[^[:space:]]*\.trycloudflare\.com' /tmp/tunnel.log 2>/dev/null | head -1 || true)
else
  echo "cloudflared not found — install with: sudo apt install cloudflared"
fi

echo ""
echo "=========================================="
echo "Tunnel URL: ${TUNNEL_URL:-Not available}"
echo ""
echo "  Local:       http://localhost:8080"
echo "  Press Ctrl+C to stop."
echo "=========================================="
echo ""

# Show live server logs
tail -f /tmp/workflow-shell.log &
TAIL_PID=$!
trap "kill $TAIL_PID $TUNNEL_PID 2>/dev/null || true; echo ''; echo '=== FULL SERVER LOG ==='; cat /tmp/workflow-shell.log 2>/dev/null || true" EXIT
if [ -n "$TUNNEL_PID" ]; then
  wait "$TUNNEL_PID" 2>/dev/null || true
else
  wait "$SERVER_PID" 2>/dev/null || true
fi
